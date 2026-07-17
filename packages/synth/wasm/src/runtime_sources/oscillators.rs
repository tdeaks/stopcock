use crate::dsp::{
    clamp, safe_finite, sample_waveform, sample_wavetable, wrap_phase, Waveform, TAU,
};
use crate::model::WavetableBank;
use crate::runtime_node::{sample_runtime_operator, RuntimeFmOperators};
use crate::runtime_params::{
    param_at, ParamAccess, FM_FEEDBACK_PARAMS, FM_LEVEL_PARAMS, FM_MATRIX_PARAMS, FM_OUTPUT_PARAMS,
    FM_RATIO_PARAMS, PARAM_DETUNE, PARAM_FREQ, PARAM_INDEX, PARAM_PHASE, PARAM_POSITION,
};
use crate::runtime_state::NodeBuffer;

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_osc(
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    base_freq: f64,
    base_detune: f64,
    base_phase: f64,
    wave: Waveform,
    phase: &mut f64,
    triangle: &mut f64,
) -> Option<()> {
    if let (Some(freq), Some(detune), Some(phase_param)) = (
        access.static_param(params, PARAM_FREQ, base_freq),
        access.static_param(params, PARAM_DETUNE, base_detune),
        access.static_param(params, PARAM_PHASE, base_phase),
    ) {
        let freq = freq.max(0.0);
        let adjusted = freq * 2.0_f64.powf(detune / 1200.0);
        let step = adjusted / sample_rate;
        let phase_offset = (phase_param - base_phase) / TAU;
        for i in 0..frames {
            out.left[i] = sample_waveform(wave, *phase + phase_offset, step, triangle) as f32;
            *phase = wrap_phase(*phase + step);
        }
        return Some(());
    }

    for i in 0..frames {
        let freq = param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames).max(0.0);
        let detune = param_at(access, prior, params, PARAM_DETUNE, base_detune, i, frames);
        let phase_offset = (param_at(access, prior, params, PARAM_PHASE, base_phase, i, frames)
            - base_phase)
            / TAU;
        let adjusted = freq * 2.0_f64.powf(detune / 1200.0);
        let step = adjusted / sample_rate;
        out.left[i] = sample_waveform(wave, *phase + phase_offset, step, triangle) as f32;
        *phase = wrap_phase(*phase + step);
    }
    Some(())
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_wavetable(
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    bank: Option<&WavetableBank>,
    base_freq: f64,
    base_detune: f64,
    base_phase: f64,
    base_position: f64,
    phase: &mut f64,
) -> Option<()> {
    let Some(bank) = bank else {
        return Some(());
    };

    if let (Some(freq), Some(detune), Some(phase_param), Some(position)) = (
        access.static_param(params, PARAM_FREQ, base_freq),
        access.static_param(params, PARAM_DETUNE, base_detune),
        access.static_param(params, PARAM_PHASE, base_phase),
        access.static_param(params, PARAM_POSITION, base_position),
    ) {
        let freq = freq.max(0.0);
        let adjusted = freq * 2.0_f64.powf(detune / 1200.0);
        let step = adjusted / sample_rate;
        let phase_offset = (phase_param - base_phase) / TAU;
        for i in 0..frames {
            out.left[i] =
                sample_wavetable(bank, *phase + phase_offset, adjusted, sample_rate, position)
                    as f32;
            *phase = wrap_phase(*phase + step);
        }
        return Some(());
    }

    for i in 0..frames {
        let freq = param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames).max(0.0);
        let detune = param_at(access, prior, params, PARAM_DETUNE, base_detune, i, frames);
        let phase_offset = (param_at(access, prior, params, PARAM_PHASE, base_phase, i, frames)
            - base_phase)
            / TAU;
        let position = param_at(
            access,
            prior,
            params,
            PARAM_POSITION,
            base_position,
            i,
            frames,
        );
        let adjusted = freq * 2.0_f64.powf(detune / 1200.0);
        out.left[i] =
            sample_wavetable(bank, *phase + phase_offset, adjusted, sample_rate, position) as f32;
        *phase = wrap_phase(*phase + adjusted / sample_rate);
    }
    Some(())
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_fm(
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    base_freq: f64,
    base_detune: f64,
    base_index: f64,
    operators: &RuntimeFmOperators,
    matrix: &[[f64; 6]; 6],
    phase: &mut [f64; 6],
    previous: &mut [f64; 6],
    current: &mut [f64; 6],
    triangle: &mut [f64; 6],
) -> Option<()> {
    if let Some(static_params) = static_fm_params(
        access,
        params,
        base_freq,
        base_detune,
        base_index,
        operators,
        matrix,
    ) {
        for i in 0..frames {
            out.left[i] = render_static_fm_sample(
                static_params,
                operators,
                phase,
                previous,
                current,
                triangle,
                sample_rate,
            );
        }
        return Some(());
    }

    for i in 0..frames {
        let base_freq = param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames).max(0.0);
        let base_detune = param_at(access, prior, params, PARAM_DETUNE, base_detune, i, frames);
        let global_index = param_at(access, prior, params, PARAM_INDEX, base_index, i, frames);
        let mut sum = 0.0;
        let mut norm = 0.0;
        for op in 0..6 {
            let spec = &operators[op];
            let ratio = param_at(
                access,
                prior,
                params,
                FM_RATIO_PARAMS[op],
                spec.ratio,
                i,
                frames,
            )
            .max(0.0);
            let level = param_at(
                access,
                prior,
                params,
                FM_LEVEL_PARAMS[op],
                spec.level,
                i,
                frames,
            );
            let feedback = param_at(
                access,
                prior,
                params,
                FM_FEEDBACK_PARAMS[op],
                spec.feedback,
                i,
                frames,
            );
            let output = param_at(
                access,
                prior,
                params,
                FM_OUTPUT_PARAMS[op],
                spec.output,
                i,
                frames,
            );
            let freq = base_freq * ratio * 2.0_f64.powf((base_detune + spec.detune) / 1200.0);
            let dt = clamp(freq / sample_rate, 0.0, 0.5);
            let mut phase_mod = previous[op] * feedback;
            for src in 0..6 {
                phase_mod += previous[src]
                    * param_at(
                        access,
                        prior,
                        params,
                        FM_MATRIX_PARAMS[src][op],
                        matrix[src][op],
                        i,
                        frames,
                    )
                    * global_index;
            }
            current[op] = sample_runtime_operator(
                spec,
                wrap_phase(phase[op] + phase_mod / TAU),
                dt,
                freq,
                sample_rate,
                triangle,
                op,
            ) * level;
            phase[op] = wrap_phase(phase[op] + dt);
            sum += current[op] * output;
            norm += output.abs();
        }
        *previous = *current;
        out.left[i] = safe_finite(if norm > 1.0 { sum / norm } else { sum }, 0.0) as f32;
    }
    Some(())
}

#[derive(Clone, Copy)]
struct StaticFmParams {
    base_freq: f64,
    base_detune: f64,
    global_index: f64,
    ratios: [f64; 6],
    levels: [f64; 6],
    feedback: [f64; 6],
    outputs: [f64; 6],
    matrix: [[f64; 6]; 6],
}

fn static_fm_params(
    access: &ParamAccess,
    params: &[&[f32]],
    base_freq: f64,
    base_detune: f64,
    base_index: f64,
    operators: &RuntimeFmOperators,
    matrix: &[[f64; 6]; 6],
) -> Option<StaticFmParams> {
    let mut static_params = StaticFmParams {
        base_freq: access.static_param(params, PARAM_FREQ, base_freq)?.max(0.0),
        base_detune: access.static_param(params, PARAM_DETUNE, base_detune)?,
        global_index: access.static_param(params, PARAM_INDEX, base_index)?,
        ratios: [0.0; 6],
        levels: [0.0; 6],
        feedback: [0.0; 6],
        outputs: [0.0; 6],
        matrix: [[0.0; 6]; 6],
    };

    for op in 0..6 {
        let spec = &operators[op];
        static_params.ratios[op] = access
            .static_param(params, FM_RATIO_PARAMS[op], spec.ratio)?
            .max(0.0);
        static_params.levels[op] = access.static_param(params, FM_LEVEL_PARAMS[op], spec.level)?;
        static_params.feedback[op] =
            access.static_param(params, FM_FEEDBACK_PARAMS[op], spec.feedback)?;
        static_params.outputs[op] =
            access.static_param(params, FM_OUTPUT_PARAMS[op], spec.output)?;
        for src in 0..6 {
            static_params.matrix[src][op] =
                access.static_param(params, FM_MATRIX_PARAMS[src][op], matrix[src][op])?;
        }
    }

    Some(static_params)
}

fn render_static_fm_sample(
    params: StaticFmParams,
    operators: &RuntimeFmOperators,
    phase: &mut [f64; 6],
    previous: &mut [f64; 6],
    current: &mut [f64; 6],
    triangle: &mut [f64; 6],
    sample_rate: f64,
) -> f32 {
    let mut sum = 0.0;
    let mut norm = 0.0;
    for op in 0..6 {
        let spec = &operators[op];
        let freq = params.base_freq
            * params.ratios[op]
            * 2.0_f64.powf((params.base_detune + spec.detune) / 1200.0);
        let dt = clamp(freq / sample_rate, 0.0, 0.5);
        let mut phase_mod = previous[op] * params.feedback[op];
        for (src, previous_value) in previous.iter().enumerate() {
            phase_mod += *previous_value * params.matrix[src][op] * params.global_index;
        }
        current[op] = sample_runtime_operator(
            spec,
            wrap_phase(phase[op] + phase_mod / TAU),
            dt,
            freq,
            sample_rate,
            triangle,
            op,
        ) * params.levels[op];
        phase[op] = wrap_phase(phase[op] + dt);
        sum += current[op] * params.outputs[op];
        norm += params.outputs[op].abs();
    }
    *previous = *current;
    safe_finite(if norm > 1.0 { sum / norm } else { sum }, 0.0) as f32
}

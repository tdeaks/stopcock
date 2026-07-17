#![allow(clippy::too_many_arguments)]

use crate::dsp::{clamp, DampedComb, FeedbackDelay};
use crate::runtime_params::{
    param_at, ParamAccess, PARAM_DAMP, PARAM_DELAY_MS, PARAM_FEEDBACK, PARAM_MIX,
};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_comb(
    input_index: usize,
    base_delay_ms: f64,
    base_feedback: f64,
    base_damp: f64,
    left: &mut DampedComb,
    right: &mut DampedComb,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;
    process_comb_channel(
        base_delay_ms,
        base_feedback,
        base_damp,
        access,
        prior,
        params,
        &input.left,
        &mut out.left,
        frames,
        sample_rate,
        left,
    );
    if input.channels == 2 {
        process_comb_channel(
            base_delay_ms,
            base_feedback,
            base_damp,
            access,
            prior,
            params,
            &input.right,
            &mut out.right,
            frames,
            sample_rate,
            right,
        );
    }
    Some(())
}

fn process_comb_channel(
    base_delay_ms: f64,
    base_feedback: f64,
    base_damp: f64,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    input: &[f32],
    out: &mut [f32],
    frames: usize,
    sample_rate: f64,
    state: &mut DampedComb,
) {
    if let (Some(delay_ms), Some(feedback), Some(damp)) = (
        access.static_param(params, PARAM_DELAY_MS, base_delay_ms),
        access.static_param(params, PARAM_FEEDBACK, base_feedback),
        access.static_param(params, PARAM_DAMP, base_damp),
    ) {
        let delay_samples = clamp(
            (delay_ms * sample_rate / 1000.0).round(),
            1.0,
            (state.len() - 1) as f64,
        ) as usize;
        for i in 0..frames {
            out[i] = state.process(input[i], delay_samples, feedback, damp);
        }
        return;
    }

    for i in 0..frames {
        let delay_samples = clamp(
            (param_at(
                access,
                prior,
                params,
                PARAM_DELAY_MS,
                base_delay_ms,
                i,
                frames,
            ) * sample_rate
                / 1000.0)
                .round(),
            1.0,
            (state.len() - 1) as f64,
        ) as usize;
        let feedback = param_at(
            access,
            prior,
            params,
            PARAM_FEEDBACK,
            base_feedback,
            i,
            frames,
        );
        let damp = param_at(access, prior, params, PARAM_DAMP, base_damp, i, frames);
        out[i] = state.process(input[i], delay_samples, feedback, damp);
    }
}

pub(crate) fn render_delay(
    input_index: usize,
    base_delay_ms: f64,
    base_feedback: f64,
    base_mix: f64,
    left: &mut FeedbackDelay,
    right: &mut FeedbackDelay,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;
    process_delay_channel(
        base_delay_ms,
        base_feedback,
        base_mix,
        access,
        prior,
        params,
        &input.left,
        &mut out.left,
        frames,
        sample_rate,
        left,
    );
    if input.channels == 2 {
        process_delay_channel(
            base_delay_ms,
            base_feedback,
            base_mix,
            access,
            prior,
            params,
            &input.right,
            &mut out.right,
            frames,
            sample_rate,
            right,
        );
    }
    Some(())
}

fn process_delay_channel(
    base_delay_ms: f64,
    base_feedback: f64,
    base_mix: f64,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    input: &[f32],
    out: &mut [f32],
    frames: usize,
    sample_rate: f64,
    state: &mut FeedbackDelay,
) {
    if let (Some(delay_ms), Some(feedback), Some(mix)) = (
        access.static_param(params, PARAM_DELAY_MS, base_delay_ms),
        access.static_param(params, PARAM_FEEDBACK, base_feedback),
        access.static_param(params, PARAM_MIX, base_mix),
    ) {
        let delay_samples = clamp(
            (delay_ms * sample_rate / 1000.0).round(),
            1.0,
            (state.len() - 1) as f64,
        ) as usize;
        for i in 0..frames {
            out[i] = state.process(input[i], delay_samples, feedback, mix);
        }
        return;
    }

    for i in 0..frames {
        let delay_samples = clamp(
            (param_at(
                access,
                prior,
                params,
                PARAM_DELAY_MS,
                base_delay_ms,
                i,
                frames,
            ) * sample_rate
                / 1000.0)
                .round(),
            1.0,
            (state.len() - 1) as f64,
        ) as usize;
        let feedback = param_at(
            access,
            prior,
            params,
            PARAM_FEEDBACK,
            base_feedback,
            i,
            frames,
        );
        let mix = param_at(access, prior, params, PARAM_MIX, base_mix, i, frames);
        out[i] = state.process(input[i], delay_samples, feedback, mix);
    }
}

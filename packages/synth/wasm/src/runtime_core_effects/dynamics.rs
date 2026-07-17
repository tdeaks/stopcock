use super::common::stereo_input;
use crate::dsp::{
    bitcrush_sample, clamp, compress_sample, BitcrusherState, CompressorParams, CompressorState,
    DegradeParams, DegradeState, SaturatorParams, SaturatorState, WavefolderParams,
    WavefolderState,
};
use crate::runtime_params::{
    param_at, ParamAccess, PARAM_ASYMMETRY, PARAM_ATTACK, PARAM_BITS, PARAM_DEPTH,
    PARAM_DOWNSAMPLE, PARAM_DRIVE, PARAM_JITTER, PARAM_MIX, PARAM_NOISE, PARAM_OUTPUT, PARAM_RATIO,
    PARAM_RELEASE, PARAM_THRESHOLD, PARAM_TONE,
};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_compressor(
    input_index: usize,
    base_threshold: f64,
    base_ratio: f64,
    base_attack: f64,
    base_release: f64,
    knee: f64,
    left: &mut CompressorState,
    right: &mut CompressorState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let (Some(threshold), Some(ratio), Some(attack), Some(release)) = (
        access.static_param(params, PARAM_THRESHOLD, base_threshold),
        access.static_param(params, PARAM_RATIO, base_ratio),
        access.static_param(params, PARAM_ATTACK, base_attack),
        access.static_param(params, PARAM_RELEASE, base_release),
    ) {
        let params = CompressorParams {
            threshold_db: threshold,
            ratio: ratio.max(1.0),
            attack_sec: attack.max(1e-6),
            release_sec: release.max(1e-6),
            knee_db: knee,
            sample_rate,
        };
        for i in 0..frames {
            out.left[i] = compress_sample(input.left[i], left, params);
            if input.channels == 2 {
                out.right[i] = compress_sample(input.right[i], right, params);
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let threshold = param_at(
            access,
            prior,
            params,
            PARAM_THRESHOLD,
            base_threshold,
            i,
            frames,
        );
        let ratio = param_at(access, prior, params, PARAM_RATIO, base_ratio, i, frames).max(1.0);
        let attack =
            param_at(access, prior, params, PARAM_ATTACK, base_attack, i, frames).max(1e-6);
        let release = param_at(
            access,
            prior,
            params,
            PARAM_RELEASE,
            base_release,
            i,
            frames,
        )
        .max(1e-6);
        let params = CompressorParams {
            threshold_db: threshold,
            ratio,
            attack_sec: attack,
            release_sec: release,
            knee_db: knee,
            sample_rate,
        };
        out.left[i] = compress_sample(input.left[i], left, params);
        if input.channels == 2 {
            out.right[i] = compress_sample(input.right[i], right, params);
        }
    }
    Some(())
}

pub(crate) fn render_bitcrush(
    input_index: usize,
    base_bits: f64,
    base_downsample: f64,
    left: &mut BitcrusherState,
    right: &mut BitcrusherState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let (Some(bits), Some(downsample)) = (
        access.static_param(params, PARAM_BITS, base_bits),
        access.static_param(params, PARAM_DOWNSAMPLE, base_downsample),
    ) {
        let bits = clamp(bits.round(), 1.0, 24.0);
        let downsample = downsample.round().max(1.0);
        for i in 0..frames {
            out.left[i] = bitcrush_sample(input.left[i], bits, downsample, left);
            if input.channels == 2 {
                out.right[i] = bitcrush_sample(input.right[i], bits, downsample, right);
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let bits = clamp(
            param_at(access, prior, params, PARAM_BITS, base_bits, i, frames).round(),
            1.0,
            24.0,
        );
        let downsample = param_at(
            access,
            prior,
            params,
            PARAM_DOWNSAMPLE,
            base_downsample,
            i,
            frames,
        )
        .round()
        .max(1.0);
        out.left[i] = bitcrush_sample(input.left[i], bits, downsample, left);
        if input.channels == 2 {
            out.right[i] = bitcrush_sample(input.right[i], bits, downsample, right);
        }
    }
    Some(())
}

pub(crate) fn render_saturator(
    input_index: usize,
    base_drive: f64,
    base_asymmetry: f64,
    base_tone: f64,
    base_mix: f64,
    base_output: f64,
    state: &mut SaturatorState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let (Some(drive), Some(asymmetry), Some(tone), Some(mix), Some(output)) = (
        access.static_param(params, PARAM_DRIVE, base_drive),
        access.static_param(params, PARAM_ASYMMETRY, base_asymmetry),
        access.static_param(params, PARAM_TONE, base_tone),
        access.static_param(params, PARAM_MIX, base_mix),
        access.static_param(params, PARAM_OUTPUT, base_output),
    ) {
        let params = SaturatorParams {
            drive,
            asymmetry,
            tone,
            mix,
            output,
        };
        for i in 0..frames {
            let (input_l, input_r) = stereo_input(input, i);
            let (left, right) = state.process(input_l, input_r, params, sample_rate);
            out.left[i] = left;
            if input.channels == 2 {
                out.right[i] = right;
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let params = SaturatorParams {
            drive: param_at(access, prior, params, PARAM_DRIVE, base_drive, i, frames),
            asymmetry: param_at(
                access,
                prior,
                params,
                PARAM_ASYMMETRY,
                base_asymmetry,
                i,
                frames,
            ),
            tone: param_at(access, prior, params, PARAM_TONE, base_tone, i, frames),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
            output: param_at(access, prior, params, PARAM_OUTPUT, base_output, i, frames),
        };
        let (input_l, input_r) = stereo_input(input, i);
        let (left, right) = state.process(input_l, input_r, params, sample_rate);
        out.left[i] = left;
        if input.channels == 2 {
            out.right[i] = right;
        }
    }
    Some(())
}

pub(crate) fn render_degrade(
    input_index: usize,
    base_bits: f64,
    base_downsample: f64,
    base_jitter: f64,
    base_noise: f64,
    base_tone: f64,
    base_mix: f64,
    state: &mut DegradeState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let (Some(bits), Some(downsample), Some(jitter), Some(noise), Some(tone), Some(mix)) = (
        access.static_param(params, PARAM_BITS, base_bits),
        access.static_param(params, PARAM_DOWNSAMPLE, base_downsample),
        access.static_param(params, PARAM_JITTER, base_jitter),
        access.static_param(params, PARAM_NOISE, base_noise),
        access.static_param(params, PARAM_TONE, base_tone),
        access.static_param(params, PARAM_MIX, base_mix),
    ) {
        let params = DegradeParams {
            bits,
            downsample,
            jitter,
            noise,
            tone,
            mix,
        };
        for i in 0..frames {
            let (input_l, input_r) = stereo_input(input, i);
            let (left, right) = state.process(input_l, input_r, params, sample_rate);
            out.left[i] = left;
            if input.channels == 2 {
                out.right[i] = right;
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let params = DegradeParams {
            bits: param_at(access, prior, params, PARAM_BITS, base_bits, i, frames),
            downsample: param_at(
                access,
                prior,
                params,
                PARAM_DOWNSAMPLE,
                base_downsample,
                i,
                frames,
            ),
            jitter: param_at(access, prior, params, PARAM_JITTER, base_jitter, i, frames),
            noise: param_at(access, prior, params, PARAM_NOISE, base_noise, i, frames),
            tone: param_at(access, prior, params, PARAM_TONE, base_tone, i, frames),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
        };
        let (input_l, input_r) = stereo_input(input, i);
        let (left, right) = state.process(input_l, input_r, params, sample_rate);
        out.left[i] = left;
        if input.channels == 2 {
            out.right[i] = right;
        }
    }
    Some(())
}

pub(crate) fn render_wavefolder(
    input_index: usize,
    base_drive: f64,
    base_depth: f64,
    base_asymmetry: f64,
    base_tone: f64,
    base_mix: f64,
    base_output: f64,
    state: &mut WavefolderState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let (Some(drive), Some(depth), Some(asymmetry), Some(tone), Some(mix), Some(output)) = (
        access.static_param(params, PARAM_DRIVE, base_drive),
        access.static_param(params, PARAM_DEPTH, base_depth),
        access.static_param(params, PARAM_ASYMMETRY, base_asymmetry),
        access.static_param(params, PARAM_TONE, base_tone),
        access.static_param(params, PARAM_MIX, base_mix),
        access.static_param(params, PARAM_OUTPUT, base_output),
    ) {
        let params = WavefolderParams {
            drive,
            depth,
            asymmetry,
            tone,
            mix,
            output,
        };
        for i in 0..frames {
            let (input_l, input_r) = stereo_input(input, i);
            let (left, right) = state.process(input_l, input_r, params, sample_rate);
            out.left[i] = left;
            if input.channels == 2 {
                out.right[i] = right;
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let params = WavefolderParams {
            drive: param_at(access, prior, params, PARAM_DRIVE, base_drive, i, frames),
            depth: param_at(access, prior, params, PARAM_DEPTH, base_depth, i, frames),
            asymmetry: param_at(
                access,
                prior,
                params,
                PARAM_ASYMMETRY,
                base_asymmetry,
                i,
                frames,
            ),
            tone: param_at(access, prior, params, PARAM_TONE, base_tone, i, frames),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
            output: param_at(access, prior, params, PARAM_OUTPUT, base_output, i, frames),
        };
        let (input_l, input_r) = stereo_input(input, i);
        let (left, right) = state.process(input_l, input_r, params, sample_rate);
        out.left[i] = left;
        if input.channels == 2 {
            out.right[i] = right;
        }
    }
    Some(())
}

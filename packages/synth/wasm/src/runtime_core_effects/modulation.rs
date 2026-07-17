use super::common::stereo_input;
use crate::dsp::{EnsembleChorusParams, EnsembleChorusState};
use crate::runtime_params::{
    param_at, ParamAccess, PARAM_DEPTH, PARAM_MIX, PARAM_NOISE, PARAM_RATE, PARAM_TONE, PARAM_WIDTH,
};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_ensemble_chorus(
    input_index: usize,
    base_rate: f64,
    base_depth: f64,
    base_mix: f64,
    base_width: f64,
    base_tone: f64,
    base_noise: f64,
    state: &mut EnsembleChorusState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = 2;

    if let (Some(rate_hz), Some(depth_ms), Some(mix), Some(width), Some(tone), Some(noise)) = (
        access.static_param(params, PARAM_RATE, base_rate),
        access.static_param(params, PARAM_DEPTH, base_depth),
        access.static_param(params, PARAM_MIX, base_mix),
        access.static_param(params, PARAM_WIDTH, base_width),
        access.static_param(params, PARAM_TONE, base_tone),
        access.static_param(params, PARAM_NOISE, base_noise),
    ) {
        let params = EnsembleChorusParams {
            rate_hz,
            depth_ms,
            mix,
            width,
            tone,
            noise,
        };
        for i in 0..frames {
            let (input_l, input_r) = stereo_input(input, i);
            (out.left[i], out.right[i]) = state.process(input_l, input_r, params, sample_rate);
        }
        return Some(());
    }

    for i in 0..frames {
        let params = EnsembleChorusParams {
            rate_hz: param_at(access, prior, params, PARAM_RATE, base_rate, i, frames),
            depth_ms: param_at(access, prior, params, PARAM_DEPTH, base_depth, i, frames),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
            width: param_at(access, prior, params, PARAM_WIDTH, base_width, i, frames),
            tone: param_at(access, prior, params, PARAM_TONE, base_tone, i, frames),
            noise: param_at(access, prior, params, PARAM_NOISE, base_noise, i, frames),
        };
        let (input_l, input_r) = stereo_input(input, i);
        (out.left[i], out.right[i]) = state.process(input_l, input_r, params, sample_rate);
    }
    Some(())
}

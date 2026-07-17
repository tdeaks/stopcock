use super::common::stereo_input;
use crate::dsp::{RotarySpeakerParams, RotarySpeakerState};
use crate::runtime_params::{
    param_at, ParamAccess, PARAM_DEPTH, PARAM_DRIVE, PARAM_FREQ, PARAM_MIX, PARAM_RATE, PARAM_WIDTH,
};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_rotary_speaker(
    input_index: usize,
    base_rate: f64,
    base_depth: f64,
    base_mix: f64,
    base_drive: f64,
    base_width: f64,
    base_freq: f64,
    state: &mut RotarySpeakerState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = 2;

    if let (Some(rate_hz), Some(depth), Some(mix), Some(drive), Some(width), Some(crossover_hz)) = (
        access.static_param(params, PARAM_RATE, base_rate),
        access.static_param(params, PARAM_DEPTH, base_depth),
        access.static_param(params, PARAM_MIX, base_mix),
        access.static_param(params, PARAM_DRIVE, base_drive),
        access.static_param(params, PARAM_WIDTH, base_width),
        access.static_param(params, PARAM_FREQ, base_freq),
    ) {
        let params = RotarySpeakerParams {
            rate_hz,
            depth,
            mix,
            drive,
            width,
            crossover_hz,
        };
        for i in 0..frames {
            let (input_l, input_r) = stereo_input(input, i);
            let (left, right) = state.process(input_l, input_r, params, sample_rate);
            out.left[i] = left;
            out.right[i] = right;
        }
        return Some(());
    }

    for i in 0..frames {
        let params = RotarySpeakerParams {
            rate_hz: param_at(access, prior, params, PARAM_RATE, base_rate, i, frames),
            depth: param_at(access, prior, params, PARAM_DEPTH, base_depth, i, frames),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
            drive: param_at(access, prior, params, PARAM_DRIVE, base_drive, i, frames),
            width: param_at(access, prior, params, PARAM_WIDTH, base_width, i, frames),
            crossover_hz: param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames),
        };
        let (input_l, input_r) = stereo_input(input, i);
        let (left, right) = state.process(input_l, input_r, params, sample_rate);
        out.left[i] = left;
        out.right[i] = right;
    }
    Some(())
}

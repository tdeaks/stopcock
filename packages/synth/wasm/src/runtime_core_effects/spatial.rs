use super::common::stereo_input;
use crate::dsp::{StereoSpreadParams, StereoSpreadState};
use crate::runtime_params::{param_at, ParamAccess, PARAM_DELAY_MS, PARAM_MIX, PARAM_WIDTH};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_stereo_spread(
    input_index: usize,
    base_width: f64,
    base_delay_ms: f64,
    base_mix: f64,
    state: &mut StereoSpreadState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = 2;

    if let (Some(width), Some(delay_ms), Some(mix)) = (
        access.static_param(params, PARAM_WIDTH, base_width),
        access.static_param(params, PARAM_DELAY_MS, base_delay_ms),
        access.static_param(params, PARAM_MIX, base_mix),
    ) {
        let params = StereoSpreadParams {
            width,
            delay_ms,
            mix,
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
        let params = StereoSpreadParams {
            width: param_at(access, prior, params, PARAM_WIDTH, base_width, i, frames),
            delay_ms: param_at(
                access,
                prior,
                params,
                PARAM_DELAY_MS,
                base_delay_ms,
                i,
                frames,
            ),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
        };
        let (input_l, input_r) = stereo_input(input, i);
        let (left, right) = state.process(input_l, input_r, params, sample_rate);
        out.left[i] = left;
        out.right[i] = right;
    }
    Some(())
}

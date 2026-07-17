use super::common::stereo_input;
use crate::dsp::{TiltEqParams, TiltEqState};
use crate::runtime_params::{param_at, ParamAccess, PARAM_FREQ, PARAM_GAIN_DB, PARAM_MIX};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_tilt_eq(
    input_index: usize,
    base_freq: f64,
    base_gain_db: f64,
    base_mix: f64,
    state: &mut TiltEqState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let (Some(freq), Some(gain_db), Some(mix)) = (
        access.static_param(params, PARAM_FREQ, base_freq),
        access.static_param(params, PARAM_GAIN_DB, base_gain_db),
        access.static_param(params, PARAM_MIX, base_mix),
    ) {
        let params = TiltEqParams { freq, gain_db, mix };
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
        let params = TiltEqParams {
            freq: param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames),
            gain_db: param_at(
                access,
                prior,
                params,
                PARAM_GAIN_DB,
                base_gain_db,
                i,
                frames,
            ),
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

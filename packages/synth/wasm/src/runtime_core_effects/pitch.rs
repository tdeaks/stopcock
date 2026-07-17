use super::common::stereo_input;
use crate::dsp::{FrequencyShifterParams, FrequencyShifterState};
use crate::runtime_params::{param_at, ParamAccess, PARAM_MIX, PARAM_SHIFT_HZ};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_frequency_shifter(
    input_index: usize,
    base_shift_hz: f64,
    base_mix: f64,
    state: &mut FrequencyShifterState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let (Some(shift_hz), Some(mix)) = (
        access.static_param(params, PARAM_SHIFT_HZ, base_shift_hz),
        access.static_param(params, PARAM_MIX, base_mix),
    ) {
        let params = FrequencyShifterParams { shift_hz, mix };
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
        let params = FrequencyShifterParams {
            shift_hz: param_at(
                access,
                prior,
                params,
                PARAM_SHIFT_HZ,
                base_shift_hz,
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

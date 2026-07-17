use crate::dsp::{PhaserParams, PhaserState, PhaserVoicing};
use crate::runtime_params::{param_at, ParamAccess, PARAM_DEPTH, PARAM_MIX, PARAM_RATE};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_phaser(
    input_index: usize,
    voicing: PhaserVoicing,
    base_rate: f64,
    base_depth: f64,
    base_mix: f64,
    left: &mut PhaserState,
    right: &mut PhaserState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let (Some(rate_hz), Some(depth), Some(mix)) = (
        access.static_param(params, PARAM_RATE, base_rate),
        access.static_param(params, PARAM_DEPTH, base_depth),
        access.static_param(params, PARAM_MIX, base_mix),
    ) {
        let params = PhaserParams {
            voicing,
            rate_hz,
            depth,
            mix,
        };
        for i in 0..frames {
            out.left[i] = left.process_sample(input.left[i] as f64, params) as f32;
        }
        if input.channels == 2 {
            for i in 0..frames {
                out.right[i] = right.process_sample(input.right[i] as f64, params) as f32;
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let params = PhaserParams {
            voicing,
            rate_hz: param_at(access, prior, params, PARAM_RATE, base_rate, i, frames),
            depth: param_at(access, prior, params, PARAM_DEPTH, base_depth, i, frames),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
        };
        out.left[i] = left.process_sample(input.left[i] as f64, params) as f32;
        if input.channels == 2 {
            out.right[i] = right.process_sample(input.right[i] as f64, params) as f32;
        }
    }
    Some(())
}

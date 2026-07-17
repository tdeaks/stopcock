#![allow(clippy::too_many_arguments)]

use crate::dsp::{clamp, ReverbLine};
use crate::runtime_params::{param_at, ParamAccess, PARAM_MIX};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_reverb(
    input_index: usize,
    ir: &[f32],
    base_mix: f64,
    left: &mut ReverbLine,
    right: &mut ReverbLine,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let Some(mix) = access.static_param(params, PARAM_MIX, base_mix) {
        let mix = clamp(mix, 0.0, 1.0) as f32;
        for i in 0..frames {
            let wet_l = left.process(input.left[i], ir);
            out.left[i] = input.left[i] * (1.0 - mix) + wet_l * mix;
            if input.channels == 2 {
                let wet_r = right.process(input.right[i], ir);
                out.right[i] = input.right[i] * (1.0 - mix) + wet_r * mix;
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let mix = clamp(
            param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
            0.0,
            1.0,
        ) as f32;
        let wet_l = left.process(input.left[i], ir);
        out.left[i] = input.left[i] * (1.0 - mix) + wet_l * mix;
        if input.channels == 2 {
            let wet_r = right.process(input.right[i], ir);
            out.right[i] = input.right[i] * (1.0 - mix) + wet_r * mix;
        }
    }
    Some(())
}

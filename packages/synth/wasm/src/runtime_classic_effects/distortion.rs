#![allow(clippy::too_many_arguments)]

use crate::dsp::clamp;
use crate::runtime_node::DistortionShape;
use crate::runtime_params::{param_at, ParamAccess, PARAM_AMOUNT};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_distortion(
    input_index: usize,
    shape: DistortionShape,
    base_amount: f64,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let Some(amount) = access.static_param(params, PARAM_AMOUNT, base_amount) {
        let drive = 1.0 + amount.max(0.0) * 24.0;
        for i in 0..frames {
            out.left[i] = distort_sample(input.left[i], drive, shape);
            if input.channels == 2 {
                out.right[i] = distort_sample(input.right[i], drive, shape);
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let amount = param_at(access, prior, params, PARAM_AMOUNT, base_amount, i, frames).max(0.0);
        let drive = 1.0 + amount * 24.0;
        out.left[i] = distort_sample(input.left[i], drive, shape);
        if input.channels == 2 {
            out.right[i] = distort_sample(input.right[i], drive, shape);
        }
    }
    Some(())
}

fn distort_sample(input: f32, drive: f64, shape: DistortionShape) -> f32 {
    let x = input as f64 * drive;
    match shape {
        DistortionShape::Hardclip => clamp(x, -1.0, 1.0) as f32,
        DistortionShape::Softclip => (x / (1.0 + x.abs())) as f32,
        DistortionShape::Tanh => x.tanh() as f32,
    }
}

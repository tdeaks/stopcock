use crate::dsp::sample_linear;
use crate::runtime_params::{param_at, ParamAccess, PARAM_VALUE};
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_constant(
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    value: f64,
) -> Option<()> {
    if let Some(value) = access.static_param(params, PARAM_VALUE, value) {
        out.left[..frames].fill(value as f32);
        return Some(());
    }

    for i in 0..frames {
        out.left[i] = param_at(access, prior, params, PARAM_VALUE, value, i, frames) as f32;
    }
    Some(())
}

pub(crate) fn render_buffer(
    out: &mut NodeBuffer,
    frames: usize,
    samples: &[f32],
    rate: f64,
    looped: bool,
    position: &mut f64,
) -> Option<()> {
    if samples.is_empty() {
        return Some(());
    }
    for i in 0..frames {
        if looped {
            let wrapped = *position % samples.len() as f64;
            out.left[i] = sample_linear(samples, wrapped);
        } else if *position < samples.len() as f64 {
            out.left[i] = sample_linear(samples, *position);
        }
        *position += rate;
    }
    Some(())
}

pub(crate) fn render_input(
    channel: usize,
    inputs: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
) -> Option<()> {
    if let Some(input) = inputs.get(channel) {
        let count = frames.min(input.len());
        out.left[..count].copy_from_slice(&input[..count]);
    }
    Some(())
}

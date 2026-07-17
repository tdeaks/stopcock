use crate::dsp::{clamp, equal_power_pan};
use crate::runtime_params::{param_at, ParamAccess, PARAM_AMOUNT, PARAM_POSITION};
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_gain(
    input_index: usize,
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
        let amount = amount as f32;
        for i in 0..frames {
            out.left[i] = input.left[i] * amount;
            if input.channels == 2 {
                out.right[i] = input.right[i] * amount;
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let amount = param_at(access, prior, params, PARAM_AMOUNT, base_amount, i, frames) as f32;
        out.left[i] = input.left[i] * amount;
        if input.channels == 2 {
            out.right[i] = input.right[i] * amount;
        }
    }
    Some(())
}

pub(crate) fn render_pan(
    input_index: usize,
    base_position: f64,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = 2;
    if let Some(position) = access.static_param(params, PARAM_POSITION, base_position) {
        let position = clamp(position, -1.0, 1.0);
        let (left_gain, right_gain) = equal_power_pan(position);
        let left_gain = left_gain as f32;
        let right_gain = right_gain as f32;
        if input.channels == 2 {
            for i in 0..frames {
                let mono = (input.left[i] + input.right[i]) * 0.5;
                out.left[i] = mono * left_gain;
                out.right[i] = mono * right_gain;
            }
        } else {
            for i in 0..frames {
                let mono = input.left[i];
                out.left[i] = mono * left_gain;
                out.right[i] = mono * right_gain;
            }
        }
        return Some(());
    }

    if input.channels == 2 {
        for i in 0..frames {
            let position = clamp(
                param_at(
                    access,
                    prior,
                    params,
                    PARAM_POSITION,
                    base_position,
                    i,
                    frames,
                ),
                -1.0,
                1.0,
            );
            let (left_gain, right_gain) = equal_power_pan(position);
            let mono = (input.left[i] + input.right[i]) * 0.5;
            out.left[i] = mono * left_gain as f32;
            out.right[i] = mono * right_gain as f32;
        }
    } else {
        for i in 0..frames {
            let position = clamp(
                param_at(
                    access,
                    prior,
                    params,
                    PARAM_POSITION,
                    base_position,
                    i,
                    frames,
                ),
                -1.0,
                1.0,
            );
            let (left_gain, right_gain) = equal_power_pan(position);
            let mono = input.left[i];
            out.left[i] = mono * left_gain as f32;
            out.right[i] = mono * right_gain as f32;
        }
    }
    Some(())
}

pub(crate) fn render_mix(
    channels: u8,
    inputs: &[usize],
    prior: &[NodeBuffer],
    out: &mut NodeBuffer,
    frames: usize,
) -> Option<()> {
    out.channels = channels;
    for input_index in inputs {
        let source = input_at(*input_index, prior)?;
        if channels == 2 {
            for i in 0..frames {
                out.left[i] += source.left[i];
                out.right[i] += if source.channels == 2 {
                    source.right[i]
                } else {
                    source.left[i]
                };
            }
        } else if source.channels == 2 {
            for i in 0..frames {
                out.left[i] += (source.left[i] + source.right[i]) * 0.5;
            }
        } else {
            for i in 0..frames {
                out.left[i] += source.left[i];
            }
        }
    }
    Some(())
}

pub(crate) fn render_stereo(
    left_index: usize,
    right_index: usize,
    prior: &[NodeBuffer],
    out: &mut NodeBuffer,
    frames: usize,
) -> Option<()> {
    let left = input_at(left_index, prior)?;
    let right = input_at(right_index, prior)?;
    out.channels = 2;
    match (left.channels, right.channels) {
        (2, 2) => {
            for i in 0..frames {
                out.left[i] = (left.left[i] + left.right[i]) * 0.5;
                out.right[i] = (right.left[i] + right.right[i]) * 0.5;
            }
        }
        (2, _) => {
            for i in 0..frames {
                out.left[i] = (left.left[i] + left.right[i]) * 0.5;
                out.right[i] = right.left[i];
            }
        }
        (_, 2) => {
            for i in 0..frames {
                out.left[i] = left.left[i];
                out.right[i] = (right.left[i] + right.right[i]) * 0.5;
            }
        }
        _ => {
            for i in 0..frames {
                out.left[i] = left.left[i];
                out.right[i] = right.left[i];
            }
        }
    }
    Some(())
}

pub(crate) fn input_at(input_index: usize, prior: &[NodeBuffer]) -> Option<&NodeBuffer> {
    prior.get(input_index)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime_params::{ParamAccess, PARAM_AMOUNT, PARAM_POSITION};

    fn mono_buffer(samples: &[f32]) -> NodeBuffer {
        let mut buffer = NodeBuffer::new(1, samples.len());
        buffer.left.copy_from_slice(samples);
        buffer
    }

    fn stereo_buffer(left: &[f32], right: &[f32]) -> NodeBuffer {
        let mut buffer = NodeBuffer::new(2, left.len());
        buffer.left.copy_from_slice(left);
        buffer.right.copy_from_slice(right);
        buffer
    }

    #[test]
    fn gain_renderer_preserves_stereo_shape_and_amount() {
        let prior = [stereo_buffer(&[0.25, -0.5, 1.0], &[0.5, 0.25, -1.0])];
        let mut out = NodeBuffer::new(1, 3);

        render_gain(0, 2.0, &ParamAccess::default(), &prior, &[], &mut out, 3)
            .expect("gain should render");

        assert_eq!(out.channels, 2);
        assert_eq!(&out.left[..3], &[0.5, -1.0, 2.0]);
        assert_eq!(&out.right[..3], &[1.0, 0.5, -2.0]);
    }

    #[test]
    fn gain_renderer_uses_amount_param_slot() {
        let prior = [mono_buffer(&[1.0, 1.0, 1.0])];
        let params: [&[f32]; 1] = [&[0.25, 0.5, 0.75]];
        let mut out = NodeBuffer::new(1, 3);

        render_gain(
            0,
            1.0,
            &ParamAccess::for_test([(PARAM_AMOUNT, 0)]),
            &prior,
            &params,
            &mut out,
            3,
        )
        .expect("gain should render");

        assert_eq!(out.channels, 1);
        assert_eq!(&out.left[..3], &[0.25, 0.5, 0.75]);
    }

    #[test]
    fn gain_renderer_uses_scalar_amount_slot_as_static_param() {
        let prior = [stereo_buffer(&[1.0, -1.0], &[0.5, -0.5])];
        let params: [&[f32]; 1] = [&[0.25]];
        let mut out = NodeBuffer::new(1, 2);

        render_gain(
            0,
            1.0,
            &ParamAccess::for_test([(PARAM_AMOUNT, 0)]),
            &prior,
            &params,
            &mut out,
            2,
        )
        .expect("gain should render");

        assert_eq!(out.channels, 2);
        assert_eq!(&out.left[..2], &[0.25, -0.25]);
        assert_eq!(&out.right[..2], &[0.125, -0.125]);
    }

    #[test]
    fn pan_renderer_uses_scalar_position_slot_as_static_param() {
        let prior = [mono_buffer(&[1.0, 1.0])];
        let params: [&[f32]; 1] = [&[1.0]];
        let mut out = NodeBuffer::new(1, 2);

        render_pan(
            0,
            0.0,
            &ParamAccess::for_test([(PARAM_POSITION, 0)]),
            &prior,
            &params,
            &mut out,
            2,
        )
        .expect("pan should render");

        assert_eq!(out.channels, 2);
        assert!(out.left[..2].iter().all(|sample| sample.abs() < 1e-6));
        assert!(out.right[..2]
            .iter()
            .all(|sample| (*sample - 1.0).abs() < 1e-6));
    }

    #[test]
    fn mix_renderer_expands_mono_to_stereo() {
        let prior = [
            mono_buffer(&[0.25, 0.5, 0.75]),
            stereo_buffer(&[1.0, 0.5, 0.25], &[-1.0, -0.5, -0.25]),
        ];
        let mut out = NodeBuffer::new(1, 3);

        render_mix(2, &[0, 1], &prior, &mut out, 3).expect("mix should render");

        assert_eq!(out.channels, 2);
        assert_eq!(&out.left[..3], &[1.25, 1.0, 1.0]);
        assert_eq!(&out.right[..3], &[-0.75, 0.0, 0.5]);
    }

    #[test]
    fn stereo_renderer_uses_mono_samples_from_each_side() {
        let prior = [
            stereo_buffer(&[1.0, 0.5], &[0.0, -0.5]),
            mono_buffer(&[-1.0, 0.25]),
        ];
        let mut out = NodeBuffer::new(1, 2);

        render_stereo(0, 1, &prior, &mut out, 2).expect("stereo should render");

        assert_eq!(out.channels, 2);
        assert_eq!(&out.left[..2], &[0.5, 0.0]);
        assert_eq!(&out.right[..2], &[-1.0, 0.25]);
    }
}

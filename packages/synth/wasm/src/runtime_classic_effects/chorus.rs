#![allow(clippy::too_many_arguments)]

use crate::dsp::{clamp, sine_lfo_at, DelayLine};
use crate::runtime_params::{param_at, ParamAccess, PARAM_DEPTH, PARAM_MIX, PARAM_RATE};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_chorus(
    input_index: usize,
    base_rate: f64,
    base_depth: f64,
    base_mix: f64,
    left: &mut DelayLine,
    right: &mut DelayLine,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    frame_start: usize,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let (Some(rate), Some(depth), Some(mix)) = (
        access.static_param(params, PARAM_RATE, base_rate),
        access.static_param(params, PARAM_DEPTH, base_depth),
        access.static_param(params, PARAM_MIX, base_mix),
    ) {
        process_static_chorus_channel(
            rate.max(0.0),
            depth.max(0.0),
            clamp(mix, 0.0, 1.0) as f32,
            &input.left,
            &mut out.left,
            frames,
            sample_rate,
            frame_start,
            left,
        );
        if input.channels == 2 {
            process_static_chorus_channel(
                rate.max(0.0),
                depth.max(0.0),
                clamp(mix, 0.0, 1.0) as f32,
                &input.right,
                &mut out.right,
                frames,
                sample_rate,
                frame_start,
                right,
            );
        }
        return Some(());
    }

    process_dynamic_chorus_channel(
        base_rate,
        base_depth,
        base_mix,
        access,
        prior,
        params,
        &input.left,
        &mut out.left,
        frames,
        sample_rate,
        frame_start,
        left,
    );
    if input.channels == 2 {
        process_dynamic_chorus_channel(
            base_rate,
            base_depth,
            base_mix,
            access,
            prior,
            params,
            &input.right,
            &mut out.right,
            frames,
            sample_rate,
            frame_start,
            right,
        );
    }
    Some(())
}

fn process_static_chorus_channel(
    rate: f64,
    depth: f64,
    mix: f32,
    input: &[f32],
    out: &mut [f32],
    frames: usize,
    sample_rate: f64,
    frame_start: usize,
    state: &mut DelayLine,
) {
    for i in 0..frames {
        let delay_ms =
            8.0 + depth * (0.5 + 0.5 * sine_lfo_at(rate, sample_rate, frame_start + i, 0.0));
        let delay_samples = clamp(
            (delay_ms * sample_rate / 1000.0).round(),
            1.0,
            (state.len() - 1) as f64,
        ) as usize;
        let wet = state.read_integer(delay_samples);
        out[i] = input[i] * (1.0 - mix) + wet * mix;
        state.push(input[i]);
    }
}

fn process_dynamic_chorus_channel(
    base_rate: f64,
    base_depth: f64,
    base_mix: f64,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    input: &[f32],
    out: &mut [f32],
    frames: usize,
    sample_rate: f64,
    frame_start: usize,
    state: &mut DelayLine,
) {
    for i in 0..frames {
        let rate = param_at(access, prior, params, PARAM_RATE, base_rate, i, frames).max(0.0);
        let depth = param_at(access, prior, params, PARAM_DEPTH, base_depth, i, frames).max(0.0);
        let mix = clamp(
            param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
            0.0,
            1.0,
        ) as f32;
        let delay_ms =
            8.0 + depth * (0.5 + 0.5 * sine_lfo_at(rate, sample_rate, frame_start + i, 0.0));
        let delay_samples = clamp(
            (delay_ms * sample_rate / 1000.0).round(),
            1.0,
            (state.len() - 1) as f64,
        ) as usize;
        let wet = state.read_integer(delay_samples);
        out[i] = input[i] * (1.0 - mix) + wet * mix;
        state.push(input[i]);
    }
}

use super::*;
use crate::dsp::{
    BiquadState, DelayLine, FeedbackDelay, FilterKind, ReverbLine, StateVariableFilterMode,
    StateVariableFilterState,
};
use crate::runtime_node::DistortionShape;
use crate::runtime_params::{
    ParamAccess, PARAM_AMOUNT, PARAM_DEPTH, PARAM_FREQ, PARAM_MIX, PARAM_RATE,
};
use crate::runtime_state::NodeBuffer;

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
fn delay_renderer_carries_state_across_samples() {
    let prior = [mono_buffer(&[1.0, 0.0, 0.0])];
    let mut left = FeedbackDelay::new(4);
    let mut right = FeedbackDelay::new(4);
    let mut out = NodeBuffer::new(1, 3);

    render_delay(
        0,
        1.0,
        0.0,
        1.0,
        &mut left,
        &mut right,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        3,
        1_000.0,
    )
    .expect("delay should render");

    assert_eq!(out.channels, 1);
    assert_eq!(&out.left[..3], &[0.0, 1.0, 0.0]);
}

#[test]
fn biquad_renderer_preserves_stereo_shape_with_static_params() {
    let prior = [stereo_buffer(&[1.0, 1.0, 1.0, 1.0], &[0.5, 0.5, 0.5, 0.5])];
    let mut left = BiquadState::default();
    let mut right = BiquadState::default();
    let mut out = NodeBuffer::new(1, 4);

    render_biquad(
        0,
        FilterKind::Lowpass,
        1_000.0,
        0.707,
        0.0,
        &mut left,
        &mut right,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        4,
        48_000.0,
    )
    .expect("biquad should render");

    assert_eq!(out.channels, 2);
    for i in 0..4 {
        assert!(out.left[i].is_finite());
        assert!(out.right[i].is_finite());
    }
}

#[test]
fn biquad_renderer_accepts_block_param_slots() {
    let prior = [mono_buffer(&[1.0, 0.5, 0.25, 0.0])];
    let mut left = BiquadState::default();
    let mut right = BiquadState::default();
    let mut out = NodeBuffer::new(1, 4);
    let freq = [400.0_f32, 800.0, 1_200.0, 1_600.0];

    render_biquad(
        0,
        FilterKind::Lowpass,
        1_000.0,
        0.707,
        0.0,
        &mut left,
        &mut right,
        &ParamAccess::for_test([(PARAM_FREQ, 0)]),
        &prior,
        &[&freq],
        &mut out,
        4,
        48_000.0,
    )
    .expect("biquad should render");

    assert_eq!(out.channels, 1);
    for sample in &out.left[..4] {
        assert!(sample.is_finite());
    }
}

#[test]
fn state_variable_filter_renderer_zero_mix_preserves_stereo_dry_signal() {
    let prior = [stereo_buffer(&[0.25, -0.5], &[0.5, -0.25])];
    let mut left = StateVariableFilterState::default();
    let mut right = StateVariableFilterState::default();
    let mut out = NodeBuffer::new(1, 2);

    render_state_variable_filter(
        0,
        StateVariableFilterMode::Lowpass,
        1_000.0,
        0.5,
        1.0,
        0.0,
        &mut left,
        &mut right,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        2,
        48_000.0,
    )
    .expect("state variable filter should render");

    assert_eq!(out.channels, 2);
    assert_eq!(&out.left[..2], &[0.25, -0.5]);
    assert_eq!(&out.right[..2], &[0.5, -0.25]);
}

#[test]
fn distortion_renderer_hard_clips_stereo() {
    let prior = [stereo_buffer(&[0.1, 0.0], &[-0.1, 0.0])];
    let mut out = NodeBuffer::new(1, 2);

    render_distortion(
        0,
        DistortionShape::Hardclip,
        1.0,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        2,
    )
    .expect("distortion should render");

    assert_eq!(out.channels, 2);
    assert_eq!(&out.left[..2], &[1.0, 0.0]);
    assert_eq!(&out.right[..2], &[-1.0, 0.0]);
}

#[test]
fn distortion_renderer_uses_scalar_amount_slot_as_static_param() {
    let prior = [stereo_buffer(&[0.1, 0.0], &[-0.1, 0.0])];
    let mut out = NodeBuffer::new(1, 2);
    let amount = [1.0];

    render_distortion(
        0,
        DistortionShape::Hardclip,
        0.0,
        &ParamAccess::for_test([(PARAM_AMOUNT, 0)]),
        &prior,
        &[&amount],
        &mut out,
        2,
    )
    .expect("distortion should render");

    assert_eq!(out.channels, 2);
    assert_eq!(&out.left[..2], &[1.0, 0.0]);
    assert_eq!(&out.right[..2], &[-1.0, 0.0]);
}

#[test]
fn reverb_renderer_zero_mix_returns_dry_stereo() {
    let prior = [stereo_buffer(&[0.25, -0.5], &[0.5, -0.25])];
    let mut left = ReverbLine::new(2);
    let mut right = ReverbLine::new(2);
    let mut out = NodeBuffer::new(1, 2);

    render_reverb(
        0,
        &[0.5, 0.25],
        0.0,
        &mut left,
        &mut right,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        2,
    )
    .expect("reverb should render");

    assert_eq!(out.channels, 2);
    assert_eq!(&out.left[..2], &[0.25, -0.5]);
    assert_eq!(&out.right[..2], &[0.5, -0.25]);
}

#[test]
fn reverb_renderer_uses_scalar_mix_slot_as_static_param() {
    let prior = [mono_buffer(&[1.0, 0.0])];
    let mut left = ReverbLine::new(1);
    let mut right = ReverbLine::new(1);
    let mut out = NodeBuffer::new(1, 2);
    let mix = [1.0];

    render_reverb(
        0,
        &[0.5],
        0.0,
        &mut left,
        &mut right,
        &ParamAccess::for_test([(PARAM_MIX, 0)]),
        &prior,
        &[&mix],
        &mut out,
        2,
    )
    .expect("reverb should render");

    assert_eq!(out.channels, 1);
    assert_eq!(&out.left[..2], &[0.5, 0.0]);
}

#[test]
fn chorus_renderer_zero_mix_returns_dry_signal() {
    let prior = [mono_buffer(&[0.25, -0.5, 0.75])];
    let mut left = DelayLine::new(32);
    let mut right = DelayLine::new(32);
    let mut out = NodeBuffer::new(1, 3);

    render_chorus(
        0,
        0.0,
        1.0,
        0.0,
        &mut left,
        &mut right,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        3,
        1_000.0,
        0,
    )
    .expect("chorus should render");

    assert_eq!(out.channels, 1);
    assert_eq!(&out.left[..3], &[0.25, -0.5, 0.75]);
}

#[test]
fn chorus_renderer_uses_scalar_param_slots_as_static_params() {
    let mut input = [0.0_f32; 16];
    input[0] = 1.0;
    let prior = [mono_buffer(&input)];
    let mut left = DelayLine::new(32);
    let mut right = DelayLine::new(32);
    let mut out = NodeBuffer::new(1, input.len());
    let rate = [0.0];
    let depth = [0.0];
    let mix = [1.0];

    render_chorus(
        0,
        1.0,
        8.0,
        0.0,
        &mut left,
        &mut right,
        &ParamAccess::for_test([(PARAM_RATE, 0), (PARAM_DEPTH, 1), (PARAM_MIX, 2)]),
        &prior,
        &[&rate, &depth, &mix],
        &mut out,
        input.len(),
        1_000.0,
        0,
    )
    .expect("chorus should render");

    assert_eq!(out.channels, 1);
    assert!(out.left[8..].iter().any(|sample| sample.abs() > 0.5));
}

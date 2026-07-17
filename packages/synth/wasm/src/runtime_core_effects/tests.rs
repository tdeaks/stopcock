use super::{
    render_bitcrush, render_compressor, render_degrade, render_ensemble_chorus,
    render_frequency_shifter, render_micro_pitch, render_multi_tap_delay, render_nonlinear_reverb,
    render_plate_reverb, render_rotary_speaker, render_saturator, render_space_echo,
    render_spring_reverb, render_stereo_spread, render_tape_delay, render_tilt_eq,
    render_wavefolder,
};
use crate::dsp::{
    BitcrusherState, CompressorState, EnsembleChorusState, FrequencyShifterState, MicroPitchState,
    MultiTapDelayState, MultiTapDelayTap, NonlinearReverbState, PlateReverbState,
    RotarySpeakerState, SaturatorState, SpringReverbState, StereoSpreadState, TapeDelayState,
    TapeEchoState, TiltEqState, WavefolderState,
};
use crate::runtime_params::{
    ParamAccess, PARAM_ASYMMETRY, PARAM_ATTACK, PARAM_BITS, PARAM_DAMPING, PARAM_DECAY,
    PARAM_DELAY_MS, PARAM_DEPTH, PARAM_DETUNE, PARAM_DIFFUSION, PARAM_DOWNSAMPLE, PARAM_DRIP,
    PARAM_DRIVE, PARAM_FEEDBACK, PARAM_FLUTTER, PARAM_FREQ, PARAM_GAIN_DB, PARAM_JITTER, PARAM_MIX,
    PARAM_MODULATION, PARAM_NOISE, PARAM_OUTPUT, PARAM_PRE_DELAY_MS, PARAM_RATE, PARAM_RATIO,
    PARAM_RELEASE, PARAM_REVERB_MIX, PARAM_TAPE_AGE, PARAM_TENSION, PARAM_THRESHOLD, PARAM_TIME_MS,
    PARAM_TONE, PARAM_WIDTH, PARAM_WOW,
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
fn bitcrush_renderer_holds_downsampled_values() {
    let prior = [mono_buffer(&[1.0, -1.0, 0.0])];
    let mut left = BitcrusherState::default();
    let mut right = BitcrusherState::default();
    let mut out = NodeBuffer::new(1, 3);

    render_bitcrush(
        0,
        2.0,
        2.0,
        &mut left,
        &mut right,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        3,
    )
    .expect("bitcrush should render");

    assert_eq!(out.channels, 1);
    assert_eq!(&out.left[..3], &[1.0, 1.0, 0.0]);
}

#[test]
fn bitcrush_renderer_uses_scalar_param_slots_as_static_params() {
    let prior = [mono_buffer(&[0.37, -0.37, 0.37, -0.37])];
    let mut left = BitcrusherState::default();
    let mut right = BitcrusherState::default();
    let mut out = NodeBuffer::new(1, 4);
    let bits = [2.0];
    let downsample = [1.0];
    let access = ParamAccess::for_test([(PARAM_BITS, 0), (PARAM_DOWNSAMPLE, 1)]);

    render_bitcrush(
        0,
        24.0,
        1.0,
        &mut left,
        &mut right,
        &access,
        &prior,
        &[&bits, &downsample],
        &mut out,
        4,
    )
    .expect("bitcrush should render");

    assert!(out.left[..4]
        .iter()
        .zip(prior[0].left[..4].iter())
        .any(|(wet, dry)| (*wet - *dry).abs() > 1e-3));
}

#[test]
fn compressor_renderer_uses_scalar_param_slots_as_static_params() {
    let prior = [mono_buffer(&[1.0; 64])];
    let mut left = CompressorState::default();
    let mut right = CompressorState::default();
    let mut out = NodeBuffer::new(1, 64);
    let threshold = [-36.0];
    let ratio = [8.0];
    let attack = [0.001];
    let release = [0.02];
    let access = ParamAccess::for_test([
        (PARAM_THRESHOLD, 0),
        (PARAM_RATIO, 1),
        (PARAM_ATTACK, 2),
        (PARAM_RELEASE, 3),
    ]);

    render_compressor(
        0,
        0.0,
        1.0,
        0.01,
        0.1,
        3.0,
        &mut left,
        &mut right,
        &access,
        &prior,
        &[&threshold, &ratio, &attack, &release],
        &mut out,
        64,
        48_000.0,
    )
    .expect("compressor should render");

    assert!(out.left[32..64].iter().any(|sample| *sample < 0.9));
}

#[test]
fn micro_pitch_zero_mix_expands_mono_dry_to_stereo() {
    let prior = [mono_buffer(&[0.25, -0.5])];
    let mut state = MicroPitchState::new(1_000.0);
    let mut out = NodeBuffer::new(1, 2);

    render_micro_pitch(
        0,
        9.0,
        1.0,
        12.0,
        0.0,
        &mut state,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        2,
        1_000.0,
    )
    .expect("micro pitch should render");

    assert_eq!(out.channels, 2);
    assert_eq!(&out.left[..2], &[0.25, -0.5]);
    assert_eq!(&out.right[..2], &[0.25, -0.5]);
}

#[test]
fn micro_pitch_renderer_uses_scalar_param_slots_as_static_params() {
    let prior = [mono_buffer(&[0.5; 64])];
    let mut state = MicroPitchState::new(1_000.0);
    let mut out = NodeBuffer::new(1, 64);
    let detune = [12.0];
    let width = [1.0];
    let delay_ms = [1.0];
    let mix = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_DETUNE, 0),
        (PARAM_WIDTH, 1),
        (PARAM_DELAY_MS, 2),
        (PARAM_MIX, 3),
    ]);

    render_micro_pitch(
        0,
        0.0,
        0.0,
        12.0,
        0.0,
        &mut state,
        &access,
        &prior,
        &[&detune, &width, &delay_ms, &mix],
        &mut out,
        64,
        1_000.0,
    )
    .expect("micro pitch should render");

    assert_eq!(out.channels, 2);
    assert!(out.left[..64]
        .iter()
        .zip(prior[0].left[..64].iter())
        .any(|(wet, dry)| (*wet - *dry).abs() > 1e-3));
}

#[test]
fn tape_delay_renderer_uses_scalar_param_slots_as_static_params() {
    let mut input = [0.0_f32; 16];
    input[0] = 1.0;
    let prior = [mono_buffer(&input)];
    let mut state = TapeDelayState::new(1_000.0);
    let mut out = NodeBuffer::new(1, input.len());
    let time_ms = [2.0];
    let feedback = [0.0];
    let mix = [1.0];
    let wow = [0.0];
    let flutter = [0.0];
    let tape_age = [0.0];
    let drive = [0.0];
    let tone = [1.0];
    let width = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_TIME_MS, 0),
        (PARAM_FEEDBACK, 1),
        (PARAM_MIX, 2),
        (PARAM_WOW, 3),
        (PARAM_FLUTTER, 4),
        (PARAM_TAPE_AGE, 5),
        (PARAM_DRIVE, 6),
        (PARAM_TONE, 7),
        (PARAM_WIDTH, 8),
    ]);

    render_tape_delay(
        0,
        2.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
        1.0,
        &mut state,
        &access,
        &prior,
        &[
            &time_ms, &feedback, &mix, &wow, &flutter, &tape_age, &drive, &tone, &width,
        ],
        &mut out,
        input.len(),
        1_000.0,
    )
    .expect("tape delay should render");

    assert_eq!(out.channels, 2);
    assert!(
        out.left[5..].iter().any(|sample| sample.abs() > 0.1)
            || out.right[5..].iter().any(|sample| sample.abs() > 0.1)
    );
}

#[test]
fn multi_tap_delay_renderer_uses_scalar_param_slots_as_static_params() {
    let mut input = [0.0_f32; 16];
    input[0] = 1.0;
    let prior = [mono_buffer(&input)];
    let taps = [MultiTapDelayTap::new(1.0, 1.0, 0.0)];
    let mut state = MultiTapDelayState::new(1_000.0);
    let mut out = NodeBuffer::new(1, input.len());
    let time_ms = [2.0];
    let feedback = [0.0];
    let mix = [1.0];
    let tone = [1.0];
    let width = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_TIME_MS, 0),
        (PARAM_FEEDBACK, 1),
        (PARAM_MIX, 2),
        (PARAM_TONE, 3),
        (PARAM_WIDTH, 4),
    ]);

    render_multi_tap_delay(
        0,
        2.0,
        0.0,
        0.0,
        1.0,
        1.0,
        &taps,
        &mut state,
        &access,
        &prior,
        &[&time_ms, &feedback, &mix, &tone, &width],
        &mut out,
        input.len(),
        1_000.0,
    )
    .expect("multi-tap delay should render");

    assert_eq!(out.channels, 2);
    assert!(out.left[2].abs() > 0.1 || out.right[2].abs() > 0.1);
}

#[test]
fn space_echo_renderer_uses_scalar_param_slots_as_static_params() {
    let mut input = [0.0_f32; 48];
    input[0] = 1.0;
    let prior = [mono_buffer(&input)];
    let mut state = TapeEchoState::new(1_000.0);
    let mut out = NodeBuffer::new(1, input.len());
    let time_ms = [10.0];
    let feedback = [0.0];
    let mix = [1.0];
    let reverb_mix = [0.0];
    let wow = [0.0];
    let flutter = [0.0];
    let tape_age = [0.0];
    let drive = [0.0];
    let access = ParamAccess::for_test([
        (PARAM_TIME_MS, 0),
        (PARAM_FEEDBACK, 1),
        (PARAM_MIX, 2),
        (PARAM_REVERB_MIX, 3),
        (PARAM_WOW, 4),
        (PARAM_FLUTTER, 5),
        (PARAM_TAPE_AGE, 6),
        (PARAM_DRIVE, 7),
    ]);

    render_space_echo(
        0,
        10.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        3.0,
        true,
        true,
        true,
        &mut state,
        &access,
        &prior,
        &[
            &time_ms,
            &feedback,
            &mix,
            &reverb_mix,
            &wow,
            &flutter,
            &tape_age,
            &drive,
        ],
        &mut out,
        input.len(),
        1_000.0,
        0,
    )
    .expect("space echo should render");

    assert_eq!(out.channels, 2);
    assert!(out.left[20].abs() > 0.1 || out.right[20].abs() > 0.1);
}

#[test]
fn saturator_zero_mix_preserves_stereo_dry_signal() {
    let prior = [stereo_buffer(&[0.25, -0.5], &[0.5, -0.25])];
    let mut state = SaturatorState::new();
    let mut out = NodeBuffer::new(1, 2);

    render_saturator(
        0,
        1.0,
        0.5,
        0.25,
        0.0,
        1.0,
        &mut state,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        2,
        1_000.0,
    )
    .expect("saturator should render");

    assert_eq!(out.channels, 2);
    assert_eq!(&out.left[..2], &[0.25, -0.5]);
    assert_eq!(&out.right[..2], &[0.5, -0.25]);
}

#[test]
fn saturator_renderer_uses_scalar_param_slots_as_static_params() {
    let prior = [mono_buffer(&[0.8; 64])];
    let mut state = SaturatorState::new();
    let mut out = NodeBuffer::new(1, 64);
    let drive = [1.0];
    let asymmetry = [0.2];
    let tone = [1.0];
    let mix = [1.0];
    let output = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_DRIVE, 0),
        (PARAM_ASYMMETRY, 1),
        (PARAM_TONE, 2),
        (PARAM_MIX, 3),
        (PARAM_OUTPUT, 4),
    ]);

    render_saturator(
        0,
        0.0,
        0.0,
        1.0,
        0.0,
        1.0,
        &mut state,
        &access,
        &prior,
        &[&drive, &asymmetry, &tone, &mix, &output],
        &mut out,
        64,
        48_000.0,
    )
    .expect("saturator should render");

    assert!(out.left[..64]
        .iter()
        .any(|sample| (*sample - 0.8).abs() > 1e-3));
}

#[test]
fn wavefolder_zero_mix_preserves_stereo_dry_signal() {
    let prior = [stereo_buffer(&[0.25, -0.5], &[0.5, -0.25])];
    let mut state = WavefolderState::new();
    let mut out = NodeBuffer::new(1, 2);

    render_wavefolder(
        0,
        0.8,
        0.9,
        0.25,
        0.8,
        0.0,
        1.0,
        &mut state,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        2,
        1_000.0,
    )
    .expect("wavefolder should render");

    assert_eq!(out.channels, 2);
    assert_eq!(&out.left[..2], &[0.25, -0.5]);
    assert_eq!(&out.right[..2], &[0.5, -0.25]);
}

#[test]
fn wavefolder_renderer_uses_scalar_param_slots_as_static_params() {
    let prior = [mono_buffer(&[0.65; 64])];
    let mut state = WavefolderState::new();
    let mut out = NodeBuffer::new(1, 64);
    let drive = [0.85];
    let depth = [0.9];
    let asymmetry = [0.1];
    let tone = [1.0];
    let mix = [1.0];
    let output = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_DRIVE, 0),
        (PARAM_DEPTH, 1),
        (PARAM_ASYMMETRY, 2),
        (PARAM_TONE, 3),
        (PARAM_MIX, 4),
        (PARAM_OUTPUT, 5),
    ]);

    render_wavefolder(
        0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
        1.0,
        &mut state,
        &access,
        &prior,
        &[&drive, &depth, &asymmetry, &tone, &mix, &output],
        &mut out,
        64,
        48_000.0,
    )
    .expect("wavefolder should render");

    assert!(out.left[..64]
        .iter()
        .any(|sample| (*sample - 0.65).abs() > 1e-3));
}

#[test]
fn degrade_renderer_uses_scalar_param_slots_as_static_params() {
    let prior = [mono_buffer(&[0.37, -0.37, 0.37, -0.37])];
    let mut state = crate::dsp::DegradeState::new();
    let mut out = NodeBuffer::new(1, 4);
    let bits = [2.0];
    let downsample = [1.0];
    let jitter = [0.0];
    let noise = [0.0];
    let tone = [1.0];
    let mix = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_BITS, 0),
        (PARAM_DOWNSAMPLE, 1),
        (PARAM_JITTER, 2),
        (PARAM_NOISE, 3),
        (PARAM_TONE, 4),
        (PARAM_MIX, 5),
    ]);

    render_degrade(
        0,
        16.0,
        1.0,
        0.0,
        0.0,
        1.0,
        0.0,
        &mut state,
        &access,
        &prior,
        &[&bits, &downsample, &jitter, &noise, &tone, &mix],
        &mut out,
        4,
        48_000.0,
    )
    .expect("degrade should render");

    assert!(out.left[..4]
        .iter()
        .zip(prior[0].left[..4].iter())
        .any(|(wet, dry)| (*wet - *dry).abs() > 1e-3));
}

#[test]
fn tilt_eq_zero_gain_preserves_mono_dry_signal() {
    let prior = [mono_buffer(&[0.25, -0.5, 0.75])];
    let mut state = TiltEqState::new();
    let mut out = NodeBuffer::new(1, 3);

    render_tilt_eq(
        0,
        1_000.0,
        0.0,
        1.0,
        &mut state,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        3,
        48_000.0,
    )
    .expect("tilt eq should render");

    assert_eq!(out.channels, 1);
    assert_eq!(&out.left[..3], &[0.25, -0.5, 0.75]);
}

#[test]
fn tilt_eq_renderer_uses_scalar_param_slots_as_static_params() {
    let prior = [mono_buffer(&[1.0, -1.0, 1.0, -1.0, 0.5, -0.5])];
    let mut state = TiltEqState::new();
    let mut out = NodeBuffer::new(1, 6);
    let freq = [500.0];
    let gain_db = [12.0];
    let mix = [1.0];
    let access = ParamAccess::for_test([(PARAM_FREQ, 0), (PARAM_GAIN_DB, 1), (PARAM_MIX, 2)]);

    render_tilt_eq(
        0,
        1_000.0,
        0.0,
        0.0,
        &mut state,
        &access,
        &prior,
        &[&freq, &gain_db, &mix],
        &mut out,
        6,
        48_000.0,
    )
    .expect("tilt eq should render");

    assert!(out.left[..6]
        .iter()
        .zip(prior[0].left[..6].iter())
        .any(|(wet, dry)| (*wet - *dry).abs() > 1e-3));
}

#[test]
fn frequency_shifter_zero_shift_preserves_mono_dry_signal() {
    let prior = [mono_buffer(&[0.25, -0.5, 0.75])];
    let mut state = FrequencyShifterState::new();
    let mut out = NodeBuffer::new(1, 3);

    render_frequency_shifter(
        0,
        0.0,
        1.0,
        &mut state,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        3,
        48_000.0,
    )
    .expect("frequency shifter should render");

    assert_eq!(out.channels, 1);
    assert_eq!(&out.left[..3], &[0.25, -0.5, 0.75]);
}

#[test]
fn rotary_speaker_expands_mono_input_to_stereo() {
    let prior = [mono_buffer(&[1.0, 0.5, 0.25, 0.0])];
    let mut state = RotarySpeakerState::new(1_000.0);
    let mut out = NodeBuffer::new(1, 4);

    render_rotary_speaker(
        0,
        6.0,
        1.0,
        1.0,
        0.0,
        1.0,
        800.0,
        &mut state,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        4,
        1_000.0,
    )
    .expect("rotary speaker should render");

    assert_eq!(out.channels, 2);
    assert!(out.left.iter().take(4).all(|sample| sample.is_finite()));
    assert!(out.right.iter().take(4).all(|sample| sample.is_finite()));
}

#[test]
fn rotary_speaker_renderer_uses_scalar_param_slots_as_static_params() {
    let prior = [mono_buffer(&[1.0; 96])];
    let mut state = RotarySpeakerState::new(1_000.0);
    let mut out = NodeBuffer::new(1, 96);
    let rate = [6.0];
    let depth = [1.0];
    let mix = [1.0];
    let drive = [0.1];
    let width = [1.0];
    let freq = [400.0];
    let access = ParamAccess::for_test([
        (PARAM_RATE, 0),
        (PARAM_DEPTH, 1),
        (PARAM_MIX, 2),
        (PARAM_DRIVE, 3),
        (PARAM_WIDTH, 4),
        (PARAM_FREQ, 5),
    ]);

    render_rotary_speaker(
        0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        800.0,
        &mut state,
        &access,
        &prior,
        &[&rate, &depth, &mix, &drive, &width, &freq],
        &mut out,
        96,
        1_000.0,
    )
    .expect("rotary speaker should render");

    assert_eq!(out.channels, 2);
    assert!(out.left[..96]
        .iter()
        .zip(out.right[..96].iter())
        .any(|(left, right)| (*left - *right).abs() > 1e-4));
}

#[test]
fn stereo_spread_expands_mono_input_to_stereo() {
    let prior = [mono_buffer(&[1.0, 0.0, 0.0])];
    let mut state = StereoSpreadState::new(1_000.0);
    let mut out = NodeBuffer::new(1, 3);

    render_stereo_spread(
        0,
        1.0,
        1.0,
        1.0,
        &mut state,
        &ParamAccess::default(),
        &prior,
        &[],
        &mut out,
        3,
        1_000.0,
    )
    .expect("stereo spread should render");

    assert_eq!(out.channels, 2);
    assert_eq!(out.left[0], 1.0);
    assert_eq!(out.right[0], 0.0);
    assert_eq!(out.right[1], 1.0);
}

#[test]
fn stereo_spread_renderer_uses_scalar_param_slots_as_static_params() {
    let prior = [mono_buffer(&[1.0, 0.0, 0.0, 0.0])];
    let mut state = StereoSpreadState::new(1_000.0);
    let mut out = NodeBuffer::new(1, 4);
    let width = [1.0];
    let delay_ms = [1.0];
    let mix = [1.0];
    let access = ParamAccess::for_test([(PARAM_WIDTH, 0), (PARAM_DELAY_MS, 1), (PARAM_MIX, 2)]);

    render_stereo_spread(
        0,
        0.0,
        0.0,
        0.0,
        &mut state,
        &access,
        &prior,
        &[&width, &delay_ms, &mix],
        &mut out,
        4,
        1_000.0,
    )
    .expect("stereo spread should render");

    assert_eq!(out.channels, 2);
    assert!(out.right[1].abs() > 0.1);
}

#[test]
fn ensemble_chorus_renderer_uses_scalar_param_slots_as_static_params() {
    let prior = [mono_buffer(&[0.5; 96])];
    let mut state = EnsembleChorusState::new(1_000.0);
    let mut out = NodeBuffer::new(1, 96);
    let rate = [0.4];
    let depth = [4.44];
    let mix = [1.0];
    let width = [1.0];
    let tone = [1.0];
    let noise = [0.0];
    let access = ParamAccess::for_test([
        (PARAM_RATE, 0),
        (PARAM_DEPTH, 1),
        (PARAM_MIX, 2),
        (PARAM_WIDTH, 3),
        (PARAM_TONE, 4),
        (PARAM_NOISE, 5),
    ]);

    render_ensemble_chorus(
        0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.82,
        0.0,
        &mut state,
        &access,
        &prior,
        &[&rate, &depth, &mix, &width, &tone, &noise],
        &mut out,
        96,
        1_000.0,
    )
    .expect("ensemble chorus should render");

    assert_eq!(out.channels, 2);
    assert!(out.left[..96]
        .iter()
        .zip(prior[0].left[..96].iter())
        .any(|(wet, dry)| (*wet - *dry).abs() > 1e-3));
}

#[test]
fn plate_reverb_renderer_uses_scalar_param_slots_as_static_params() {
    let mut input = [0.0_f32; 128];
    input[0] = 1.0;
    let prior = [mono_buffer(&input)];
    let mut state = PlateReverbState::new(1_000.0);
    let mut out = NodeBuffer::new(1, input.len());
    let pre_delay_ms = [1.0];
    let decay = [0.6];
    let damping = [0.3];
    let diffusion = [0.8];
    let modulation = [0.0];
    let mix = [1.0];
    let width = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_PRE_DELAY_MS, 0),
        (PARAM_DECAY, 1),
        (PARAM_DAMPING, 2),
        (PARAM_DIFFUSION, 3),
        (PARAM_MODULATION, 4),
        (PARAM_MIX, 5),
        (PARAM_WIDTH, 6),
    ]);

    render_plate_reverb(
        0,
        12.0,
        0.55,
        0.42,
        0.72,
        0.18,
        0.0,
        1.0,
        &mut state,
        &access,
        &prior,
        &[
            &pre_delay_ms,
            &decay,
            &damping,
            &diffusion,
            &modulation,
            &mix,
            &width,
        ],
        &mut out,
        input.len(),
        1_000.0,
    )
    .expect("plate reverb should render");

    assert_eq!(out.channels, 2);
    assert!(
        out.left[8..].iter().any(|sample| sample.abs() > 1e-5)
            || out.right[8..].iter().any(|sample| sample.abs() > 1e-5)
    );
}

#[test]
fn spring_reverb_renderer_uses_scalar_param_slots_as_static_params() {
    let mut input = [0.0_f32; 128];
    input[0] = 1.0;
    let prior = [mono_buffer(&input)];
    let mut state = SpringReverbState::new(1_000.0);
    let mut out = NodeBuffer::new(1, input.len());
    let decay = [0.7];
    let damping = [0.25];
    let tension = [0.5];
    let drip = [0.3];
    let mix = [1.0];
    let width = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_DECAY, 0),
        (PARAM_DAMPING, 1),
        (PARAM_TENSION, 2),
        (PARAM_DRIP, 3),
        (PARAM_MIX, 4),
        (PARAM_WIDTH, 5),
    ]);

    render_spring_reverb(
        0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
        &mut state,
        &access,
        &prior,
        &[&decay, &damping, &tension, &drip, &mix, &width],
        &mut out,
        input.len(),
        1_000.0,
    )
    .expect("spring reverb should render");

    assert_eq!(out.channels, 2);
    assert!(
        out.left[20..].iter().any(|sample| sample.abs() > 1e-5)
            || out.right[20..].iter().any(|sample| sample.abs() > 1e-5)
    );
}

#[test]
fn nonlinear_reverb_renderer_uses_scalar_param_slots_as_static_params() {
    let mut input = [0.0_f32; 128];
    input[0] = 1.0;
    let prior = [mono_buffer(&input)];
    let mut state = NonlinearReverbState::new(1_000.0);
    let mut out = NodeBuffer::new(1, input.len());
    let time_ms = [90.0];
    let decay = [0.65];
    let damping = [0.3];
    let drive = [0.2];
    let mix = [1.0];
    let width = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_TIME_MS, 0),
        (PARAM_DECAY, 1),
        (PARAM_DAMPING, 2),
        (PARAM_DRIVE, 3),
        (PARAM_MIX, 4),
        (PARAM_WIDTH, 5),
    ]);

    render_nonlinear_reverb(
        0,
        180.0,
        0.68,
        0.38,
        0.18,
        0.0,
        1.0,
        &mut state,
        &access,
        &prior,
        &[&time_ms, &decay, &damping, &drive, &mix, &width],
        &mut out,
        input.len(),
        1_000.0,
    )
    .expect("nonlinear reverb should render");

    assert_eq!(out.channels, 2);
    assert!(
        out.left[20..].iter().any(|sample| sample.abs() > 1e-5)
            || out.right[20..].iter().any(|sample| sample.abs() > 1e-5)
    );
}

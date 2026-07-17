use super::{
    common::trigger_velocity, render_acid_bass, render_drum_voice, render_lofi_sampler,
    render_poly_synth, render_sampler_instrument, render_string_machine,
};
use crate::dsp::{
    AcidBassState, AcidBassWaveform, DrumVoiceKind, DrumVoiceState, LoFiSamplerState,
    PolySynthState, SamplerVoiceState, SamplerZone, StringMachineState,
};
use crate::runtime_params::{
    ParamAccess, PARAM_ACCENT, PARAM_ATTACK, PARAM_BITS, PARAM_CHORUS, PARAM_CUTOFF, PARAM_DECAY,
    PARAM_DEPTH, PARAM_DETUNE, PARAM_DOWNSAMPLE, PARAM_DRIVE, PARAM_ENV_MOD, PARAM_FREQ,
    PARAM_JITTER, PARAM_LEVEL, PARAM_MIX, PARAM_MODULATION, PARAM_NOISE, PARAM_PULSE_WIDTH,
    PARAM_RELEASE, PARAM_RESONANCE, PARAM_SLIDE, PARAM_SNAP, PARAM_SUB, PARAM_SUSTAIN, PARAM_TONE,
    PARAM_WIDTH,
};
use crate::runtime_state::NodeBuffer;

fn zone(samples: &[f32]) -> SamplerZone {
    SamplerZone {
        samples: samples.to_vec(),
        sample_rate: 1_000.0,
        root_midi: 69.0,
        key_low: 0.0,
        key_high: 127.0,
        velocity_low: 0.0,
        velocity_high: 1.0,
        looped: false,
        loop_start: 0,
        loop_end: 0,
        gain: 1.0,
        pan: 0.0,
    }
}

#[test]
fn trigger_velocity_prefers_explicit_node_velocity() {
    assert_eq!(trigger_velocity(0.3, 0.9), 0.3);
    assert_eq!(trigger_velocity(f64::NAN, 0.9), 0.9);
}

#[test]
fn drum_voice_renderer_produces_finite_mono_output() {
    let mut state = DrumVoiceState::new();
    let access = ParamAccess::default();
    let mut out = NodeBuffer::new(1, 16);

    render_drum_voice(
        DrumVoiceKind::Kick,
        55.0,
        f64::NAN,
        0.12,
        0.5,
        0.5,
        0.0,
        0.1,
        0.8,
        &mut state,
        &access,
        &[],
        &[],
        &mut out,
        16,
        1_000.0,
        Some(0.02),
        0.7,
    )
    .expect("render");

    assert_eq!(out.channels, 1);
    assert!(out.left.iter().all(|sample| sample.is_finite()));
    assert!(out.left.iter().any(|sample| sample.abs() > 1e-6));
}

#[test]
fn sampler_renderer_uses_scalar_param_slots_as_static_params() {
    let zones = [zone(&[1.0, 0.8, 0.6, 0.4])];
    let mut state = SamplerVoiceState::new();
    let mut out = NodeBuffer::new(1, 4);
    let freq = [440.0];
    let attack = [0.0];
    let release = [0.1];
    let level = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_FREQ, 0),
        (PARAM_ATTACK, 1),
        (PARAM_RELEASE, 2),
        (PARAM_LEVEL, 3),
    ]);

    render_sampler_instrument(
        &zones,
        440.0,
        f64::NAN,
        0.0,
        0.1,
        0.0,
        &mut state,
        &access,
        &[],
        &[&freq, &attack, &release, &level],
        &mut out,
        4,
        1_000.0,
        None,
        0.8,
    )
    .expect("sampler should render");

    assert_eq!(out.channels, 2);
    assert!(out.left[..4].iter().any(|sample| sample.abs() > 0.1));
}

#[test]
fn lofi_sampler_renderer_uses_scalar_param_slots_as_static_params() {
    let zones = [zone(&[1.0, 0.5, -0.5, -1.0, 0.25])];
    let mut state = LoFiSamplerState::new();
    let mut out = NodeBuffer::new(1, 5);
    let freq = [440.0];
    let attack = [0.0];
    let release = [0.1];
    let level = [1.0];
    let bits = [8.0];
    let downsample = [1.0];
    let jitter = [0.0];
    let noise = [0.0];
    let tone = [1.0];
    let drive = [0.1];
    let mix = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_FREQ, 0),
        (PARAM_ATTACK, 1),
        (PARAM_RELEASE, 2),
        (PARAM_LEVEL, 3),
        (PARAM_BITS, 4),
        (PARAM_DOWNSAMPLE, 5),
        (PARAM_JITTER, 6),
        (PARAM_NOISE, 7),
        (PARAM_TONE, 8),
        (PARAM_DRIVE, 9),
        (PARAM_MIX, 10),
    ]);

    render_lofi_sampler(
        &zones,
        440.0,
        f64::NAN,
        0.0,
        0.1,
        0.0,
        12.0,
        1.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0,
        &mut state,
        &access,
        &[],
        &[
            &freq,
            &attack,
            &release,
            &level,
            &bits,
            &downsample,
            &jitter,
            &noise,
            &tone,
            &drive,
            &mix,
        ],
        &mut out,
        5,
        1_000.0,
        None,
        1.0,
    )
    .expect("lo-fi sampler should render");

    assert_eq!(out.channels, 2);
    assert!(out.left[..5].iter().any(|sample| sample.abs() > 0.1));
}

#[test]
fn acid_bass_renderer_uses_scalar_param_slots_as_static_params() {
    let mut state = AcidBassState::new();
    let mut out = NodeBuffer::new(1, 32);
    let freq = [110.0];
    let cutoff = [700.0];
    let resonance = [0.5];
    let env_mod = [0.6];
    let decay = [0.2];
    let accent = [0.2];
    let slide = [0.0];
    let drive = [0.2];
    let level = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_FREQ, 0),
        (PARAM_CUTOFF, 1),
        (PARAM_RESONANCE, 2),
        (PARAM_ENV_MOD, 3),
        (PARAM_DECAY, 4),
        (PARAM_ACCENT, 5),
        (PARAM_SLIDE, 6),
        (PARAM_DRIVE, 7),
        (PARAM_LEVEL, 8),
    ]);

    render_acid_bass(
        AcidBassWaveform::Saw,
        110.0,
        f64::NAN,
        700.0,
        0.5,
        0.6,
        0.2,
        0.0,
        0.0,
        0.0,
        0.0,
        &mut state,
        &access,
        &[],
        &[
            &freq, &cutoff, &resonance, &env_mod, &decay, &accent, &slide, &drive, &level,
        ],
        &mut out,
        32,
        1_000.0,
        Some(0.05),
        0.9,
    )
    .expect("acid bass should render");

    assert_eq!(out.channels, 1);
    assert!(out.left[..32].iter().any(|sample| sample.abs() > 1e-5));
}

#[test]
fn drum_voice_renderer_uses_scalar_param_slots_as_static_params() {
    let mut state = DrumVoiceState::new();
    let mut out = NodeBuffer::new(1, 32);
    let freq = [55.0];
    let decay = [0.12];
    let tone = [0.5];
    let snap = [0.6];
    let noise = [0.0];
    let drive = [0.1];
    let level = [0.8];
    let access = ParamAccess::for_test([
        (PARAM_FREQ, 0),
        (PARAM_DECAY, 1),
        (PARAM_TONE, 2),
        (PARAM_SNAP, 3),
        (PARAM_NOISE, 4),
        (PARAM_DRIVE, 5),
        (PARAM_LEVEL, 6),
    ]);

    render_drum_voice(
        DrumVoiceKind::Kick,
        55.0,
        f64::NAN,
        0.12,
        0.5,
        0.5,
        0.0,
        0.1,
        0.0,
        &mut state,
        &access,
        &[],
        &[&freq, &decay, &tone, &snap, &noise, &drive, &level],
        &mut out,
        32,
        1_000.0,
        Some(0.05),
        0.9,
    )
    .expect("drum voice should render");

    assert_eq!(out.channels, 1);
    assert!(out.left[..32].iter().any(|sample| sample.abs() > 1e-5));
}

#[test]
fn string_machine_renderer_uses_scalar_param_slots_as_static_params() {
    let mut state = StringMachineState::new(1_000.0);
    let mut out = NodeBuffer::new(1, 48);
    let freq = [220.0];
    let detune = [7.0];
    let attack = [0.0];
    let release = [0.2];
    let tone = [0.8];
    let depth = [0.6];
    let modulation = [0.4];
    let width = [1.0];
    let level = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_FREQ, 0),
        (PARAM_DETUNE, 1),
        (PARAM_ATTACK, 2),
        (PARAM_RELEASE, 3),
        (PARAM_TONE, 4),
        (PARAM_DEPTH, 5),
        (PARAM_MODULATION, 6),
        (PARAM_WIDTH, 7),
        (PARAM_LEVEL, 8),
    ]);

    render_string_machine(
        220.0,
        f64::NAN,
        7.0,
        0.0,
        0.2,
        0.8,
        0.6,
        0.4,
        1.0,
        0.0,
        &mut state,
        &access,
        &[],
        &[
            &freq,
            &detune,
            &attack,
            &release,
            &tone,
            &depth,
            &modulation,
            &width,
            &level,
        ],
        &mut out,
        48,
        1_000.0,
        Some(0.08),
        0.9,
    )
    .expect("string machine should render");

    assert_eq!(out.channels, 2);
    assert!(
        out.left[..48].iter().any(|sample| sample.abs() > 1e-5)
            || out.right[..48].iter().any(|sample| sample.abs() > 1e-5)
    );
}

#[test]
fn poly_synth_renderer_uses_scalar_param_slots_as_static_params() {
    let mut state = PolySynthState::new(1_000.0);
    let mut out = NodeBuffer::new(1, 48);
    let freq = [110.0];
    let detune = [4.0];
    let pulse_width = [0.48];
    let sub = [0.3];
    let noise = [0.0];
    let cutoff = [400.0];
    let resonance = [0.25];
    let env_mod = [0.3];
    let attack = [0.0];
    let decay = [0.2];
    let sustain = [0.6];
    let release = [0.2];
    let drive = [0.1];
    let chorus = [0.2];
    let modulation = [0.1];
    let width = [0.8];
    let level = [1.0];
    let access = ParamAccess::for_test([
        (PARAM_FREQ, 0),
        (PARAM_DETUNE, 1),
        (PARAM_PULSE_WIDTH, 2),
        (PARAM_SUB, 3),
        (PARAM_NOISE, 4),
        (PARAM_CUTOFF, 5),
        (PARAM_RESONANCE, 6),
        (PARAM_ENV_MOD, 7),
        (PARAM_ATTACK, 8),
        (PARAM_DECAY, 9),
        (PARAM_SUSTAIN, 10),
        (PARAM_RELEASE, 11),
        (PARAM_DRIVE, 12),
        (PARAM_CHORUS, 13),
        (PARAM_MODULATION, 14),
        (PARAM_WIDTH, 15),
        (PARAM_LEVEL, 16),
    ]);

    render_poly_synth(
        110.0,
        f64::NAN,
        4.0,
        0.48,
        0.3,
        0.0,
        400.0,
        0.25,
        0.3,
        0.0,
        0.2,
        0.6,
        0.2,
        0.1,
        0.2,
        0.1,
        0.8,
        0.0,
        &mut state,
        &access,
        &[],
        &[
            &freq,
            &detune,
            &pulse_width,
            &sub,
            &noise,
            &cutoff,
            &resonance,
            &env_mod,
            &attack,
            &decay,
            &sustain,
            &release,
            &drive,
            &chorus,
            &modulation,
            &width,
            &level,
        ],
        &mut out,
        48,
        1_000.0,
        Some(0.08),
        0.9,
    )
    .expect("poly synth should render");

    assert_eq!(out.channels, 2);
    assert!(
        out.left[..48].iter().any(|sample| sample.abs() > 1e-5)
            || out.right[..48].iter().any(|sample| sample.abs() > 1e-5)
    );
}

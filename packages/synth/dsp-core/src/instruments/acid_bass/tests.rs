use super::*;

fn render(waveform: AcidBassWaveform, params: AcidBassParams, frames: usize) -> Vec<f32> {
    let mut state = AcidBassState::new();
    (0..frames)
        .map(|_| state.process(waveform, params, 48_000.0, Some(frames as f64 / 48_000.0)))
        .collect()
}

fn peak(samples: &[f32]) -> f32 {
    samples
        .iter()
        .fold(0.0_f32, |acc, value| acc.max(value.abs()))
}

fn energy(samples: &[f32]) -> f32 {
    samples.iter().map(|value| value * value).sum::<f32>() / samples.len().max(1) as f32
}

#[test]
fn acid_bass_renders_finite_bounded_samples() {
    let out = render(AcidBassWaveform::Saw, AcidBassParams::default(), 512);

    assert!(out.iter().all(|sample| sample.is_finite()));
    assert!(peak(&out) <= 1.25);
    assert!(peak(&out) > 0.01);
}

#[test]
fn acid_bass_zero_level_is_silent() {
    let out = render(
        AcidBassWaveform::Saw,
        AcidBassParams {
            level: 0.0,
            ..AcidBassParams::default()
        },
        128,
    );

    assert!(peak(&out) <= 1e-9);
}

#[test]
fn acid_bass_accent_increases_peak_level() {
    let base = render(AcidBassWaveform::Saw, AcidBassParams::default(), 256);
    let accented = render(
        AcidBassWaveform::Saw,
        AcidBassParams {
            accent: 1.0,
            ..AcidBassParams::default()
        },
        256,
    );

    assert!(peak(&accented) > peak(&base));
}

#[test]
fn acid_bass_cutoff_changes_signal_energy() {
    let low = render(
        AcidBassWaveform::Saw,
        AcidBassParams {
            cutoff: 120.0,
            env_mod: 0.0,
            resonance: 0.0,
            ..AcidBassParams::default()
        },
        512,
    );
    let high = render(
        AcidBassWaveform::Saw,
        AcidBassParams {
            cutoff: 4_800.0,
            env_mod: 0.0,
            resonance: 0.0,
            ..AcidBassParams::default()
        },
        512,
    );

    assert!(energy(&high) > energy(&low) * 1.5);
}

#[test]
fn acid_bass_slide_slews_frequency() {
    let mut state = AcidBassState::new();
    state.process(
        AcidBassWaveform::Saw,
        AcidBassParams {
            freq: 110.0,
            ..AcidBassParams::default()
        },
        48_000.0,
        None,
    );
    state.process(
        AcidBassWaveform::Saw,
        AcidBassParams {
            freq: 880.0,
            slide: 1.0,
            ..AcidBassParams::default()
        },
        48_000.0,
        None,
    );

    assert!(state.current_freq() > 110.0);
    assert!(state.current_freq() < 880.0);
}

#[test]
fn acid_bass_clear_resets_frequency_state() {
    let mut state = AcidBassState::new();
    state.process(
        AcidBassWaveform::Square,
        AcidBassParams::default(),
        48_000.0,
        None,
    );
    state.clear();

    assert_eq!(state.current_freq(), 0.0);
}

#[test]
fn acid_bass_sanitizes_hostile_params() {
    let mut state = AcidBassState::new();
    let params = AcidBassParams {
        freq: f64::NAN,
        cutoff: f64::INFINITY,
        resonance: f64::NEG_INFINITY,
        env_mod: f64::INFINITY,
        decay: f64::NAN,
        accent: f64::INFINITY,
        slide: f64::INFINITY,
        drive: f64::INFINITY,
        level: f64::INFINITY,
        velocity: f64::INFINITY,
    };

    for _ in 0..64 {
        let sample = state.process(AcidBassWaveform::Square, params, f64::NAN, Some(f64::NAN));
        assert!(sample.is_finite());
    }
}

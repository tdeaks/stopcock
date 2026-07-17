use super::*;

const SR: f64 = 48_000.0;

fn params_for(kind: DrumVoiceKind) -> DrumVoiceParams {
    DrumVoiceParams {
        freq: kind.default_freq(),
        decay: kind.default_decay(),
        tone: kind.default_tone(),
        snap: kind.default_snap(),
        noise: kind.default_noise(),
        ..DrumVoiceParams::default()
    }
}

fn render(kind: DrumVoiceKind, params: DrumVoiceParams, frames: usize) -> Vec<f32> {
    let mut state = DrumVoiceState::new();
    (0..frames)
        .map(|_| state.process(kind, params, SR, Some(frames as f64 / SR)))
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
fn drum_voices_render_finite_bounded_samples() {
    for kind in [
        DrumVoiceKind::Kick,
        DrumVoiceKind::Snare,
        DrumVoiceKind::Hat,
    ] {
        let out = render(kind, params_for(kind), 1_024);

        assert!(out.iter().all(|sample| sample.is_finite()));
        assert!(peak(&out) <= 1.2);
        assert!(peak(&out) > 0.005);
    }
}

#[test]
fn drum_voice_zero_level_is_silent() {
    for kind in [
        DrumVoiceKind::Kick,
        DrumVoiceKind::Snare,
        DrumVoiceKind::Hat,
    ] {
        let out = render(
            kind,
            DrumVoiceParams {
                level: 0.0,
                ..params_for(kind)
            },
            256,
        );

        assert!(peak(&out) <= 1e-9);
    }
}

#[test]
fn kick_energy_decays_over_time() {
    let out = render(
        DrumVoiceKind::Kick,
        DrumVoiceParams {
            decay: 0.12,
            ..params_for(DrumVoiceKind::Kick)
        },
        16_000,
    );
    let early = energy(&out[0..2_048]);
    let late = energy(&out[12_000..14_048]);

    assert!(early > late * 8.0);
}

#[test]
fn snare_noise_control_changes_body_mix() {
    let body = render(
        DrumVoiceKind::Snare,
        DrumVoiceParams {
            noise: 0.0,
            ..params_for(DrumVoiceKind::Snare)
        },
        2_048,
    );
    let snappy = render(
        DrumVoiceKind::Snare,
        DrumVoiceParams {
            noise: 1.0,
            ..params_for(DrumVoiceKind::Snare)
        },
        2_048,
    );

    assert!((energy(&snappy) - energy(&body)).abs() > 0.001);
}

#[test]
fn hat_decay_controls_tail_energy() {
    let short = render(
        DrumVoiceKind::Hat,
        DrumVoiceParams {
            decay: 0.04,
            ..params_for(DrumVoiceKind::Hat)
        },
        12_000,
    );
    let long = render(
        DrumVoiceKind::Hat,
        DrumVoiceParams {
            decay: 0.55,
            ..params_for(DrumVoiceKind::Hat)
        },
        12_000,
    );
    let short_tail = energy(&short[8_000..10_000]);
    let long_tail = energy(&long[8_000..10_000]);

    assert!(long_tail > short_tail * 10.0);
}

#[test]
fn velocity_scales_peak_level() {
    let quiet = render(
        DrumVoiceKind::Kick,
        DrumVoiceParams {
            velocity: 0.25,
            ..params_for(DrumVoiceKind::Kick)
        },
        512,
    );
    let loud = render(DrumVoiceKind::Kick, params_for(DrumVoiceKind::Kick), 512);

    assert!(peak(&loud) > peak(&quiet) * 1.4);
}

#[test]
fn clear_resets_deterministic_state() {
    let mut state = DrumVoiceState::new();
    let params = params_for(DrumVoiceKind::Snare);
    let first: Vec<f32> = (0..128)
        .map(|_| state.process(DrumVoiceKind::Snare, params, SR, None))
        .collect();
    state.clear();
    let second: Vec<f32> = (0..128)
        .map(|_| state.process(DrumVoiceKind::Snare, params, SR, None))
        .collect();

    assert_eq!(first, second);
    assert_eq!(state.frame(), 128);
}

#[test]
fn drum_voice_sanitizes_hostile_params() {
    let mut state = DrumVoiceState::new();
    let params = DrumVoiceParams {
        freq: f64::NAN,
        decay: f64::NEG_INFINITY,
        tone: f64::INFINITY,
        snap: f64::INFINITY,
        noise: f64::INFINITY,
        drive: f64::INFINITY,
        level: f64::INFINITY,
        velocity: f64::INFINITY,
    };

    for kind in [
        DrumVoiceKind::Kick,
        DrumVoiceKind::Snare,
        DrumVoiceKind::Hat,
    ] {
        state.clear();
        for _ in 0..64 {
            let sample = state.process(kind, params, f64::NAN, Some(f64::NAN));
            assert!(sample.is_finite());
        }
    }
}

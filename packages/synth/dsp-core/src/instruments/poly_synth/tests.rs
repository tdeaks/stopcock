use super::*;

fn render(params: PolySynthParams, frames: usize) -> Vec<(f32, f32)> {
    let mut state = PolySynthState::new(48_000.0);
    (0..frames)
        .map(|_| state.process(params, 48_000.0, Some(frames as f64 / 48_000.0)))
        .collect()
}

fn peak(samples: &[(f32, f32)]) -> f32 {
    samples.iter().fold(0.0_f32, |acc, (left, right)| {
        acc.max(left.abs()).max(right.abs())
    })
}

fn energy_left(samples: &[(f32, f32)]) -> f32 {
    samples.iter().map(|(left, _)| left * left).sum::<f32>() / samples.len().max(1) as f32
}

#[test]
fn poly_synth_renders_finite_bounded_stereo_samples() {
    let out = render(PolySynthParams::default(), 1024);

    assert!(out
        .iter()
        .all(|(left, right)| left.is_finite() && right.is_finite()));
    assert!(peak(&out) <= 1.25);
    assert!(peak(&out) > 0.01);
}

#[test]
fn poly_synth_zero_level_is_silent() {
    let out = render(
        PolySynthParams {
            level: 0.0,
            ..PolySynthParams::default()
        },
        512,
    );

    assert_eq!(peak(&out), 0.0);
}

#[test]
fn poly_synth_velocity_scales_output() {
    let quiet = render(
        PolySynthParams {
            velocity: 0.25,
            ..PolySynthParams::default()
        },
        2048,
    );
    let loud = render(
        PolySynthParams {
            velocity: 1.0,
            ..PolySynthParams::default()
        },
        2048,
    );

    assert!(peak(&loud) > peak(&quiet) * 2.5);
}

#[test]
fn poly_synth_attack_ramps_in() {
    let mut state = PolySynthState::new(1_000.0);
    let params = PolySynthParams {
        attack: 0.04,
        decay: 0.01,
        sustain: 1.0,
        chorus: 0.0,
        ..PolySynthParams::default()
    };
    let mut early = 0.0_f32;
    let mut late = 0.0_f32;
    for frame in 0..80 {
        let (left, _) = state.process(params, 1_000.0, Some(1.0));
        if frame < 8 {
            early = early.max(left.abs());
        }
        if frame >= 60 {
            late = late.max(left.abs());
        }
    }

    assert!(late > early * 2.0);
}

#[test]
fn poly_synth_release_decays_after_gate() {
    let mut state = PolySynthState::new(1_000.0);
    let params = PolySynthParams {
        attack: 0.0,
        decay: 0.01,
        sustain: 0.8,
        release: 0.04,
        chorus: 0.0,
        ..PolySynthParams::default()
    };
    let mut near_gate = 0.0_f32;
    let mut tail = 0.0_f32;
    for frame in 0..120 {
        let (left, _) = state.process(params, 1_000.0, Some(0.04));
        if (30..40).contains(&frame) {
            near_gate = near_gate.max(left.abs());
        }
        if frame >= 100 {
            tail = tail.max(left.abs());
        }
    }

    assert!(tail < near_gate * 0.45);
}

#[test]
fn poly_synth_cutoff_changes_brightness_energy() {
    let dark = render(
        PolySynthParams {
            cutoff: 160.0,
            env_mod: 0.0,
            resonance: 0.0,
            chorus: 0.0,
            ..PolySynthParams::default()
        },
        4096,
    );
    let bright = render(
        PolySynthParams {
            cutoff: 8_000.0,
            env_mod: 0.0,
            resonance: 0.0,
            chorus: 0.0,
            ..PolySynthParams::default()
        },
        4096,
    );

    assert!(energy_left(&bright) > energy_left(&dark) * 3.0);
}

#[test]
fn poly_synth_chorus_and_width_create_stereo_motion() {
    let out = render(
        PolySynthParams {
            chorus: 0.9,
            width: 1.0,
            modulation: 0.8,
            ..PolySynthParams::default()
        },
        4096,
    );

    assert!(out
        .iter()
        .any(|(left, right)| (*left - *right).abs() > 1e-5));
}

#[test]
fn poly_synth_clear_is_deterministic() {
    let params = PolySynthParams::default();
    let mut state = PolySynthState::new(48_000.0);
    let first: Vec<_> = (0..256)
        .map(|_| state.process(params, 48_000.0, Some(0.5)))
        .collect();
    state.clear();
    let second: Vec<_> = (0..256)
        .map(|_| state.process(params, 48_000.0, Some(0.5)))
        .collect();

    assert_eq!(first, second);
    assert_eq!(state.frame(), 256);
}

#[test]
fn poly_synth_hostile_params_stay_finite() {
    let mut state = PolySynthState::new(f64::NAN);
    let params = PolySynthParams {
        freq: f64::NAN,
        detune: f64::INFINITY,
        pulse_width: f64::NEG_INFINITY,
        sub: 99.0,
        noise: -99.0,
        cutoff: f64::INFINITY,
        resonance: 99.0,
        env_mod: f64::NAN,
        attack: f64::NAN,
        decay: f64::NEG_INFINITY,
        sustain: 99.0,
        release: f64::INFINITY,
        drive: 99.0,
        chorus: 99.0,
        modulation: f64::NAN,
        width: 99.0,
        level: 99.0,
        velocity: 99.0,
    };

    for _ in 0..2048 {
        let (left, right) = state.process(params, f64::NAN, Some(f64::NAN));
        assert!(left.is_finite());
        assert!(right.is_finite());
        assert!(left.abs() <= 4.0);
        assert!(right.abs() <= 4.0);
    }
}

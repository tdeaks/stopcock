use super::*;

#[test]
fn wavefold_sample_is_identity_below_unity_threshold() {
    for input in [-0.9, -0.25, 0.0, 0.25, 0.9] {
        let out = wavefold_sample(input, 0.0, 0.0, 0.0);
        assert!((out - input).abs() < 1e-12);
    }
}

#[test]
fn wavefold_sample_folds_back_after_threshold() {
    let shallow = wavefold_sample(0.25, 0.0, 0.9, 0.0).abs();
    let beyond = wavefold_sample(0.45, 0.0, 0.9, 0.0).abs();

    assert!(beyond < shallow);
}

#[test]
fn wavefolder_zero_mix_returns_dry_signal_with_output_trim() {
    let mut state = WavefolderState::new();
    let params = WavefolderParams {
        mix: 0.0,
        output: 0.5,
        ..WavefolderParams::default()
    };

    for input in [-0.75, -0.25, 0.0, 0.25, 0.75] {
        let (left, right) = state.process(input, -input, params, 48_000.0);
        assert!((left - input * 0.5).abs() < 1e-6);
        assert!((right + input * 0.5).abs() < 1e-6);
    }
}

#[test]
fn wavefolder_depth_increases_harmonic_variation() {
    let mut low = WavefolderState::new();
    let mut high = WavefolderState::new();
    let low_params = WavefolderParams {
        drive: 0.1,
        depth: 0.0,
        tone: 1.0,
        ..WavefolderParams::default()
    };
    let high_params = WavefolderParams {
        drive: 0.7,
        depth: 0.85,
        tone: 1.0,
        ..WavefolderParams::default()
    };

    let mut low_delta = 0.0;
    let mut high_delta = 0.0;
    let mut previous_low = 0.0;
    let mut previous_high = 0.0;
    for i in 0..512 {
        let phase = i as f64 * std::f64::consts::TAU / 64.0;
        let input = (phase.sin() * 0.45) as f32;
        let next_low = low.process(input, input, low_params, 48_000.0).0 as f64;
        let next_high = high.process(input, input, high_params, 48_000.0).0 as f64;
        if i > 0 {
            low_delta += (next_low - previous_low).abs();
            high_delta += (next_high - previous_high).abs();
        }
        previous_low = next_low;
        previous_high = next_high;
    }

    assert!(high_delta > low_delta * 1.4);
}

#[test]
fn wavefolder_asymmetry_changes_positive_and_negative_shape() {
    let pos = wavefold_sample(0.45, 0.65, 0.8, 0.75);
    let neg = wavefold_sample(-0.45, 0.65, 0.8, 0.75);

    assert!((pos.abs() - neg.abs()).abs() > 0.1);
}

#[test]
fn wavefolder_tone_reduces_fast_alternating_energy() {
    let mut dark = WavefolderState::new();
    let mut bright = WavefolderState::new();
    let dark_params = WavefolderParams {
        drive: 0.45,
        depth: 0.7,
        tone: 0.0,
        ..WavefolderParams::default()
    };
    let bright_params = WavefolderParams {
        drive: 0.45,
        depth: 0.7,
        tone: 1.0,
        ..WavefolderParams::default()
    };
    let mut dark_energy = 0.0;
    let mut bright_energy = 0.0;
    for i in 0..512 {
        let input = if i % 2 == 0 { 0.85 } else { -0.85 };
        dark_energy += dark.process(input, input, dark_params, 48_000.0).0.abs();
        bright_energy += bright
            .process(input, input, bright_params, 48_000.0)
            .0
            .abs();
    }

    assert!(dark_energy < bright_energy * 0.65);
}

#[test]
fn wavefolder_clear_restarts_deterministic_state() {
    let mut state = WavefolderState::new();
    let params = WavefolderParams {
        drive: 0.55,
        depth: 0.72,
        tone: 0.6,
        ..WavefolderParams::default()
    };

    let mut first = Vec::new();
    for i in 0..64 {
        let input = (i as f32 / 64.0) * 2.0 - 1.0;
        first.push(state.process(input, input, params, 48_000.0).0);
    }
    state.clear();
    for (i, expected) in first.into_iter().enumerate() {
        let input = (i as f32 / 64.0) * 2.0 - 1.0;
        let actual = state.process(input, input, params, 48_000.0).0;
        assert!((actual - expected).abs() < 1e-6);
    }
}

#[test]
fn wavefolder_hostile_params_stay_finite_and_bounded() {
    let mut state = WavefolderState::new();
    let params = WavefolderParams {
        drive: f64::NAN,
        depth: f64::INFINITY,
        asymmetry: f64::NEG_INFINITY,
        tone: f64::NAN,
        mix: f64::INFINITY,
        output: f64::INFINITY,
    };

    for _ in 0..128 {
        let (left, right) = state.process(0.9, -0.9, params, f64::NAN);
        assert!(left.is_finite());
        assert!(right.is_finite());
        assert!(left.abs() <= 4.0);
        assert!(right.abs() <= 4.0);
    }
}

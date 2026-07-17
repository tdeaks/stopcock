use super::*;

#[test]
fn zero_gain_returns_dry_signal() {
    let mut state = TiltEqState::new();
    let params = TiltEqParams {
        freq: 1_000.0,
        gain_db: 0.0,
        mix: 1.0,
    };

    for input in [-0.75, -0.2, 0.0, 0.3, 0.9] {
        let (left, right) = state.process(input, -input, params, 48_000.0);
        assert!((left - input).abs() < 1e-6);
        assert!((right + input).abs() < 1e-6);
    }
}

#[test]
fn zero_mix_returns_dry_signal() {
    let mut state = TiltEqState::new();
    let params = TiltEqParams {
        freq: 1_000.0,
        gain_db: 18.0,
        mix: 0.0,
    };

    for input in [-0.5, 0.25, 0.75] {
        let (left, right) = state.process(input, -input, params, 48_000.0);
        assert_eq!(left, input);
        assert_eq!(right, -input);
    }
}

#[test]
fn positive_gain_boosts_fast_alternating_energy() {
    let mut dark = TiltEqState::new();
    let mut bright = TiltEqState::new();
    let dark_params = TiltEqParams {
        freq: 1_000.0,
        gain_db: -12.0,
        mix: 1.0,
    };
    let bright_params = TiltEqParams {
        freq: 1_000.0,
        gain_db: 12.0,
        mix: 1.0,
    };
    let mut dark_energy = 0.0_f32;
    let mut bright_energy = 0.0_f32;

    for i in 0..512 {
        let input = if i % 2 == 0 { 0.5 } else { -0.5 };
        dark_energy += dark.process(input, input, dark_params, 48_000.0).0.abs();
        bright_energy += bright
            .process(input, input, bright_params, 48_000.0)
            .0
            .abs();
    }

    assert!(bright_energy > dark_energy * 2.0);
}

#[test]
fn negative_gain_keeps_slow_content_louder_than_fast_content() {
    let mut slow = TiltEqState::new();
    let mut fast = TiltEqState::new();
    let params = TiltEqParams {
        freq: 1_000.0,
        gain_db: -18.0,
        mix: 1.0,
    };
    let mut slow_energy = 0.0_f32;
    let mut fast_energy = 0.0_f32;

    for i in 0..2048 {
        let phase = i as f64 / 48_000.0 * std::f64::consts::TAU * 120.0;
        let slow_input = (phase.sin() * 0.5) as f32;
        let fast_input = if i % 2 == 0 { 0.5 } else { -0.5 };
        slow_energy += slow
            .process(slow_input, slow_input, params, 48_000.0)
            .0
            .abs();
        fast_energy += fast
            .process(fast_input, fast_input, params, 48_000.0)
            .0
            .abs();
    }

    assert!(slow_energy > fast_energy);
}

#[test]
fn hostile_params_stay_finite_and_bounded() {
    let mut state = TiltEqState::new();
    let params = TiltEqParams {
        freq: f64::NAN,
        gain_db: f64::INFINITY,
        mix: f64::NEG_INFINITY,
    };

    for _ in 0..128 {
        let (left, right) = state.process(0.5, -0.5, params, f64::NAN);
        assert!(left.is_finite());
        assert!(right.is_finite());
        assert!(left.abs() <= 8.0);
        assert!(right.abs() <= 8.0);
    }
}

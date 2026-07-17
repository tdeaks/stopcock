use super::*;

#[test]
fn zero_mix_returns_dry_signal() {
    let mut state = StereoSpreadState::new(1_000.0);
    let params = StereoSpreadParams {
        width: 1.0,
        delay_ms: 8.0,
        mix: 0.0,
    };

    for (left, right) in [(0.25, -0.5), (0.5, 0.25), (-0.75, 0.1)] {
        assert_eq!(state.process(left, right, params, 1_000.0), (left, right));
    }
}

#[test]
fn zero_width_returns_dry_signal_even_when_mixed_wet() {
    let mut state = StereoSpreadState::new(1_000.0);
    let params = StereoSpreadParams {
        width: 0.0,
        delay_ms: 8.0,
        mix: 1.0,
    };

    for (left, right) in [(0.25, -0.5), (0.5, 0.25), (-0.75, 0.1)] {
        assert_eq!(state.process(left, right, params, 1_000.0), (left, right));
    }
}

#[test]
fn haas_delay_spreads_mono_impulse_to_right_channel() {
    let mut state = StereoSpreadState::new(1_000.0);
    let params = StereoSpreadParams {
        width: 1.0,
        delay_ms: 3.0,
        mix: 1.0,
    };
    let mut left = [0.0; 8];
    let mut right = [0.0; 8];

    for i in 0..8 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        (left[i], right[i]) = state.process(input, input, params, 1_000.0);
    }

    assert!(left[0] > 0.9);
    assert_eq!(right[0], 0.0);
    assert!(right[3] > 0.9);
}

#[test]
fn width_increases_existing_stereo_side_energy() {
    let mut narrow = StereoSpreadState::new(48_000.0);
    let mut wide = StereoSpreadState::new(48_000.0);
    let narrow_params = StereoSpreadParams {
        width: 0.0,
        delay_ms: 0.0,
        mix: 1.0,
    };
    let wide_params = StereoSpreadParams {
        width: 1.0,
        delay_ms: 0.0,
        mix: 1.0,
    };

    let (narrow_l, narrow_r) = narrow.process(0.4, -0.2, narrow_params, 48_000.0);
    let (wide_l, wide_r) = wide.process(0.4, -0.2, wide_params, 48_000.0);

    assert!((wide_l - wide_r).abs() > (narrow_l - narrow_r).abs());
}

#[test]
fn clear_restarts_delay_history() {
    let mut state = StereoSpreadState::new(1_000.0);
    let params = StereoSpreadParams {
        width: 1.0,
        delay_ms: 1.0,
        mix: 1.0,
    };

    let _ = state.process(1.0, 1.0, params, 1_000.0);
    assert!(state.process(0.0, 0.0, params, 1_000.0).1 > 0.9);
    state.clear();
    assert_eq!(state.process(0.0, 0.0, params, 1_000.0).1, 0.0);
}

#[test]
fn hostile_params_stay_finite_and_bounded() {
    let mut state = StereoSpreadState::new(f64::NAN);
    let params = StereoSpreadParams {
        width: f64::INFINITY,
        delay_ms: f64::NAN,
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

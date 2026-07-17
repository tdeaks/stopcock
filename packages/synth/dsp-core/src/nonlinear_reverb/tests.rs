use super::*;

fn test_params() -> NonlinearReverbParams {
    NonlinearReverbParams {
        time_ms: 180.0,
        decay: 0.7,
        damping: 0.25,
        drive: 0.2,
        mix: 1.0,
        width: 1.0,
    }
}

#[test]
fn nonlinear_reverb_zero_mix_returns_dry_signal() {
    let mut state = NonlinearReverbState::new(1_000.0);
    let params = NonlinearReverbParams {
        mix: 0.0,
        ..test_params()
    };

    for _ in 0..64 {
        assert_eq!(state.process(0.4, -0.25, params, 1_000.0), (0.4, -0.25));
    }
}

#[test]
fn nonlinear_reverb_impulse_builds_finite_gated_tail() {
    let mut state = NonlinearReverbState::new(1_000.0);
    let params = test_params();
    let mut open_energy = 0.0_f64;
    let mut closed_energy = 0.0_f64;

    for i in 0..420 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        let (left, right) = state.process(input, input, params, 1_000.0);
        assert!(left.is_finite());
        assert!(right.is_finite());
        if (40..160).contains(&i) {
            open_energy += left.abs() as f64 + right.abs() as f64;
        }
        if i > 260 {
            closed_energy += left.abs() as f64 + right.abs() as f64;
        }
    }

    assert!(open_energy > 0.01);
    assert!(closed_energy < open_energy * 0.05);
}

#[test]
fn nonlinear_reverb_time_controls_gate_length() {
    let mut short = NonlinearReverbState::new(1_000.0);
    let mut long = NonlinearReverbState::new(1_000.0);
    let short_params = NonlinearReverbParams {
        time_ms: 80.0,
        ..test_params()
    };
    let long_params = NonlinearReverbParams {
        time_ms: 260.0,
        ..test_params()
    };
    let mut short_late = 0.0_f64;
    let mut long_late = 0.0_f64;

    for i in 0..360 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        let short_out = short.process(input, input, short_params, 1_000.0).0;
        let long_out = long.process(input, input, long_params, 1_000.0).0;
        if i > 120 {
            short_late += short_out.abs() as f64;
            long_late += long_out.abs() as f64;
        }
    }

    assert!(long_late > short_late * 5.0);
}

#[test]
fn nonlinear_reverb_damping_reduces_fast_tail_motion() {
    let mut dark = NonlinearReverbState::new(1_000.0);
    let mut bright = NonlinearReverbState::new(1_000.0);
    let dark_params = NonlinearReverbParams {
        damping: 1.0,
        ..test_params()
    };
    let bright_params = NonlinearReverbParams {
        damping: 0.0,
        ..test_params()
    };
    let mut dark_delta = 0.0_f32;
    let mut bright_delta = 0.0_f32;
    let mut previous_dark = 0.0;
    let mut previous_bright = 0.0;

    for i in 0..240 {
        let input = if i < 48 {
            if i % 2 == 0 {
                1.0
            } else {
                -1.0
            }
        } else {
            0.0
        };
        let dark_l = dark.process(input, input, dark_params, 1_000.0).0;
        let bright_l = bright.process(input, input, bright_params, 1_000.0).0;
        if i > 70 {
            dark_delta += (dark_l - previous_dark).abs();
            bright_delta += (bright_l - previous_bright).abs();
        }
        previous_dark = dark_l;
        previous_bright = bright_l;
    }

    assert!(dark_delta < bright_delta);
}

#[test]
fn nonlinear_reverb_drive_changes_tail_shape() {
    let mut clean = NonlinearReverbState::new(1_000.0);
    let mut driven = NonlinearReverbState::new(1_000.0);
    let clean_params = NonlinearReverbParams {
        drive: 0.0,
        ..test_params()
    };
    let driven_params = NonlinearReverbParams {
        drive: 1.0,
        ..test_params()
    };
    let mut difference = 0.0_f32;

    for i in 0..220 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        let clean_l = clean.process(input, input, clean_params, 1_000.0).0;
        let driven_l = driven.process(input, input, driven_params, 1_000.0).0;
        difference += (clean_l - driven_l).abs();
        assert!(driven_l.is_finite());
    }

    assert!(difference > 0.005);
}

#[test]
fn nonlinear_reverb_zero_width_centers_mono_wet_signal() {
    let mut state = NonlinearReverbState::new(1_000.0);
    let params = NonlinearReverbParams {
        width: 0.0,
        ..test_params()
    };

    for i in 0..260 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        let (left, right) = state.process(input, input, params, 1_000.0);
        assert!((left - right).abs() < 1e-6);
    }
}

#[test]
fn nonlinear_reverb_full_width_decorrelates_mono_tail() {
    let mut state = NonlinearReverbState::new(1_000.0);
    let params = test_params();
    let mut difference = 0.0_f32;

    for i in 0..280 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        let (left, right) = state.process(input, input, params, 1_000.0);
        if i > 60 {
            difference += (left - right).abs();
        }
    }

    assert!(difference > 0.01);
}

#[test]
fn nonlinear_reverb_clear_resets_tail_history() {
    let mut state = NonlinearReverbState::new(1_000.0);
    let params = test_params();

    for i in 0..220 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        state.process(input, input, params, 1_000.0);
    }
    state.clear();

    for _ in 0..128 {
        assert_eq!(state.process(0.0, 0.0, params, 1_000.0), (0.0, 0.0));
    }
}

#[test]
fn nonlinear_reverb_sanitizes_hostile_params() {
    let mut state = NonlinearReverbState::new(f64::NAN);
    let params = NonlinearReverbParams {
        time_ms: f64::INFINITY,
        decay: f64::INFINITY,
        damping: f64::NEG_INFINITY,
        drive: f64::INFINITY,
        mix: f64::NAN,
        width: f64::NEG_INFINITY,
    };

    for _ in 0..256 {
        let (left, right) = state.process(1.0, -1.0, params, f64::NAN);
        assert!(left.is_finite());
        assert!(right.is_finite());
    }
}

#[test]
fn nonlinear_reverb_sizes_combs_from_sample_rate() {
    let state = NonlinearReverbState::new(1_000.0);
    assert_eq!(state.comb_len(0, 0), Some(21));
    assert_eq!(state.comb_len(1, 0), Some(24));
    assert_eq!(state.comb_len(2, 0), None);
}

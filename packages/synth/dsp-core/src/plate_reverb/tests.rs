use super::*;

fn test_params() -> PlateReverbParams {
    PlateReverbParams {
        pre_delay_ms: 0.0,
        decay: 0.55,
        damping: 0.2,
        diffusion: 0.7,
        modulation: 0.0,
        mix: 1.0,
        width: 1.0,
    }
}

#[test]
fn plate_reverb_zero_mix_returns_dry_signal() {
    let mut state = PlateReverbState::new(1_000.0);
    let params = PlateReverbParams {
        mix: 0.0,
        ..test_params()
    };

    for _ in 0..64 {
        let (left, right) = state.process(0.25, -0.5, params, 1_000.0);
        assert_eq!(left, 0.25);
        assert_eq!(right, -0.5);
    }
}

#[test]
fn plate_reverb_impulse_builds_a_finite_tail() {
    let mut state = PlateReverbState::new(1_000.0);
    let params = test_params();
    let mut energy = 0.0_f64;

    for i in 0..400 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        let (left, right) = state.process(input, input, params, 1_000.0);
        assert!(left.is_finite());
        assert!(right.is_finite());
        if i > 60 {
            energy += (left as f64).abs() + (right as f64).abs();
        }
    }

    assert!(energy > 0.01);
}

#[test]
fn plate_reverb_decay_controls_tail_energy() {
    let mut short = PlateReverbState::new(1_000.0);
    let mut long = PlateReverbState::new(1_000.0);
    let short_params = PlateReverbParams {
        decay: 0.15,
        ..test_params()
    };
    let long_params = PlateReverbParams {
        decay: 0.9,
        ..test_params()
    };
    let mut short_tail = 0.0_f64;
    let mut long_tail = 0.0_f64;

    for i in 0..700 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        let (short_l, short_r) = short.process(input, input, short_params, 1_000.0);
        let (long_l, long_r) = long.process(input, input, long_params, 1_000.0);
        if i > 350 {
            short_tail += short_l.abs() as f64 + short_r.abs() as f64;
            long_tail += long_l.abs() as f64 + long_r.abs() as f64;
        }
    }

    assert!(long_tail > short_tail * 1.5);
}

#[test]
fn plate_reverb_damping_reduces_fast_tail_motion() {
    let mut dark = PlateReverbState::new(1_000.0);
    let mut bright = PlateReverbState::new(1_000.0);
    let dark_params = PlateReverbParams {
        damping: 1.0,
        ..test_params()
    };
    let bright_params = PlateReverbParams {
        damping: 0.0,
        ..test_params()
    };
    let mut dark_delta = 0.0_f32;
    let mut bright_delta = 0.0_f32;
    let mut previous_dark = 0.0;
    let mut previous_bright = 0.0;

    for i in 0..300 {
        let input = if i < 80 {
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
        if i > 120 {
            dark_delta += (dark_l - previous_dark).abs();
            bright_delta += (bright_l - previous_bright).abs();
        }
        previous_dark = dark_l;
        previous_bright = bright_l;
    }

    assert!(dark_delta < bright_delta);
}

#[test]
fn plate_reverb_zero_width_centers_mono_wet_signal() {
    let mut state = PlateReverbState::new(1_000.0);
    let params = PlateReverbParams {
        width: 0.0,
        ..test_params()
    };

    for i in 0..300 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        let (left, right) = state.process(input, input, params, 1_000.0);
        assert!((left - right).abs() < 1e-6);
    }
}

#[test]
fn plate_reverb_full_width_decorrelates_mono_tail() {
    let mut state = PlateReverbState::new(1_000.0);
    let params = PlateReverbParams {
        width: 1.0,
        ..test_params()
    };
    let mut difference = 0.0_f32;

    for i in 0..400 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        let (left, right) = state.process(input, input, params, 1_000.0);
        if i > 60 {
            difference += (left - right).abs();
        }
    }

    assert!(difference > 0.01);
}

#[test]
fn plate_reverb_clear_resets_tail_history() {
    let mut state = PlateReverbState::new(1_000.0);
    let params = test_params();

    for i in 0..300 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        state.process(input, input, params, 1_000.0);
    }
    state.clear();

    for _ in 0..128 {
        assert_eq!(state.process(0.0, 0.0, params, 1_000.0), (0.0, 0.0));
    }
}

#[test]
fn plate_reverb_sanitizes_hostile_params() {
    let mut state = PlateReverbState::new(f64::NAN);
    let params = PlateReverbParams {
        pre_delay_ms: f64::NAN,
        decay: f64::INFINITY,
        damping: f64::NEG_INFINITY,
        diffusion: f64::NAN,
        modulation: f64::INFINITY,
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
fn plate_reverb_sizes_predelay_from_sample_rate() {
    let state = PlateReverbState::new(1_000.0);
    assert_eq!(state.pre_delay_len(), 300);
}

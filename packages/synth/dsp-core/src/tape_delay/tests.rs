use super::*;

fn clean_params() -> TapeDelayParams {
    TapeDelayParams {
        time_ms: 20.0,
        feedback: 0.0,
        mix: 1.0,
        wow: 0.0,
        flutter: 0.0,
        tape_age: 0.0,
        drive: 0.0,
        tone: 1.0,
        width: 0.0,
    }
}

#[test]
fn tape_delay_zero_mix_returns_dry_signal() {
    let mut state = TapeDelayState::new(1_000.0);
    let params = TapeDelayParams {
        mix: 0.0,
        ..clean_params()
    };

    for _ in 0..32 {
        let (left, right) = state.process(0.25, -0.5, params, 1_000.0);
        assert_eq!(left, 0.25);
        assert_eq!(right, -0.5);
    }
}

#[test]
fn tape_delay_renders_impulse_after_fractional_delay() {
    let mut state = TapeDelayState::new(1_000.0);
    let params = clean_params();
    let mut left = [0.0; 48];

    for (i, out) in left.iter_mut().enumerate() {
        let input = if i == 0 { 1.0 } else { 0.0 };
        *out = state.process(input, input, params, 1_000.0).0;
    }

    assert_eq!(left[0], 0.0);
    assert!(left[20] > 0.4);
    assert!(left.iter().all(|sample| sample.is_finite()));
}

#[test]
fn tape_delay_feedback_recirculates_with_decay() {
    let mut state = TapeDelayState::new(1_000.0);
    let params = TapeDelayParams {
        feedback: 0.5,
        ..clean_params()
    };
    let mut left = [0.0; 72];

    for (i, out) in left.iter_mut().enumerate() {
        let input = if i == 0 { 1.0 } else { 0.0 };
        *out = state.process(input, input, params, 1_000.0).0;
    }

    assert!(left[20] > 0.4);
    assert!(left[40] > 0.1);
    assert!(left[40] < left[20]);
}

#[test]
fn tape_delay_width_spreads_mono_repeats() {
    let mut state = TapeDelayState::new(1_000.0);
    let params = TapeDelayParams {
        width: 1.0,
        ..clean_params()
    };
    let mut difference = 0.0_f32;

    for i in 0..64 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        let (left, right) = state.process(input, input, params, 1_000.0);
        difference += (left - right).abs();
    }

    assert!(difference > 0.01);
}

#[test]
fn tape_delay_zero_width_centers_mono_repeats() {
    let mut state = TapeDelayState::new(1_000.0);
    let params = TapeDelayParams {
        width: 0.0,
        ..clean_params()
    };

    for i in 0..64 {
        let input = if i == 0 { 1.0 } else { 0.0 };
        let (left, right) = state.process(input, input, params, 1_000.0);
        assert!((left - right).abs() < 1e-6);
    }
}

#[test]
fn tape_delay_tone_and_age_dampen_fast_alternation() {
    let mut dark = TapeDelayState::new(1_000.0);
    let mut bright = TapeDelayState::new(1_000.0);
    let dark_params = TapeDelayParams {
        tone: 0.0,
        tape_age: 1.0,
        time_ms: 5.0,
        ..clean_params()
    };
    let bright_params = TapeDelayParams {
        tone: 1.0,
        tape_age: 0.0,
        time_ms: 5.0,
        ..clean_params()
    };
    let mut dark_delta = 0.0;
    let mut bright_delta = 0.0;
    let mut previous_dark = 0.0;
    let mut previous_bright = 0.0;

    for i in 0..96 {
        let input = if i % 2 == 0 { 1.0 } else { -1.0 };
        let current_dark = dark.process(input, input, dark_params, 1_000.0).0;
        let current_bright = bright.process(input, input, bright_params, 1_000.0).0;
        if i > 12 {
            dark_delta += (current_dark - previous_dark).abs();
            bright_delta += (current_bright - previous_bright).abs();
        }
        previous_dark = current_dark;
        previous_bright = current_bright;
    }

    assert!(dark_delta < bright_delta * 0.75);
}

#[test]
fn tape_delay_hiss_is_deterministic_from_seed() {
    let params = TapeDelayParams {
        mix: 1.0,
        tape_age: 1.0,
        drive: 0.4,
        ..clean_params()
    };
    let mut a = TapeDelayState::with_seed(48_000.0, 42);
    let mut b = TapeDelayState::with_seed(48_000.0, 42);

    for _ in 0..256 {
        assert_eq!(
            a.process(0.0, 0.0, params, 48_000.0),
            b.process(0.0, 0.0, params, 48_000.0)
        );
    }
}

#[test]
fn tape_delay_sanitizes_hostile_params() {
    let mut state = TapeDelayState::new(f64::NAN);
    let params = TapeDelayParams {
        time_ms: f64::NAN,
        feedback: f64::INFINITY,
        mix: f64::NAN,
        wow: f64::NAN,
        flutter: f64::NEG_INFINITY,
        tape_age: f64::NAN,
        drive: f64::NAN,
        tone: f64::INFINITY,
        width: f64::NEG_INFINITY,
    };

    for _ in 0..256 {
        let (left, right) = state.process(1.0, -1.0, params, f64::NAN);
        assert!(left.is_finite());
        assert!(right.is_finite());
    }
}

#[test]
fn tape_delay_sizes_delay_from_sample_rate() {
    let state = TapeDelayState::new(1_000.0);
    assert_eq!(state.delay_len(), 2_400);
}

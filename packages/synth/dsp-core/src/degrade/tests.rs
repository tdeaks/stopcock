use super::*;

#[test]
fn bitcrusher_quantizes_to_requested_resolution() {
    let mut state = BitcrusherState::default();
    let out = bitcrush_sample(0.8, 2.0, 1.0, &mut state);

    assert_eq!(out, 1.0);
}

#[test]
fn bitcrusher_holds_sample_while_downsampling() {
    let mut state = BitcrusherState::default();

    assert_eq!(bitcrush_sample(0.25, 8.0, 3.0, &mut state), state.held());
    let held = state.held();
    assert_eq!(bitcrush_sample(0.75, 8.0, 3.0, &mut state), held);
    assert_eq!(bitcrush_sample(-0.75, 8.0, 3.0, &mut state), held);
    assert_ne!(bitcrush_sample(-0.75, 8.0, 3.0, &mut state), held);
}

#[test]
fn bitcrusher_sanitizes_params_and_clamps_input() {
    let mut state = BitcrusherState::default();
    let out = bitcrush_sample(2.0, f64::NAN, f64::NAN, &mut state);

    assert!(out.is_finite());
    assert!(out <= 1.0);
    assert_eq!(state.countdown(), 0);
}

#[test]
fn quantize_sample_reuses_bitcrusher_resolution() {
    assert_eq!(quantize_sample(0.8, 2.0), 1.0);
    assert_eq!(quantize_sample(-0.8, 2.0), -1.0);
}

#[test]
fn degrade_zero_mix_returns_dry_signal() {
    let mut state = DegradeState::new();
    let params = DegradeParams {
        mix: 0.0,
        bits: 2.0,
        downsample: 8.0,
        noise: 1.0,
        jitter: 1.0,
        ..DegradeParams::default()
    };

    for input in [-0.75, -0.25, 0.0, 0.25, 0.75] {
        let (left, right) = state.process(input, -input, params, 48_000.0);
        assert!((left - input).abs() < 1e-6);
        assert!((right + input).abs() < 1e-6);
    }
}

#[test]
fn degrade_reduces_resolution_and_holds_samples() {
    let mut state = DegradeState::new();
    let params = DegradeParams {
        bits: 2.0,
        downsample: 3.0,
        tone: 1.0,
        mix: 1.0,
        ..DegradeParams::default()
    };

    let first = state.process(0.8, 0.8, params, 48_000.0).0;
    let second = state.process(-0.8, -0.8, params, 48_000.0).0;
    let third = state.process(-0.8, -0.8, params, 48_000.0).0;
    let fourth = state.process(-0.8, -0.8, params, 48_000.0).0;

    assert!((first - second).abs() < 0.1);
    assert!((first - third).abs() < 0.1);
    assert!((fourth - first).abs() > 0.1);
}

#[test]
fn degrade_noise_is_deterministic_from_seed() {
    let params = DegradeParams {
        bits: 4.0,
        downsample: 1.0,
        noise: 1.0,
        tone: 1.0,
        mix: 1.0,
        ..DegradeParams::default()
    };
    let mut a = DegradeState::with_seed(7);
    let mut b = DegradeState::with_seed(7);

    for _ in 0..128 {
        assert_eq!(
            a.process(0.03, 0.03, params, 48_000.0),
            b.process(0.03, 0.03, params, 48_000.0)
        );
    }
}

#[test]
fn degrade_tone_damps_fast_alternating_artifacts() {
    let mut dark = DegradeState::new();
    let mut bright = DegradeState::new();
    let dark_params = DegradeParams {
        bits: 8.0,
        downsample: 1.0,
        tone: 0.0,
        mix: 1.0,
        ..DegradeParams::default()
    };
    let bright_params = DegradeParams {
        bits: 8.0,
        downsample: 1.0,
        tone: 1.0,
        mix: 1.0,
        ..DegradeParams::default()
    };
    let mut dark_energy = 0.0;
    let mut bright_energy = 0.0;

    for i in 0..256 {
        let input = if i % 2 == 0 { 0.8 } else { -0.8 };
        dark_energy += dark.process(input, input, dark_params, 48_000.0).0.abs();
        bright_energy += bright
            .process(input, input, bright_params, 48_000.0)
            .0
            .abs();
    }

    assert!(dark_energy < bright_energy * 0.5);
}

#[test]
fn degrade_sanitizes_hostile_params() {
    let mut state = DegradeState::new();
    let params = DegradeParams {
        bits: f64::NAN,
        downsample: f64::INFINITY,
        jitter: f64::NAN,
        noise: f64::INFINITY,
        tone: f64::NAN,
        mix: f64::INFINITY,
    };

    for _ in 0..128 {
        let (left, right) = state.process(0.5, -0.5, params, f64::NAN);
        assert!(left.is_finite());
        assert!(right.is_finite());
        assert!(left.abs() <= 4.0);
        assert!(right.abs() <= 4.0);
    }
}

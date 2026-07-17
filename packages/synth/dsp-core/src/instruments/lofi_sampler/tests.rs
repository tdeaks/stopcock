use super::*;

fn zone() -> SamplerZone {
    SamplerZone {
        samples: vec![0.0, 0.8, 0.2, -0.4, -0.1, 0.3, 0.0],
        sample_rate: 48_000.0,
        root_midi: 69.0,
        key_low: 0.0,
        key_high: 127.0,
        velocity_low: 0.0,
        velocity_high: 1.0,
        looped: true,
        loop_start: 1,
        loop_end: 6,
        gain: 1.0,
        pan: 0.0,
    }
}

fn render(params: LoFiSamplerParams, frames: usize) -> Vec<(f32, f32)> {
    let zones = [zone()];
    let mut state = LoFiSamplerState::new();
    (0..frames)
        .map(|_| state.process(&zones, params, 48_000.0, Some(frames as f64 / 48_000.0)))
        .collect()
}

fn peak(samples: &[(f32, f32)]) -> f32 {
    samples.iter().fold(0.0_f32, |acc, (left, right)| {
        acc.max(left.abs()).max(right.abs())
    })
}

#[test]
fn lofi_sampler_renders_finite_stereo_samples() {
    let out = render(LoFiSamplerParams::default(), 256);

    assert!(out
        .iter()
        .all(|(left, right)| left.is_finite() && right.is_finite()));
    assert!(peak(&out) > 0.01);
    assert!(peak(&out) <= 1.2);
}

#[test]
fn lofi_sampler_zero_level_is_silent() {
    let out = render(
        LoFiSamplerParams {
            level: 0.0,
            ..LoFiSamplerParams::default()
        },
        128,
    );

    assert_eq!(peak(&out), 0.0);
}

#[test]
fn lofi_sampler_velocity_scales_output() {
    let quiet = render(
        LoFiSamplerParams {
            velocity: 0.25,
            noise: 0.0,
            ..LoFiSamplerParams::default()
        },
        256,
    );
    let loud = render(
        LoFiSamplerParams {
            velocity: 1.0,
            noise: 0.0,
            ..LoFiSamplerParams::default()
        },
        256,
    );

    assert!(peak(&loud) > peak(&quiet) * 2.5);
}

#[test]
fn lofi_sampler_degrade_params_change_output() {
    let clean = render(
        LoFiSamplerParams {
            bits: 16.0,
            downsample: 1.0,
            jitter: 0.0,
            noise: 0.0,
            drive: 0.0,
            mix: 0.0,
            ..LoFiSamplerParams::default()
        },
        256,
    );
    let gritty = render(
        LoFiSamplerParams {
            bits: 6.0,
            downsample: 6.0,
            jitter: 0.2,
            noise: 0.2,
            drive: 0.4,
            mix: 1.0,
            ..LoFiSamplerParams::default()
        },
        256,
    );

    let delta = clean
        .iter()
        .zip(gritty.iter())
        .map(|((clean_l, clean_r), (grit_l, grit_r))| {
            (clean_l - grit_l).abs() + (clean_r - grit_r).abs()
        })
        .sum::<f32>();
    assert!(delta > 1.0);
}

#[test]
fn lofi_sampler_noise_stops_after_gate_release() {
    let zones = [zone()];
    let mut state = LoFiSamplerState::new();
    let params = LoFiSamplerParams {
        noise: 1.0,
        mix: 1.0,
        attack: 0.0,
        release: 0.01,
        ..LoFiSamplerParams::default()
    };
    let out: Vec<_> = (0..40)
        .map(|_| state.process(&zones, params, 1_000.0, Some(0.01)))
        .collect();

    assert!(peak(&out[..20]) > 0.01);
    assert_eq!(peak(&out[20..]), 0.0);
}

#[test]
fn lofi_sampler_clear_is_deterministic() {
    let zones = [zone()];
    let params = LoFiSamplerParams::default();
    let mut state = LoFiSamplerState::new();
    let first: Vec<_> = (0..128)
        .map(|_| state.process(&zones, params, 48_000.0, Some(1.0)))
        .collect();
    state.clear();
    let second: Vec<_> = (0..128)
        .map(|_| state.process(&zones, params, 48_000.0, Some(1.0)))
        .collect();

    assert_eq!(first, second);
    assert_eq!(state.selected_zone(), Some(0));
    assert!(state.position() > 0.0);
}

#[test]
fn lofi_sampler_sanitizes_hostile_params() {
    let zones = [zone()];
    let mut state = LoFiSamplerState::new();
    let params = LoFiSamplerParams {
        freq: f64::NAN,
        velocity: f64::INFINITY,
        attack: f64::NAN,
        release: f64::NEG_INFINITY,
        level: f64::INFINITY,
        bits: f64::NAN,
        downsample: f64::INFINITY,
        jitter: f64::NAN,
        noise: f64::INFINITY,
        tone: f64::NEG_INFINITY,
        drive: f64::INFINITY,
        mix: f64::NAN,
    };

    for _ in 0..256 {
        let (left, right) = state.process(&zones, params, f64::NAN, Some(f64::NAN));
        assert!(left.is_finite());
        assert!(right.is_finite());
        assert!(left.abs() <= 4.0);
        assert!(right.abs() <= 4.0);
    }
}

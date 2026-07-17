use super::*;

fn zone(samples: &[f32], root_midi: f64) -> SamplerZone {
    SamplerZone {
        samples: samples.to_vec(),
        sample_rate: 1_000.0,
        root_midi,
        key_low: 0.0,
        key_high: 127.0,
        velocity_low: 0.0,
        velocity_high: 1.0,
        looped: false,
        loop_start: 0,
        loop_end: 0,
        gain: 1.0,
        pan: 0.0,
    }
}

#[test]
fn sampler_selects_matching_key_and_velocity_zone() {
    let zones = [
        SamplerZone {
            key_low: 0.0,
            key_high: 40.0,
            velocity_low: 0.0,
            velocity_high: 0.5,
            ..zone(&[1.0], 36.0)
        },
        SamplerZone {
            key_low: 41.0,
            key_high: 90.0,
            velocity_low: 0.5,
            velocity_high: 1.0,
            ..zone(&[2.0], 60.0)
        },
    ];

    assert_eq!(select_zone(&zones, 60.0, 0.75), Some(1));
}

#[test]
fn sampler_falls_back_to_first_nonempty_zone() {
    let zones = [zone(&[], 60.0), zone(&[0.25], 60.0)];

    assert_eq!(select_zone(&zones, 10.0, 1.0), Some(1));
}

#[test]
fn sampler_renders_root_pitch_at_source_rate() {
    let zones = [zone(&[1.0, 0.5, -1.0, 0.0], 69.0)];
    let mut state = SamplerVoiceState::new();
    let params = SamplerParams {
        freq: 440.0,
        velocity: 1.0,
        attack: 0.0,
        release: 0.1,
        level: 1.0,
    };

    let first = state.process(&zones, params, 1_000.0, None).0;
    let second = state.process(&zones, params, 1_000.0, None).0;

    assert!(first > 0.7);
    assert!(second > 0.3);
    assert_eq!(state.selected_zone(), Some(0));
}

#[test]
fn sampler_transposes_by_playback_ratio() {
    let zones = [zone(&[0.0, 1.0, 0.0, -1.0, 0.5], 69.0)];
    let mut state = SamplerVoiceState::new();
    let params = SamplerParams {
        freq: 880.0,
        ..SamplerParams::default()
    };

    let _ = state.process(&zones, params, 1_000.0, None);
    let pos = state.position();

    assert!((pos - 2.0).abs() < 1e-9);
}

#[test]
fn sampler_loops_between_loop_points() {
    let zones = [SamplerZone {
        looped: true,
        loop_start: 1,
        loop_end: 3,
        ..zone(&[0.0, 1.0, 0.5, -1.0], 69.0)
    }];
    let mut state = SamplerVoiceState::new();
    let params = SamplerParams::default();

    for _ in 0..8 {
        let (left, right) = state.process(&zones, params, 1_000.0, None);
        assert!(left.is_finite());
        assert!(right.is_finite());
    }

    assert!(state.position() >= 1.0);
    assert!(state.position() < 3.0);
}

#[test]
fn sampler_applies_gate_release_envelope() {
    let zones = [zone(&[1.0; 16], 69.0)];
    let mut state = SamplerVoiceState::new();
    let params = SamplerParams {
        release: 0.004,
        ..SamplerParams::default()
    };
    let mut last = 0.0;

    for _ in 0..10 {
        last = state.process(&zones, params, 1_000.0, Some(0.002)).0.abs();
    }

    assert!(last < 1e-6);
}

#[test]
fn sampler_velocity_scales_output() {
    let zones = [zone(&[1.0, 1.0, 1.0], 69.0)];
    let mut quiet = SamplerVoiceState::new();
    let mut loud = SamplerVoiceState::new();
    let quiet_out = quiet.process(
        &zones,
        SamplerParams {
            velocity: 0.25,
            ..SamplerParams::default()
        },
        1_000.0,
        None,
    );
    let loud_out = loud.process(&zones, SamplerParams::default(), 1_000.0, None);

    assert!(quiet_out.0.abs() < loud_out.0.abs());
    assert!(quiet_out.1.abs() < loud_out.1.abs());
}

#[test]
fn sampler_pan_spreads_output() {
    let zones = [SamplerZone {
        pan: -1.0,
        ..zone(&[1.0, 1.0], 69.0)
    }];
    let mut state = SamplerVoiceState::new();
    let (left, right) = state.process(&zones, SamplerParams::default(), 1_000.0, None);

    assert!(left.abs() > 0.9);
    assert!(right.abs() < 1e-6);
}

#[test]
fn sampler_clear_restarts_selection_and_position() {
    let zones = [zone(&[1.0, 0.0], 69.0)];
    let mut state = SamplerVoiceState::new();

    state.process(&zones, SamplerParams::default(), 1_000.0, None);
    state.clear();

    assert_eq!(state.selected_zone(), None);
    assert_eq!(state.position(), 0.0);
}

#[test]
fn sampler_sanitizes_hostile_values() {
    let zones = [SamplerZone {
        sample_rate: f64::NAN,
        root_midi: f64::INFINITY,
        key_low: f64::NAN,
        key_high: f64::INFINITY,
        velocity_low: f64::NEG_INFINITY,
        velocity_high: f64::INFINITY,
        looped: true,
        loop_start: usize::MAX,
        loop_end: usize::MAX,
        gain: f64::INFINITY,
        pan: f64::NEG_INFINITY,
        ..zone(&[1.0, 0.0], 69.0)
    }];
    let mut state = SamplerVoiceState::new();
    let params = SamplerParams {
        freq: f64::NAN,
        velocity: f64::INFINITY,
        attack: f64::NAN,
        release: f64::INFINITY,
        level: f64::INFINITY,
    };

    for _ in 0..16 {
        let (left, right) = state.process(&zones, params, f64::NAN, Some(f64::NAN));
        assert!(left.is_finite());
        assert!(right.is_finite());
    }
}

use super::*;

#[test]
fn zero_mix_returns_dry_stereo_signal() {
    let mut state = RotarySpeakerState::new(8_000.0);
    let params = RotarySpeakerParams {
        mix: 0.0,
        depth: 1.0,
        ..RotarySpeakerParams::default()
    };

    for input in [-0.75, -0.2, 0.0, 0.3, 0.9] {
        let (left, right) = state.process(input, -input, params, 8_000.0);
        assert_eq!(left, input);
        assert_eq!(right, -input);
    }
}

#[test]
fn zero_depth_returns_dry_signal() {
    let mut state = RotarySpeakerState::new(8_000.0);
    let params = RotarySpeakerParams {
        mix: 1.0,
        depth: 0.0,
        ..RotarySpeakerParams::default()
    };

    for input in [-0.75, -0.2, 0.0, 0.3, 0.9] {
        let (left, right) = state.process(input, -input, params, 8_000.0);
        assert_eq!(left, input);
        assert_eq!(right, -input);
    }
}

#[test]
fn rotary_motion_creates_stereo_difference_from_mono_input() {
    let mut state = RotarySpeakerState::new(8_000.0);
    let params = RotarySpeakerParams {
        rate_hz: 6.0,
        depth: 1.0,
        mix: 1.0,
        width: 1.0,
        ..RotarySpeakerParams::default()
    };

    let (left, right) = render_sine(&mut state, params);
    let difference = left
        .iter()
        .zip(right.iter())
        .map(|(l, r)| (*l as f64 - *r as f64).abs())
        .sum::<f64>();
    let mono_energy = left
        .iter()
        .map(|sample| (*sample as f64).abs())
        .sum::<f64>();

    assert!(difference > mono_energy * 0.08);
}

#[test]
fn width_controls_stereo_motion() {
    let mut narrow = RotarySpeakerState::new(8_000.0);
    let mut wide = RotarySpeakerState::new(8_000.0);
    let narrow_params = RotarySpeakerParams {
        rate_hz: 6.0,
        depth: 1.0,
        mix: 1.0,
        width: 0.0,
        ..RotarySpeakerParams::default()
    };
    let wide_params = RotarySpeakerParams {
        width: 1.0,
        ..narrow_params
    };

    let (narrow_l, narrow_r) = render_sine(&mut narrow, narrow_params);
    let (wide_l, wide_r) = render_sine(&mut wide, wide_params);

    assert!(stereo_difference(&wide_l, &wide_r) > stereo_difference(&narrow_l, &narrow_r) * 1.5);
}

#[test]
fn clear_restarts_phase_delay_and_filters() {
    let params = RotarySpeakerParams {
        rate_hz: 6.0,
        depth: 1.0,
        mix: 1.0,
        ..RotarySpeakerParams::default()
    };
    let mut a = RotarySpeakerState::new(8_000.0);
    let mut b = RotarySpeakerState::new(8_000.0);

    for _ in 0..256 {
        let _ = a.process(0.5, 0.5, params, 8_000.0);
    }
    a.clear();

    for i in 0..512 {
        let input = (i as f64 * 440.0 * TAU / 8_000.0).sin() as f32;
        assert_eq!(
            a.process(input, input, params, 8_000.0),
            b.process(input, input, params, 8_000.0)
        );
    }
}

#[test]
fn hostile_params_stay_finite_and_bounded() {
    let mut state = RotarySpeakerState::new(f64::NAN);
    let params = RotarySpeakerParams {
        rate_hz: f64::INFINITY,
        depth: f64::NAN,
        mix: f64::INFINITY,
        drive: f64::INFINITY,
        width: f64::INFINITY,
        crossover_hz: f64::NAN,
    };

    for _ in 0..256 {
        let (left, right) = state.process(0.5, -0.5, params, f64::NAN);
        assert!(left.is_finite());
        assert!(right.is_finite());
        assert!(left.abs() <= 8.0);
        assert!(right.abs() <= 8.0);
    }
}

fn render_sine(
    state: &mut RotarySpeakerState,
    params: RotarySpeakerParams,
) -> (Vec<f32>, Vec<f32>) {
    let mut left = Vec::with_capacity(2048);
    let mut right = Vec::with_capacity(2048);
    for i in 0..2304 {
        let input = (i as f64 * 440.0 * TAU / 8_000.0).sin() as f32;
        let (l, r) = state.process(input, input, params, 8_000.0);
        if i >= 256 {
            left.push(l);
            right.push(r);
        }
    }
    (left, right)
}

fn stereo_difference(left: &[f32], right: &[f32]) -> f64 {
    left.iter()
        .zip(right.iter())
        .map(|(l, r)| (*l as f64 - *r as f64).abs())
        .sum()
}

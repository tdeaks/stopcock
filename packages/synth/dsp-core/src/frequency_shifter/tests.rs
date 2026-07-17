use super::*;

#[test]
fn zero_mix_returns_dry_signal() {
    let mut state = FrequencyShifterState::new();
    let params = FrequencyShifterParams {
        shift_hz: 110.0,
        mix: 0.0,
    };

    for input in [-0.75, -0.2, 0.0, 0.3, 0.9] {
        let (left, right) = state.process(input, -input, params, 8_000.0);
        assert_eq!(left, input);
        assert_eq!(right, -input);
    }
}

#[test]
fn zero_shift_returns_dry_signal() {
    let mut state = FrequencyShifterState::new();
    let params = FrequencyShifterParams {
        shift_hz: 0.0,
        mix: 1.0,
    };

    for input in [-0.75, -0.2, 0.0, 0.3, 0.9] {
        let (left, right) = state.process(input, -input, params, 8_000.0);
        assert_eq!(left, input);
        assert_eq!(right, -input);
    }
}

#[test]
fn positive_shift_moves_sine_energy_upward() {
    let mut state = FrequencyShifterState::new();
    let params = FrequencyShifterParams {
        shift_hz: 110.0,
        mix: 1.0,
    };
    let samples = shifted_sine(&mut state, params);

    let target = tone_energy(&samples, 550.0, 8_000.0);
    let original = tone_energy(&samples, 440.0, 8_000.0);
    assert!(target > original * 5.0);
}

#[test]
fn negative_shift_moves_sine_energy_downward() {
    let mut state = FrequencyShifterState::new();
    let params = FrequencyShifterParams {
        shift_hz: -110.0,
        mix: 1.0,
    };
    let samples = shifted_sine(&mut state, params);

    let target = tone_energy(&samples, 330.0, 8_000.0);
    let original = tone_energy(&samples, 440.0, 8_000.0);
    assert!(target > original * 5.0);
}

#[test]
fn clear_restarts_phase_and_hilbert_history() {
    let params = FrequencyShifterParams {
        shift_hz: 110.0,
        mix: 1.0,
    };
    let mut a = FrequencyShifterState::new();
    let mut b = FrequencyShifterState::new();

    for _ in 0..128 {
        let _ = a.process(0.5, 0.5, params, 8_000.0);
    }
    a.clear();

    for i in 0..256 {
        let input = (i as f64 * 440.0 * TAU / 8_000.0).sin() as f32;
        assert_eq!(
            a.process(input, -input, params, 8_000.0),
            b.process(input, -input, params, 8_000.0)
        );
    }
}

#[test]
fn hostile_params_stay_finite_and_bounded() {
    let mut state = FrequencyShifterState::new();
    let params = FrequencyShifterParams {
        shift_hz: f64::INFINITY,
        mix: f64::NAN,
    };

    for _ in 0..128 {
        let (left, right) = state.process(0.5, -0.5, params, f64::NAN);
        assert!(left.is_finite());
        assert!(right.is_finite());
        assert!(left.abs() <= 8.0);
        assert!(right.abs() <= 8.0);
    }
}

fn shifted_sine(state: &mut FrequencyShifterState, params: FrequencyShifterParams) -> Vec<f32> {
    let mut samples = Vec::with_capacity(2048);
    for i in 0..2300 {
        let input = (i as f64 * 440.0 * TAU / 8_000.0).sin() as f32;
        let sample = state.process(input, input, params, 8_000.0).0;
        if i >= 252 {
            samples.push(sample);
        }
    }
    samples
}

fn tone_energy(samples: &[f32], freq: f64, sample_rate: f64) -> f64 {
    let mut real = 0.0;
    let mut imag = 0.0;
    for (index, sample) in samples.iter().enumerate() {
        let phase = index as f64 * freq * TAU / sample_rate;
        real += *sample as f64 * phase.cos();
        imag -= *sample as f64 * phase.sin();
    }
    real * real + imag * imag
}

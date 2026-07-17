use super::*;

#[test]
fn rbj_lowpass_step_response_stays_finite_and_converges() {
    let mut biquad = BiquadState::default();
    biquad.design_kind(FilterKind::Lowpass, 1_000.0, 0.707, 0.0, 48_000.0);
    let mut y = 0.0;
    for _ in 0..4096 {
        y = biquad.process(1.0);
        assert!(y.is_finite());
    }
    assert!((y - 1.0).abs() < 1e-6);
}

#[test]
fn highpass_rejects_dc() {
    let mut biquad = BiquadState::default();
    biquad.design_kind(FilterKind::Highpass, 1_000.0, 0.707, 0.0, 48_000.0);
    let mut y = 0.0;
    for _ in 0..4096 {
        y = biquad.process(1.0);
        assert!(y.is_finite());
    }
    assert!(y.abs() < 1e-6);
}

#[test]
fn one_pole_lowpass_moves_monotonically_toward_step() {
    let mut filter = OnePoleLowpass::default();
    filter.set_cutoff(500.0, 48_000.0);
    let mut last = 0.0;
    for _ in 0..128 {
        let y = filter.process(1.0);
        assert!(y >= last);
        assert!(y <= 1.0);
        last = y;
    }
}

#[test]
fn dc_blocker_removes_constant_input() {
    let mut blocker = DcBlocker::default();
    let mut y = 0.0;
    for _ in 0..4096 {
        y = blocker.process(1.0);
        assert!(y.is_finite());
    }
    assert!(y.abs() < 1e-6);
}

#[test]
fn state_variable_lowpass_converges_to_step() {
    let mut filter = StateVariableFilterState::default();
    let params = StateVariableFilterParams {
        mode: StateVariableFilterMode::Lowpass,
        freq: 500.0,
        resonance: 0.0,
        drive: 0.0,
        mix: 1.0,
    };
    let mut y = 0.0;
    for _ in 0..4096 {
        y = filter.process(1.0, params, 48_000.0);
        assert!(y.is_finite());
    }
    assert!((y - 1.0).abs() < 1e-3);
}

#[test]
fn state_variable_highpass_rejects_dc() {
    let mut filter = StateVariableFilterState::default();
    let params = StateVariableFilterParams {
        mode: StateVariableFilterMode::Highpass,
        freq: 500.0,
        resonance: 0.2,
        drive: 0.0,
        mix: 1.0,
    };
    let mut y = 0.0;
    for _ in 0..4096 {
        y = filter.process(1.0, params, 48_000.0);
        assert!(y.is_finite());
    }
    assert!(y.abs() < 1e-3);
}

#[test]
fn state_variable_zero_mix_returns_dry_signal() {
    let mut filter = StateVariableFilterState::default();
    let params = StateVariableFilterParams {
        mix: 0.0,
        drive: 2.0,
        ..StateVariableFilterParams::default()
    };

    assert_eq!(filter.process(0.25, params, 48_000.0), 0.25);
    assert_eq!(filter.process(-0.5, params, 48_000.0), -0.5);
}

#[test]
fn state_variable_resonance_increases_bandpass_energy() {
    let quiet = render_state_variable_bandpass(0.0);
    let resonant = render_state_variable_bandpass(0.9);

    assert!(resonant > quiet * 1.5);
}

#[test]
fn state_variable_clear_restarts_deterministic_state() {
    let params = StateVariableFilterParams {
        mode: StateVariableFilterMode::Notch,
        freq: 1_200.0,
        resonance: 0.4,
        drive: 0.2,
        mix: 1.0,
    };
    let mut a = StateVariableFilterState::default();
    let mut b = StateVariableFilterState::default();
    let mut before = Vec::new();
    let mut after = Vec::new();

    for i in 0..64 {
        before.push(a.process(if i == 0 { 1.0 } else { 0.0 }, params, 48_000.0));
    }
    for i in 0..17 {
        let _ = a.process((i as f32 * 0.03).sin(), params, 48_000.0);
    }
    a.clear();
    for i in 0..64 {
        after.push(a.process(if i == 0 { 1.0 } else { 0.0 }, params, 48_000.0));
        assert_eq!(
            after[i],
            b.process(if i == 0 { 1.0 } else { 0.0 }, params, 48_000.0)
        );
    }

    assert_eq!(before, after);
}

#[test]
fn state_variable_hostile_params_stay_finite_and_bounded() {
    let mut filter = StateVariableFilterState::default();
    let params = StateVariableFilterParams {
        mode: StateVariableFilterMode::Bandpass,
        freq: f64::INFINITY,
        resonance: f64::NAN,
        drive: f64::INFINITY,
        mix: f64::NAN,
    };

    for i in 0..512 {
        let input = if i % 2 == 0 { 100.0 } else { -100.0 };
        let output = filter.process(input, params, f64::NAN);
        assert!(output.is_finite());
        assert!(output.abs() <= 8.0);
    }
}

fn render_state_variable_bandpass(resonance: f64) -> f32 {
    let mut filter = StateVariableFilterState::default();
    let params = StateVariableFilterParams {
        mode: StateVariableFilterMode::Bandpass,
        freq: 1_000.0,
        resonance,
        drive: 0.0,
        mix: 1.0,
    };
    let sample_rate = 48_000.0;
    let mut energy = 0.0;
    for i in 0..2048 {
        let input = (2.0 * std::f32::consts::PI * 1_000.0 * i as f32 / sample_rate as f32).sin();
        let output = filter.process(input, params, sample_rate);
        if i > 256 {
            energy += output.abs();
        }
    }
    energy
}

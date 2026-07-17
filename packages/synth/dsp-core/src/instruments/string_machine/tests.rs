use super::*;

const SR: f64 = 48_000.0;

fn render(params: StringMachineParams, frames: usize, gate_sec: Option<f64>) -> Vec<(f32, f32)> {
    let mut state = StringMachineState::new(SR);
    (0..frames)
        .map(|_| state.process(params, SR, gate_sec))
        .collect()
}

fn peak(samples: &[(f32, f32)]) -> f32 {
    samples.iter().fold(0.0_f32, |acc, (left, right)| {
        acc.max(left.abs()).max(right.abs())
    })
}

fn energy(samples: &[(f32, f32)]) -> f32 {
    samples
        .iter()
        .map(|(left, right)| left * left + right * right)
        .sum::<f32>()
        / samples.len().max(1) as f32
}

fn stereo_difference(samples: &[(f32, f32)]) -> f32 {
    samples
        .iter()
        .map(|(left, right)| (left - right).abs())
        .sum::<f32>()
        / samples.len().max(1) as f32
}

#[test]
fn string_machine_renders_finite_bounded_stereo() {
    let out = render(StringMachineParams::default(), 2_048, Some(2_048.0 / SR));

    assert!(out
        .iter()
        .all(|(left, right)| left.is_finite() && right.is_finite()));
    assert!(peak(&out) <= 1.2);
    assert!(peak(&out) > 0.01);
}

#[test]
fn string_machine_zero_level_is_silent() {
    let out = render(
        StringMachineParams {
            level: 0.0,
            attack: 0.0,
            ..StringMachineParams::default()
        },
        256,
        None,
    );

    assert!(peak(&out) <= 1e-9);
}

#[test]
fn attack_ramps_in_slowly() {
    let out = render(
        StringMachineParams {
            attack: 0.2,
            depth: 0.0,
            ..StringMachineParams::default()
        },
        12_000,
        None,
    );
    let early = energy(&out[0..1_000]);
    let later = energy(&out[8_000..10_000]);

    assert!(later > early * 6.0);
}

#[test]
fn gate_release_decays_tail() {
    let out = render(
        StringMachineParams {
            attack: 0.0,
            release: 0.04,
            depth: 0.0,
            ..StringMachineParams::default()
        },
        8_000,
        Some(0.03),
    );
    let before = energy(&out[1_000..1_400]);
    let tail = energy(&out[6_000..7_000]);

    assert!(before > tail * 12.0);
}

#[test]
fn ensemble_depth_and_width_create_stereo_motion() {
    let narrow = render(
        StringMachineParams {
            attack: 0.0,
            depth: 0.0,
            width: 0.0,
            ..StringMachineParams::default()
        },
        4_096,
        None,
    );
    let wide = render(
        StringMachineParams {
            attack: 0.0,
            depth: 1.0,
            width: 1.0,
            modulation: 1.0,
            ..StringMachineParams::default()
        },
        4_096,
        None,
    );

    assert!(stereo_difference(&wide) > stereo_difference(&narrow) + 0.001);
}

#[test]
fn tone_changes_high_register_energy() {
    let dark = render(
        StringMachineParams {
            attack: 0.0,
            tone: 0.0,
            depth: 0.0,
            ..StringMachineParams::default()
        },
        2_048,
        None,
    );
    let bright = render(
        StringMachineParams {
            attack: 0.0,
            tone: 1.0,
            depth: 0.0,
            ..StringMachineParams::default()
        },
        2_048,
        None,
    );

    assert!((energy(&bright) - energy(&dark)).abs() > 0.0005);
}

#[test]
fn clear_resets_deterministic_state() {
    let mut state = StringMachineState::new(SR);
    let params = StringMachineParams {
        attack: 0.0,
        ..StringMachineParams::default()
    };
    let first: Vec<(f32, f32)> = (0..256).map(|_| state.process(params, SR, None)).collect();
    state.clear();
    let second: Vec<(f32, f32)> = (0..256).map(|_| state.process(params, SR, None)).collect();

    assert_eq!(first, second);
    assert_eq!(state.frame(), 256);
}

#[test]
fn string_machine_sanitizes_hostile_params() {
    let mut state = StringMachineState::new(f64::NAN);
    let params = StringMachineParams {
        freq: f64::NAN,
        detune: f64::INFINITY,
        attack: f64::NEG_INFINITY,
        release: f64::NAN,
        tone: f64::INFINITY,
        depth: f64::INFINITY,
        modulation: f64::INFINITY,
        width: f64::INFINITY,
        level: f64::INFINITY,
        velocity: f64::INFINITY,
    };

    for _ in 0..128 {
        let (left, right) = state.process(params, f64::NAN, Some(f64::NAN));
        assert!(left.is_finite());
        assert!(right.is_finite());
    }
}

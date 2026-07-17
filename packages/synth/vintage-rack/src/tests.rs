use stopcock_dsp_core::TAU;

use crate::{RackMode, RackParams, VintageRack};

#[test]
fn saturator_zero_mix_with_unity_output_returns_dry_signal() {
    let mut rack = VintageRack::new(48_000.0);
    let mut left = [-0.5, -0.25, 0.0, 0.25, 0.5];
    let mut right = [0.5, 0.25, 0.0, -0.25, -0.5];
    let original_l = left;
    let original_r = right;

    rack.process_block_in_place(
        &mut left,
        &mut right,
        RackParams {
            mode: RackMode::Saturator,
            mix: 0.0,
            output: 1.0,
            drive: 1.0,
            ..RackParams::default()
        },
    );

    assert_eq!(left, original_l);
    assert_eq!(right, original_r);
}

#[test]
fn reset_restarts_deterministic_rack_state() {
    let params = RackParams {
        mode: RackMode::DrumEcho,
        mix: 1.0,
        feedback: 0.4,
        time_ms: 24.0,
        motion: 0.3,
        age: 0.2,
        ..RackParams::default()
    };
    let mut rack = VintageRack::new(1_000.0);
    let mut first_l = [0.0_f32; 96];
    let mut first_r = [0.0_f32; 96];
    let mut second_l = [0.0_f32; 96];
    let mut second_r = [0.0_f32; 96];
    first_l[0] = 1.0;
    second_l[0] = 1.0;

    rack.process_block_in_place(&mut first_l, &mut first_r, params);
    rack.reset(1_000.0);
    rack.process_block_in_place(&mut second_l, &mut second_r, params);

    assert_eq!(first_l, second_l);
    assert_eq!(first_r, second_r);
}

#[test]
fn modes_route_to_distinct_processors() {
    let mut saturator = VintageRack::new(48_000.0);
    let mut lofi = VintageRack::new(48_000.0);
    let frames = 64;
    let mut input_l = vec![0.0_f32; frames];
    let input_r = vec![0.0_f32; frames];
    input_l[0] = 1.0;
    let mut saturator_l = vec![0.0_f32; frames];
    let mut saturator_r = vec![0.0_f32; frames];
    let mut lofi_l = vec![0.0_f32; frames];
    let mut lofi_r = vec![0.0_f32; frames];

    saturator
        .process_block(
            &input_l,
            &input_r,
            &mut saturator_l,
            &mut saturator_r,
            RackParams {
                mode: RackMode::Saturator,
                mix: 1.0,
                drive: 1.0,
                tone: 1.0,
                ..RackParams::default()
            },
        )
        .expect("saturator render");
    lofi.process_block(
        &input_l,
        &input_r,
        &mut lofi_l,
        &mut lofi_r,
        RackParams {
            mode: RackMode::LoFi,
            mix: 1.0,
            tone: 0.2,
            age: 1.0,
            ..RackParams::default()
        },
    )
    .expect("lofi render");

    assert_ne!(saturator_l, lofi_l);
    assert!(saturator_l.iter().any(|sample| sample.abs() > 1e-6));
    assert!(lofi_l.iter().any(|sample| sample.abs() > 1e-6));
}

#[test]
fn process_block_rejects_mismatched_buffers() {
    let mut rack = VintageRack::default();
    let input_l = [0.0_f32; 4];
    let input_r = [0.0_f32; 3];
    let mut output_l = [0.0_f32; 4];
    let mut output_r = [0.0_f32; 4];

    assert!(rack
        .process_block(
            &input_l,
            &input_r,
            &mut output_l,
            &mut output_r,
            RackParams::default(),
        )
        .is_none());
}

#[test]
fn hostile_params_stay_finite_and_bounded() {
    let mut rack = VintageRack::new(f64::NAN);
    let params = RackParams {
        mode: RackMode::EnsembleChorus,
        mix: f64::NAN,
        drive: f64::INFINITY,
        tone: -10.0,
        motion: 10.0,
        age: 10.0,
        width: 10.0,
        feedback: 10.0,
        time_ms: f64::INFINITY,
        decay: 10.0,
        output: 100.0,
    };
    let mut peak = 0.0_f32;

    for frame in 0..1024 {
        let input = (TAU * 220.0 * frame as f64 / rack.sample_rate()).sin() as f32;
        let (left, right) = rack.process_sample(input, -input, params);
        assert!(left.is_finite());
        assert!(right.is_finite());
        peak = peak.max(left.abs()).max(right.abs());
    }

    assert!(peak <= 4.0);
}

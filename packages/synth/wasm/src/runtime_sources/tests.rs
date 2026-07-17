use super::*;
use crate::dsp::Waveform;
use crate::model::WavetableBank;
use crate::runtime_params::{
    ParamAccess, PARAM_DETUNE, PARAM_FREQ, PARAM_PHASE, PARAM_POSITION, PARAM_VALUE,
};
use crate::runtime_state::NodeBuffer;

#[test]
fn constant_renderer_uses_scalar_param_slot() {
    let mut out = NodeBuffer::new(1, 4);
    let access = ParamAccess::for_test([(PARAM_VALUE, 0)]);
    render_constant(&access, &[], &[&[0.25]], &mut out, 4, 1.0).expect("render");

    assert_eq!(out.left, vec![0.25; 4]);
}

#[test]
fn oscillator_renderer_uses_scalar_param_slots_as_static_params() {
    let mut out = NodeBuffer::new(1, 4);
    let mut phase = 0.0;
    let mut triangle = 0.0;
    let freq = [1.0];
    let detune = [0.0];
    let phase_param = [0.0];
    let access = ParamAccess::for_test([(PARAM_FREQ, 0), (PARAM_DETUNE, 1), (PARAM_PHASE, 2)]);

    render_osc(
        &access,
        &[],
        &[&freq, &detune, &phase_param],
        &mut out,
        4,
        4.0,
        0.0,
        0.0,
        0.0,
        Waveform::Sine,
        &mut phase,
        &mut triangle,
    )
    .expect("oscillator should render");

    assert!((out.left[0] - 0.0).abs() < 1e-6);
    assert!((out.left[1] - 1.0).abs() < 1e-6);
    assert!((phase - 0.0).abs() < 1e-12);
}

#[test]
fn wavetable_renderer_uses_scalar_param_slots_as_static_params() {
    let bank = WavetableBank {
        size: 4,
        frame_count: 1,
        levels: vec![vec![0.0, 1.0, 0.0, -1.0]],
        level_max_harmonics: vec![2.0],
    };
    let mut out = NodeBuffer::new(1, 4);
    let mut phase = 0.0;
    let freq = [1.0];
    let detune = [0.0];
    let phase_param = [0.0];
    let position = [0.0];
    let access = ParamAccess::for_test([
        (PARAM_FREQ, 0),
        (PARAM_DETUNE, 1),
        (PARAM_PHASE, 2),
        (PARAM_POSITION, 3),
    ]);

    render_wavetable(
        &access,
        &[],
        &[&freq, &detune, &phase_param, &position],
        &mut out,
        4,
        4.0,
        Some(&bank),
        0.0,
        0.0,
        0.0,
        0.0,
        &mut phase,
    )
    .expect("wavetable should render");

    assert!((out.left[0] - 0.0).abs() < 1e-6);
    assert!((out.left[1] - 1.0).abs() < 1e-6);
    assert!((phase - 0.0).abs() < 1e-12);
}

#[test]
fn buffer_renderer_advances_and_stops_non_looped_buffers() {
    let mut out = NodeBuffer::new(1, 5);
    let mut position = 0.0;

    render_buffer(&mut out, 5, &[0.0, 1.0], 1.0, false, &mut position).expect("render");

    assert_eq!(out.left, vec![0.0, 1.0, 0.0, 0.0, 0.0]);
    assert_eq!(position, 5.0);
}

#[test]
fn input_renderer_copies_only_available_frames() {
    let mut out = NodeBuffer::new(1, 4);
    render_input(1, &[&[0.0], &[0.2, 0.4]], &mut out, 4).expect("render");

    assert_eq!(out.left, vec![0.2, 0.4, 0.0, 0.0]);
}

use super::runtime_io::PARAM_FLAG_BLOCK;
use super::*;
use crate::model::{Fields, NodeDef, ParamSlot};

#[test]
fn decode_request_accepts_camel_case_fields() {
    let request = decode_request(
        br#"{
            "sampleRate": 48000,
            "length": 2,
            "root": 0,
            "nodes": [
                { "kind": "constant", "out": 1, "fields": { "value": 0.25 } }
            ]
        }"#,
    )
    .expect("valid request");

    assert_eq!(request.length(), 2);
}

#[test]
fn render_json_request_maps_invalid_json_and_render_failures() {
    let mut left = [0.0_f32; 2];
    let mut right = [0.0_f32; 2];
    assert_eq!(
        render_json_request_into(b"{", &mut left, &mut right)
            .expect_err("invalid json")
            .status_code(),
        ERR_INVALID_JSON
    );

    let bad_graph = br#"{
        "sampleRate": 48000,
        "length": 2,
        "root": 1,
        "nodes": [
            { "kind": "constant", "out": 1, "fields": { "value": 0.25 } }
        ]
    }"#;
    assert_eq!(
        render_json_request_into(bad_graph, &mut left, &mut right)
            .expect_err("invalid graph")
            .status_code(),
        ERR_RENDER_FAILED
    );
}

#[test]
fn render_json_request_writes_caller_buffers_through_runtime() {
    let mut left = [99.0_f32; 3];
    let mut right = [88.0_f32; 3];
    let channels = render_json_request_into(
        br#"{
            "sampleRate": 48000,
            "length": 3,
            "root": 0,
            "nodes": [
                { "kind": "constant", "out": 1, "fields": { "value": 0.5 } }
            ]
        }"#,
        &mut left,
        &mut right,
    )
    .expect("rendered request");

    assert_eq!(channels, CHANNELS_MONO);
    assert_eq!(left, [0.5, 0.5, 0.5]);
    assert_eq!(right, [0.0, 0.0, 0.0]);
}

#[test]
fn output_writers_accept_zero_frames_with_null_pointers() {
    let request = br#"{
        "sampleRate": 48000,
        "length": 0,
        "root": 0,
        "nodes": [
            { "kind": "constant", "out": 1, "fields": { "value": 0.25 } }
        ]
    }"#;
    assert_eq!(
        unsafe {
            stopcock_synth_render(
                request.as_ptr(),
                request.len(),
                ptr::null_mut(),
                ptr::null_mut(),
            )
        },
        CHANNELS_MONO
    );

    let mut runtime = Runtime::new(RenderRequest {
        sample_rate: 48_000.0,
        length: 1,
        root: 0,
        gate_sec: None,
        velocity: None,
        trigger_freq: None,
        inputs: Vec::new(),
        nodes: vec![NodeDef {
            kind: "constant".to_string(),
            kind_id: None,
            out: 1,
            inputs: Vec::new(),
            mods: Vec::new(),
            param_slots: Vec::new(),
            fields: Fields {
                value: Some(0.25),
                ..Fields::default()
            },
        }],
    })
    .expect("runtime");

    assert_eq!(
        unsafe {
            stopcock_synth_runtime_process(
                &mut runtime,
                ptr::null(),
                0,
                0,
                ptr::null(),
                0,
                0,
                0,
                ptr::null_mut(),
                ptr::null_mut(),
            )
        },
        CHANNELS_MONO
    );
}

#[test]
fn render_binary_request_into_writes_caller_buffers_directly() {
    let mut left = [99.0_f32; 3];
    let mut right = [88.0_f32; 3];
    let channels = render_request_into(
        RenderRequest {
            sample_rate: 48_000.0,
            length: 3,
            root: 0,
            gate_sec: None,
            velocity: None,
            trigger_freq: None,
            inputs: Vec::new(),
            nodes: vec![NodeDef {
                kind: "constant".to_string(),
                kind_id: None,
                out: 1,
                inputs: Vec::new(),
                mods: Vec::new(),
                param_slots: Vec::new(),
                fields: Fields {
                    value: Some(0.25),
                    ..Fields::default()
                },
            }],
        },
        &mut left,
        &mut right,
    )
    .expect("rendered");

    assert_eq!(channels, CHANNELS_MONO);
    assert_eq!(left, [0.25, 0.25, 0.25]);
    assert_eq!(right, [0.0, 0.0, 0.0]);
}

#[test]
fn runtime_reset_event_restarts_state_and_updates_trigger_fields() {
    let mut runtime = Runtime::new(RenderRequest {
        sample_rate: 1_000.0,
        length: 8,
        root: 0,
        gate_sec: Some(0.001),
        velocity: Some(0.25),
        trigger_freq: Some(110.0),
        inputs: Vec::new(),
        nodes: vec![NodeDef {
            kind: "osc".to_string(),
            kind_id: None,
            out: 1,
            inputs: Vec::new(),
            mods: Vec::new(),
            param_slots: Vec::new(),
            fields: Fields {
                wave: Some("sine".to_string()),
                freq: Some(110.0),
                ..Fields::default()
            },
        }],
    })
    .expect("runtime");
    let mut first_l = [0.0_f32; 8];
    let mut first_r = [0.0_f32; 8];
    let mut second_l = [0.0_f32; 8];
    let mut second_r = [0.0_f32; 8];
    let mut retuned_l = [0.0_f32; 8];
    let mut retuned_r = [0.0_f32; 8];

    assert_eq!(
        runtime.process(8, &[], &[], &mut first_l, &mut first_r),
        Some(1)
    );
    assert_eq!(
        unsafe { stopcock_synth_runtime_reset_event(&mut runtime, 0.001, 0.25, 110.0) },
        STATUS_OK
    );
    assert_eq!(
        runtime.process(8, &[], &[], &mut second_l, &mut second_r),
        Some(1)
    );
    assert_eq!(first_l, second_l);

    assert_eq!(
        unsafe { stopcock_synth_runtime_reset_event(&mut runtime, f64::NAN, f64::NAN, 220.0) },
        STATUS_OK
    );
    assert_eq!(
        runtime.process(8, &[], &[], &mut retuned_l, &mut retuned_r),
        Some(1)
    );
    assert_ne!(first_l, retuned_l);
}

#[test]
fn runtime_process_mixed_accepts_scalar_and_block_params() {
    let mut runtime = input_gain_runtime();
    let input = [1.0_f32, 2.0, 3.0, 4.0];
    let scalar = [2.0_f32];
    let block = [0.5_f32, 1.0, 1.5, 2.0];
    let flags = [PARAM_FLAG_BLOCK];
    let mut left = [0.0_f32; 4];
    let mut right = [0.0_f32; 4];

    let channels = unsafe {
        stopcock_synth_runtime_process_mixed(
            &mut runtime,
            input.as_ptr(),
            1,
            4,
            scalar.as_ptr(),
            block.as_ptr(),
            flags.as_ptr(),
            1,
            4,
            4,
            left.as_mut_ptr(),
            right.as_mut_ptr(),
        )
    };

    assert_eq!(channels, 1);
    assert_eq!(left, [0.5, 2.0, 4.5, 8.0]);

    let scalar_flags = [0_u8];
    let scalar_channels = unsafe {
        stopcock_synth_runtime_process_mixed(
            &mut runtime,
            input.as_ptr(),
            1,
            4,
            scalar.as_ptr(),
            ptr::null(),
            scalar_flags.as_ptr(),
            1,
            4,
            4,
            left.as_mut_ptr(),
            right.as_mut_ptr(),
        )
    };

    assert_eq!(scalar_channels, 1);
    assert_eq!(left, [2.0, 4.0, 6.0, 8.0]);
}

#[test]
fn runtime_process_direct_leaves_output_in_root_buffers() {
    let mut runtime = input_gain_runtime();
    let input = [1.0_f32, 2.0, 3.0, 4.0];
    let scalar = [2.0_f32];

    let channels = unsafe {
        stopcock_synth_runtime_process_direct(
            &mut runtime,
            input.as_ptr(),
            1,
            4,
            scalar.as_ptr(),
            1,
            1,
            4,
        )
    };
    let left_ptr = unsafe { stopcock_synth_runtime_output_left_ptr(&runtime) };
    let right_ptr = unsafe { stopcock_synth_runtime_output_right_ptr(&runtime) };

    assert_eq!(channels, 1);
    assert!(!left_ptr.is_null());
    assert!(!right_ptr.is_null());
    assert_eq!(
        unsafe { slice::from_raw_parts(left_ptr, 4) },
        [2.0, 4.0, 6.0, 8.0]
    );
}

#[test]
fn runtime_process_mixed_direct_accepts_block_params() {
    let mut runtime = input_gain_runtime();
    let input = [1.0_f32, 2.0, 3.0, 4.0];
    let scalar = [2.0_f32];
    let block = [0.5_f32, 1.0, 1.5, 2.0];
    let flags = [PARAM_FLAG_BLOCK];

    let channels = unsafe {
        stopcock_synth_runtime_process_mixed_direct(
            &mut runtime,
            input.as_ptr(),
            1,
            4,
            scalar.as_ptr(),
            block.as_ptr(),
            flags.as_ptr(),
            1,
            4,
            4,
        )
    };
    let left_ptr = unsafe { stopcock_synth_runtime_output_left_ptr(&runtime) };

    assert_eq!(channels, 1);
    assert_eq!(
        unsafe { slice::from_raw_parts(left_ptr, 4) },
        [0.5, 2.0, 4.5, 8.0]
    );
    assert_eq!(
        unsafe { stopcock_synth_runtime_output_left_ptr(ptr::null()) },
        ptr::null()
    );
}

fn input_gain_runtime() -> Runtime {
    Runtime::new(RenderRequest {
        sample_rate: 48_000.0,
        length: 4,
        root: 1,
        gate_sec: None,
        velocity: None,
        trigger_freq: None,
        inputs: Vec::new(),
        nodes: vec![
            NodeDef {
                kind: "input".to_string(),
                kind_id: None,
                out: 1,
                inputs: Vec::new(),
                mods: Vec::new(),
                param_slots: Vec::new(),
                fields: Fields {
                    channel: Some(0),
                    ..Fields::default()
                },
            },
            NodeDef {
                kind: "gain".to_string(),
                kind_id: None,
                out: 1,
                inputs: vec![0],
                mods: Vec::new(),
                param_slots: vec![ParamSlot {
                    param: "amount".to_string(),
                    param_id: None,
                    slot: 0,
                }],
                fields: Fields {
                    amount: Some(1.0),
                    ..Fields::default()
                },
            },
        ],
    })
    .expect("runtime")
}

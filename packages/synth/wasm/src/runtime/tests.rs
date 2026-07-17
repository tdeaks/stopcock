use super::*;
use crate::model::{Fields, ModDef, NodeDef, SamplerZoneDef};

#[derive(Clone, Debug, PartialEq)]
struct RuntimeRender {
    channels: u8,
    left: Vec<f32>,
    right: Vec<f32>,
}

#[test]
fn runtime_keeps_oscillator_phase_across_blocks() {
    let request = request(
        vec![NodeDef {
            fields: Fields {
                wave: Some("saw".to_string()),
                freq: Some(125.0),
                ..Fields::default()
            },
            ..node("osc", 1)
        }],
        0,
        8,
    );
    let mut runtime = Runtime::new(request).expect("runtime");
    let mut first_l = [0.0; 4];
    let mut first_r = [0.0; 4];
    let mut second_l = [0.0; 4];
    let mut second_r = [0.0; 4];

    assert_eq!(
        runtime.process(4, &[], &[], &mut first_l, &mut first_r),
        Some(1)
    );
    assert_eq!(
        runtime.process(4, &[], &[], &mut second_l, &mut second_r),
        Some(1)
    );

    assert_ne!(first_l, second_l);
}

#[test]
fn runtime_delay_feedback_crosses_block_boundaries() {
    let nodes = vec![
        NodeDef {
            fields: Fields {
                samples: Some(vec![1.0, 0.0, 0.0, 0.0]),
                rate: Some(1.0),
                ..Fields::default()
            },
            ..node("buffer", 1)
        },
        NodeDef {
            inputs: vec![0],
            fields: Fields {
                delay_ms: Some(1.0),
                feedback: Some(0.0),
                mix: Some(1.0),
                ..Fields::default()
            },
            ..node("delay", 1)
        },
    ];
    let mut request = request(nodes, 1, 2);
    request.sample_rate = 1_000.0;
    let mut runtime = Runtime::new(request).expect("runtime");
    let mut left = [0.0; 2];
    let mut right = [0.0; 2];

    assert_eq!(runtime.process(2, &[], &[], &mut left, &mut right), Some(1));
    assert_eq!(left, [0.0, 1.0]);
    assert_eq!(runtime.process(2, &[], &[], &mut left, &mut right), Some(1));
    assert_eq!(left, [0.0, 0.0]);
}

#[test]
fn runtime_matches_offline_render_for_stateless_graph_in_blocks() {
    let nodes = vec![
        NodeDef {
            fields: Fields {
                value: Some(0.5),
                ..Fields::default()
            },
            ..node("constant", 1)
        },
        NodeDef {
            fields: Fields {
                value: Some(0.25),
                ..Fields::default()
            },
            ..node("constant", 1)
        },
        NodeDef {
            inputs: vec![0],
            mods: vec![ModDef {
                param: "amount".to_string(),
                param_id: None,
                source: 1,
                depth: 2.0,
                rate: "audio".to_string(),
                control_rate: None,
            }],
            fields: Fields {
                amount: Some(1.0),
                ..Fields::default()
            },
            ..node("gain", 1)
        },
    ];
    let request = request(nodes, 2, 6);
    assert_eq!(
        render_request_in_runtime_blocks(request.clone(), 2),
        render_request_runtime(request)
    );
}

#[test]
fn rejects_invalid_root_and_sample_rate() {
    assert!(Runtime::new(request(vec![constant(0.0)], 1, 4)).is_none());

    let mut invalid_rate = request(vec![constant(0.0)], 0, 4);
    invalid_rate.sample_rate = 0.0;
    assert!(Runtime::new(invalid_rate.clone()).is_none());

    invalid_rate.sample_rate = f64::INFINITY;
    assert!(Runtime::new(invalid_rate).is_none());
}

#[test]
fn renders_modulated_gain_from_prior_nodes() {
    let nodes = vec![
        constant(0.5),
        constant(0.2),
        gain(
            0,
            1.0,
            vec![ModDef {
                param: "amount".to_string(),
                param_id: None,
                source: 1,
                depth: 2.0,
                rate: "audio".to_string(),
                control_rate: None,
            }],
        ),
    ];

    let rendered = render_request_runtime(request(nodes, 2, 4)).expect("rendered graph");

    assert_eq!(rendered.channels, 1);
    assert_eq!(rendered.left, vec![0.7, 0.7, 0.7, 0.7]);
    assert_eq!(rendered.right, vec![0.0, 0.0, 0.0, 0.0]);
}

#[test]
fn control_rate_modulation_holds_value_until_next_block() {
    let source = NodeDef {
        fields: Fields {
            samples: Some((0..130).map(|sample| sample as f32).collect()),
            rate: Some(1.0),
            ..Fields::default()
        },
        ..node("buffer", 1)
    };
    let nodes = vec![
        source,
        constant(1.0),
        gain(
            1,
            0.0,
            vec![ModDef {
                param: "amount".to_string(),
                param_id: None,
                source: 0,
                depth: 1.0,
                rate: "control".to_string(),
                control_rate: None,
            }],
        ),
    ];

    let rendered = render_request_runtime(request(nodes, 2, 130)).expect("rendered graph");

    assert_eq!(rendered.left[0], 0.0);
    assert_eq!(rendered.left[1], 0.0);
    assert_eq!(rendered.left[127], 0.0);
    assert_eq!(rendered.left[128], 128.0);
    assert_eq!(rendered.left[129], 128.0);
}

#[test]
fn stereo_node_preserves_left_and_right_channels() {
    let mut stereo = node("stereo", 2);
    stereo.inputs = vec![0, 1];

    let rendered =
        render_request_runtime(request(vec![constant(1.0), constant(-1.0), stereo], 2, 3))
            .expect("rendered graph");

    assert_eq!(rendered.channels, 2);
    assert_eq!(rendered.left, vec![1.0, 1.0, 1.0]);
    assert_eq!(rendered.right, vec![-1.0, -1.0, -1.0]);
}

#[test]
fn request_trigger_freq_overrides_source_freq_without_node_clone() {
    let triggered = RenderRequest {
        trigger_freq: Some(220.0),
        ..request(
            vec![NodeDef {
                fields: Fields {
                    wave: Some("sine".to_string()),
                    freq: Some(110.0),
                    ..Fields::default()
                },
                ..node("osc", 1)
            }],
            0,
            16,
        )
    };
    let retuned = request(
        vec![NodeDef {
            fields: Fields {
                wave: Some("sine".to_string()),
                freq: Some(220.0),
                ..Fields::default()
            },
            ..node("osc", 1)
        }],
        0,
        16,
    );

    assert_eq!(
        render_request_runtime(triggered),
        render_request_runtime(retuned)
    );
}

#[test]
fn runtime_reset_event_matches_fresh_runtime_for_stateful_graph() {
    let mut request = request(
        vec![
            NodeDef {
                fields: Fields {
                    color: Some("pink".to_string()),
                    seed: Some(42),
                    ..Fields::default()
                },
                ..node("noise", 1)
            },
            NodeDef {
                inputs: vec![0],
                fields: Fields {
                    time_ms: Some(2.0),
                    feedback: Some(0.18),
                    mix: Some(0.35),
                    reverb_mix: Some(0.04),
                    wow: Some(0.05),
                    flutter: Some(0.02),
                    tape_age: Some(0.2),
                    drive: Some(0.08),
                    head1: Some(true),
                    head2: Some(false),
                    head3: Some(false),
                    head_count: Some(1.0),
                    ..Fields::default()
                },
                ..node("spaceEcho", 2)
            },
        ],
        1,
        32,
    );
    request.sample_rate = 1_000.0;
    let mut runtime = Runtime::new(request.clone()).expect("runtime");
    let mut first_l = vec![0.0; request.length];
    let mut first_r = vec![0.0; request.length];
    let mut reset_l = vec![0.0; request.length];
    let mut reset_r = vec![0.0; request.length];
    let mut fresh = Runtime::new(request.clone()).expect("fresh runtime");
    let mut fresh_l = vec![0.0; request.length];
    let mut fresh_r = vec![0.0; request.length];

    assert_eq!(
        runtime.process(request.length, &[], &[], &mut first_l, &mut first_r),
        Some(2)
    );
    runtime.reset_event(None, None, None);
    assert_eq!(
        runtime.process(request.length, &[], &[], &mut reset_l, &mut reset_r),
        Some(2)
    );
    assert_eq!(
        fresh.process(request.length, &[], &[], &mut fresh_l, &mut fresh_r),
        Some(2)
    );

    assert_eq!(reset_l, fresh_l);
    assert_eq!(reset_r, fresh_r);
}

#[test]
fn runtime_matches_offline_poly_synth_in_blocks() {
    let request = request(
        vec![NodeDef {
            fields: Fields {
                freq: Some(110.0),
                detune: Some(3.0),
                pulse_width: Some(0.42),
                sub: Some(0.4),
                noise: Some(0.02),
                cutoff: Some(1_200.0),
                resonance: Some(0.34),
                env_mod: Some(0.42),
                attack: Some(0.001),
                decay: Some(0.08),
                sustain: Some(0.7),
                release: Some(0.12),
                drive: Some(0.18),
                chorus: Some(0.5),
                modulation: Some(0.4),
                width: Some(1.0),
                level: Some(0.4),
                ..Fields::default()
            },
            ..node("polySynth", 2)
        }],
        0,
        256,
    );

    assert_eq!(
        render_request_in_runtime_blocks(request.clone(), 64),
        render_request_runtime(request)
    );
}

#[test]
fn runtime_matches_offline_lofi_sampler_in_blocks() {
    let request = request(
        vec![NodeDef {
            fields: Fields {
                freq: Some(440.0),
                value: Some(0.9),
                attack: Some(0.0),
                release: Some(0.01),
                amount: Some(0.7),
                bits: Some(7.0),
                downsample: Some(2.0),
                jitter: Some(0.0),
                noise: Some(0.0),
                tone: Some(0.75),
                drive: Some(0.2),
                mix: Some(1.0),
                zones: Some(vec![SamplerZoneDef {
                    samples: vec![0.0, 0.35, 0.9, 0.35],
                    sample_rate: 1_000.0,
                    root_midi: 69.0,
                    key_low: 0.0,
                    key_high: 127.0,
                    velocity_low: 0.0,
                    velocity_high: 1.0,
                    looped: true,
                    loop_start: 1,
                    loop_end: 3,
                    gain: 1.0,
                    pan: 0.2,
                }]),
                ..Fields::default()
            },
            ..node("lofiSampler", 2)
        }],
        0,
        256,
    );

    assert_eq!(
        render_request_in_runtime_blocks(request.clone(), 64),
        render_request_runtime(request)
    );
}

fn render_request_runtime(mut request: RenderRequest) -> Option<RuntimeRender> {
    let length = request.length;
    let inputs = std::mem::take(&mut request.inputs);
    let input_refs: Vec<&[f32]> = inputs.iter().map(Vec::as_slice).collect();
    let mut runtime = Runtime::new(request)?;
    let mut left = vec![0.0; length];
    let mut right = vec![0.0; length];
    let channels = runtime.process(length, &input_refs, &[], &mut left, &mut right)? as u8;

    Some(RuntimeRender {
        channels,
        left,
        right,
    })
}

fn render_request_in_runtime_blocks(
    request: RenderRequest,
    block_size: usize,
) -> Option<RuntimeRender> {
    let length = request.length;
    let root = request.root;
    let inputs = request.inputs.clone();
    let mut runtime = Runtime::new(RenderRequest {
        length: block_size.max(1),
        ..request
    })?;
    let mut left = vec![0.0; length];
    let mut right = vec![0.0; length];
    let mut block_l = vec![0.0; block_size.max(1)];
    let mut block_r = vec![0.0; block_size.max(1)];
    let channels = runtime.nodes[root].out();
    let mut offset = 0;
    while offset < length {
        let frames = block_size.min(length - offset).max(1);
        let input_refs: Vec<&[f32]> = inputs
            .iter()
            .map(|input| {
                let end = (offset + frames).min(input.len());
                if offset < end {
                    &input[offset..end]
                } else {
                    &[]
                }
            })
            .collect();
        runtime.process(frames, &input_refs, &[], &mut block_l, &mut block_r)?;
        left[offset..offset + frames].copy_from_slice(&block_l[..frames]);
        right[offset..offset + frames].copy_from_slice(&block_r[..frames]);
        offset += frames;
    }
    Some(RuntimeRender {
        channels,
        left,
        right,
    })
}

fn request(nodes: Vec<NodeDef>, root: usize, length: usize) -> RenderRequest {
    RenderRequest {
        sample_rate: 1_000.0,
        length,
        root,
        gate_sec: None,
        velocity: None,
        trigger_freq: None,
        nodes,
        inputs: Vec::new(),
    }
}

fn constant(value: f64) -> NodeDef {
    NodeDef {
        fields: Fields {
            value: Some(value),
            ..Fields::default()
        },
        ..node("constant", 1)
    }
}

fn gain(input: usize, amount: f64, mods: Vec<ModDef>) -> NodeDef {
    NodeDef {
        inputs: vec![input],
        mods,
        fields: Fields {
            amount: Some(amount),
            ..Fields::default()
        },
        ..node("gain", 1)
    }
}

fn node(kind: &str, out: u8) -> NodeDef {
    NodeDef {
        kind: kind.to_string(),
        kind_id: None,
        out,
        inputs: Vec::new(),
        mods: Vec::new(),
        param_slots: Vec::new(),
        fields: Fields::default(),
    }
}

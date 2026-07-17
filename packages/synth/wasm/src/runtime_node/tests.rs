use crate::dsp::{AcidBassWaveform, DrumVoiceKind, FilterKind, StateVariableFilterMode, Waveform};
use crate::model::{Fields, NodeDef, NodeKind};
use crate::runtime_node::RuntimeNode;

fn node(kind: &str, inputs: Vec<usize>, fields: Fields) -> NodeDef {
    NodeDef {
        kind: kind.to_string(),
        kind_id: None,
        out: 1,
        inputs,
        mods: Vec::new(),
        param_slots: Vec::new(),
        fields,
    }
}

#[test]
fn node_compilation_rejects_missing_required_inputs() {
    assert!(
        RuntimeNode::from_node(node("gain", Vec::new(), Fields::default()), 48_000.0).is_none()
    );
    assert!(RuntimeNode::from_node(node("stereo", vec![0], Fields::default()), 48_000.0).is_none());
}

#[test]
fn node_compilation_prefers_binary_decoded_node_kind() {
    let compiled = RuntimeNode::from_node(
        NodeDef {
            kind: "gain".to_string(),
            kind_id: Some(NodeKind::Constant),
            out: 1,
            inputs: Vec::new(),
            mods: Vec::new(),
            param_slots: Vec::new(),
            fields: Fields {
                value: Some(0.5),
                ..Fields::default()
            },
        },
        48_000.0,
    )
    .expect("constant compiles from typed kind");

    match compiled {
        RuntimeNode::Constant { value, .. } => assert_eq!(value, 0.5),
        _ => panic!("expected constant node"),
    }
}

#[test]
fn stereo_nodes_report_two_output_channels() {
    let pan = RuntimeNode::from_node(node("pan", vec![0], Fields::default()), 48_000.0)
        .expect("pan compiles");
    let echo = RuntimeNode::from_node(node("spaceEcho", vec![0], Fields::default()), 48_000.0)
        .expect("space echo compiles");
    let tape_delay =
        RuntimeNode::from_node(node("tapeDelay", vec![0], Fields::default()), 48_000.0)
            .expect("tape delay compiles");
    let plate_reverb =
        RuntimeNode::from_node(node("plateReverb", vec![0], Fields::default()), 48_000.0)
            .expect("plate reverb compiles");
    let spring_reverb =
        RuntimeNode::from_node(node("springReverb", vec![0], Fields::default()), 48_000.0)
            .expect("spring reverb compiles");
    let nonlinear_reverb = RuntimeNode::from_node(
        node("nonlinearReverb", vec![0], Fields::default()),
        48_000.0,
    )
    .expect("nonlinear reverb compiles");
    let sampler = RuntimeNode::from_node(
        node("samplerInstrument", Vec::new(), Fields::default()),
        48_000.0,
    )
    .expect("sampler compiles");
    let tilt_eq = RuntimeNode::from_node(node("tiltEq", vec![0], Fields::default()), 48_000.0)
        .expect("tilt eq compiles");
    let stereo_spread =
        RuntimeNode::from_node(node("stereoSpread", vec![0], Fields::default()), 48_000.0)
            .expect("stereo spread compiles");
    let rotary_speaker =
        RuntimeNode::from_node(node("rotarySpeaker", vec![0], Fields::default()), 48_000.0)
            .expect("rotary speaker compiles");
    let state_variable_filter = RuntimeNode::from_node(
        node("stateVariableFilter", vec![0], Fields::default()),
        48_000.0,
    )
    .expect("state variable filter compiles");
    let wavefolder =
        RuntimeNode::from_node(node("wavefolder", vec![0], Fields::default()), 48_000.0)
            .expect("wavefolder compiles");
    assert_eq!(pan.out(), 2);
    assert_eq!(echo.out(), 2);
    assert_eq!(tape_delay.out(), 2);
    assert_eq!(plate_reverb.out(), 2);
    assert_eq!(spring_reverb.out(), 2);
    assert_eq!(nonlinear_reverb.out(), 2);
    assert_eq!(sampler.out(), 2);
    assert_eq!(tilt_eq.out(), 1);
    assert_eq!(stereo_spread.out(), 2);
    assert_eq!(rotary_speaker.out(), 2);
    assert_eq!(state_variable_filter.out(), 1);
    assert_eq!(wavefolder.out(), 1);
}

#[test]
fn buffer_rate_non_finite_values_are_sanitized() {
    let compiled = RuntimeNode::from_node(
        node(
            "buffer",
            Vec::new(),
            Fields {
                rate: Some(f64::NAN),
                ..Fields::default()
            },
        ),
        48_000.0,
    )
    .expect("buffer compiles");

    match compiled {
        RuntimeNode::Buffer { rate, .. } => assert_eq!(rate, 0.0),
        _ => panic!("expected buffer node"),
    }
}

#[test]
fn node_compilation_prefers_binary_decoded_choice_kinds() {
    let osc = RuntimeNode::from_node(
        node(
            "osc",
            Vec::new(),
            Fields {
                wave: Some("sine".to_string()),
                wave_kind: Some(Waveform::Square),
                ..Fields::default()
            },
        ),
        48_000.0,
    )
    .expect("osc compiles");
    match osc {
        RuntimeNode::Osc { wave, .. } => assert_eq!(wave, Waveform::Square),
        _ => panic!("expected oscillator node"),
    }

    let bass = RuntimeNode::from_node(
        node(
            "acidBass",
            Vec::new(),
            Fields {
                wave: Some("saw".to_string()),
                acid_wave_kind: Some(AcidBassWaveform::Square),
                ..Fields::default()
            },
        ),
        48_000.0,
    )
    .expect("acid bass compiles");
    match bass {
        RuntimeNode::AcidBass { wave, .. } => assert_eq!(wave, AcidBassWaveform::Square),
        _ => panic!("expected acid bass node"),
    }

    let drum = RuntimeNode::from_node(
        node(
            "drumVoice",
            Vec::new(),
            Fields {
                drum_kind: Some("kick".to_string()),
                drum_voice_kind: Some(DrumVoiceKind::Hat),
                ..Fields::default()
            },
        ),
        48_000.0,
    )
    .expect("drum voice compiles");
    match drum {
        RuntimeNode::DrumVoice { kind, .. } => assert_eq!(kind, DrumVoiceKind::Hat),
        _ => panic!("expected drum voice node"),
    }
}

#[test]
fn filter_compilation_prefers_binary_decoded_choice_kinds() {
    let biquad = RuntimeNode::from_node(
        node(
            "biquad",
            vec![0],
            Fields {
                filter: Some("lowpass".to_string()),
                filter_kind: Some(FilterKind::Allpass),
                ..Fields::default()
            },
        ),
        48_000.0,
    )
    .expect("biquad compiles");
    match biquad {
        RuntimeNode::Biquad { filter, .. } => assert_eq!(filter, FilterKind::Allpass),
        _ => panic!("expected biquad node"),
    }

    let state_variable = RuntimeNode::from_node(
        node(
            "stateVariableFilter",
            vec![0],
            Fields {
                filter: Some("lowpass".to_string()),
                state_variable_filter_mode: Some(StateVariableFilterMode::Bandpass),
                ..Fields::default()
            },
        ),
        48_000.0,
    )
    .expect("state variable filter compiles");
    match state_variable {
        RuntimeNode::StateVariableFilter { mode, .. } => {
            assert_eq!(mode, StateVariableFilterMode::Bandpass)
        }
        _ => panic!("expected state variable filter node"),
    }
}

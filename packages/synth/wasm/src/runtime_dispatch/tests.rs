use crate::model::{Fields, NodeDef, ParamSlot};
use crate::runtime_dispatch::render_node_block;
use crate::runtime_node::RuntimeNode;
use crate::runtime_params::ParamAccess;
use crate::runtime_state::NodeBuffer;

#[test]
fn dispatch_renders_gain_with_param_slot() {
    let node = NodeDef {
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
    };
    let access = ParamAccess::for_node(&node).expect("param access");
    let mut runtime_node = RuntimeNode::from_node(node, 48_000.0).expect("runtime node");
    let mut input = NodeBuffer::new(1, 3);
    input.left.copy_from_slice(&[1.0, 2.0, 3.0]);
    let prior = [input];
    let block = [0.5_f32, 1.0, 1.5];
    let params: [&[f32]; 1] = [&block];
    let mut out = NodeBuffer::new(1, 3);

    render_node_block(
        &mut runtime_node,
        &access,
        &prior,
        &[],
        &params,
        &mut out,
        3,
        48_000.0,
        0,
        None,
        1.0,
        None,
    )
    .expect("rendered block");

    assert_eq!(out.channels, 1);
    assert_eq!(out.left, [0.5, 2.0, 4.5]);
    assert_eq!(out.right, [0.0, 0.0, 0.0]);
}

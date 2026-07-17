use crate::runtime_dispatch::RenderContext;
use crate::runtime_node::RuntimeNode;
use crate::runtime_routing::{render_gain, render_mix, render_pan, render_stereo};
use crate::runtime_sources::render_input;
use crate::runtime_state::NodeBuffer;

#[inline(always)]
pub(super) fn render_routing_node(
    node: &mut RuntimeNode,
    ctx: &RenderContext<'_>,
    out: &mut NodeBuffer,
) -> Option<()> {
    match node {
        RuntimeNode::Input { channel, .. } => render_input(*channel, ctx.inputs, out, ctx.frames),
        RuntimeNode::Gain { input, amount, .. } => render_gain(
            *input, *amount, ctx.access, ctx.prior, ctx.params, out, ctx.frames,
        ),
        RuntimeNode::Pan { input, position } => render_pan(
            *input, *position, ctx.access, ctx.prior, ctx.params, out, ctx.frames,
        ),
        RuntimeNode::Mix {
            out: channels,
            inputs,
        } => render_mix(*channels, inputs, ctx.prior, out, ctx.frames),
        RuntimeNode::Stereo { left, right } => {
            render_stereo(*left, *right, ctx.prior, out, ctx.frames)
        }
        _ => unreachable!("non-routing node dispatched to routing renderer"),
    }
}

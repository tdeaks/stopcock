use crate::runtime_dispatch::RenderContext;
use crate::runtime_envelopes::{render_adsr, render_ar, render_exponential};
use crate::runtime_node::RuntimeNode;
use crate::runtime_state::NodeBuffer;

#[inline(always)]
pub(super) fn render_envelope_node(
    node: &mut RuntimeNode,
    ctx: &RenderContext<'_>,
    out: &mut NodeBuffer,
) -> Option<()> {
    match node {
        RuntimeNode::Adsr {
            input,
            attack,
            decay,
            sustain,
            release,
            ..
        } => render_adsr(
            *input,
            *attack,
            *decay,
            *sustain,
            *release,
            ctx.access,
            ctx.prior,
            ctx.params,
            out,
            ctx.frames,
            ctx.sample_rate,
            ctx.frame_start,
            ctx.gate_sec,
            ctx.velocity,
        ),
        RuntimeNode::Ar {
            input,
            attack,
            release,
            ..
        } => render_ar(
            *input,
            *attack,
            *release,
            ctx.access,
            ctx.prior,
            ctx.params,
            out,
            ctx.frames,
            ctx.sample_rate,
            ctx.frame_start,
            ctx.gate_sec,
            ctx.velocity,
        ),
        RuntimeNode::Exponential { input, tau, .. } => render_exponential(
            *input,
            *tau,
            ctx.access,
            ctx.prior,
            ctx.params,
            out,
            ctx.frames,
            ctx.sample_rate,
            ctx.frame_start,
        ),
        _ => unreachable!("non-envelope node dispatched to envelope renderer"),
    }
}

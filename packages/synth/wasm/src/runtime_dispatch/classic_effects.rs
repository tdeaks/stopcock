use crate::runtime_classic_effects::{
    render_biquad, render_chorus, render_comb, render_delay, render_distortion, render_reverb,
    render_state_variable_filter,
};
use crate::runtime_dispatch::RenderContext;
use crate::runtime_node::RuntimeNode;
use crate::runtime_state::NodeBuffer;

#[inline(always)]
pub(super) fn render_classic_effect_node(
    node: &mut RuntimeNode,
    ctx: &RenderContext<'_>,
    out: &mut NodeBuffer,
) -> Option<()> {
    match node {
        RuntimeNode::Biquad {
            input,
            filter,
            freq,
            q,
            gain_db,
            left,
            right,
            ..
        } => render_biquad(
            *input,
            *filter,
            *freq,
            *q,
            *gain_db,
            left,
            right,
            ctx.access,
            ctx.prior,
            ctx.params,
            out,
            ctx.frames,
            ctx.sample_rate,
        ),
        RuntimeNode::StateVariableFilter {
            input,
            mode,
            freq,
            resonance,
            drive,
            mix,
            left,
            right,
            ..
        } => render_state_variable_filter(
            *input,
            *mode,
            *freq,
            *resonance,
            *drive,
            *mix,
            left,
            right,
            ctx.access,
            ctx.prior,
            ctx.params,
            out,
            ctx.frames,
            ctx.sample_rate,
        ),
        RuntimeNode::Comb {
            input,
            delay_ms,
            feedback,
            damp,
            left,
            right,
            ..
        } => render_comb(
            *input,
            *delay_ms,
            *feedback,
            *damp,
            left,
            right,
            ctx.access,
            ctx.prior,
            ctx.params,
            out,
            ctx.frames,
            ctx.sample_rate,
        ),
        RuntimeNode::Delay {
            input,
            delay_ms,
            feedback,
            mix,
            left,
            right,
            ..
        } => render_delay(
            *input,
            *delay_ms,
            *feedback,
            *mix,
            left,
            right,
            ctx.access,
            ctx.prior,
            ctx.params,
            out,
            ctx.frames,
            ctx.sample_rate,
        ),
        RuntimeNode::Reverb {
            input,
            ir,
            mix,
            left,
            right,
            ..
        } => render_reverb(
            *input, ir, *mix, left, right, ctx.access, ctx.prior, ctx.params, out, ctx.frames,
        ),
        RuntimeNode::Distortion {
            input,
            shape,
            amount,
            ..
        } => render_distortion(
            *input, *shape, *amount, ctx.access, ctx.prior, ctx.params, out, ctx.frames,
        ),
        RuntimeNode::Chorus {
            input,
            rate,
            depth,
            mix,
            left,
            right,
            ..
        } => render_chorus(
            *input,
            *rate,
            *depth,
            *mix,
            left,
            right,
            ctx.access,
            ctx.prior,
            ctx.params,
            out,
            ctx.frames,
            ctx.sample_rate,
            ctx.frame_start,
        ),
        _ => unreachable!("non-classic-effect node dispatched to classic-effect renderer"),
    }
}

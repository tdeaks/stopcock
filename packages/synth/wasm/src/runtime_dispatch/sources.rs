use crate::runtime_dispatch::RenderContext;
use crate::runtime_node::RuntimeNode;
use crate::runtime_sources::{
    render_buffer, render_constant, render_fm, render_noise, render_osc, render_wavetable,
    NoiseRenderState,
};
use crate::runtime_state::NodeBuffer;

#[inline(always)]
pub(super) fn render_source_node(
    node: &mut RuntimeNode,
    ctx: &RenderContext<'_>,
    out: &mut NodeBuffer,
) -> Option<()> {
    match node {
        RuntimeNode::Osc {
            freq,
            detune,
            base_phase,
            wave,
            phase,
            triangle,
            ..
        } => render_osc(
            ctx.access,
            ctx.prior,
            ctx.params,
            out,
            ctx.frames,
            ctx.sample_rate,
            ctx.trigger_freq.unwrap_or(*freq),
            *detune,
            *base_phase,
            *wave,
            phase,
            triangle,
        ),
        RuntimeNode::Wavetable {
            bank,
            freq,
            detune,
            base_phase,
            position,
            phase,
            ..
        } => render_wavetable(
            ctx.access,
            ctx.prior,
            ctx.params,
            out,
            ctx.frames,
            ctx.sample_rate,
            bank.as_ref(),
            ctx.trigger_freq.unwrap_or(*freq),
            *detune,
            *base_phase,
            *position,
            phase,
        ),
        RuntimeNode::Fm {
            freq,
            detune,
            index,
            operators,
            matrix,
            phase,
            previous,
            current,
            triangle,
            ..
        } => render_fm(
            ctx.access,
            ctx.prior,
            ctx.params,
            out,
            ctx.frames,
            ctx.sample_rate,
            ctx.trigger_freq.unwrap_or(*freq),
            *detune,
            *index,
            operators.as_ref(),
            matrix.as_ref(),
            phase,
            previous,
            current,
            triangle,
        ),
        RuntimeNode::Noise {
            color,
            rng,
            pink0,
            pink1,
            pink2,
            brown,
            ..
        } => render_noise(
            out,
            ctx.frames,
            *color,
            NoiseRenderState {
                rng,
                pink0,
                pink1,
                pink2,
                brown,
            },
        ),
        RuntimeNode::Constant { value, .. } => {
            render_constant(ctx.access, ctx.prior, ctx.params, out, ctx.frames, *value)
        }
        RuntimeNode::Buffer {
            samples,
            rate,
            looped,
            position,
            ..
        } => render_buffer(out, ctx.frames, samples, *rate, *looped, position),
        _ => unreachable!("non-source node dispatched to source renderer"),
    }
}

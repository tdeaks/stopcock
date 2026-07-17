mod classic_effects;
mod core_effects;
mod envelopes;
mod instruments;
mod routing;
mod sources;
#[cfg(test)]
mod tests;

use crate::runtime_node::RuntimeNode;
use crate::runtime_params::ParamAccess;
use crate::runtime_state::NodeBuffer;

pub(crate) struct RenderContext<'a> {
    pub(crate) access: &'a ParamAccess,
    pub(crate) prior: &'a [NodeBuffer],
    pub(crate) inputs: &'a [&'a [f32]],
    pub(crate) params: &'a [&'a [f32]],
    pub(crate) frames: usize,
    pub(crate) sample_rate: f64,
    pub(crate) frame_start: usize,
    pub(crate) gate_sec: Option<f64>,
    pub(crate) velocity: f64,
    pub(crate) trigger_freq: Option<f64>,
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_node_block(
    node: &mut RuntimeNode,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    inputs: &[&[f32]],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    frame_start: usize,
    gate_sec: Option<f64>,
    velocity: f64,
    trigger_freq: Option<f64>,
) -> Option<()> {
    let ctx = RenderContext {
        access,
        prior,
        inputs,
        params,
        frames,
        sample_rate,
        frame_start,
        gate_sec,
        velocity,
        trigger_freq,
    };

    match node {
        RuntimeNode::Osc { .. }
        | RuntimeNode::Wavetable { .. }
        | RuntimeNode::Fm { .. }
        | RuntimeNode::Noise { .. }
        | RuntimeNode::Constant { .. }
        | RuntimeNode::Buffer { .. } => sources::render_source_node(node, &ctx, out),
        RuntimeNode::SamplerInstrument { .. }
        | RuntimeNode::LofiSampler { .. }
        | RuntimeNode::AcidBass { .. }
        | RuntimeNode::DrumVoice { .. }
        | RuntimeNode::StringMachine { .. }
        | RuntimeNode::PolySynth { .. } => instruments::render_instrument_node(node, &ctx, out),
        RuntimeNode::Input { .. }
        | RuntimeNode::Gain { .. }
        | RuntimeNode::Pan { .. }
        | RuntimeNode::Mix { .. }
        | RuntimeNode::Stereo { .. } => routing::render_routing_node(node, &ctx, out),
        RuntimeNode::Biquad { .. }
        | RuntimeNode::StateVariableFilter { .. }
        | RuntimeNode::Comb { .. }
        | RuntimeNode::Delay { .. }
        | RuntimeNode::Reverb { .. }
        | RuntimeNode::Distortion { .. }
        | RuntimeNode::Chorus { .. } => {
            classic_effects::render_classic_effect_node(node, &ctx, out)
        }
        RuntimeNode::Adsr { .. } | RuntimeNode::Ar { .. } | RuntimeNode::Exponential { .. } => {
            envelopes::render_envelope_node(node, &ctx, out)
        }
        RuntimeNode::SpaceEcho { .. }
        | RuntimeNode::TapeDelay { .. }
        | RuntimeNode::PlateReverb { .. }
        | RuntimeNode::SpringReverb { .. }
        | RuntimeNode::NonlinearReverb { .. }
        | RuntimeNode::Compressor { .. }
        | RuntimeNode::Bitcrush { .. }
        | RuntimeNode::MicroPitch { .. }
        | RuntimeNode::MultiTapDelay { .. }
        | RuntimeNode::Saturator { .. }
        | RuntimeNode::Wavefolder { .. }
        | RuntimeNode::Degrade { .. }
        | RuntimeNode::TiltEq { .. }
        | RuntimeNode::StereoSpread { .. }
        | RuntimeNode::FrequencyShifter { .. }
        | RuntimeNode::RotarySpeaker { .. }
        | RuntimeNode::EnsembleChorus { .. }
        | RuntimeNode::Phaser { .. } => {
            core_effects::render_core_effect_node(node, &ctx, out)
        }
    }
}

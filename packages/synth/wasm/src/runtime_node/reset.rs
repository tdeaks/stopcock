use crate::dsp::{wrap_phase, BiquadState, BitcrusherState, CompressorState, Mulberry32, TAU};
use crate::runtime_node::RuntimeNode;

impl RuntimeNode {
    pub(crate) fn reset(&mut self) {
        match self {
            Self::Osc {
                base_phase,
                phase,
                triangle,
                ..
            } => {
                *phase = wrap_phase(*base_phase / TAU);
                *triangle = 0.0;
            }
            Self::Wavetable {
                base_phase, phase, ..
            } => {
                *phase = wrap_phase(*base_phase / TAU);
            }
            Self::Fm {
                operators,
                phase,
                previous,
                current,
                triangle,
                ..
            } => {
                for op in 0..6 {
                    phase[op] = wrap_phase(operators[op].phase / TAU);
                }
                *previous = [0.0; 6];
                *current = [0.0; 6];
                *triangle = [0.0; 6];
            }
            Self::Noise {
                rng,
                seed,
                pink0,
                pink1,
                pink2,
                brown,
                ..
            } => {
                *rng = Mulberry32::new(*seed);
                *pink0 = 0.0;
                *pink1 = 0.0;
                *pink2 = 0.0;
                *brown = 0.0;
            }
            Self::Buffer { position, .. } => *position = 0.0,
            Self::SamplerInstrument { state, .. } => state.clear(),
            Self::LofiSampler { state, .. } => state.clear(),
            Self::AcidBass { state, .. } => state.clear(),
            Self::DrumVoice { state, .. } => state.clear(),
            Self::StringMachine { state, .. } => state.clear(),
            Self::PolySynth { state, .. } => state.clear(),
            Self::Biquad { left, right, .. } => {
                *left = BiquadState::default();
                *right = BiquadState::default();
            }
            Self::StateVariableFilter { left, right, .. } => {
                left.clear();
                right.clear();
            }
            Self::Comb { left, right, .. } => {
                left.clear();
                right.clear();
            }
            Self::Delay { left, right, .. } => {
                left.clear();
                right.clear();
            }
            Self::Reverb { left, right, .. } => {
                left.clear();
                right.clear();
            }
            Self::Chorus { left, right, .. } => {
                left.clear();
                right.clear();
            }
            Self::SpaceEcho { state, .. } => state.clear(),
            Self::TapeDelay { state, .. } => state.clear(),
            Self::PlateReverb { state, .. } => state.clear(),
            Self::SpringReverb { state, .. } => state.clear(),
            Self::NonlinearReverb { state, .. } => state.clear(),
            Self::Compressor { left, right, .. } => {
                *left = CompressorState::default();
                *right = CompressorState::default();
            }
            Self::Bitcrush { left, right, .. } => {
                *left = BitcrusherState::default();
                *right = BitcrusherState::default();
            }
            Self::MicroPitch { state, .. } => state.clear(),
            Self::MultiTapDelay { state, .. } => state.clear(),
            Self::Saturator { state, .. } => state.clear(),
            Self::Wavefolder { state, .. } => state.clear(),
            Self::Degrade { state, .. } => state.clear(),
            Self::TiltEq { state, .. } => state.clear(),
            Self::StereoSpread { state, .. } => state.clear(),
            Self::FrequencyShifter { state, .. } => state.clear(),
            Self::RotarySpeaker { state, .. } => state.clear(),
            Self::EnsembleChorus { state, .. } => state.clear(),
            Self::Phaser { left, right, .. } => {
                left.clear();
                right.clear();
            }
            Self::Constant { .. }
            | Self::Input { .. }
            | Self::Gain { .. }
            | Self::Pan { .. }
            | Self::Mix { .. }
            | Self::Stereo { .. }
            | Self::Adsr { .. }
            | Self::Ar { .. }
            | Self::Exponential { .. }
            | Self::Distortion { .. } => {}
        }
    }
}

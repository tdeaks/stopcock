use crate::dsp::{AcidBassWaveform, DrumVoiceKind, FilterKind, StateVariableFilterMode, Waveform};
use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenderRequest {
    pub(crate) sample_rate: f64,
    pub(crate) length: usize,
    pub(crate) root: usize,
    pub(crate) gate_sec: Option<f64>,
    pub(crate) velocity: Option<f64>,
    pub(crate) trigger_freq: Option<f64>,
    pub(crate) nodes: Vec<NodeDef>,
    #[serde(default)]
    pub(crate) inputs: Vec<Vec<f32>>,
}

impl RenderRequest {
    pub(crate) fn length(&self) -> usize {
        self.length
    }
}

#[derive(Clone, Deserialize)]
pub(crate) struct NodeDef {
    pub(crate) kind: String,
    #[serde(skip)]
    pub(crate) kind_id: Option<NodeKind>,
    pub(crate) out: u8,
    #[serde(default)]
    pub(crate) inputs: Vec<usize>,
    #[serde(default)]
    pub(crate) mods: Vec<ModDef>,
    #[serde(default)]
    pub(crate) param_slots: Vec<ParamSlot>,
    #[serde(default)]
    pub(crate) fields: Fields,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NodeKind {
    Osc,
    Wavetable,
    Fm,
    Noise,
    Constant,
    Buffer,
    Input,
    Gain,
    Pan,
    Mix,
    Stereo,
    Biquad,
    Comb,
    Adsr,
    Ar,
    Exponential,
    Delay,
    Reverb,
    Distortion,
    Chorus,
    SpaceEcho,
    Compressor,
    Bitcrush,
    MicroPitch,
    MultiTapDelay,
    Saturator,
    Degrade,
    EnsembleChorus,
    TapeDelay,
    PlateReverb,
    SpringReverb,
    NonlinearReverb,
    SamplerInstrument,
    AcidBass,
    DrumVoice,
    StringMachine,
    PolySynth,
    LofiSampler,
    TiltEq,
    StereoSpread,
    FrequencyShifter,
    RotarySpeaker,
    StateVariableFilter,
    Wavefolder,
    Phaser,
}

impl NodeKind {
    pub(crate) fn from_name(kind: &str) -> Option<Self> {
        Some(match kind {
            "osc" => Self::Osc,
            "wavetable" => Self::Wavetable,
            "fm" => Self::Fm,
            "noise" => Self::Noise,
            "constant" => Self::Constant,
            "buffer" => Self::Buffer,
            "input" => Self::Input,
            "gain" => Self::Gain,
            "pan" => Self::Pan,
            "mix" => Self::Mix,
            "stereo" => Self::Stereo,
            "biquad" => Self::Biquad,
            "comb" => Self::Comb,
            "adsr" => Self::Adsr,
            "ar" => Self::Ar,
            "exponential" => Self::Exponential,
            "delay" => Self::Delay,
            "reverb" => Self::Reverb,
            "distortion" => Self::Distortion,
            "chorus" => Self::Chorus,
            "spaceEcho" => Self::SpaceEcho,
            "compressor" => Self::Compressor,
            "bitcrush" => Self::Bitcrush,
            "microPitch" => Self::MicroPitch,
            "multiTapDelay" => Self::MultiTapDelay,
            "saturator" => Self::Saturator,
            "degrade" => Self::Degrade,
            "ensembleChorus" => Self::EnsembleChorus,
            "tapeDelay" => Self::TapeDelay,
            "plateReverb" => Self::PlateReverb,
            "springReverb" => Self::SpringReverb,
            "nonlinearReverb" => Self::NonlinearReverb,
            "samplerInstrument" => Self::SamplerInstrument,
            "acidBass" => Self::AcidBass,
            "drumVoice" => Self::DrumVoice,
            "stringMachine" => Self::StringMachine,
            "polySynth" => Self::PolySynth,
            "lofiSampler" => Self::LofiSampler,
            "tiltEq" => Self::TiltEq,
            "stereoSpread" => Self::StereoSpread,
            "frequencyShifter" => Self::FrequencyShifter,
            "rotarySpeaker" => Self::RotarySpeaker,
            "stateVariableFilter" => Self::StateVariableFilter,
            "wavefolder" => Self::Wavefolder,
            "phaser" => Self::Phaser,
            _ => return None,
        })
    }

    #[cfg(test)]
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Osc => "osc",
            Self::Wavetable => "wavetable",
            Self::Fm => "fm",
            Self::Noise => "noise",
            Self::Constant => "constant",
            Self::Buffer => "buffer",
            Self::Input => "input",
            Self::Gain => "gain",
            Self::Pan => "pan",
            Self::Mix => "mix",
            Self::Stereo => "stereo",
            Self::Biquad => "biquad",
            Self::Comb => "comb",
            Self::Adsr => "adsr",
            Self::Ar => "ar",
            Self::Exponential => "exponential",
            Self::Delay => "delay",
            Self::Reverb => "reverb",
            Self::Distortion => "distortion",
            Self::Chorus => "chorus",
            Self::SpaceEcho => "spaceEcho",
            Self::Compressor => "compressor",
            Self::Bitcrush => "bitcrush",
            Self::MicroPitch => "microPitch",
            Self::MultiTapDelay => "multiTapDelay",
            Self::Saturator => "saturator",
            Self::Degrade => "degrade",
            Self::EnsembleChorus => "ensembleChorus",
            Self::TapeDelay => "tapeDelay",
            Self::PlateReverb => "plateReverb",
            Self::SpringReverb => "springReverb",
            Self::NonlinearReverb => "nonlinearReverb",
            Self::SamplerInstrument => "samplerInstrument",
            Self::AcidBass => "acidBass",
            Self::DrumVoice => "drumVoice",
            Self::StringMachine => "stringMachine",
            Self::PolySynth => "polySynth",
            Self::LofiSampler => "lofiSampler",
            Self::TiltEq => "tiltEq",
            Self::StereoSpread => "stereoSpread",
            Self::FrequencyShifter => "frequencyShifter",
            Self::RotarySpeaker => "rotarySpeaker",
            Self::StateVariableFilter => "stateVariableFilter",
            Self::Wavefolder => "wavefolder",
            Self::Phaser => "phaser",
        }
    }
}

#[derive(Clone, Deserialize)]
pub(crate) struct ModDef {
    pub(crate) param: String,
    #[serde(skip)]
    pub(crate) param_id: Option<u16>,
    pub(crate) source: usize,
    pub(crate) depth: f64,
    pub(crate) rate: String,
    #[serde(skip)]
    pub(crate) control_rate: Option<bool>,
}

#[derive(Clone, Deserialize)]
pub(crate) struct ParamSlot {
    pub(crate) param: String,
    #[serde(skip)]
    pub(crate) param_id: Option<u16>,
    pub(crate) slot: usize,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Fields {
    pub(crate) wave: Option<String>,
    #[serde(skip)]
    pub(crate) wave_kind: Option<Waveform>,
    #[serde(skip)]
    pub(crate) acid_wave_kind: Option<AcidBassWaveform>,
    pub(crate) drum_kind: Option<String>,
    #[serde(skip)]
    pub(crate) drum_voice_kind: Option<DrumVoiceKind>,
    pub(crate) freq: Option<f64>,
    pub(crate) detune: Option<f64>,
    pub(crate) pulse_width: Option<f64>,
    pub(crate) sub: Option<f64>,
    pub(crate) shift_hz: Option<f64>,
    pub(crate) phase: Option<f64>,
    pub(crate) bank: Option<WavetableBank>,
    pub(crate) position: Option<f64>,
    pub(crate) index: Option<f64>,
    pub(crate) operators: Option<Vec<FmOperator>>,
    pub(crate) matrix: Option<Vec<Vec<f64>>>,
    pub(crate) color: Option<String>,
    pub(crate) seed: Option<u32>,
    pub(crate) value: Option<f64>,
    pub(crate) samples: Option<Vec<f32>>,
    pub(crate) zones: Option<Vec<SamplerZoneDef>>,
    pub(crate) looped: Option<bool>,
    pub(crate) rate: Option<f64>,
    pub(crate) cutoff: Option<f64>,
    pub(crate) resonance: Option<f64>,
    pub(crate) env_mod: Option<f64>,
    pub(crate) accent: Option<f64>,
    pub(crate) slide: Option<f64>,
    pub(crate) snap: Option<f64>,
    pub(crate) level: Option<f64>,
    pub(crate) channel: Option<usize>,
    pub(crate) amount: Option<f64>,
    pub(crate) filter: Option<String>,
    #[serde(skip)]
    pub(crate) filter_kind: Option<FilterKind>,
    #[serde(skip)]
    pub(crate) state_variable_filter_mode: Option<StateVariableFilterMode>,
    pub(crate) q: Option<f64>,
    pub(crate) gain_db: Option<f64>,
    pub(crate) delay_ms: Option<f64>,
    pub(crate) time_ms: Option<f64>,
    pub(crate) feedback: Option<f64>,
    pub(crate) damp: Option<f64>,
    pub(crate) attack: Option<f64>,
    pub(crate) decay: Option<f64>,
    pub(crate) sustain: Option<f64>,
    pub(crate) release: Option<f64>,
    pub(crate) tau: Option<f64>,
    pub(crate) mix: Option<f64>,
    pub(crate) ir: Option<Vec<f32>>,
    pub(crate) shape: Option<String>,
    pub(crate) depth: Option<f64>,
    pub(crate) width: Option<f64>,
    pub(crate) reverb_mix: Option<f64>,
    pub(crate) wow: Option<f64>,
    pub(crate) flutter: Option<f64>,
    pub(crate) tape_age: Option<f64>,
    pub(crate) drive: Option<f64>,
    pub(crate) chorus: Option<f64>,
    pub(crate) head1: Option<bool>,
    pub(crate) head2: Option<bool>,
    pub(crate) head3: Option<bool>,
    pub(crate) head_count: Option<f64>,
    pub(crate) threshold: Option<f64>,
    pub(crate) ratio: Option<f64>,
    pub(crate) knee: Option<f64>,
    pub(crate) bits: Option<f64>,
    pub(crate) downsample: Option<f64>,
    pub(crate) tone: Option<f64>,
    pub(crate) asymmetry: Option<f64>,
    pub(crate) output: Option<f64>,
    pub(crate) jitter: Option<f64>,
    pub(crate) noise: Option<f64>,
    pub(crate) tap_ratios: Option<Vec<f64>>,
    pub(crate) tap_gains: Option<Vec<f64>>,
    pub(crate) tap_pans: Option<Vec<f64>>,
    pub(crate) pre_delay_ms: Option<f64>,
    pub(crate) damping: Option<f64>,
    pub(crate) diffusion: Option<f64>,
    pub(crate) modulation: Option<f64>,
    pub(crate) tension: Option<f64>,
    pub(crate) drip: Option<f64>,
    pub(crate) voicing: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SamplerZoneDef {
    pub(crate) samples: Vec<f32>,
    pub(crate) sample_rate: f64,
    pub(crate) root_midi: f64,
    pub(crate) key_low: f64,
    pub(crate) key_high: f64,
    pub(crate) velocity_low: f64,
    pub(crate) velocity_high: f64,
    pub(crate) looped: bool,
    pub(crate) loop_start: usize,
    pub(crate) loop_end: usize,
    pub(crate) gain: f64,
    pub(crate) pan: f64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WavetableBank {
    pub(crate) size: usize,
    pub(crate) frame_count: usize,
    pub(crate) levels: Vec<Vec<f32>>,
    pub(crate) level_max_harmonics: Vec<f64>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FmOperator {
    pub(crate) kind: String,
    #[serde(skip)]
    pub(crate) operator_kind: Option<FmOperatorKind>,
    pub(crate) ratio: f64,
    pub(crate) detune: f64,
    pub(crate) level: f64,
    pub(crate) feedback: f64,
    pub(crate) output: f64,
    pub(crate) phase: f64,
    pub(crate) wave: Option<String>,
    #[serde(skip)]
    pub(crate) wave_kind: Option<Waveform>,
    pub(crate) bank: Option<WavetableBank>,
    pub(crate) position: Option<f64>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum FmOperatorKind {
    Sine,
    Polyblep,
    Wavetable,
}

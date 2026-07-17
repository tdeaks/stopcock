mod compile;
mod fm;
mod reset;
#[cfg(test)]
mod tests;

use crate::dsp::{
    AcidBassState, AcidBassWaveform, BiquadState, BitcrusherState, CompressorState, DampedComb,
    DegradeState, DelayLine, DrumVoiceKind, DrumVoiceState, EnsembleChorusState, FeedbackDelay,
    FilterKind, FrequencyShifterState, LoFiSamplerState, MicroPitchState, Mulberry32,
    MultiTapDelayState, MultiTapDelayTap, NonlinearReverbState, PhaserState, PhaserVoicing,
    PlateReverbState, PolySynthState, ReverbLine, RotarySpeakerState, SamplerVoiceState,
    SamplerZone, SaturatorState,
    SpringReverbState, StateVariableFilterMode, StateVariableFilterState, StereoSpreadState,
    StringMachineState, TapeDelayState, TapeEchoState, TiltEqState, WavefolderState, Waveform,
};
use crate::model::WavetableBank;

pub(crate) use fm::{sample_runtime_operator, RuntimeFmOperators};

#[derive(Clone, Copy)]
pub(crate) enum NoiseColor {
    White,
    Pink,
    Brown,
}

impl NoiseColor {
    fn from_optional(color: Option<&str>) -> Self {
        match color {
            Some("pink") => Self::Pink,
            Some("brown") => Self::Brown,
            Some("white") | None => Self::White,
            Some(_) => Self::White,
        }
    }
}

#[derive(Clone, Copy)]
pub(crate) enum DistortionShape {
    Tanh,
    Hardclip,
    Softclip,
}

impl DistortionShape {
    fn from_optional(shape: Option<&str>) -> Self {
        match shape {
            Some("hardclip") => Self::Hardclip,
            Some("softclip") => Self::Softclip,
            Some("tanh") | None => Self::Tanh,
            Some(_) => Self::Tanh,
        }
    }
}

pub(crate) fn phaser_voicing_from_optional(voicing: Option<&str>) -> PhaserVoicing {
    match voicing {
        Some("smallStone") | Some("small-stone") => PhaserVoicing::SmallStoneColor,
        Some("uniVibe") | Some("uni-vibe") | Some("uniVibeChorus") => PhaserVoicing::UniVibeChorus,
        Some("uniVibeVibrato") | Some("vibrato") => PhaserVoicing::UniVibeVibrato,
        _ => PhaserVoicing::Phase90,
    }
}

pub(crate) enum RuntimeNode {
    Osc {
        out: u8,
        freq: f64,
        detune: f64,
        base_phase: f64,
        wave: Waveform,
        phase: f64,
        triangle: f64,
    },
    Wavetable {
        out: u8,
        bank: Option<WavetableBank>,
        freq: f64,
        detune: f64,
        base_phase: f64,
        position: f64,
        phase: f64,
    },
    Fm {
        out: u8,
        freq: f64,
        detune: f64,
        index: f64,
        operators: Box<RuntimeFmOperators>,
        matrix: Box<[[f64; 6]; 6]>,
        phase: [f64; 6],
        previous: [f64; 6],
        current: [f64; 6],
        triangle: [f64; 6],
    },
    Noise {
        out: u8,
        color: NoiseColor,
        rng: Mulberry32,
        seed: u32,
        pink0: f64,
        pink1: f64,
        pink2: f64,
        brown: f64,
    },
    Constant {
        out: u8,
        value: f64,
    },
    Buffer {
        out: u8,
        samples: Vec<f32>,
        rate: f64,
        looped: bool,
        position: f64,
    },
    SamplerInstrument {
        zones: Vec<SamplerZone>,
        freq: f64,
        velocity: f64,
        attack: f64,
        release: f64,
        level: f64,
        state: SamplerVoiceState,
    },
    LofiSampler {
        zones: Vec<SamplerZone>,
        freq: f64,
        velocity: f64,
        attack: f64,
        release: f64,
        level: f64,
        bits: f64,
        downsample: f64,
        jitter: f64,
        noise: f64,
        tone: f64,
        drive: f64,
        mix: f64,
        state: LoFiSamplerState,
    },
    AcidBass {
        wave: AcidBassWaveform,
        freq: f64,
        velocity: f64,
        cutoff: f64,
        resonance: f64,
        env_mod: f64,
        decay: f64,
        accent: f64,
        slide: f64,
        drive: f64,
        level: f64,
        state: AcidBassState,
    },
    DrumVoice {
        kind: DrumVoiceKind,
        freq: f64,
        velocity: f64,
        decay: f64,
        tone: f64,
        snap: f64,
        noise: f64,
        drive: f64,
        level: f64,
        state: DrumVoiceState,
    },
    StringMachine {
        freq: f64,
        velocity: f64,
        detune: f64,
        attack: f64,
        release: f64,
        tone: f64,
        depth: f64,
        modulation: f64,
        width: f64,
        level: f64,
        state: StringMachineState,
    },
    PolySynth {
        freq: f64,
        velocity: f64,
        detune: f64,
        pulse_width: f64,
        sub: f64,
        noise: f64,
        cutoff: f64,
        resonance: f64,
        env_mod: f64,
        attack: f64,
        decay: f64,
        sustain: f64,
        release: f64,
        drive: f64,
        chorus: f64,
        modulation: f64,
        width: f64,
        level: f64,
        state: PolySynthState,
    },
    Input {
        out: u8,
        channel: usize,
    },
    Gain {
        out: u8,
        input: usize,
        amount: f64,
    },
    Pan {
        input: usize,
        position: f64,
    },
    Mix {
        out: u8,
        inputs: Vec<usize>,
    },
    Stereo {
        left: usize,
        right: usize,
    },
    Biquad {
        out: u8,
        input: usize,
        filter: FilterKind,
        freq: f64,
        q: f64,
        gain_db: f64,
        left: BiquadState,
        right: BiquadState,
    },
    StateVariableFilter {
        out: u8,
        input: usize,
        mode: StateVariableFilterMode,
        freq: f64,
        resonance: f64,
        drive: f64,
        mix: f64,
        left: StateVariableFilterState,
        right: StateVariableFilterState,
    },
    Comb {
        out: u8,
        input: usize,
        delay_ms: f64,
        feedback: f64,
        damp: f64,
        left: DampedComb,
        right: DampedComb,
    },
    Adsr {
        out: u8,
        input: usize,
        attack: f64,
        decay: f64,
        sustain: f64,
        release: f64,
    },
    Ar {
        out: u8,
        input: usize,
        attack: f64,
        release: f64,
    },
    Exponential {
        out: u8,
        input: usize,
        tau: f64,
    },
    Delay {
        out: u8,
        input: usize,
        delay_ms: f64,
        feedback: f64,
        mix: f64,
        left: FeedbackDelay,
        right: FeedbackDelay,
    },
    Reverb {
        out: u8,
        input: usize,
        ir: Vec<f32>,
        mix: f64,
        left: ReverbLine,
        right: ReverbLine,
    },
    Distortion {
        out: u8,
        input: usize,
        shape: DistortionShape,
        amount: f64,
    },
    Chorus {
        out: u8,
        input: usize,
        rate: f64,
        depth: f64,
        mix: f64,
        left: DelayLine,
        right: DelayLine,
    },
    SpaceEcho {
        input: usize,
        time_ms: f64,
        feedback: f64,
        mix: f64,
        reverb_mix: f64,
        wow: f64,
        flutter: f64,
        tape_age: f64,
        drive: f64,
        head_count: f64,
        head1: bool,
        head2: bool,
        head3: bool,
        state: TapeEchoState,
    },
    TapeDelay {
        input: usize,
        time_ms: f64,
        feedback: f64,
        mix: f64,
        wow: f64,
        flutter: f64,
        tape_age: f64,
        drive: f64,
        tone: f64,
        width: f64,
        state: TapeDelayState,
    },
    PlateReverb {
        input: usize,
        pre_delay_ms: f64,
        decay: f64,
        damping: f64,
        diffusion: f64,
        modulation: f64,
        mix: f64,
        width: f64,
        state: Box<PlateReverbState>,
    },
    SpringReverb {
        input: usize,
        decay: f64,
        damping: f64,
        tension: f64,
        drip: f64,
        mix: f64,
        width: f64,
        state: Box<SpringReverbState>,
    },
    NonlinearReverb {
        input: usize,
        time_ms: f64,
        decay: f64,
        damping: f64,
        drive: f64,
        mix: f64,
        width: f64,
        state: Box<NonlinearReverbState>,
    },
    Compressor {
        out: u8,
        input: usize,
        threshold: f64,
        ratio: f64,
        attack: f64,
        release: f64,
        knee: f64,
        left: CompressorState,
        right: CompressorState,
    },
    Bitcrush {
        out: u8,
        input: usize,
        bits: f64,
        downsample: f64,
        left: BitcrusherState,
        right: BitcrusherState,
    },
    MicroPitch {
        input: usize,
        detune: f64,
        width: f64,
        delay_ms: f64,
        mix: f64,
        state: MicroPitchState,
    },
    MultiTapDelay {
        input: usize,
        time_ms: f64,
        feedback: f64,
        mix: f64,
        tone: f64,
        width: f64,
        taps: Vec<MultiTapDelayTap>,
        state: MultiTapDelayState,
    },
    Saturator {
        out: u8,
        input: usize,
        drive: f64,
        asymmetry: f64,
        tone: f64,
        mix: f64,
        output: f64,
        state: SaturatorState,
    },
    Wavefolder {
        out: u8,
        input: usize,
        drive: f64,
        depth: f64,
        asymmetry: f64,
        tone: f64,
        mix: f64,
        output: f64,
        state: WavefolderState,
    },
    Degrade {
        out: u8,
        input: usize,
        bits: f64,
        downsample: f64,
        jitter: f64,
        noise: f64,
        tone: f64,
        mix: f64,
        state: DegradeState,
    },
    TiltEq {
        out: u8,
        input: usize,
        freq: f64,
        gain_db: f64,
        mix: f64,
        state: TiltEqState,
    },
    StereoSpread {
        input: usize,
        width: f64,
        delay_ms: f64,
        mix: f64,
        state: StereoSpreadState,
    },
    FrequencyShifter {
        out: u8,
        input: usize,
        shift_hz: f64,
        mix: f64,
        state: Box<FrequencyShifterState>,
    },
    RotarySpeaker {
        input: usize,
        rate: f64,
        depth: f64,
        mix: f64,
        drive: f64,
        width: f64,
        freq: f64,
        state: Box<RotarySpeakerState>,
    },
    EnsembleChorus {
        input: usize,
        rate: f64,
        depth: f64,
        mix: f64,
        width: f64,
        tone: f64,
        noise: f64,
        state: EnsembleChorusState,
    },
    Phaser {
        out: u8,
        input: usize,
        voicing: PhaserVoicing,
        rate: f64,
        depth: f64,
        mix: f64,
        left: Box<PhaserState>,
        right: Box<PhaserState>,
    },
}

impl RuntimeNode {
    pub(crate) fn out(&self) -> u8 {
        match self {
            Self::Osc { out, .. }
            | Self::Wavetable { out, .. }
            | Self::Fm { out, .. }
            | Self::Noise { out, .. }
            | Self::Constant { out, .. }
            | Self::Buffer { out, .. }
            | Self::Input { out, .. }
            | Self::Gain { out, .. }
            | Self::Mix { out, .. }
            | Self::Biquad { out, .. }
            | Self::StateVariableFilter { out, .. }
            | Self::Comb { out, .. }
            | Self::Adsr { out, .. }
            | Self::Ar { out, .. }
            | Self::Exponential { out, .. }
            | Self::Delay { out, .. }
            | Self::Reverb { out, .. }
            | Self::Distortion { out, .. }
            | Self::Chorus { out, .. }
            | Self::Compressor { out, .. }
            | Self::Bitcrush { out, .. }
            | Self::Saturator { out, .. }
            | Self::Wavefolder { out, .. }
            | Self::TiltEq { out, .. }
            | Self::FrequencyShifter { out, .. }
            | Self::Phaser { out, .. }
            | Self::Degrade { out, .. } => *out,
            Self::AcidBass { .. } => 1,
            Self::DrumVoice { .. } => 1,
            Self::StringMachine { .. } => 2,
            Self::PolySynth { .. } => 2,
            Self::SamplerInstrument { .. } => 2,
            Self::LofiSampler { .. } => 2,
            Self::Pan { .. }
            | Self::Stereo { .. }
            | Self::SpaceEcho { .. }
            | Self::TapeDelay { .. }
            | Self::PlateReverb { .. }
            | Self::SpringReverb { .. }
            | Self::NonlinearReverb { .. }
            | Self::StereoSpread { .. }
            | Self::RotarySpeaker { .. }
            | Self::EnsembleChorus { .. }
            | Self::MicroPitch { .. }
            | Self::MultiTapDelay { .. } => 2,
        }
    }
}

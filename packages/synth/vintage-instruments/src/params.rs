use stopcock_dsp_core::{clamp, safe_finite, AcidBassWaveform, DrumVoiceKind};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InstrumentMode {
    PolySynth,
    AcidBass,
    DrumVoice,
    StringMachine,
    LoFiSampler,
}

#[derive(Clone, Copy, Debug)]
pub struct InstrumentParams {
    pub mode: InstrumentMode,
    pub drum_kind: DrumVoiceKind,
    pub acid_waveform: AcidBassWaveform,
    pub level: f64,
    pub tone: f64,
    pub motion: f64,
    pub age: f64,
    pub width: f64,
    pub drive: f64,
    pub cutoff: f64,
    pub resonance: f64,
    pub env_mod: f64,
    pub attack: f64,
    pub decay: f64,
    pub sustain: f64,
    pub release: f64,
    pub accent: f64,
    pub slide: f64,
    pub detune: f64,
    pub pulse_width: f64,
    pub sub: f64,
    pub noise: f64,
    pub bits: f64,
    pub downsample: f64,
    pub mix: f64,
}

impl Default for InstrumentParams {
    fn default() -> Self {
        Self {
            mode: InstrumentMode::PolySynth,
            drum_kind: DrumVoiceKind::Kick,
            acid_waveform: AcidBassWaveform::Saw,
            level: 0.82,
            tone: 0.68,
            motion: 0.25,
            age: 0.12,
            width: 0.9,
            drive: 0.14,
            cutoff: 1_800.0,
            resonance: 0.34,
            env_mod: 0.4,
            attack: 0.008,
            decay: 0.32,
            sustain: 0.68,
            release: 0.38,
            accent: 0.0,
            slide: 0.0,
            detune: 5.0,
            pulse_width: 0.48,
            sub: 0.28,
            noise: 0.04,
            bits: 12.0,
            downsample: 2.0,
            mix: 0.42,
        }
    }
}

impl InstrumentParams {
    #[must_use]
    pub fn sanitized(self) -> Self {
        Self {
            mode: self.mode,
            drum_kind: self.drum_kind,
            acid_waveform: self.acid_waveform,
            level: clamp(safe_finite(self.level, 0.82), 0.0, 4.0),
            tone: clamp(safe_finite(self.tone, 0.68), 0.0, 1.0),
            motion: clamp(safe_finite(self.motion, 0.25), 0.0, 1.0),
            age: clamp(safe_finite(self.age, 0.12), 0.0, 1.0),
            width: clamp(safe_finite(self.width, 0.9), 0.0, 1.0),
            drive: clamp(safe_finite(self.drive, 0.14), 0.0, 1.0),
            cutoff: clamp(safe_finite(self.cutoff, 1_800.0), 20.0, 24_000.0),
            resonance: clamp(safe_finite(self.resonance, 0.34), 0.0, 1.0),
            env_mod: clamp(safe_finite(self.env_mod, 0.4), -1.0, 1.0),
            attack: clamp(safe_finite(self.attack, 0.008), 0.0, 6.0),
            decay: clamp(safe_finite(self.decay, 0.32), 0.0, 12.0),
            sustain: clamp(safe_finite(self.sustain, 0.68), 0.0, 1.0),
            release: clamp(safe_finite(self.release, 0.38), 0.0, 12.0),
            accent: clamp(safe_finite(self.accent, 0.0), 0.0, 1.0),
            slide: clamp(safe_finite(self.slide, 0.0), 0.0, 1.0),
            detune: clamp(safe_finite(self.detune, 5.0), -50.0, 50.0),
            pulse_width: clamp(safe_finite(self.pulse_width, 0.48), 0.04, 0.96),
            sub: clamp(safe_finite(self.sub, 0.28), 0.0, 1.0),
            noise: clamp(safe_finite(self.noise, 0.04), 0.0, 1.0),
            bits: clamp(safe_finite(self.bits, 12.0).round(), 4.0, 16.0),
            downsample: clamp(safe_finite(self.downsample, 2.0).round(), 1.0, 32.0),
            mix: clamp(safe_finite(self.mix, 0.42), 0.0, 1.0),
        }
    }
}

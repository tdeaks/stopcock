use stopcock_dsp_core::{
    clamp, AcidBassParams, AcidBassState, DrumVoiceParams, DrumVoiceState, LoFiSamplerParams,
    LoFiSamplerState, PolySynthParams, PolySynthState, SamplerZone, StringMachineParams,
    StringMachineState,
};

use crate::params::{InstrumentMode, InstrumentParams};

const CENTER_GAIN: f64 = std::f64::consts::FRAC_1_SQRT_2;

pub(crate) struct VoiceSlot {
    pub(crate) active: bool,
    pub(crate) sustained: bool,
    pub(crate) note: u8,
    velocity: f64,
    pub(crate) order: u64,
    frame: usize,
    release_frame: Option<usize>,
    poly: PolySynthState,
    acid: AcidBassState,
    drum: DrumVoiceState,
    string_machine: StringMachineState,
    lofi_sampler: LoFiSamplerState,
}

impl VoiceSlot {
    pub(crate) fn new(sample_rate: f64) -> Self {
        Self {
            active: false,
            sustained: false,
            note: 0,
            velocity: 0.0,
            order: 0,
            frame: 0,
            release_frame: None,
            poly: PolySynthState::new(sample_rate),
            acid: AcidBassState::new(),
            drum: DrumVoiceState::new(),
            string_machine: StringMachineState::new(sample_rate),
            lofi_sampler: LoFiSamplerState::new(),
        }
    }

    pub(crate) fn clear(&mut self, sample_rate: f64) {
        *self = Self::new(sample_rate);
    }

    pub(crate) fn trigger(&mut self, note: u8, velocity: f64, order: u64, sample_rate: f64) {
        self.clear(sample_rate);
        self.active = true;
        self.note = note;
        self.velocity = velocity;
        self.order = order;
    }

    pub(crate) fn release(&mut self) {
        if self.release_frame.is_none() {
            self.release_frame = Some(self.frame);
        }
    }

    pub(crate) fn process(
        &mut self,
        params: InstrumentParams,
        sample_rate: f64,
        sampler_zones: &[SamplerZone],
    ) -> (f32, f32) {
        let freq = midi_note_hz(self.note);
        let gate_sec = self
            .release_frame
            .map(|frame| frame as f64 / sample_rate.max(1.0));
        let output = match params.mode {
            InstrumentMode::PolySynth => self.poly.process(
                poly_params(params, freq, self.velocity),
                sample_rate,
                gate_sec,
            ),
            InstrumentMode::AcidBass => {
                let mono = self.acid.process(
                    params.acid_waveform,
                    acid_params(params, freq, self.velocity),
                    sample_rate,
                    gate_sec,
                ) as f64;
                center_mono(mono)
            }
            InstrumentMode::DrumVoice => {
                let mono = self.drum.process(
                    params.drum_kind,
                    drum_params(params, freq, self.velocity),
                    sample_rate,
                    None,
                ) as f64;
                center_mono(mono)
            }
            InstrumentMode::StringMachine => self.string_machine.process(
                string_machine_params(params, freq, self.velocity),
                sample_rate,
                gate_sec,
            ),
            InstrumentMode::LoFiSampler => self.lofi_sampler.process(
                sampler_zones,
                lofi_sampler_params(params, freq, self.velocity),
                sample_rate,
                gate_sec,
            ),
        };
        self.frame = self.frame.saturating_add(1);
        output
    }

    pub(crate) fn should_stop(&self, params: InstrumentParams, sample_rate: f64) -> bool {
        if !self.active || self.sustained {
            return false;
        }
        let tail_frames = tail_frames(params, sample_rate);
        match params.mode {
            InstrumentMode::DrumVoice => self.frame > tail_frames,
            _ => self
                .release_frame
                .map(|release_frame| self.frame.saturating_sub(release_frame) > tail_frames)
                .unwrap_or(false),
        }
    }
}

fn poly_params(params: InstrumentParams, freq: f64, velocity: f64) -> PolySynthParams {
    PolySynthParams {
        freq,
        velocity,
        detune: params.detune,
        pulse_width: params.pulse_width,
        sub: params.sub,
        noise: params.noise,
        cutoff: params.cutoff,
        resonance: params.resonance,
        env_mod: params.env_mod,
        attack: params.attack,
        decay: params.decay,
        sustain: params.sustain,
        release: params.release,
        drive: params.drive,
        chorus: params.mix,
        modulation: params.motion,
        width: params.width,
        level: params.level,
    }
}

fn acid_params(params: InstrumentParams, freq: f64, velocity: f64) -> AcidBassParams {
    AcidBassParams {
        freq,
        cutoff: params.cutoff,
        resonance: params.resonance,
        env_mod: params.env_mod,
        decay: params.decay.max(0.006),
        accent: params.accent,
        slide: params.slide,
        drive: params.drive,
        level: params.level,
        velocity,
    }
}

fn drum_params(params: InstrumentParams, freq: f64, velocity: f64) -> DrumVoiceParams {
    DrumVoiceParams {
        freq,
        decay: params.decay.max(0.01),
        tone: params.tone,
        snap: params.motion,
        noise: params.noise.max(params.age * 0.5),
        drive: params.drive,
        level: params.level,
        velocity,
    }
}

fn string_machine_params(
    params: InstrumentParams,
    freq: f64,
    velocity: f64,
) -> StringMachineParams {
    StringMachineParams {
        freq,
        detune: params.detune.abs(),
        attack: params.attack,
        release: params.release.max(0.005),
        tone: params.tone,
        depth: params.mix,
        modulation: params.motion,
        width: params.width,
        level: params.level,
        velocity,
    }
}

fn lofi_sampler_params(params: InstrumentParams, freq: f64, velocity: f64) -> LoFiSamplerParams {
    LoFiSamplerParams {
        freq,
        velocity,
        attack: params.attack,
        release: params.release,
        level: params.level,
        bits: params.bits,
        downsample: params.downsample,
        jitter: params.motion * 0.25,
        noise: params.noise.max(params.age * 0.1),
        tone: params.tone,
        drive: params.drive,
        mix: params.mix,
    }
}

fn center_mono(sample: f64) -> (f32, f32) {
    let sample = clamp(sample * CENTER_GAIN, -4.0, 4.0) as f32;
    (sample, sample)
}

fn tail_frames(params: InstrumentParams, sample_rate: f64) -> usize {
    let seconds = match params.mode {
        InstrumentMode::PolySynth => params.release * 8.0 + 0.12,
        InstrumentMode::AcidBass => 0.08,
        InstrumentMode::DrumVoice => params.decay.max(0.01) * 10.0 + 0.05,
        InstrumentMode::StringMachine => params.release * 8.0 + 0.2,
        InstrumentMode::LoFiSampler => params.release * 8.0 + 0.08,
    };
    (seconds * sample_rate.max(1.0)).ceil() as usize
}

fn midi_note_hz(note: u8) -> f64 {
    440.0 * 2.0_f64.powf((f64::from(note.min(127)) - 69.0) / 12.0)
}

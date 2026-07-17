use crate::degrade::{DegradeParams, DegradeState};
use crate::math::{clamp, safe_finite};
use crate::sampler::{SamplerParams, SamplerVoiceState, SamplerZone};

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
const DEGRADE_SEED: u32 = 0x10F1_5A11;

#[derive(Clone, Copy, Debug)]
pub struct LoFiSamplerParams {
    pub freq: f64,
    pub velocity: f64,
    pub attack: f64,
    pub release: f64,
    pub level: f64,
    pub bits: f64,
    pub downsample: f64,
    pub jitter: f64,
    pub noise: f64,
    pub tone: f64,
    pub drive: f64,
    pub mix: f64,
}

impl Default for LoFiSamplerParams {
    fn default() -> Self {
        Self {
            freq: 440.0,
            velocity: 1.0,
            attack: 0.0,
            release: 0.08,
            level: 1.0,
            bits: 12.0,
            downsample: 2.0,
            jitter: 0.04,
            noise: 0.06,
            tone: 0.58,
            drive: 0.16,
            mix: 1.0,
        }
    }
}

#[derive(Clone, Copy)]
struct SanitizedLoFiSamplerParams {
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
}

pub struct LoFiSamplerState {
    sampler: SamplerVoiceState,
    degrade: DegradeState,
}

impl LoFiSamplerState {
    pub fn new() -> Self {
        Self {
            sampler: SamplerVoiceState::new(),
            degrade: DegradeState::with_seed(DEGRADE_SEED),
        }
    }

    pub fn clear(&mut self) {
        self.sampler.clear();
        self.degrade = DegradeState::with_seed(DEGRADE_SEED);
    }

    pub fn selected_zone(&self) -> Option<usize> {
        self.sampler.selected_zone()
    }

    pub fn position(&self) -> f64 {
        self.sampler.position()
    }

    pub fn process(
        &mut self,
        zones: &[SamplerZone],
        params: LoFiSamplerParams,
        sample_rate: f64,
        gate_sec: Option<f64>,
    ) -> (f32, f32) {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let params = sanitize_params(params);
        let (left, right, active) = self.sampler.process_with_activity(
            zones,
            SamplerParams {
                freq: params.freq,
                velocity: params.velocity,
                attack: params.attack,
                release: params.release,
                level: 1.0,
            },
            sample_rate,
            gate_sec,
        );
        if !active {
            return (0.0, 0.0);
        }
        let driven_l = drive_sample(left, params.drive);
        let driven_r = drive_sample(right, params.drive);
        let (wet_l, wet_r) = self.degrade.process(
            driven_l,
            driven_r,
            DegradeParams {
                bits: params.bits,
                downsample: params.downsample,
                jitter: params.jitter,
                noise: params.noise,
                tone: params.tone,
                mix: params.mix,
            },
            sample_rate,
        );
        (
            clamp(wet_l as f64 * params.level, -4.0, 4.0) as f32,
            clamp(wet_r as f64 * params.level, -4.0, 4.0) as f32,
        )
    }
}

impl Default for LoFiSamplerState {
    fn default() -> Self {
        Self::new()
    }
}

fn sanitize_params(params: LoFiSamplerParams) -> SanitizedLoFiSamplerParams {
    SanitizedLoFiSamplerParams {
        freq: clamp(safe_finite(params.freq, 440.0), 1e-6, 24_000.0),
        velocity: clamp(safe_finite(params.velocity, 1.0), 0.0, 1.0),
        attack: clamp(safe_finite(params.attack, 0.0), 0.0, 5.0),
        release: clamp(safe_finite(params.release, 0.08), 0.0, 10.0),
        level: clamp(safe_finite(params.level, 1.0), 0.0, 8.0),
        bits: clamp(safe_finite(params.bits, 12.0).round(), 4.0, 16.0),
        downsample: clamp(safe_finite(params.downsample, 2.0).round(), 1.0, 32.0),
        jitter: clamp(safe_finite(params.jitter, 0.04), 0.0, 1.0),
        noise: clamp(safe_finite(params.noise, 0.06), 0.0, 1.0),
        tone: clamp(safe_finite(params.tone, 0.58), 0.0, 1.0),
        drive: clamp(safe_finite(params.drive, 0.16), 0.0, 1.0),
        mix: clamp(safe_finite(params.mix, 1.0), 0.0, 1.0),
    }
}

fn sanitize_sample_rate(sample_rate: f64) -> f64 {
    safe_finite(sample_rate, DEFAULT_SAMPLE_RATE).max(1.0)
}

fn drive_sample(input: f32, drive: f64) -> f32 {
    if drive <= 0.0 {
        return input;
    }
    let gain = 1.0 + drive * 3.5;
    let norm = gain.tanh();
    ((input as f64 * gain).tanh() / norm.max(1e-6)) as f32
}

#[cfg(test)]
mod tests;

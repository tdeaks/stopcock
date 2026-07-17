use crate::math::{clamp, safe_finite, TAU};
use crate::oscillator::{sample_waveform, wrap_phase, Waveform};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AcidBassWaveform {
    Saw,
    Square,
}

impl AcidBassWaveform {
    pub fn from_optional(wave: Option<&str>) -> Self {
        match wave {
            Some("square") => Self::Square,
            Some("saw") | None => Self::Saw,
            Some(_) => Self::Saw,
        }
    }

    fn as_waveform(self) -> Waveform {
        match self {
            Self::Saw => Waveform::Saw,
            Self::Square => Waveform::Square,
        }
    }
}

#[derive(Clone, Copy)]
pub struct AcidBassParams {
    pub freq: f64,
    pub cutoff: f64,
    pub resonance: f64,
    pub env_mod: f64,
    pub decay: f64,
    pub accent: f64,
    pub slide: f64,
    pub drive: f64,
    pub level: f64,
    pub velocity: f64,
}

impl Default for AcidBassParams {
    fn default() -> Self {
        Self {
            freq: 110.0,
            cutoff: 760.0,
            resonance: 0.58,
            env_mod: 0.62,
            decay: 0.22,
            accent: 0.0,
            slide: 0.0,
            drive: 0.18,
            level: 1.0,
            velocity: 1.0,
        }
    }
}

#[derive(Clone, Copy)]
struct SanitizedAcidBassParams {
    freq: f64,
    cutoff: f64,
    resonance: f64,
    env_mod: f64,
    decay: f64,
    accent: f64,
    slide: f64,
    drive: f64,
    level: f64,
    velocity: f64,
}

#[derive(Default)]
pub struct AcidBassState {
    phase: f64,
    triangle: f64,
    current_freq: f64,
    frame: usize,
    filter: AcidFilterState,
}

impl AcidBassState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn clear(&mut self) {
        self.phase = 0.0;
        self.triangle = 0.0;
        self.current_freq = 0.0;
        self.frame = 0;
        self.filter.clear();
    }

    pub fn current_freq(&self) -> f64 {
        self.current_freq
    }

    pub fn process(
        &mut self,
        waveform: AcidBassWaveform,
        params: AcidBassParams,
        sample_rate: f64,
        gate_sec: Option<f64>,
    ) -> f32 {
        let sample_rate = safe_finite(sample_rate, 48_000.0).max(1.0);
        let params = sanitize_params(params, sample_rate);
        let freq = self.next_freq(params.freq, params.slide, sample_rate);
        let dt = clamp(freq / sample_rate, 0.0, 0.5);
        let t = self.frame as f64 / sample_rate;
        let accent = params.accent * params.velocity;
        let filter_env = (-t / params.decay).exp();
        let cutoff = cutoff_from_envelope(params.cutoff, params.env_mod, filter_env, accent);
        let amp = gate_envelope(t, gate_sec) * params.velocity * (1.0 + accent * 0.65);
        let raw = sample_waveform(waveform.as_waveform(), self.phase, dt, &mut self.triangle);
        self.phase = wrap_phase(self.phase + dt);
        self.frame = self.frame.saturating_add(1);
        let shaped = (raw * (1.0 + params.drive * 2.8)).tanh();
        let filtered =
            self.filter
                .process(shaped, cutoff, params.resonance, params.drive, sample_rate);
        (filtered * amp * params.level) as f32
    }

    fn next_freq(&mut self, target: f64, slide: f64, sample_rate: f64) -> f64 {
        if self.current_freq <= 0.0 || slide <= 0.0 {
            self.current_freq = target;
            return target;
        }
        let tau = 0.004 + slide * 0.18;
        let coeff = 1.0 - (-1.0 / (tau * sample_rate)).exp();
        self.current_freq += (target - self.current_freq) * coeff;
        self.current_freq = safe_finite(self.current_freq, target).max(1e-6);
        self.current_freq
    }
}

#[derive(Default)]
struct AcidFilterState {
    y1: f64,
    y2: f64,
    y3: f64,
}

impl AcidFilterState {
    fn clear(&mut self) {
        self.y1 = 0.0;
        self.y2 = 0.0;
        self.y3 = 0.0;
    }

    fn process(
        &mut self,
        input: f64,
        cutoff: f64,
        resonance: f64,
        drive: f64,
        sample_rate: f64,
    ) -> f64 {
        let cutoff = clamp(safe_finite(cutoff, 760.0), 20.0, sample_rate * 0.45);
        let g = 1.0 - (-TAU * cutoff / sample_rate).exp();
        let feedback = clamp(safe_finite(resonance, 0.0), 0.0, 1.0) * 3.35;
        let drive = 1.0 + clamp(safe_finite(drive, 0.0), 0.0, 1.0) * 3.5;
        let driven = (input * drive - self.y3 * feedback).tanh();
        self.y1 += g * (driven - self.y1);
        self.y2 += g * (self.y1 - self.y2);
        self.y3 += g * (self.y2 - self.y3);
        self.y1 = safe_finite(self.y1, 0.0);
        self.y2 = safe_finite(self.y2, 0.0);
        self.y3 = safe_finite(self.y3, 0.0);
        (self.y3 * (1.0 + resonance * 0.45)).tanh()
    }
}

fn sanitize_params(params: AcidBassParams, sample_rate: f64) -> SanitizedAcidBassParams {
    SanitizedAcidBassParams {
        freq: clamp(safe_finite(params.freq, 110.0), 1e-6, sample_rate * 0.45),
        cutoff: clamp(safe_finite(params.cutoff, 760.0), 20.0, sample_rate * 0.45),
        resonance: clamp(safe_finite(params.resonance, 0.58), 0.0, 1.0),
        env_mod: clamp(safe_finite(params.env_mod, 0.62), 0.0, 1.0),
        decay: clamp(safe_finite(params.decay, 0.22), 0.006, 3.0),
        accent: clamp(safe_finite(params.accent, 0.0), 0.0, 1.0),
        slide: clamp(safe_finite(params.slide, 0.0), 0.0, 1.0),
        drive: clamp(safe_finite(params.drive, 0.18), 0.0, 1.0),
        level: clamp(safe_finite(params.level, 1.0), 0.0, 8.0),
        velocity: clamp(safe_finite(params.velocity, 1.0), 0.0, 1.0),
    }
}

fn cutoff_from_envelope(cutoff: f64, env_mod: f64, env: f64, accent: f64) -> f64 {
    let octaves = env * (env_mod * 3.6 + accent * 1.4);
    cutoff * 2.0_f64.powf(octaves)
}

fn gate_envelope(t: f64, gate_sec: Option<f64>) -> f64 {
    let gate_sec = gate_sec
        .filter(|value| value.is_finite() && *value >= 0.0)
        .unwrap_or(f64::INFINITY);
    if t < gate_sec {
        1.0
    } else {
        (-(t - gate_sec) / 0.012).exp()
    }
}

#[cfg(test)]
mod tests;

use crate::ensemble_chorus::{EnsembleChorusParams, EnsembleChorusState};
use crate::filter::OnePoleLowpass;
use crate::math::{clamp, safe_finite, TAU};
use crate::oscillator::{sample_waveform, wrap_phase, Waveform};

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
const REGISTER_RATIOS: [f64; 4] = [0.5, 1.0, 2.0, 4.0];

#[derive(Clone, Copy, Debug)]
pub struct StringMachineParams {
    pub freq: f64,
    pub detune: f64,
    pub attack: f64,
    pub release: f64,
    pub tone: f64,
    pub depth: f64,
    pub modulation: f64,
    pub width: f64,
    pub level: f64,
    pub velocity: f64,
}

impl Default for StringMachineParams {
    fn default() -> Self {
        Self {
            freq: 220.0,
            detune: 7.0,
            attack: 0.18,
            release: 0.8,
            tone: 0.72,
            depth: 0.72,
            modulation: 0.46,
            width: 1.0,
            level: 1.0,
            velocity: 1.0,
        }
    }
}

#[derive(Clone, Copy)]
struct SanitizedStringMachineParams {
    freq: f64,
    detune: f64,
    attack: f64,
    release: f64,
    tone: f64,
    depth: f64,
    modulation: f64,
    width: f64,
    level: f64,
    velocity: f64,
}

pub struct StringMachineState {
    phases: [f64; 4],
    triangles: [f64; 4],
    frame: usize,
    left_tone: OnePoleLowpass,
    right_tone: OnePoleLowpass,
    ensemble: EnsembleChorusState,
}

impl StringMachineState {
    pub fn new(sample_rate: f64) -> Self {
        Self {
            phases: [0.0; 4],
            triangles: [0.0; 4],
            frame: 0,
            left_tone: OnePoleLowpass::default(),
            right_tone: OnePoleLowpass::default(),
            ensemble: EnsembleChorusState::new(sanitize_sample_rate(sample_rate)),
        }
    }

    pub fn clear(&mut self) {
        self.phases = [0.0; 4];
        self.triangles = [0.0; 4];
        self.frame = 0;
        self.left_tone.reset(0.0);
        self.right_tone.reset(0.0);
        self.ensemble.clear();
    }

    pub fn frame(&self) -> usize {
        self.frame
    }

    pub fn process(
        &mut self,
        params: StringMachineParams,
        sample_rate: f64,
        gate_sec: Option<f64>,
    ) -> (f32, f32) {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let params = sanitize_params(params, sample_rate);
        let t = self.frame as f64 / sample_rate;
        let env = amp_envelope(t, gate_sec, params.attack, params.release);
        let dry = self.render_divide_down_core(params, sample_rate);
        let gain = env * params.level * params.velocity * 0.72;
        self.frame = self.frame.saturating_add(1);

        let cutoff = tone_cutoff(params.tone, sample_rate);
        self.left_tone.set_cutoff(cutoff, sample_rate);
        self.right_tone.set_cutoff(cutoff, sample_rate);
        let left = self.left_tone.process((dry.0 * gain).tanh());
        let right = self.right_tone.process((dry.1 * gain).tanh());
        self.ensemble.process(
            left as f32,
            right as f32,
            ensemble_params(params),
            sample_rate,
        )
    }

    fn render_divide_down_core(
        &mut self,
        params: SanitizedStringMachineParams,
        sample_rate: f64,
    ) -> (f64, f64) {
        let time = self.frame as f64 / sample_rate;
        let slow = (TAU * (0.07 + params.modulation * 0.23) * time).sin();
        let fast = (TAU * (0.31 + params.modulation * 0.67) * time + 1.7).sin();
        let drift_cents = params.modulation * (1.8 * slow + 0.7 * fast);
        let detune = params.detune + drift_cents;
        let tone_bright = 0.35 + params.tone * 0.65;
        let gains = [
            0.26 * (1.0 - params.tone * 0.35),
            0.52,
            0.31 * tone_bright,
            0.12 * params.tone * params.tone,
        ];

        let mut left = 0.0;
        let mut right = 0.0;
        let mut norm = 0.0;
        for index in 0..REGISTER_RATIOS.len() {
            let ratio = REGISTER_RATIOS[index];
            let base = params.freq * ratio;
            let spread = if index % 2 == 0 { -detune } else { detune };
            let left_freq = base * 2.0_f64.powf((spread * params.width) / 1200.0);
            let right_freq = base * 2.0_f64.powf((-spread * params.width) / 1200.0);
            let sample = self.register_sample(index, base, sample_rate);
            let shimmer_l = self.alias_sideband(index, left_freq, sample_rate, 0.25 * params.width);
            let shimmer_r =
                self.alias_sideband(index, right_freq, sample_rate, 0.75 * params.width);
            let gain = gains[index];
            left += (sample * 0.78 + shimmer_l * 0.22) * gain;
            right += (sample * 0.78 + shimmer_r * 0.22) * gain;
            norm += gain;
        }

        if norm > 0.0 {
            left /= norm;
            right /= norm;
        }
        (left, right)
    }

    fn register_sample(&mut self, index: usize, freq: f64, sample_rate: f64) -> f64 {
        let step = clamp(freq / sample_rate, 0.0, 0.48);
        let saw = sample_waveform(
            Waveform::Saw,
            self.phases[index],
            step,
            &mut self.triangles[index],
        );
        let pulse = sample_waveform(
            Waveform::Square,
            wrap_phase(self.phases[index] + 0.18),
            step,
            &mut self.triangles[index],
        );
        self.phases[index] = wrap_phase(self.phases[index] + step);
        saw * 0.72 + pulse * 0.28
    }

    fn alias_sideband(&self, index: usize, freq: f64, sample_rate: f64, phase_offset: f64) -> f64 {
        let phase = wrap_phase(self.phases[index] + phase_offset);
        let fold = (freq / sample_rate).min(0.49);
        (TAU * (phase + fold * 0.5)).sin()
    }
}

fn ensemble_params(params: SanitizedStringMachineParams) -> EnsembleChorusParams {
    EnsembleChorusParams {
        rate_hz: 0.28 + params.modulation * 0.52,
        depth_ms: 2.4 + params.modulation * 6.2,
        mix: params.depth,
        width: params.width,
        tone: params.tone,
        noise: 0.0,
    }
}

fn sanitize_params(params: StringMachineParams, sample_rate: f64) -> SanitizedStringMachineParams {
    SanitizedStringMachineParams {
        freq: clamp(safe_finite(params.freq, 220.0), 1e-6, sample_rate * 0.45),
        detune: clamp(safe_finite(params.detune, 7.0), 0.0, 50.0),
        attack: clamp(safe_finite(params.attack, 0.18), 0.0, 5.0),
        release: clamp(safe_finite(params.release, 0.8), 0.005, 10.0),
        tone: clamp(safe_finite(params.tone, 0.72), 0.0, 1.0),
        depth: clamp(safe_finite(params.depth, 0.72), 0.0, 1.0),
        modulation: clamp(safe_finite(params.modulation, 0.46), 0.0, 1.0),
        width: clamp(safe_finite(params.width, 1.0), 0.0, 1.0),
        level: clamp(safe_finite(params.level, 1.0), 0.0, 8.0),
        velocity: clamp(safe_finite(params.velocity, 1.0), 0.0, 1.0),
    }
}

fn amp_envelope(t: f64, gate_sec: Option<f64>, attack: f64, release: f64) -> f64 {
    let gate_sec = gate_sec
        .filter(|value| value.is_finite() && *value >= 0.0)
        .unwrap_or(f64::INFINITY);
    let attack_level = attack_curve(t.min(gate_sec), attack);
    if t < gate_sec {
        attack_level
    } else {
        attack_level * (-(t - gate_sec) / release).exp()
    }
}

fn attack_curve(t: f64, attack: f64) -> f64 {
    if attack <= 0.0 {
        1.0
    } else {
        1.0 - (-t / attack).exp()
    }
}

fn tone_cutoff(tone: f64, sample_rate: f64) -> f64 {
    let min = 1_100.0;
    let max = (sample_rate * 0.42).min(14_000.0).max(min);
    min + tone * tone * (max - min)
}

fn sanitize_sample_rate(sample_rate: f64) -> f64 {
    if sample_rate.is_finite() && sample_rate > 0.0 {
        sample_rate
    } else {
        DEFAULT_SAMPLE_RATE
    }
}

#[cfg(test)]
mod tests;

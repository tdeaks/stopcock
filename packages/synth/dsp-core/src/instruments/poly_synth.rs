use crate::ensemble_chorus::{EnsembleChorusParams, EnsembleChorusState};
use crate::envelope::adsr_at;
use crate::math::{clamp, safe_finite, TAU};
use crate::noise::Mulberry32;
use crate::oscillator::{sample_waveform, wrap_phase, Waveform};

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
const NOISE_SEED: u32 = 0x506F_6C79;

#[derive(Clone, Copy, Debug)]
pub struct PolySynthParams {
    pub freq: f64,
    pub detune: f64,
    pub pulse_width: f64,
    pub sub: f64,
    pub noise: f64,
    pub cutoff: f64,
    pub resonance: f64,
    pub env_mod: f64,
    pub attack: f64,
    pub decay: f64,
    pub sustain: f64,
    pub release: f64,
    pub drive: f64,
    pub chorus: f64,
    pub modulation: f64,
    pub width: f64,
    pub level: f64,
    pub velocity: f64,
}

impl Default for PolySynthParams {
    fn default() -> Self {
        Self {
            freq: 220.0,
            detune: 4.0,
            pulse_width: 0.48,
            sub: 0.32,
            noise: 0.03,
            cutoff: 1_800.0,
            resonance: 0.28,
            env_mod: 0.36,
            attack: 0.006,
            decay: 0.28,
            sustain: 0.68,
            release: 0.36,
            drive: 0.12,
            chorus: 0.38,
            modulation: 0.18,
            width: 0.9,
            level: 1.0,
            velocity: 1.0,
        }
    }
}

#[derive(Clone, Copy)]
struct SanitizedPolySynthParams {
    freq: f64,
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
    velocity: f64,
}

pub struct PolySynthState {
    saw_phase: f64,
    pulse_phase: f64,
    sub_phase: f64,
    saw_triangle: f64,
    pwm_phase: f64,
    frame: usize,
    rng: Mulberry32,
    filter: PolyLowpassState,
    chorus: EnsembleChorusState,
}

impl PolySynthState {
    pub fn new(sample_rate: f64) -> Self {
        Self {
            saw_phase: 0.0,
            pulse_phase: 0.0,
            sub_phase: 0.0,
            saw_triangle: 0.0,
            pwm_phase: 0.0,
            frame: 0,
            rng: Mulberry32::new(NOISE_SEED),
            filter: PolyLowpassState::default(),
            chorus: EnsembleChorusState::new(sanitize_sample_rate(sample_rate)),
        }
    }

    pub fn clear(&mut self) {
        self.saw_phase = 0.0;
        self.pulse_phase = 0.0;
        self.sub_phase = 0.0;
        self.saw_triangle = 0.0;
        self.pwm_phase = 0.0;
        self.frame = 0;
        self.rng = Mulberry32::new(NOISE_SEED);
        self.filter.clear();
        self.chorus.clear();
    }

    pub fn frame(&self) -> usize {
        self.frame
    }

    pub fn process(
        &mut self,
        params: PolySynthParams,
        sample_rate: f64,
        gate_sec: Option<f64>,
    ) -> (f32, f32) {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let params = sanitize_params(params, sample_rate);
        let t = self.frame as f64 / sample_rate;
        let gate_sec = sanitize_gate(gate_sec);
        let amp_env = adsr_at(
            t,
            gate_sec,
            params.attack,
            params.decay,
            params.sustain,
            params.release,
        );
        let filter_env = filter_envelope(t, gate_sec, params);
        let raw = self.render_dco(params, sample_rate);
        let cutoff = filter_cutoff(params, filter_env, sample_rate);
        let filtered =
            self.filter
                .process(raw, cutoff, params.resonance, params.drive, sample_rate);
        let gain = amp_env * params.velocity * params.level * 0.78;
        let driven = (filtered * gain * (1.0 + params.drive * 0.8)).tanh() as f32;
        self.frame = self.frame.saturating_add(1);

        self.chorus
            .process(driven, driven, chorus_params(params), sample_rate)
    }

    fn render_dco(&mut self, params: SanitizedPolySynthParams, sample_rate: f64) -> f64 {
        let drift = 1.0 + 0.000_35 * (self.pwm_phase * 0.19 + 0.4).sin();
        let saw_freq = params.freq * drift * 2.0_f64.powf(-params.detune * 0.5 / 1200.0);
        let pulse_freq = params.freq * drift * 2.0_f64.powf(params.detune * 0.5 / 1200.0);
        let saw_step = clamp(saw_freq / sample_rate, 0.0, 0.48);
        let pulse_step = clamp(pulse_freq / sample_rate, 0.0, 0.48);
        let sub_step = clamp(params.freq * 0.5 / sample_rate, 0.0, 0.48);
        let pwm_depth = params.modulation * 0.36;
        let pulse_width = clamp(
            params.pulse_width + self.pwm_phase.sin() * pwm_depth,
            0.04,
            0.96,
        );

        let saw = sample_waveform(
            Waveform::Saw,
            self.saw_phase,
            saw_step,
            &mut self.saw_triangle,
        );
        let pulse = sample_pulse(self.pulse_phase, pulse_width, pulse_step);
        let sub = sample_pulse(self.sub_phase, 0.5, sub_step);
        let noise = self.rng.next_f64() * 2.0 - 1.0;

        self.saw_phase = wrap_phase(self.saw_phase + saw_step);
        self.pulse_phase = wrap_phase(self.pulse_phase + pulse_step);
        self.sub_phase = wrap_phase(self.sub_phase + sub_step);
        self.pwm_phase =
            (self.pwm_phase + TAU * pwm_rate(params.modulation) / sample_rate).rem_euclid(TAU);

        let saw_gain = 0.58;
        let pulse_gain = 0.46;
        let sub_gain = params.sub * 0.58;
        let noise_gain = params.noise * 0.34;
        let norm = saw_gain + pulse_gain + sub_gain + noise_gain;
        (saw * saw_gain + pulse * pulse_gain + sub * sub_gain + noise * noise_gain) / norm
    }
}

#[derive(Default)]
struct PolyLowpassState {
    poles: [f64; 4],
}

impl PolyLowpassState {
    fn clear(&mut self) {
        self.poles = [0.0; 4];
    }

    fn process(
        &mut self,
        input: f64,
        cutoff: f64,
        resonance: f64,
        drive: f64,
        sample_rate: f64,
    ) -> f64 {
        let cutoff = clamp(safe_finite(cutoff, 1_800.0), 20.0, sample_rate * 0.45);
        let g = 1.0 - (-TAU * cutoff / sample_rate).exp();
        let feedback = resonance * 3.78;
        let pre_drive = 1.0 + drive * 3.2;
        let mut x = (input * pre_drive - self.poles[3] * feedback).tanh();
        for pole in &mut self.poles {
            *pole += g * (x - *pole);
            *pole = safe_finite(*pole, 0.0);
            x = *pole;
        }
        (self.poles[3] * (1.0 + resonance * 0.62)).tanh()
    }
}

fn sanitize_params(params: PolySynthParams, sample_rate: f64) -> SanitizedPolySynthParams {
    SanitizedPolySynthParams {
        freq: clamp(safe_finite(params.freq, 220.0), 1e-6, sample_rate * 0.45),
        detune: clamp(safe_finite(params.detune, 4.0), -50.0, 50.0),
        pulse_width: clamp(safe_finite(params.pulse_width, 0.48), 0.04, 0.96),
        sub: clamp(safe_finite(params.sub, 0.32), 0.0, 1.0),
        noise: clamp(safe_finite(params.noise, 0.03), 0.0, 1.0),
        cutoff: clamp(
            safe_finite(params.cutoff, 1_800.0),
            20.0,
            sample_rate * 0.45,
        ),
        resonance: clamp(safe_finite(params.resonance, 0.28), 0.0, 1.0),
        env_mod: clamp(safe_finite(params.env_mod, 0.36), -1.0, 1.0),
        attack: clamp(safe_finite(params.attack, 0.006), 0.0, 6.0),
        decay: clamp(safe_finite(params.decay, 0.28), 0.0, 12.0),
        sustain: clamp(safe_finite(params.sustain, 0.68), 0.0, 1.0),
        release: clamp(safe_finite(params.release, 0.36), 0.0, 12.0),
        drive: clamp(safe_finite(params.drive, 0.12), 0.0, 1.0),
        chorus: clamp(safe_finite(params.chorus, 0.38), 0.0, 1.0),
        modulation: clamp(safe_finite(params.modulation, 0.18), 0.0, 1.0),
        width: clamp(safe_finite(params.width, 0.9), 0.0, 1.0),
        level: clamp(safe_finite(params.level, 1.0), 0.0, 8.0),
        velocity: clamp(safe_finite(params.velocity, 1.0), 0.0, 1.0),
    }
}

fn sanitize_sample_rate(sample_rate: f64) -> f64 {
    safe_finite(sample_rate, DEFAULT_SAMPLE_RATE).max(1.0)
}

fn sanitize_gate(gate_sec: Option<f64>) -> f64 {
    gate_sec
        .filter(|value| value.is_finite() && *value >= 0.0)
        .unwrap_or(f64::INFINITY)
}

fn filter_envelope(t: f64, gate_sec: f64, params: SanitizedPolySynthParams) -> f64 {
    adsr_at(
        t,
        gate_sec,
        params.attack * 0.6,
        params.decay.max(0.001),
        params.sustain,
        params.release.max(0.001),
    )
}

fn filter_cutoff(params: SanitizedPolySynthParams, envelope: f64, sample_rate: f64) -> f64 {
    let key_follow = clamp((params.freq / 440.0).sqrt(), 0.35, 2.2);
    let sweep = params.env_mod * envelope * 4.2;
    clamp(
        params.cutoff * key_follow * 2.0_f64.powf(sweep),
        20.0,
        sample_rate * 0.45,
    )
}

fn chorus_params(params: SanitizedPolySynthParams) -> EnsembleChorusParams {
    EnsembleChorusParams {
        rate_hz: 0.28 + params.modulation * 0.62,
        depth_ms: 2.0 + params.chorus * 5.8,
        mix: params.chorus,
        width: params.width,
        tone: 0.78 + params.cutoff.min(8_000.0) / 8_000.0 * 0.18,
        noise: 0.0,
    }
}

fn pwm_rate(modulation: f64) -> f64 {
    0.16 + modulation * 1.35
}

#[inline]
fn sample_pulse(phase: f64, width: f64, dt: f64) -> f64 {
    let t = wrap_phase(phase);
    let width = clamp(width, 0.04, 0.96);
    let mut value = if t < width { 1.0 } else { -1.0 };
    value += poly_blep(t, dt);
    value -= poly_blep(wrap_phase(t + 1.0 - width), dt);
    value
}

#[inline]
fn poly_blep(t: f64, dt: f64) -> f64 {
    if dt <= 0.0 {
        0.0
    } else if t < dt {
        let x = t / dt;
        x + x - x * x - 1.0
    } else if t > 1.0 - dt {
        let x = (t - 1.0) / dt;
        x * x + x + x + 1.0
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests;

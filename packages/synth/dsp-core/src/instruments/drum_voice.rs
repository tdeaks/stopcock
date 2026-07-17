use crate::math::{clamp, safe_finite};
use crate::noise::Mulberry32;
use crate::oscillator::{sample_waveform, wrap_phase, Waveform};

const RNG_SEED: u32 = 0xD8A7_808D;
const HAT_RATIOS: [f64; 6] = [1.0, 1.342, 1.819, 2.491, 3.317, 4.214];
const HAT_GAINS: [f64; 6] = [0.34, 0.29, 0.23, 0.19, 0.15, 0.12];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DrumVoiceKind {
    Kick,
    Snare,
    Hat,
}

impl DrumVoiceKind {
    pub fn from_optional(kind: Option<&str>) -> Self {
        match kind {
            Some("snare") => Self::Snare,
            Some("hat") => Self::Hat,
            Some("kick") | None => Self::Kick,
            Some(_) => Self::Kick,
        }
    }

    fn default_freq(self) -> f64 {
        match self {
            Self::Kick => 55.0,
            Self::Snare => 180.0,
            Self::Hat => 720.0,
        }
    }

    fn default_decay(self) -> f64 {
        match self {
            Self::Kick => 0.52,
            Self::Snare => 0.28,
            Self::Hat => 0.12,
        }
    }

    fn default_tone(self) -> f64 {
        match self {
            Self::Kick => 0.58,
            Self::Snare => 0.62,
            Self::Hat => 0.78,
        }
    }

    fn default_snap(self) -> f64 {
        match self {
            Self::Kick => 0.48,
            Self::Snare => 0.58,
            Self::Hat => 0.34,
        }
    }

    fn default_noise(self) -> f64 {
        match self {
            Self::Kick => 0.05,
            Self::Snare => 0.68,
            Self::Hat => 0.38,
        }
    }
}

#[derive(Clone, Copy)]
pub struct DrumVoiceParams {
    pub freq: f64,
    pub decay: f64,
    pub tone: f64,
    pub snap: f64,
    pub noise: f64,
    pub drive: f64,
    pub level: f64,
    pub velocity: f64,
}

impl Default for DrumVoiceParams {
    fn default() -> Self {
        Self {
            freq: DrumVoiceKind::Kick.default_freq(),
            decay: DrumVoiceKind::Kick.default_decay(),
            tone: DrumVoiceKind::Kick.default_tone(),
            snap: DrumVoiceKind::Kick.default_snap(),
            noise: DrumVoiceKind::Kick.default_noise(),
            drive: 0.16,
            level: 1.0,
            velocity: 1.0,
        }
    }
}

#[derive(Clone, Copy)]
struct SanitizedDrumVoiceParams {
    freq: f64,
    decay: f64,
    tone: f64,
    snap: f64,
    noise: f64,
    drive: f64,
    level: f64,
    velocity: f64,
}

pub struct DrumVoiceState {
    phases: [f64; 6],
    triangles: [f64; 6],
    frame: usize,
    rng: Mulberry32,
    noise_low_a: OnePoleState,
    noise_low_b: OnePoleState,
}

impl Default for DrumVoiceState {
    fn default() -> Self {
        Self::new()
    }
}

impl DrumVoiceState {
    pub fn new() -> Self {
        Self {
            phases: [0.0; 6],
            triangles: [0.0; 6],
            frame: 0,
            rng: Mulberry32::new(RNG_SEED),
            noise_low_a: OnePoleState::default(),
            noise_low_b: OnePoleState::default(),
        }
    }

    pub fn clear(&mut self) {
        self.phases = [0.0; 6];
        self.triangles = [0.0; 6];
        self.frame = 0;
        self.rng = Mulberry32::new(RNG_SEED);
        self.noise_low_a.clear();
        self.noise_low_b.clear();
    }

    pub fn frame(&self) -> usize {
        self.frame
    }

    pub fn process(
        &mut self,
        kind: DrumVoiceKind,
        params: DrumVoiceParams,
        sample_rate: f64,
        gate_sec: Option<f64>,
    ) -> f32 {
        let sample_rate = safe_finite(sample_rate, 48_000.0).max(1.0);
        let params = sanitize_params(kind, params, sample_rate);
        let t = self.frame as f64 / sample_rate;
        let gate = gate_envelope(t, gate_sec, params.decay);
        let sample = match kind {
            DrumVoiceKind::Kick => self.process_kick(params, sample_rate, t),
            DrumVoiceKind::Snare => self.process_snare(params, sample_rate, t),
            DrumVoiceKind::Hat => self.process_hat(params, sample_rate, t),
        };
        self.frame = self.frame.saturating_add(1);
        shape_output(sample * gate * params.velocity * params.level, params.drive) as f32
    }

    fn process_kick(&mut self, params: SanitizedDrumVoiceParams, sample_rate: f64, t: f64) -> f64 {
        let pitch_tau = 0.018 + params.snap * 0.052;
        let pitch_env = (-t / pitch_tau).exp();
        let amp_env = (-t / params.decay).exp();
        let transient_env = (-t / (0.0018 + params.snap * 0.006)).exp();
        let freq = params.freq * (1.0 + params.snap * 5.2 * pitch_env);
        let step = clamp(freq / sample_rate, 0.0, 0.48);
        let body = (self.phases[0] * std::f64::consts::TAU).sin();
        self.phases[0] = wrap_phase(self.phases[0] + step);

        let click_noise = self.white_noise() * params.noise * transient_env;
        let click_tone = pitch_env * transient_env * params.snap * 0.42;
        body * amp_env + click_tone + click_noise
    }

    fn process_snare(&mut self, params: SanitizedDrumVoiceParams, sample_rate: f64, t: f64) -> f64 {
        let pitch_env = (-t / (0.018 + params.snap * 0.12)).exp();
        let body_env = (-t / (params.decay * 0.82).max(0.01)).exp();
        let noise_env = (-t / (0.07 + params.decay * 1.15)).exp();
        let transient_env = (-t / (0.004 + params.snap * 0.01)).exp();
        let body_freq = params.freq * (1.0 + params.snap * 1.5 * pitch_env);
        let upper_freq = body_freq * 1.47;
        let body = self.sine_voice(0, body_freq, sample_rate) * 0.66
            + self.sine_voice(1, upper_freq, sample_rate) * 0.34;
        let noise_cutoff = 1_200.0 + params.tone * 11_000.0;
        let snappy = self.filtered_noise(noise_cutoff, 260.0 + params.tone * 1_400.0, sample_rate);
        let noise_gain = 0.22 + params.noise * 0.95;
        let body_gain = 0.85 - params.noise * 0.32;

        body * body_env * body_gain
            + snappy * noise_env * noise_gain
            + snappy * transient_env * params.snap * 0.35
    }

    fn process_hat(&mut self, params: SanitizedDrumVoiceParams, sample_rate: f64, t: f64) -> f64 {
        let amp_env = (-t / params.decay).exp();
        let transient_env = (-t / (0.002 + params.snap * 0.006)).exp();
        let metal = self.metallic_square_bank(params.freq, sample_rate);
        let high_noise = self.filtered_noise(
            6_000.0 + params.tone * 12_000.0,
            1_600.0 + params.tone * 5_200.0,
            sample_rate,
        );
        let source = metal * (1.0 - params.noise * 0.45) + high_noise * params.noise;

        source * amp_env + high_noise * transient_env * params.snap * 0.38
    }

    fn sine_voice(&mut self, index: usize, freq: f64, sample_rate: f64) -> f64 {
        let step = clamp(freq / sample_rate, 0.0, 0.48);
        let out = (self.phases[index] * std::f64::consts::TAU).sin();
        self.phases[index] = wrap_phase(self.phases[index] + step);
        out
    }

    fn metallic_square_bank(&mut self, freq: f64, sample_rate: f64) -> f64 {
        let mut sum = 0.0;
        for index in 0..HAT_RATIOS.len() {
            let adjusted = freq * HAT_RATIOS[index];
            let step = clamp(adjusted / sample_rate, 0.0, 0.48);
            let sample = sample_waveform(
                Waveform::Square,
                self.phases[index],
                step,
                &mut self.triangles[index],
            );
            self.phases[index] = wrap_phase(self.phases[index] + step);
            sum += sample * HAT_GAINS[index];
        }
        sum * 0.55
    }

    fn filtered_noise(
        &mut self,
        lowpass_cutoff: f64,
        highpass_cutoff: f64,
        sample_rate: f64,
    ) -> f64 {
        let white = self.white_noise();
        let low =
            self.noise_low_a
                .lowpass(white, lowpass_cutoff.min(sample_rate * 0.45), sample_rate);
        let high_low =
            self.noise_low_b
                .lowpass(low, highpass_cutoff.min(sample_rate * 0.45), sample_rate);
        low - high_low
    }

    fn white_noise(&mut self) -> f64 {
        self.rng.next_f64() * 2.0 - 1.0
    }
}

#[derive(Clone, Copy, Default)]
struct OnePoleState {
    z: f64,
}

impl OnePoleState {
    fn clear(&mut self) {
        self.z = 0.0;
    }

    fn lowpass(&mut self, input: f64, cutoff: f64, sample_rate: f64) -> f64 {
        let cutoff = clamp(safe_finite(cutoff, 1_000.0), 20.0, sample_rate * 0.45);
        let g = 1.0 - (-std::f64::consts::TAU * cutoff / sample_rate).exp();
        self.z += g * (input - self.z);
        self.z = safe_finite(self.z, 0.0);
        self.z
    }
}

fn sanitize_params(
    kind: DrumVoiceKind,
    params: DrumVoiceParams,
    sample_rate: f64,
) -> SanitizedDrumVoiceParams {
    SanitizedDrumVoiceParams {
        freq: clamp(
            safe_finite(params.freq, kind.default_freq()),
            1e-6,
            sample_rate * 0.45,
        ),
        decay: clamp(safe_finite(params.decay, kind.default_decay()), 0.006, 3.0),
        tone: clamp(safe_finite(params.tone, kind.default_tone()), 0.0, 1.0),
        snap: clamp(safe_finite(params.snap, kind.default_snap()), 0.0, 1.0),
        noise: clamp(safe_finite(params.noise, kind.default_noise()), 0.0, 1.0),
        drive: clamp(safe_finite(params.drive, 0.16), 0.0, 1.0),
        level: clamp(safe_finite(params.level, 1.0), 0.0, 8.0),
        velocity: clamp(safe_finite(params.velocity, 1.0), 0.0, 1.0),
    }
}

fn gate_envelope(t: f64, gate_sec: Option<f64>, decay: f64) -> f64 {
    let gate_sec = gate_sec
        .filter(|value| value.is_finite() && *value >= 0.0)
        .unwrap_or(f64::INFINITY);
    if t < gate_sec {
        1.0
    } else {
        (-(t - gate_sec) / (decay * 0.08).max(0.004)).exp()
    }
}

fn shape_output(sample: f64, drive: f64) -> f64 {
    let pre_gain = 1.0 + drive * 5.5;
    let compensation = 1.0 / (1.0 + drive * 1.8);
    clamp((sample * pre_gain).tanh() * compensation, -1.2, 1.2)
}

#[cfg(test)]
mod tests;

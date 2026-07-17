use crate::delay::DelayLine;
use crate::filter::OnePoleLowpass;
use crate::math::{clamp, safe_finite, TAU};
use crate::noise::Mulberry32;

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
const BASE_DELAY_MS: f64 = 7.0;

#[derive(Clone, Copy, Debug)]
pub struct EnsembleChorusParams {
    pub rate_hz: f64,
    pub depth_ms: f64,
    pub mix: f64,
    pub width: f64,
    pub tone: f64,
    pub noise: f64,
}

impl EnsembleChorusParams {
    fn sanitized(self) -> Self {
        Self {
            rate_hz: clamp(safe_finite(self.rate_hz, 0.4), 0.0, 15.0),
            depth_ms: clamp(safe_finite(self.depth_ms, 4.44), 0.0, 10.0),
            mix: clamp(safe_finite(self.mix, 0.5), 0.0, 1.0),
            width: clamp(safe_finite(self.width, 1.0), 0.0, 1.0),
            tone: clamp(safe_finite(self.tone, 0.82), 0.0, 1.0),
            noise: clamp(safe_finite(self.noise, 0.0), 0.0, 1.0),
        }
    }
}

impl Default for EnsembleChorusParams {
    fn default() -> Self {
        Self {
            rate_hz: 0.4,
            depth_ms: 4.44,
            mix: 0.5,
            width: 1.0,
            tone: 0.82,
            noise: 0.0,
        }
    }
}

pub struct EnsembleChorusState {
    left_delay: DelayLine,
    right_delay: DelayLine,
    left_tone: OnePoleLowpass,
    right_tone: OnePoleLowpass,
    rng: Mulberry32,
    seed: u32,
    phase: f64,
}

impl EnsembleChorusState {
    pub fn new(sample_rate: f64) -> Self {
        Self::with_seed(sample_rate, 0xC60C_6F15)
    }

    pub fn with_seed(sample_rate: f64, seed: u32) -> Self {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let max_delay = (sample_rate * 0.08).ceil().max(2.0) as usize;
        Self {
            left_delay: DelayLine::new(max_delay),
            right_delay: DelayLine::new(max_delay),
            left_tone: OnePoleLowpass::default(),
            right_tone: OnePoleLowpass::default(),
            rng: Mulberry32::new(seed),
            seed,
            phase: 0.0,
        }
    }

    pub fn clear(&mut self) {
        self.left_delay.clear();
        self.right_delay.clear();
        self.left_tone.reset(0.0);
        self.right_tone.reset(0.0);
        self.rng = Mulberry32::new(self.seed);
        self.phase = 0.0;
    }

    pub fn process(
        &mut self,
        input_l: f32,
        input_r: f32,
        params: EnsembleChorusParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        let params = params.sanitized();
        let sample_rate = sanitize_sample_rate(sample_rate);
        let phase_offset = std::f64::consts::PI * params.width;
        let lfo_l = self.phase.sin();
        let lfo_r = (self.phase + phase_offset).sin();
        let mono = (input_l + input_r) * 0.5;
        let wet_l = self.process_side(mono, params, lfo_l, sample_rate, true);
        let wet_r = self.process_side(mono, params, lfo_r, sample_rate, false);
        self.left_delay.push(mono);
        self.right_delay.push(mono);
        self.phase = (self.phase + TAU * params.rate_hz / sample_rate).rem_euclid(TAU);

        let mix_angle = params.mix * std::f64::consts::FRAC_PI_2;
        let dry_gain = mix_angle.cos() as f32;
        let wet_gain = mix_angle.sin() as f32;
        (
            clamp(
                input_l as f64 * dry_gain as f64 + wet_l as f64 * wet_gain as f64,
                -4.0,
                4.0,
            ) as f32,
            clamp(
                input_r as f64 * dry_gain as f64 + wet_r as f64 * wet_gain as f64,
                -4.0,
                4.0,
            ) as f32,
        )
    }

    fn process_side(
        &mut self,
        input: f32,
        params: EnsembleChorusParams,
        lfo: f64,
        sample_rate: f64,
        left: bool,
    ) -> f32 {
        let delay_ms = BASE_DELAY_MS + params.depth_ms * (0.5 + 0.5 * lfo);
        let delay_samples = delay_ms * sample_rate / 1000.0;
        let delay = if left {
            &self.left_delay
        } else {
            &self.right_delay
        };
        let tone = if left {
            &mut self.left_tone
        } else {
            &mut self.right_tone
        };
        let mut wet = delay.read_linear(delay_samples);
        wet += bbd_noise(&mut self.rng, params.noise, lfo);
        tone.set_cutoff(tone_cutoff(params.tone, sample_rate), sample_rate);
        tone.process(input as f64 * 0.02 + wet * 0.98) as f32
    }
}

fn bbd_noise(rng: &mut Mulberry32, amount: f64, lfo: f64) -> f64 {
    let amount = clamp(safe_finite(amount, 0.0), 0.0, 1.0);
    if amount <= 0.0 {
        return 0.0;
    }
    let level = amount * 0.004 * (0.35 + 0.65 * lfo.abs());
    (rng.next_f64() * 2.0 - 1.0) * level
}

fn tone_cutoff(tone: f64, sample_rate: f64) -> f64 {
    let tone = clamp(safe_finite(tone, 0.82), 0.0, 1.0);
    let min = 900.0;
    let max = (sample_rate * 0.42).min(16_000.0).max(min);
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
mod tests {
    use super::*;

    #[test]
    fn ensemble_chorus_zero_mix_returns_dry_stereo() {
        let mut state = EnsembleChorusState::new(48_000.0);
        let params = EnsembleChorusParams {
            mix: 0.0,
            depth_ms: 10.0,
            noise: 1.0,
            ..EnsembleChorusParams::default()
        };

        for input in [-0.75, -0.25, 0.0, 0.25, 0.75] {
            let (left, right) = state.process(input, -input, params, 48_000.0);
            assert!((left - input).abs() < 1e-6);
            assert!((right + input).abs() < 1e-6);
        }
    }

    #[test]
    fn ensemble_chorus_width_spreads_mono_input() {
        let mut state = EnsembleChorusState::new(48_000.0);
        let params = EnsembleChorusParams {
            rate_hz: 0.7,
            depth_ms: 8.0,
            mix: 1.0,
            width: 1.0,
            tone: 1.0,
            ..EnsembleChorusParams::default()
        };
        let mut difference = 0.0;

        for i in 0..4096 {
            let input = (TAU * 220.0 * i as f64 / 48_000.0).sin() as f32;
            let (left, right) = state.process(input, input, params, 48_000.0);
            difference += (left - right).abs();
        }

        assert!(difference > 0.05);
    }

    #[test]
    fn ensemble_chorus_zero_width_keeps_mono_wet_centered() {
        let mut state = EnsembleChorusState::new(48_000.0);
        let params = EnsembleChorusParams {
            rate_hz: 0.7,
            depth_ms: 8.0,
            mix: 1.0,
            width: 0.0,
            tone: 1.0,
            noise: 0.0,
        };

        for i in 0..4096 {
            let input = (TAU * 220.0 * i as f64 / 48_000.0).sin() as f32;
            let (left, right) = state.process(input, input, params, 48_000.0);
            assert!((left - right).abs() < 1e-6);
        }
    }

    #[test]
    fn ensemble_chorus_tone_reduces_fast_alternating_energy() {
        let mut dark = EnsembleChorusState::new(48_000.0);
        let mut bright = EnsembleChorusState::new(48_000.0);
        let dark_params = EnsembleChorusParams {
            rate_hz: 0.0,
            depth_ms: 0.0,
            mix: 1.0,
            tone: 0.0,
            ..EnsembleChorusParams::default()
        };
        let bright_params = EnsembleChorusParams {
            rate_hz: 0.0,
            depth_ms: 0.0,
            mix: 1.0,
            tone: 1.0,
            ..EnsembleChorusParams::default()
        };
        let mut dark_energy = 0.0;
        let mut bright_energy = 0.0;

        for i in 0..2048 {
            let input = if i % 2 == 0 { 0.8 } else { -0.8 };
            dark_energy += dark.process(input, input, dark_params, 48_000.0).0.abs();
            bright_energy += bright
                .process(input, input, bright_params, 48_000.0)
                .0
                .abs();
        }

        assert!(dark_energy < bright_energy * 0.7);
    }

    #[test]
    fn ensemble_chorus_noise_is_deterministic_from_seed() {
        let params = EnsembleChorusParams {
            noise: 1.0,
            mix: 1.0,
            tone: 1.0,
            ..EnsembleChorusParams::default()
        };
        let mut a = EnsembleChorusState::with_seed(48_000.0, 9);
        let mut b = EnsembleChorusState::with_seed(48_000.0, 9);

        for _ in 0..128 {
            assert_eq!(
                a.process(0.2, 0.2, params, 48_000.0),
                b.process(0.2, 0.2, params, 48_000.0)
            );
        }
    }

    #[test]
    fn ensemble_chorus_sanitizes_hostile_params() {
        let mut state = EnsembleChorusState::new(f64::NAN);
        let params = EnsembleChorusParams {
            rate_hz: f64::NAN,
            depth_ms: f64::INFINITY,
            mix: f64::INFINITY,
            width: f64::NAN,
            tone: f64::NAN,
            noise: f64::INFINITY,
        };

        for _ in 0..128 {
            let (left, right) = state.process(0.5, -0.5, params, f64::NAN);
            assert!(left.is_finite());
            assert!(right.is_finite());
            assert!(left.abs() <= 4.0);
            assert!(right.abs() <= 4.0);
        }
    }
}

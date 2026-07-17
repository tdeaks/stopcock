use crate::delay::DelayLine;
use crate::math::{clamp, safe_finite, TAU};

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
const MAX_BASE_DELAY_MS: f64 = 80.0;
const MIN_BASE_DELAY_MS: f64 = 1.0;
const SWEEP_MS: f64 = 32.0;
const MAX_DETUNE_CENTS: f64 = 120.0;

#[derive(Clone, Copy, Debug)]
pub struct MicroPitchParams {
    pub detune_cents: f64,
    pub width: f64,
    pub delay_ms: f64,
    pub mix: f64,
}

impl MicroPitchParams {
    fn sanitized(self) -> Self {
        Self {
            detune_cents: clamp(
                safe_finite(self.detune_cents, 0.0),
                -MAX_DETUNE_CENTS,
                MAX_DETUNE_CENTS,
            ),
            width: clamp(safe_finite(self.width, 1.0), 0.0, 2.0),
            delay_ms: clamp(
                safe_finite(self.delay_ms, 12.0),
                MIN_BASE_DELAY_MS,
                MAX_BASE_DELAY_MS,
            ),
            mix: clamp(safe_finite(self.mix, 0.0), 0.0, 1.0),
        }
    }
}

impl Default for MicroPitchParams {
    fn default() -> Self {
        Self {
            detune_cents: 9.0,
            width: 1.0,
            delay_ms: 12.0,
            mix: 0.35,
        }
    }
}

pub struct MicroPitchState {
    left: PitchShiftDelay,
    right: PitchShiftDelay,
}

impl MicroPitchState {
    pub fn new(sample_rate: f64) -> Self {
        Self {
            left: PitchShiftDelay::new(sample_rate),
            right: PitchShiftDelay::new(sample_rate),
        }
    }

    pub fn clear(&mut self) {
        self.left.clear();
        self.right.clear();
    }

    pub fn process(
        &mut self,
        input_l: f32,
        input_r: f32,
        params: MicroPitchParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        let params = params.sanitized();
        let wet_in = (input_l + input_r) * 0.5;
        let cents = params.detune_cents * params.width;
        let left_wet = self
            .left
            .process(wet_in, -cents, params.delay_ms, sample_rate);
        let right_wet = self
            .right
            .process(wet_in, cents, params.delay_ms, sample_rate);
        let mix = params.mix as f32;
        let dry = 1.0 - mix;
        (
            input_l * dry + left_wet * mix,
            input_r * dry + right_wet * mix,
        )
    }
}

struct PitchShiftDelay {
    delay: DelayLine,
    phase: f64,
}

impl PitchShiftDelay {
    fn new(sample_rate: f64) -> Self {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let capacity_ms = MAX_BASE_DELAY_MS + SWEEP_MS + 4.0;
        let capacity = (sample_rate * capacity_ms / 1000.0).ceil().max(2.0) as usize;
        Self {
            delay: DelayLine::new(capacity),
            phase: 0.0,
        }
    }

    fn clear(&mut self) {
        self.delay.clear();
        self.phase = 0.0;
    }

    fn process(&mut self, input: f32, cents: f64, delay_ms: f64, sample_rate: f64) -> f32 {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let cents = clamp(safe_finite(cents, 0.0), -MAX_DETUNE_CENTS, MAX_DETUNE_CENTS);
        let base = clamp(
            safe_finite(delay_ms, 12.0) * sample_rate / 1000.0,
            1.0,
            (self.delay.len().saturating_sub(2)) as f64,
        );
        let sweep = clamp(
            SWEEP_MS * sample_rate / 1000.0,
            1.0,
            (self.delay.len() as f64 - base - 2.0).max(1.0),
        );

        let shifted = if cents.abs() < 0.001 {
            self.delay.read_linear(base) as f32
        } else {
            let p_a = self.phase;
            let p_b = wrap01(self.phase + 0.5);
            let h_a = hann(p_a);
            let w_a = h_a.sqrt();
            let w_b = (1.0 - h_a).sqrt();
            let wet_a = self
                .delay
                .read_linear(delay_for_phase(base, sweep, p_a, cents));
            let wet_b = self
                .delay
                .read_linear(delay_for_phase(base, sweep, p_b, cents));
            let ratio = 2.0_f64.powf(cents / 1200.0);
            self.phase = wrap01(self.phase + ((ratio - 1.0).abs() / sweep));
            (wet_a * w_a + wet_b * w_b) as f32
        };

        self.delay.push(input);
        shifted
    }
}

fn delay_for_phase(base: f64, sweep: f64, phase: f64, cents: f64) -> f64 {
    if cents >= 0.0 {
        base + (1.0 - phase) * sweep
    } else {
        base + phase * sweep
    }
}

fn hann(phase: f64) -> f64 {
    0.5 - 0.5 * (phase * TAU).cos()
}

fn wrap01(value: f64) -> f64 {
    value - value.floor()
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

    fn non_zero_count(values: impl IntoIterator<Item = f32>) -> usize {
        values
            .into_iter()
            .filter(|sample| sample.abs() > 1e-6)
            .count()
    }

    #[test]
    fn micro_pitch_zero_mix_returns_dry_signal() {
        let mut state = MicroPitchState::new(1_000.0);
        for i in 0..64 {
            let left = (i as f32 * 0.01).sin();
            let right = (i as f32 * 0.02).cos();
            let (out_l, out_r) = state.process(
                left,
                right,
                MicroPitchParams {
                    mix: 0.0,
                    ..MicroPitchParams::default()
                },
                1_000.0,
            );
            assert!((out_l - left).abs() < 1e-7);
            assert!((out_r - right).abs() < 1e-7);
        }
    }

    #[test]
    fn micro_pitch_zero_detune_delays_wet_signal() {
        let mut state = MicroPitchState::new(1_000.0);
        let params = MicroPitchParams {
            detune_cents: 0.0,
            delay_ms: 10.0,
            mix: 1.0,
            ..MicroPitchParams::default()
        };
        let mut left = Vec::with_capacity(16);
        for i in 0..16 {
            let input = if i == 0 { 1.0 } else { 0.0 };
            left.push(state.process(input, input, params, 1_000.0).0);
        }

        assert_eq!(left[9], 0.0);
        assert!((left[10] - 1.0).abs() < 1e-6);
        assert_eq!(left[11], 0.0);
    }

    #[test]
    fn micro_pitch_detuned_mono_input_creates_stereo_difference() {
        let mut state = MicroPitchState::new(48_000.0);
        let params = MicroPitchParams {
            detune_cents: 18.0,
            width: 1.0,
            delay_ms: 14.0,
            mix: 1.0,
        };
        let mut left = Vec::with_capacity(3_000);
        let mut right = Vec::with_capacity(3_000);
        for i in 0..3_000 {
            let input = (i as f64 * 440.0 * TAU / 48_000.0).sin() as f32;
            let (out_l, out_r) = state.process(input, input, params, 48_000.0);
            left.push(out_l);
            right.push(out_r);
        }

        assert!(non_zero_count(left.iter().copied()) > 1_000);
        assert!(non_zero_count(right.iter().copied()) > 1_000);
        assert!(left
            .iter()
            .zip(right.iter())
            .any(|(left, right)| (*left - *right).abs() > 1e-5));
    }

    #[test]
    fn micro_pitch_sanitizes_hostile_params() {
        let mut state = MicroPitchState::new(f64::NAN);
        for _ in 0..128 {
            let (left, right) = state.process(
                0.5,
                -0.5,
                MicroPitchParams {
                    detune_cents: f64::INFINITY,
                    width: f64::NAN,
                    delay_ms: f64::NAN,
                    mix: f64::INFINITY,
                },
                f64::NAN,
            );
            assert!(left.is_finite());
            assert!(right.is_finite());
            assert!(left.abs() <= 1.0);
            assert!(right.abs() <= 1.0);
        }
    }
}

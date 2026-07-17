use crate::delay::DelayLine;
use crate::math::{clamp, safe_finite};
use crate::stereo::equal_power_pan;

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
const DEFAULT_TIME_MS: f64 = 96.0;
const MAX_TIME_MS: f64 = 5_000.0;
const MAX_TAPS: usize = 16;

#[derive(Clone, Copy, Debug)]
pub struct MultiTapDelayTap {
    pub ratio: f64,
    pub gain: f64,
    pub pan: f64,
}

impl MultiTapDelayTap {
    pub fn new(ratio: f64, gain: f64, pan: f64) -> Self {
        Self { ratio, gain, pan }
    }

    fn sanitized(self) -> Self {
        Self {
            ratio: clamp(safe_finite(self.ratio, 1.0), 0.01, 16.0),
            gain: clamp(safe_finite(self.gain, 0.0), -2.0, 2.0),
            pan: clamp(safe_finite(self.pan, 0.0), -1.0, 1.0),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct MultiTapDelayParams {
    pub time_ms: f64,
    pub feedback: f64,
    pub mix: f64,
    pub tone: f64,
    pub width: f64,
}

impl MultiTapDelayParams {
    fn sanitized(self) -> Self {
        Self {
            time_ms: clamp(safe_finite(self.time_ms, DEFAULT_TIME_MS), 1.0, MAX_TIME_MS),
            feedback: clamp(safe_finite(self.feedback, 0.0), -0.95, 0.95),
            mix: clamp(safe_finite(self.mix, 0.0), 0.0, 1.0),
            tone: clamp(safe_finite(self.tone, 0.7), 0.0, 1.0),
            width: clamp(safe_finite(self.width, 1.0), 0.0, 2.0),
        }
    }
}

impl Default for MultiTapDelayParams {
    fn default() -> Self {
        Self {
            time_ms: DEFAULT_TIME_MS,
            feedback: 0.28,
            mix: 0.35,
            tone: 0.72,
            width: 1.0,
        }
    }
}

pub struct MultiTapDelayState {
    left: DelayLine,
    right: DelayLine,
    tone_l: f32,
    tone_r: f32,
}

impl MultiTapDelayState {
    pub fn new(sample_rate: f64) -> Self {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let capacity = (sample_rate * MAX_TIME_MS / 1000.0).ceil().max(2.0) as usize + 2;
        Self {
            left: DelayLine::new(capacity),
            right: DelayLine::new(capacity),
            tone_l: 0.0,
            tone_r: 0.0,
        }
    }

    pub fn clear(&mut self) {
        self.left.clear();
        self.right.clear();
        self.tone_l = 0.0;
        self.tone_r = 0.0;
    }

    pub fn process(
        &mut self,
        input_l: f32,
        input_r: f32,
        params: MultiTapDelayParams,
        taps: &[MultiTapDelayTap],
        sample_rate: f64,
    ) -> (f32, f32) {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let params = params.sanitized();
        let tap_count = taps.len().min(MAX_TAPS);
        if tap_count == 0 {
            self.left.push(input_l);
            self.right.push(input_r);
            return (input_l, input_r);
        }

        let mut wet_l = 0.0_f32;
        let mut wet_r = 0.0_f32;
        let mut gain_sum = 0.0_f64;
        for tap in taps.iter().take(tap_count) {
            let tap = tap.sanitized();
            let delay_samples = clamp(
                tap.ratio * params.time_ms * sample_rate / 1000.0,
                1.0,
                (self.left.len().saturating_sub(2)) as f64,
            );
            let tap_l = self.left.read_linear(delay_samples) as f32;
            let tap_r = self.right.read_linear(delay_samples) as f32;
            let pan = clamp(tap.pan * params.width, -1.0, 1.0);
            let (pan_l, pan_r) = equal_power_pan(pan);
            wet_l += tap_l * (tap.gain * pan_l) as f32;
            wet_r += tap_r * (tap.gain * pan_r) as f32;
            gain_sum += tap.gain.abs();
        }

        let normalize = (1.0 / gain_sum.max(1.0)) as f32;
        wet_l *= normalize;
        wet_r *= normalize;

        let tone_coeff = (0.02 + params.tone * 0.98) as f32;
        self.tone_l += tone_coeff * (wet_l - self.tone_l);
        self.tone_r += tone_coeff * (wet_r - self.tone_r);
        self.tone_l = safe_f32(self.tone_l);
        self.tone_r = safe_f32(self.tone_r);

        let feedback = params.feedback as f32;
        self.left.push(input_l + self.tone_l * feedback);
        self.right.push(input_r + self.tone_r * feedback);

        let mix = params.mix as f32;
        let dry = 1.0 - mix;
        (
            input_l * dry + self.tone_l * mix,
            input_r * dry + self.tone_r * mix,
        )
    }
}

fn sanitize_sample_rate(sample_rate: f64) -> f64 {
    if sample_rate.is_finite() && sample_rate > 0.0 {
        sample_rate
    } else {
        DEFAULT_SAMPLE_RATE
    }
}

fn safe_f32(value: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multi_tap_delay_places_a_panned_tap_at_expected_time() {
        let mut state = MultiTapDelayState::new(1_000.0);
        let params = MultiTapDelayParams {
            time_ms: 10.0,
            feedback: 0.0,
            mix: 1.0,
            tone: 1.0,
            width: 1.0,
        };
        let taps = [MultiTapDelayTap::new(1.0, 1.0, -1.0)];
        let mut left = Vec::with_capacity(16);
        let mut right = Vec::with_capacity(16);
        for i in 0..16 {
            let input = if i == 0 { 1.0 } else { 0.0 };
            let (out_l, out_r) = state.process(input, input, params, &taps, 1_000.0);
            left.push(out_l);
            right.push(out_r);
        }

        assert_eq!(left[9], 0.0);
        assert!((left[10] - 1.0).abs() < 1e-6);
        assert!(right[10].abs() < 1e-6);
    }

    #[test]
    fn multi_tap_delay_feedback_recirculates_filtered_taps() {
        let mut state = MultiTapDelayState::new(1_000.0);
        let params = MultiTapDelayParams {
            time_ms: 4.0,
            feedback: 0.5,
            mix: 1.0,
            tone: 1.0,
            width: 1.0,
        };
        let taps = [MultiTapDelayTap::new(1.0, 1.0, -1.0)];
        let mut left = Vec::with_capacity(16);
        for i in 0..16 {
            let input = if i == 0 { 1.0 } else { 0.0 };
            left.push(state.process(input, input, params, &taps, 1_000.0).0);
        }

        assert!(left[4] > 0.7);
        assert!(left[8] > 0.3);
        assert!(left[12] > 0.1);
    }

    #[test]
    fn multi_tap_delay_width_spreads_mono_input_across_stereo_taps() {
        let mut state = MultiTapDelayState::new(1_000.0);
        let params = MultiTapDelayParams {
            time_ms: 6.0,
            feedback: 0.0,
            mix: 1.0,
            tone: 1.0,
            width: 1.0,
        };
        let taps = [
            MultiTapDelayTap::new(1.0, 1.0, -1.0),
            MultiTapDelayTap::new(1.5, 1.0, 1.0),
        ];
        let mut left_energy = 0.0;
        let mut right_energy = 0.0;
        for i in 0..20 {
            let input = if i == 0 { 1.0 } else { 0.0 };
            let (left, right) = state.process(input, input, params, &taps, 1_000.0);
            left_energy += left.abs();
            right_energy += right.abs();
        }

        assert!(left_energy > 0.4);
        assert!(right_energy > 0.4);
    }

    #[test]
    fn multi_tap_delay_sanitizes_hostile_params_and_taps() {
        let mut state = MultiTapDelayState::new(f64::NAN);
        let params = MultiTapDelayParams {
            time_ms: f64::NAN,
            feedback: f64::INFINITY,
            mix: f64::INFINITY,
            tone: f64::NAN,
            width: f64::INFINITY,
        };
        let taps = [MultiTapDelayTap::new(f64::NAN, f64::INFINITY, f64::NAN)];
        for _ in 0..128 {
            let (left, right) = state.process(0.5, -0.5, params, &taps, f64::NAN);
            assert!(left.is_finite());
            assert!(right.is_finite());
            assert!(left.abs() <= 1.0);
            assert!(right.abs() <= 1.0);
        }
    }
}

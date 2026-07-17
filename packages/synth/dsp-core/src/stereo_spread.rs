use crate::delay::DelayLine;
use crate::math::{clamp, safe_finite};

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
const DEFAULT_DELAY_MS: f64 = 9.0;
const DEFAULT_WIDTH: f64 = 1.0;
const DEFAULT_MIX: f64 = 1.0;
const MAX_DELAY_MS: f64 = 50.0;

#[derive(Clone, Copy, Debug)]
pub struct StereoSpreadParams {
    pub width: f64,
    pub delay_ms: f64,
    pub mix: f64,
}

impl StereoSpreadParams {
    fn sanitized(self) -> Self {
        Self {
            width: clamp(safe_finite(self.width, DEFAULT_WIDTH), 0.0, 1.0),
            delay_ms: clamp(
                safe_finite(self.delay_ms, DEFAULT_DELAY_MS),
                0.0,
                MAX_DELAY_MS,
            ),
            mix: clamp(safe_finite(self.mix, DEFAULT_MIX), 0.0, 1.0),
        }
    }
}

impl Default for StereoSpreadParams {
    fn default() -> Self {
        Self {
            width: DEFAULT_WIDTH,
            delay_ms: DEFAULT_DELAY_MS,
            mix: DEFAULT_MIX,
        }
    }
}

pub struct StereoSpreadState {
    right_delay: DelayLine,
}

impl StereoSpreadState {
    pub fn new(sample_rate: f64) -> Self {
        Self {
            right_delay: DelayLine::new(max_delay_samples(sample_rate) + 2),
        }
    }

    pub fn clear(&mut self) {
        self.right_delay.clear();
    }

    pub fn process(
        &mut self,
        input_l: f32,
        input_r: f32,
        params: StereoSpreadParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        let params = params.sanitized();
        let sample_rate = sanitize_sample_rate(sample_rate);
        let dry_l = input_l as f64;
        let dry_r = input_r as f64;
        let mid = (dry_l + dry_r) * 0.5;
        let side = (dry_l - dry_r) * 0.5 * (1.0 + params.width);
        let widened_l = mid + side;
        let widened_r = mid - side;
        let delay_samples = params.delay_ms * sample_rate / 1_000.0;
        let delayed_r = if delay_samples <= 0.0 {
            widened_r
        } else {
            self.right_delay.read_linear(delay_samples)
        };
        self.right_delay.push(widened_r as f32);

        let wet_l = widened_l;
        let wet_r = widened_r * (1.0 - params.width) + delayed_r * params.width;
        let left = dry_l * (1.0 - params.mix) + wet_l * params.mix;
        let right = dry_r * (1.0 - params.mix) + wet_r * params.mix;
        (
            clamp(safe_finite(left, 0.0), -8.0, 8.0) as f32,
            clamp(safe_finite(right, 0.0), -8.0, 8.0) as f32,
        )
    }
}

fn max_delay_samples(sample_rate: f64) -> usize {
    (sanitize_sample_rate(sample_rate) * MAX_DELAY_MS / 1_000.0)
        .ceil()
        .max(1.0) as usize
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

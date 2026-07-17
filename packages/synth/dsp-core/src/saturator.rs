use crate::filter::{DcBlocker, OnePoleLowpass};
use crate::math::{clamp, safe_finite};

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;

#[derive(Clone, Copy, Debug)]
pub struct SaturatorParams {
    pub drive: f64,
    pub asymmetry: f64,
    pub tone: f64,
    pub mix: f64,
    pub output: f64,
}

impl SaturatorParams {
    fn sanitized(self) -> Self {
        Self {
            drive: clamp(safe_finite(self.drive, 0.0), 0.0, 1.0),
            asymmetry: clamp(safe_finite(self.asymmetry, 0.0), -1.0, 1.0),
            tone: clamp(safe_finite(self.tone, 0.75), 0.0, 1.0),
            mix: clamp(safe_finite(self.mix, 1.0), 0.0, 1.0),
            output: clamp(safe_finite(self.output, 1.0), 0.0, 4.0),
        }
    }
}

impl Default for SaturatorParams {
    fn default() -> Self {
        Self {
            drive: 0.35,
            asymmetry: 0.0,
            tone: 0.75,
            mix: 1.0,
            output: 1.0,
        }
    }
}

#[derive(Default)]
pub struct SaturatorChannel {
    tone: OnePoleLowpass,
    dc: DcBlocker,
}

impl SaturatorChannel {
    pub fn clear(&mut self) {
        self.tone.reset(0.0);
        self.dc.reset();
    }

    pub fn process(&mut self, input: f32, params: SaturatorParams, sample_rate: f64) -> f32 {
        let params = params.sanitized();
        let sample_rate = sanitize_sample_rate(sample_rate);
        let drive_gain = 1.0 + params.drive * 24.0;
        let bias = params.asymmetry * 0.75;
        let bias_offset = bias.tanh();
        let positive_extent = (drive_gain + bias).tanh() - bias_offset;
        let negative_extent = (-drive_gain + bias).tanh() - bias_offset;
        let normalize = positive_extent.abs().max(negative_extent.abs()).max(1e-6);
        let shaped = ((input as f64 * drive_gain + bias).tanh() - bias_offset) / normalize;
        let compensated = shaped / (1.0 + params.drive * 0.35);
        let cleaned = self.dc.process(compensated);
        self.tone
            .set_cutoff(tone_cutoff(params.tone, sample_rate), sample_rate);
        let wet = self.tone.process(cleaned);
        let output = (input as f64 * (1.0 - params.mix) + wet * params.mix) * params.output;
        clamp(safe_finite(output, 0.0), -4.0, 4.0) as f32
    }
}

pub struct SaturatorState {
    left: SaturatorChannel,
    right: SaturatorChannel,
}

impl SaturatorState {
    pub fn new() -> Self {
        Self {
            left: SaturatorChannel::default(),
            right: SaturatorChannel::default(),
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
        params: SaturatorParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        (
            self.left.process(input_l, params, sample_rate),
            self.right.process(input_r, params, sample_rate),
        )
    }
}

impl Default for SaturatorState {
    fn default() -> Self {
        Self::new()
    }
}

fn tone_cutoff(tone: f64, sample_rate: f64) -> f64 {
    let normalized = clamp(tone, 0.0, 1.0);
    let min = 700.0;
    let max = (sample_rate * 0.45).min(18_000.0).max(min);
    min + normalized * normalized * (max - min)
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
    fn saturator_zero_mix_returns_dry_signal_with_output_trim() {
        let mut state = SaturatorState::new();
        let params = SaturatorParams {
            mix: 0.0,
            output: 0.5,
            ..SaturatorParams::default()
        };

        for input in [-0.75, -0.25, 0.0, 0.25, 0.75] {
            let (left, right) = state.process(input, -input, params, 48_000.0);
            assert!((left - input * 0.5).abs() < 1e-6);
            assert!((right + input * 0.5).abs() < 1e-6);
        }
    }

    #[test]
    fn saturator_drive_compresses_large_signal() {
        let mut low = SaturatorState::new();
        let mut high = SaturatorState::new();
        let low_params = SaturatorParams {
            drive: 0.0,
            tone: 1.0,
            mix: 1.0,
            ..SaturatorParams::default()
        };
        let high_params = SaturatorParams {
            drive: 1.0,
            tone: 1.0,
            mix: 1.0,
            ..SaturatorParams::default()
        };

        let mut low_out = 0.0;
        let mut high_out = 0.0;
        for _ in 0..128 {
            low_out = low.process(1.0, 1.0, low_params, 48_000.0).0;
            high_out = high.process(1.0, 1.0, high_params, 48_000.0).0;
        }

        assert!(high_out.abs() < low_out.abs());
        assert!(high_out.abs() < 1.0);
    }

    #[test]
    fn saturator_asymmetry_changes_positive_and_negative_shape() {
        let mut state = SaturatorState::new();
        let params = SaturatorParams {
            drive: 0.7,
            asymmetry: 0.7,
            tone: 1.0,
            mix: 1.0,
            ..SaturatorParams::default()
        };

        let mut pos = 0.0;
        let mut neg = 0.0;
        for _ in 0..128 {
            pos = state.process(0.4, 0.4, params, 48_000.0).0;
            neg = state.process(-0.4, -0.4, params, 48_000.0).0;
        }

        assert!((pos.abs() - neg.abs()).abs() > 0.02);
    }

    #[test]
    fn saturator_tone_reduces_fast_alternating_energy() {
        let mut dark = SaturatorState::new();
        let mut bright = SaturatorState::new();
        let dark_params = SaturatorParams {
            drive: 0.4,
            tone: 0.0,
            mix: 1.0,
            ..SaturatorParams::default()
        };
        let bright_params = SaturatorParams {
            drive: 0.4,
            tone: 1.0,
            mix: 1.0,
            ..SaturatorParams::default()
        };
        let mut dark_energy = 0.0;
        let mut bright_energy = 0.0;
        for i in 0..256 {
            let input = if i % 2 == 0 { 0.8 } else { -0.8 };
            dark_energy += dark.process(input, input, dark_params, 48_000.0).0.abs();
            bright_energy += bright
                .process(input, input, bright_params, 48_000.0)
                .0
                .abs();
        }

        assert!(dark_energy < bright_energy * 0.5);
    }

    #[test]
    fn saturator_sanitizes_hostile_params() {
        let mut state = SaturatorState::new();
        let params = SaturatorParams {
            drive: f64::NAN,
            asymmetry: f64::INFINITY,
            tone: f64::NAN,
            mix: f64::INFINITY,
            output: f64::INFINITY,
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

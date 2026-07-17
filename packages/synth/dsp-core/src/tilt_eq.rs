use crate::filter::OnePoleLowpass;
use crate::math::{clamp, safe_finite};

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
const DEFAULT_FREQ: f64 = 1_000.0;
const DEFAULT_GAIN_DB: f64 = 0.0;
const DEFAULT_MIX: f64 = 1.0;

#[derive(Clone, Copy, Debug)]
pub struct TiltEqParams {
    pub freq: f64,
    pub gain_db: f64,
    pub mix: f64,
}

impl TiltEqParams {
    fn sanitized(self, sample_rate: f64) -> Self {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let max_freq = (sample_rate * 0.45).max(20.0);
        Self {
            freq: clamp(safe_finite(self.freq, DEFAULT_FREQ), 20.0, max_freq),
            gain_db: clamp(safe_finite(self.gain_db, DEFAULT_GAIN_DB), -24.0, 24.0),
            mix: clamp(safe_finite(self.mix, DEFAULT_MIX), 0.0, 1.0),
        }
    }
}

impl Default for TiltEqParams {
    fn default() -> Self {
        Self {
            freq: DEFAULT_FREQ,
            gain_db: DEFAULT_GAIN_DB,
            mix: DEFAULT_MIX,
        }
    }
}

pub struct TiltEqChannel {
    lowpass: OnePoleLowpass,
}

impl TiltEqChannel {
    pub fn new() -> Self {
        Self {
            lowpass: OnePoleLowpass::default(),
        }
    }

    pub fn clear(&mut self) {
        self.lowpass.reset(0.0);
    }

    pub fn process(&mut self, input: f32, params: TiltEqParams, sample_rate: f64) -> f32 {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let params = params.sanitized(sample_rate);
        if params.mix <= 0.0 {
            return input;
        }

        self.lowpass.set_cutoff(params.freq, sample_rate);
        let dry = input as f64;
        let low = self.lowpass.process(dry);
        let high = dry - low;
        let half_gain_db = params.gain_db * 0.5;
        let low_gain = db_to_gain(-half_gain_db);
        let high_gain = db_to_gain(half_gain_db);
        let wet = low * low_gain + high * high_gain;
        let mixed = dry * (1.0 - params.mix) + wet * params.mix;
        clamp(safe_finite(mixed, 0.0), -8.0, 8.0) as f32
    }
}

impl Default for TiltEqChannel {
    fn default() -> Self {
        Self::new()
    }
}

pub struct TiltEqState {
    left: TiltEqChannel,
    right: TiltEqChannel,
}

impl TiltEqState {
    pub fn new() -> Self {
        Self {
            left: TiltEqChannel::new(),
            right: TiltEqChannel::new(),
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
        params: TiltEqParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        (
            self.left.process(input_l, params, sample_rate),
            self.right.process(input_r, params, sample_rate),
        )
    }
}

impl Default for TiltEqState {
    fn default() -> Self {
        Self::new()
    }
}

#[inline]
fn db_to_gain(db: f64) -> f64 {
    10.0_f64.powf(db / 20.0)
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

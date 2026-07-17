use crate::filter::{DcBlocker, OnePoleLowpass};
use crate::math::{clamp, safe_finite};

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
const MIN_FOLD_THRESHOLD: f64 = 0.22;

#[derive(Clone, Copy, Debug)]
pub struct WavefolderParams {
    pub drive: f64,
    pub depth: f64,
    pub asymmetry: f64,
    pub tone: f64,
    pub mix: f64,
    pub output: f64,
}

impl WavefolderParams {
    fn sanitized(self) -> Self {
        Self {
            drive: clamp(safe_finite(self.drive, 0.0), 0.0, 1.0),
            depth: clamp(safe_finite(self.depth, 0.0), 0.0, 1.0),
            asymmetry: clamp(safe_finite(self.asymmetry, 0.0), -1.0, 1.0),
            tone: clamp(safe_finite(self.tone, 0.78), 0.0, 1.0),
            mix: clamp(safe_finite(self.mix, 1.0), 0.0, 1.0),
            output: clamp(safe_finite(self.output, 1.0), 0.0, 4.0),
        }
    }
}

impl Default for WavefolderParams {
    fn default() -> Self {
        Self {
            drive: 0.32,
            depth: 0.58,
            asymmetry: 0.0,
            tone: 0.78,
            mix: 1.0,
            output: 1.0,
        }
    }
}

#[derive(Default)]
pub struct WavefolderChannel {
    previous_input: f64,
    anti_alias: OnePoleLowpass,
    tone: OnePoleLowpass,
    dc: DcBlocker,
}

impl WavefolderChannel {
    pub fn clear(&mut self) {
        self.previous_input = 0.0;
        self.anti_alias.reset(0.0);
        self.tone.reset(0.0);
        self.dc.reset();
    }

    pub fn process(&mut self, input: f32, params: WavefolderParams, sample_rate: f64) -> f32 {
        let params = params.sanitized();
        if params.mix <= 0.0 {
            let dry = input as f64 * params.output;
            return clamp(safe_finite(dry, 0.0), -4.0, 4.0) as f32;
        }

        let sample_rate = sanitize_sample_rate(sample_rate);
        let current = safe_finite(input as f64, 0.0);
        let mid = (self.previous_input + current) * 0.5;
        self.previous_input = current;

        self.anti_alias
            .set_cutoff(sample_rate * 0.45, sample_rate * 2.0);
        let folded_mid = self.anti_alias.process(wavefold_sample(
            mid,
            params.drive,
            params.depth,
            params.asymmetry,
        ));
        let folded_current = self.anti_alias.process(wavefold_sample(
            current,
            params.drive,
            params.depth,
            params.asymmetry,
        ));
        let folded = (folded_mid + folded_current) * 0.5;
        let cleaned = self.dc.process(folded);

        self.tone
            .set_cutoff(tone_cutoff(params.tone, sample_rate), sample_rate);
        let wet = self.tone.process(cleaned);
        let output = (current * (1.0 - params.mix) + wet * params.mix) * params.output;
        clamp(safe_finite(output, 0.0), -4.0, 4.0) as f32
    }
}

pub struct WavefolderState {
    left: WavefolderChannel,
    right: WavefolderChannel,
}

impl WavefolderState {
    pub fn new() -> Self {
        Self {
            left: WavefolderChannel::default(),
            right: WavefolderChannel::default(),
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
        params: WavefolderParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        (
            self.left.process(input_l, params, sample_rate),
            self.right.process(input_r, params, sample_rate),
        )
    }
}

impl Default for WavefolderState {
    fn default() -> Self {
        Self::new()
    }
}

pub fn wavefold_sample(input: f64, drive: f64, depth: f64, asymmetry: f64) -> f64 {
    let drive = clamp(safe_finite(drive, 0.0), 0.0, 1.0);
    let depth = clamp(safe_finite(depth, 0.0), 0.0, 1.0);
    let asymmetry = clamp(safe_finite(asymmetry, 0.0), -1.0, 1.0);
    let gain = 1.0 + drive * 18.0;
    let threshold = 1.0 - depth * (1.0 - MIN_FOLD_THRESHOLD);
    let bias = asymmetry * depth * 0.85;
    let driven = safe_finite(input, 0.0) * gain + bias;
    let folded = foldback(driven, threshold) - foldback(bias, threshold);
    let normalized = folded / threshold;
    let round = depth * 0.35;
    let rounded =
        normalized * (1.0 - round) + (normalized * std::f64::consts::FRAC_PI_2).sin() * round;
    let compensation = 1.0 / (1.0 + drive * 0.22);
    clamp(safe_finite(rounded * compensation, 0.0), -2.0, 2.0)
}

fn foldback(value: f64, threshold: f64) -> f64 {
    let threshold = safe_finite(threshold, 1.0).abs().max(1e-9);
    let period = threshold * 4.0;
    let folded = (value + threshold).rem_euclid(period);
    if folded <= threshold * 2.0 {
        folded - threshold
    } else {
        threshold * 3.0 - folded
    }
}

fn tone_cutoff(tone: f64, sample_rate: f64) -> f64 {
    let normalized = clamp(tone, 0.0, 1.0);
    let min = 900.0;
    let max = (sample_rate * 0.45).min(20_000.0).max(min);
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
mod tests;

use crate::filter::OnePoleLowpass;
use crate::math::{clamp, safe_finite};
use crate::noise::Mulberry32;

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;

#[derive(Clone, Copy, Debug, Default)]
pub struct BitcrusherState {
    held: f32,
    countdown: i32,
}

impl BitcrusherState {
    pub fn held(&self) -> f32 {
        self.held
    }

    pub fn countdown(&self) -> i32 {
        self.countdown
    }
}

#[inline]
pub fn bitcrush_sample(input: f32, bits: f64, downsample: f64, state: &mut BitcrusherState) -> f32 {
    held_quantized_sample(input, bits, downsample, 0.0, state)
}

#[derive(Clone, Copy, Debug)]
pub struct DegradeParams {
    pub bits: f64,
    pub downsample: f64,
    pub jitter: f64,
    pub noise: f64,
    pub tone: f64,
    pub mix: f64,
}

impl DegradeParams {
    fn sanitized(self) -> Self {
        Self {
            bits: clamp(safe_finite(self.bits, 10.0).round(), 1.0, 24.0),
            downsample: clamp(safe_finite(self.downsample, 3.0).round(), 1.0, 128.0),
            jitter: clamp(safe_finite(self.jitter, 0.0), 0.0, 1.0),
            noise: clamp(safe_finite(self.noise, 0.0), 0.0, 1.0),
            tone: clamp(safe_finite(self.tone, 0.72), 0.0, 1.0),
            mix: clamp(safe_finite(self.mix, 0.65), 0.0, 1.0),
        }
    }
}

impl Default for DegradeParams {
    fn default() -> Self {
        Self {
            bits: 10.0,
            downsample: 3.0,
            jitter: 0.0,
            noise: 0.0,
            tone: 0.72,
            mix: 0.65,
        }
    }
}

pub struct DegradeChannel {
    crush: BitcrusherState,
    tone: OnePoleLowpass,
    rng: Mulberry32,
}

impl DegradeChannel {
    pub fn new(seed: u32) -> Self {
        Self {
            crush: BitcrusherState::default(),
            tone: OnePoleLowpass::default(),
            rng: Mulberry32::new(seed),
        }
    }

    pub fn clear(&mut self, seed: u32) {
        self.crush = BitcrusherState::default();
        self.tone.reset(0.0);
        self.rng = Mulberry32::new(seed);
    }

    pub fn process(&mut self, input: f32, params: DegradeParams, sample_rate: f64) -> f32 {
        let params = params.sanitized();
        let sample_rate = sanitize_sample_rate(sample_rate);
        let dither = triangular_dither(&mut self.rng, params.bits, params.noise);
        let downsample = jittered_downsample(params.downsample, params.jitter, &mut self.rng);
        let crushed =
            held_quantized_sample(input, params.bits, downsample, dither, &mut self.crush);
        self.tone
            .set_cutoff(tone_cutoff(params.tone, sample_rate), sample_rate);
        let wet = self.tone.process(crushed as f64);
        let mixed = input as f64 * (1.0 - params.mix) + wet * params.mix;
        clamp(safe_finite(mixed, 0.0), -4.0, 4.0) as f32
    }
}

pub struct DegradeState {
    left: DegradeChannel,
    right: DegradeChannel,
}

impl DegradeState {
    pub fn new() -> Self {
        Self::with_seed(0xD3E6_ADED)
    }

    pub fn with_seed(seed: u32) -> Self {
        Self {
            left: DegradeChannel::new(seed),
            right: DegradeChannel::new(seed ^ 0x9E37_79B9),
        }
    }

    pub fn clear(&mut self) {
        self.left.clear(0xD3E6_ADED);
        self.right.clear(0x4DD1_D454);
    }

    pub fn process(
        &mut self,
        input_l: f32,
        input_r: f32,
        params: DegradeParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        (
            self.left.process(input_l, params, sample_rate),
            self.right.process(input_r, params, sample_rate),
        )
    }
}

impl Default for DegradeState {
    fn default() -> Self {
        Self::new()
    }
}

#[inline]
pub fn quantize_sample(input: f32, bits: f64) -> f32 {
    quantize_with_dither(input, bits, 0.0)
}

#[inline]
fn held_quantized_sample(
    input: f32,
    bits: f64,
    downsample: f64,
    dither: f64,
    state: &mut BitcrusherState,
) -> f32 {
    if state.countdown <= 0 {
        state.held = quantize_with_dither(input, bits, dither);
        state.countdown = downsample_factor(downsample);
    }
    let out = state.held;
    state.countdown -= 1;
    out
}

#[inline]
fn quantize_with_dither(input: f32, bits: f64, dither: f64) -> f32 {
    let divisor = quantization_divisor(bits);
    let value = clamp(input as f64 + safe_finite(dither, 0.0), -1.0, 1.0);
    (value * divisor).round() as f32 / divisor as f32
}

#[inline]
fn quantization_divisor(bits: f64) -> f64 {
    let bits = clamp(safe_finite(bits, 8.0).round(), 1.0, 24.0);
    let levels = 2.0_f64.powf(bits);
    (levels / 2.0 - 1.0).max(1.0)
}

#[inline]
fn quantization_step(bits: f64) -> f64 {
    1.0 / quantization_divisor(bits)
}

#[inline]
fn downsample_factor(downsample: f64) -> i32 {
    clamp(safe_finite(downsample, 1.0).round(), 1.0, 128.0) as i32
}

#[inline]
fn triangular_dither(rng: &mut Mulberry32, bits: f64, amount: f64) -> f64 {
    let amount = clamp(safe_finite(amount, 0.0), 0.0, 1.0);
    if amount <= 0.0 {
        return 0.0;
    }
    (rng.next_f64() - rng.next_f64()) * quantization_step(bits) * amount
}

#[inline]
fn jittered_downsample(base: f64, jitter: f64, rng: &mut Mulberry32) -> f64 {
    let jitter = clamp(safe_finite(jitter, 0.0), 0.0, 1.0);
    if jitter <= 0.0 {
        return base;
    }
    let factor = 1.0 + (rng.next_f64() * 2.0 - 1.0) * jitter;
    clamp(base * factor, 1.0, 128.0)
}

fn tone_cutoff(tone: f64, sample_rate: f64) -> f64 {
    let tone = clamp(safe_finite(tone, 0.72), 0.0, 1.0);
    let min = 650.0;
    let max = (sample_rate * 0.45).min(18_000.0).max(min);
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

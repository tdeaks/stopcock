use crate::delay::DelayLine;
use crate::math::{clamp, safe_finite, TAU};

#[derive(Clone, Copy)]
pub struct PlateReverbParams {
    pub pre_delay_ms: f64,
    pub decay: f64,
    pub damping: f64,
    pub diffusion: f64,
    pub modulation: f64,
    pub mix: f64,
    pub width: f64,
}

impl Default for PlateReverbParams {
    fn default() -> Self {
        Self {
            pre_delay_ms: 12.0,
            decay: 0.55,
            damping: 0.42,
            diffusion: 0.72,
            modulation: 0.18,
            mix: 0.28,
            width: 1.0,
        }
    }
}

#[derive(Clone, Copy)]
struct SanitizedPlateParams {
    pre_delay_samples: f64,
    decay: f64,
    damping: f64,
    diffusion: f64,
    modulation_samples: f64,
    mix: f64,
    width: f64,
}

pub struct PlateReverbState {
    pre_delay: DelayLine,
    input_diffusers: [AllpassDiffuser; 4],
    tank_l: PlateTankSide,
    tank_r: PlateTankSide,
    feedback_l: f64,
    feedback_r: f64,
    phase_l: f64,
    phase_r: f64,
}

impl PlateReverbState {
    pub fn new(sample_rate: f64) -> Self {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        Self {
            pre_delay: DelayLine::new(samples_for_ms(300.0, sample_rate)),
            input_diffusers: [
                AllpassDiffuser::new(4.8, sample_rate),
                AllpassDiffuser::new(3.6, sample_rate),
                AllpassDiffuser::new(12.7, sample_rate),
                AllpassDiffuser::new(9.3, sample_rate),
            ],
            tank_l: PlateTankSide::new(36.7, 30.5, 8.9, 4.1, sample_rate),
            tank_r: PlateTankSide::new(48.1, 43.9, 11.3, 5.7, sample_rate),
            feedback_l: 0.0,
            feedback_r: 0.0,
            phase_l: 0.0,
            phase_r: 1.7,
        }
    }

    pub fn clear(&mut self) {
        self.pre_delay.clear();
        for diffuser in &mut self.input_diffusers {
            diffuser.clear();
        }
        self.tank_l.clear();
        self.tank_r.clear();
        self.feedback_l = 0.0;
        self.feedback_r = 0.0;
        self.phase_l = 0.0;
        self.phase_r = 1.7;
    }

    pub fn pre_delay_len(&self) -> usize {
        self.pre_delay.len()
    }

    pub fn process(
        &mut self,
        input_l: f32,
        input_r: f32,
        params: PlateReverbParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        let params = sanitize_params(params, sample_rate);
        let dry_l = input_l as f64;
        let dry_r = input_r as f64;
        let mono = (dry_l + dry_r) * 0.5;
        let mut wet = process_pre_delay(&mut self.pre_delay, mono, params.pre_delay_samples);
        let input_diffusion = 0.48 + params.diffusion * 0.32;

        for diffuser in &mut self.input_diffusers {
            wet = diffuser.process(wet, input_diffusion, 0.0);
        }

        let mod_l = self.phase_l.sin() * params.modulation_samples;
        let mod_r = self.phase_r.sin() * params.modulation_samples;
        advance_phase(&mut self.phase_l, 0.09, sample_rate);
        advance_phase(&mut self.phase_r, 0.13, sample_rate);

        let tank_input_l = wet + self.feedback_r * params.decay;
        let tank_input_r = wet - self.feedback_l * params.decay;
        let (out_l, feedback_l) = self.tank_l.process(tank_input_l, params, mod_l);
        let (out_r, feedback_r) = self.tank_r.process(tank_input_r, params, mod_r);
        self.feedback_l = safe_finite(feedback_l, 0.0);
        self.feedback_r = safe_finite(feedback_r, 0.0);

        let (wet_l, wet_r) = apply_width(out_l, out_r, params.width);
        (
            (dry_l * (1.0 - params.mix) + wet_l * params.mix) as f32,
            (dry_r * (1.0 - params.mix) + wet_r * params.mix) as f32,
        )
    }
}

struct PlateTankSide {
    delay_a: DampedPlateDelay,
    delay_b: DampedPlateDelay,
    diffuser_a: AllpassDiffuser,
    diffuser_b: AllpassDiffuser,
}

impl PlateTankSide {
    fn new(
        delay_a_ms: f64,
        delay_b_ms: f64,
        diffuser_a_ms: f64,
        diffuser_b_ms: f64,
        sample_rate: f64,
    ) -> Self {
        Self {
            delay_a: DampedPlateDelay::new(delay_a_ms, sample_rate),
            delay_b: DampedPlateDelay::new(delay_b_ms, sample_rate),
            diffuser_a: AllpassDiffuser::new(diffuser_a_ms, sample_rate),
            diffuser_b: AllpassDiffuser::new(diffuser_b_ms, sample_rate),
        }
    }

    fn clear(&mut self) {
        self.delay_a.clear();
        self.delay_b.clear();
        self.diffuser_a.clear();
        self.diffuser_b.clear();
    }

    fn process(&mut self, input: f64, params: SanitizedPlateParams, modulation: f64) -> (f64, f64) {
        let diffusion_a = 0.22 + params.diffusion * 0.42;
        let diffusion_b = 0.18 + params.diffusion * 0.3;
        let diffused_a = self
            .diffuser_a
            .process(input, diffusion_a, modulation * 0.35);
        let delayed_a = self.delay_a.process(diffused_a, params.damping, modulation);
        let diffused_b = self
            .diffuser_b
            .process(delayed_a, diffusion_b, -modulation * 0.5);
        let delayed_b = self
            .delay_b
            .process(diffused_b, params.damping, -modulation * 0.65);
        (delayed_a * 0.54 + delayed_b * 0.46, delayed_b)
    }
}

struct AllpassDiffuser {
    delay: DelayLine,
    delay_samples: f64,
}

impl AllpassDiffuser {
    fn new(delay_ms: f64, sample_rate: f64) -> Self {
        Self {
            delay: DelayLine::new(samples_for_ms(delay_ms + 16.0, sample_rate)),
            delay_samples: samples_for_ms_f64(delay_ms, sample_rate),
        }
    }

    fn clear(&mut self) {
        self.delay.clear();
    }

    fn process(&mut self, input: f64, gain: f64, modulation: f64) -> f64 {
        let gain = clamp(safe_finite(gain, 0.5), 0.0, 0.95);
        let delayed = self
            .delay
            .read_linear((self.delay_samples + modulation).max(1.0));
        let output = -gain * input + delayed;
        self.delay.push((input + gain * output) as f32);
        safe_finite(output, 0.0)
    }
}

struct DampedPlateDelay {
    delay: DelayLine,
    delay_samples: f64,
    damping_state: f64,
}

impl DampedPlateDelay {
    fn new(delay_ms: f64, sample_rate: f64) -> Self {
        Self {
            delay: DelayLine::new(samples_for_ms(delay_ms + 16.0, sample_rate)),
            delay_samples: samples_for_ms_f64(delay_ms, sample_rate),
            damping_state: 0.0,
        }
    }

    fn clear(&mut self) {
        self.delay.clear();
        self.damping_state = 0.0;
    }

    fn process(&mut self, input: f64, damping: f64, modulation: f64) -> f64 {
        let delayed = self
            .delay
            .read_linear((self.delay_samples + modulation).max(1.0));
        let damping = clamp(safe_finite(damping, 0.42), 0.0, 1.0);
        let coefficient = 0.08 + damping * 0.84;
        self.damping_state += (delayed - self.damping_state) * (1.0 - coefficient);
        self.damping_state = safe_finite(self.damping_state, 0.0);
        self.delay.push(input as f32);
        self.damping_state
    }
}

fn sanitize_params(params: PlateReverbParams, sample_rate: f64) -> SanitizedPlateParams {
    SanitizedPlateParams {
        pre_delay_samples: clamp(safe_finite(params.pre_delay_ms, 12.0), 0.0, 250.0) * sample_rate
            / 1000.0,
        decay: clamp(safe_finite(params.decay, 0.55), 0.0, 0.98),
        damping: clamp(safe_finite(params.damping, 0.42), 0.0, 1.0),
        diffusion: clamp(safe_finite(params.diffusion, 0.72), 0.0, 0.95),
        modulation_samples: clamp(safe_finite(params.modulation, 0.18), 0.0, 1.0)
            * sample_rate
            * 0.00025,
        mix: clamp(safe_finite(params.mix, 0.28), 0.0, 1.0),
        width: clamp(safe_finite(params.width, 1.0), 0.0, 1.0),
    }
}

fn process_pre_delay(delay: &mut DelayLine, input: f64, delay_samples: f64) -> f64 {
    if delay_samples <= 1.0 {
        delay.push(input as f32);
        return input;
    }
    let out = delay.read_linear(delay_samples);
    delay.push(input as f32);
    out
}

fn apply_width(left: f64, right: f64, width: f64) -> (f64, f64) {
    let mid = (left + right) * 0.5;
    let side = (left - right) * 0.5 * width;
    (mid + side, mid - side)
}

fn advance_phase(phase: &mut f64, freq: f64, sample_rate: f64) {
    *phase += TAU * freq / sample_rate;
    if *phase >= TAU {
        *phase -= TAU;
    }
}

fn samples_for_ms(delay_ms: f64, sample_rate: f64) -> usize {
    samples_for_ms_f64(delay_ms, sample_rate).ceil().max(1.0) as usize
}

fn samples_for_ms_f64(delay_ms: f64, sample_rate: f64) -> f64 {
    safe_finite(delay_ms, 1.0).max(0.0) * sample_rate / 1000.0
}

#[cfg(test)]
mod tests;

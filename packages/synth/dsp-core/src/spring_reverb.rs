use crate::delay::DelayLine;
use crate::dispersion::FirstOrderAllpass;
use crate::math::{clamp, safe_finite};
use crate::nonlinear::tape_saturate;

const SPRING_LINES: usize = 3;
const DISPERSION_STAGES: usize = 6;

#[derive(Clone, Copy)]
pub struct SpringReverbParams {
    pub decay: f64,
    pub damping: f64,
    pub tension: f64,
    pub drip: f64,
    pub mix: f64,
    pub width: f64,
}

impl Default for SpringReverbParams {
    fn default() -> Self {
        Self {
            decay: 0.62,
            damping: 0.36,
            tension: 0.52,
            drip: 0.28,
            mix: 0.25,
            width: 1.0,
        }
    }
}

#[derive(Clone, Copy)]
struct SanitizedSpringParams {
    decay: f64,
    damping: f64,
    tension: f64,
    drip: f64,
    mix: f64,
    width: f64,
}

pub struct SpringReverbState {
    lines: [SpringLine; SPRING_LINES],
}

impl SpringReverbState {
    pub fn new(sample_rate: f64) -> Self {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        Self {
            lines: [
                SpringLine::new(28.9, 0.0, sample_rate),
                SpringLine::new(37.7, 0.48, sample_rate),
                SpringLine::new(43.1, 0.91, sample_rate),
            ],
        }
    }

    pub fn clear(&mut self) {
        for line in &mut self.lines {
            line.clear();
        }
    }

    pub fn line_len(&self, index: usize) -> Option<usize> {
        self.lines.get(index).map(SpringLine::delay_len)
    }

    pub fn process(
        &mut self,
        input_l: f32,
        input_r: f32,
        params: SpringReverbParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        let params = sanitize_params(params);
        let dry_l = input_l as f64;
        let dry_r = input_r as f64;
        let input = (dry_l + dry_r) * 0.5;
        let excitation = excite_spring(input, params);
        let mut taps = [0.0_f64; SPRING_LINES];

        for (index, line) in self.lines.iter_mut().enumerate() {
            let gain = 1.0 - index as f64 * 0.14;
            taps[index] = line.process(excitation * gain, params, sample_rate);
        }

        let wet_l = taps[0] * 0.62 - taps[1] * 0.18 + taps[2] * 0.36;
        let wet_r = taps[1] * 0.62 - taps[0] * 0.18 + taps[2] * 0.36;
        let (wet_l, wet_r) = apply_width(wet_l * 0.82, wet_r * 0.82, params.width);
        (
            (dry_l * (1.0 - params.mix) + wet_l * params.mix) as f32,
            (dry_r * (1.0 - params.mix) + wet_r * params.mix) as f32,
        )
    }
}

struct SpringLine {
    delay: DelayLine,
    base_delay_samples: f64,
    dispersion: [FirstOrderAllpass; DISPERSION_STAGES],
    damping_state: f64,
    phase_offset: f64,
}

impl SpringLine {
    fn new(delay_ms: f64, phase_offset: f64, sample_rate: f64) -> Self {
        Self {
            delay: DelayLine::new(samples_for_ms(delay_ms * 1.8 + 64.0, sample_rate)),
            base_delay_samples: samples_for_ms_f64(delay_ms, sample_rate),
            dispersion: [FirstOrderAllpass::default(); DISPERSION_STAGES],
            damping_state: 0.0,
            phase_offset,
        }
    }

    fn delay_len(&self) -> usize {
        self.delay.len()
    }

    fn clear(&mut self) {
        self.delay.clear();
        for stage in &mut self.dispersion {
            stage.reset();
        }
        self.damping_state = 0.0;
    }

    fn process(&mut self, input: f64, params: SanitizedSpringParams, sample_rate: f64) -> f64 {
        let delay_samples = self.delay_samples(params, sample_rate);
        let delayed = self.delay.read_linear(delay_samples);
        let dispersed = process_dispersion(
            &mut self.dispersion,
            delayed,
            params.tension,
            self.phase_offset,
        );
        let damped = process_damping(&mut self.damping_state, dispersed, params.damping);
        let feedback = damped * params.decay;
        self.delay
            .push(tape_saturate(input + feedback, params.drip * 0.18) as f32);
        damped
    }

    fn delay_samples(&self, params: SanitizedSpringParams, sample_rate: f64) -> f64 {
        let tension_scale = 1.18 - params.tension * 0.32;
        let drip_pull = params.drip * 0.0015 * sample_rate * (self.phase_offset + 0.4).sin();
        (self.base_delay_samples * tension_scale + drip_pull).max(1.0)
    }
}

fn sanitize_params(params: SpringReverbParams) -> SanitizedSpringParams {
    SanitizedSpringParams {
        decay: clamp(safe_finite(params.decay, 0.62), 0.0, 0.985),
        damping: clamp(safe_finite(params.damping, 0.36), 0.0, 1.0),
        tension: clamp(safe_finite(params.tension, 0.52), 0.0, 1.0),
        drip: clamp(safe_finite(params.drip, 0.28), 0.0, 1.0),
        mix: clamp(safe_finite(params.mix, 0.25), 0.0, 1.0),
        width: clamp(safe_finite(params.width, 1.0), 0.0, 1.0),
    }
}

fn excite_spring(input: f64, params: SanitizedSpringParams) -> f64 {
    let pluck = tape_saturate(input * (1.0 + params.drip * 0.7), params.drip * 0.22);
    pluck + (pluck - input) * params.drip * 0.35
}

fn process_dispersion(
    stages: &mut [FirstOrderAllpass; DISPERSION_STAGES],
    mut input: f64,
    tension: f64,
    offset: f64,
) -> f64 {
    for (index, stage) in stages.iter_mut().enumerate() {
        let spread = index as f64 / DISPERSION_STAGES as f64;
        let coefficient = 0.24 + tension * 0.34 + spread * 0.22 + offset * 0.035;
        input = stage.process(input, coefficient);
    }
    input
}

fn process_damping(state: &mut f64, input: f64, damping: f64) -> f64 {
    let coefficient = 0.04 + damping * 0.88;
    *state += (input - *state) * (1.0 - coefficient);
    *state = safe_finite(*state, 0.0);
    *state
}

fn apply_width(left: f64, right: f64, width: f64) -> (f64, f64) {
    let mid = (left + right) * 0.5;
    let side = (left - right) * 0.5 * width;
    (mid + side, mid - side)
}

fn samples_for_ms(delay_ms: f64, sample_rate: f64) -> usize {
    samples_for_ms_f64(delay_ms, sample_rate).ceil().max(1.0) as usize
}

fn samples_for_ms_f64(delay_ms: f64, sample_rate: f64) -> f64 {
    safe_finite(delay_ms, 1.0).max(0.0) * sample_rate / 1000.0
}

#[cfg(test)]
mod tests;

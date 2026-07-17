use crate::delay::DelayLine;
use crate::math::{clamp, safe_finite};
use crate::nonlinear::tape_saturate;

const COMB_COUNT: usize = 4;
const DIFFUSER_COUNT: usize = 2;

#[derive(Clone, Copy)]
pub struct NonlinearReverbParams {
    pub time_ms: f64,
    pub decay: f64,
    pub damping: f64,
    pub drive: f64,
    pub mix: f64,
    pub width: f64,
}

impl Default for NonlinearReverbParams {
    fn default() -> Self {
        Self {
            time_ms: 180.0,
            decay: 0.68,
            damping: 0.38,
            drive: 0.18,
            mix: 0.24,
            width: 1.0,
        }
    }
}

#[derive(Clone, Copy)]
struct SanitizedNonlinearReverbParams {
    gate_samples: f64,
    feedback: f64,
    damping: f64,
    drive: f64,
    mix: f64,
    width: f64,
}

pub struct NonlinearReverbState {
    left_combs: [NonlinearComb; COMB_COUNT],
    right_combs: [NonlinearComb; COMB_COUNT],
    left_diffusers: [DelayAllpass; DIFFUSER_COUNT],
    right_diffusers: [DelayAllpass; DIFFUSER_COUNT],
    gate_age: f64,
}

impl NonlinearReverbState {
    pub fn new(sample_rate: f64) -> Self {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        Self {
            left_combs: [
                NonlinearComb::new(19.9, sample_rate),
                NonlinearComb::new(26.3, sample_rate),
                NonlinearComb::new(31.1, sample_rate),
                NonlinearComb::new(37.7, sample_rate),
            ],
            right_combs: [
                NonlinearComb::new(22.1, sample_rate),
                NonlinearComb::new(29.7, sample_rate),
                NonlinearComb::new(34.3, sample_rate),
                NonlinearComb::new(41.9, sample_rate),
            ],
            left_diffusers: [
                DelayAllpass::new(7.1, sample_rate),
                DelayAllpass::new(11.3, sample_rate),
            ],
            right_diffusers: [
                DelayAllpass::new(8.9, sample_rate),
                DelayAllpass::new(13.7, sample_rate),
            ],
            gate_age: f64::INFINITY,
        }
    }

    pub fn clear(&mut self) {
        for comb in &mut self.left_combs {
            comb.clear();
        }
        for comb in &mut self.right_combs {
            comb.clear();
        }
        for diffuser in &mut self.left_diffusers {
            diffuser.clear();
        }
        for diffuser in &mut self.right_diffusers {
            diffuser.clear();
        }
        self.gate_age = f64::INFINITY;
    }

    pub fn comb_len(&self, side: usize, index: usize) -> Option<usize> {
        match side {
            0 => self.left_combs.get(index).map(NonlinearComb::len),
            1 => self.right_combs.get(index).map(NonlinearComb::len),
            _ => None,
        }
    }

    pub fn process(
        &mut self,
        input_l: f32,
        input_r: f32,
        params: NonlinearReverbParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        let params = sanitize_params(params, sample_rate);
        let dry_l = input_l as f64;
        let dry_r = input_r as f64;
        let mono = (dry_l + dry_r) * 0.5;
        update_gate_age(&mut self.gate_age, dry_l.abs().max(dry_r.abs()));
        let envelope = gate_envelope(self.gate_age, params.gate_samples);
        let excitation = tape_saturate(mono * (1.0 + params.drive * 2.2), params.drive * 0.35);

        let mut wet_l = process_comb_bank(&mut self.left_combs, excitation, params);
        let mut wet_r = process_comb_bank(&mut self.right_combs, excitation, params);
        wet_l = process_diffusers(&mut self.left_diffusers, wet_l, 0.58);
        wet_r = process_diffusers(&mut self.right_diffusers, wet_r, 0.56);

        let (wet_l, wet_r) = apply_width(
            wet_l * envelope * 0.74,
            wet_r * envelope * 0.74,
            params.width,
        );
        (
            (dry_l * (1.0 - params.mix) + wet_l * params.mix) as f32,
            (dry_r * (1.0 - params.mix) + wet_r * params.mix) as f32,
        )
    }
}

struct NonlinearComb {
    delay: DelayLine,
    delay_samples: usize,
    damping_state: f64,
}

impl NonlinearComb {
    fn new(delay_ms: f64, sample_rate: f64) -> Self {
        let delay_samples = samples_for_ms(delay_ms, sample_rate);
        Self {
            delay: DelayLine::new(delay_samples + 1),
            delay_samples,
            damping_state: 0.0,
        }
    }

    fn len(&self) -> usize {
        self.delay.len()
    }

    fn clear(&mut self) {
        self.delay.clear();
        self.damping_state = 0.0;
    }

    fn process(&mut self, input: f64, params: SanitizedNonlinearReverbParams) -> f64 {
        let delayed = self.delay.read_integer(self.delay_samples) as f64;
        let coefficient = 0.04 + params.damping * 0.9;
        self.damping_state += (delayed - self.damping_state) * (1.0 - coefficient);
        self.damping_state = safe_finite(self.damping_state, 0.0);
        let feedback = tape_saturate(self.damping_state * params.feedback, params.drive * 0.22);
        self.delay.push((input + feedback) as f32);
        self.damping_state
    }
}

struct DelayAllpass {
    delay: DelayLine,
    delay_samples: usize,
}

impl DelayAllpass {
    fn new(delay_ms: f64, sample_rate: f64) -> Self {
        let delay_samples = samples_for_ms(delay_ms, sample_rate);
        Self {
            delay: DelayLine::new(delay_samples + 1),
            delay_samples,
        }
    }

    fn clear(&mut self) {
        self.delay.clear();
    }

    fn process(&mut self, input: f64, gain: f64) -> f64 {
        let gain = clamp(safe_finite(gain, 0.5), 0.0, 0.92);
        let delayed = self.delay.read_integer(self.delay_samples) as f64;
        let output = -gain * input + delayed;
        self.delay.push((input + gain * output) as f32);
        safe_finite(output, 0.0)
    }
}

fn sanitize_params(
    params: NonlinearReverbParams,
    sample_rate: f64,
) -> SanitizedNonlinearReverbParams {
    let decay = clamp(safe_finite(params.decay, 0.68), 0.0, 0.98);
    SanitizedNonlinearReverbParams {
        gate_samples: clamp(safe_finite(params.time_ms, 180.0), 20.0, 800.0) * sample_rate / 1000.0,
        feedback: 0.18 + decay * 0.78,
        damping: clamp(safe_finite(params.damping, 0.38), 0.0, 1.0),
        drive: clamp(safe_finite(params.drive, 0.18), 0.0, 1.0),
        mix: clamp(safe_finite(params.mix, 0.24), 0.0, 1.0),
        width: clamp(safe_finite(params.width, 1.0), 0.0, 1.0),
    }
}

fn update_gate_age(gate_age: &mut f64, input_level: f64) {
    if input_level > 0.025 {
        *gate_age = 0.0;
    } else {
        *gate_age = safe_finite(*gate_age + 1.0, f64::INFINITY);
    }
}

fn gate_envelope(age: f64, gate_samples: f64) -> f64 {
    if age >= gate_samples {
        return 0.0;
    }
    let attack = (gate_samples * 0.06).max(1.0);
    let release_start = gate_samples * 0.82;
    if age < attack {
        return (age / attack).sqrt();
    }
    if age < release_start {
        return 1.0;
    }
    let release = ((age - release_start) / (gate_samples - release_start).max(1.0)).clamp(0.0, 1.0);
    (1.0 - release).powi(4)
}

fn process_comb_bank(
    combs: &mut [NonlinearComb; COMB_COUNT],
    input: f64,
    params: SanitizedNonlinearReverbParams,
) -> f64 {
    let mut sum = 0.0;
    for (index, comb) in combs.iter_mut().enumerate() {
        let gain = 1.0 - index as f64 * 0.08;
        sum += comb.process(input * gain, params);
    }
    sum / COMB_COUNT as f64
}

fn process_diffusers(
    diffusers: &mut [DelayAllpass; DIFFUSER_COUNT],
    mut input: f64,
    gain: f64,
) -> f64 {
    for diffuser in diffusers {
        input = diffuser.process(input, gain);
    }
    input
}

fn apply_width(left: f64, right: f64, width: f64) -> (f64, f64) {
    let mid = (left + right) * 0.5;
    let side = (left - right) * 0.5 * width;
    (mid + side, mid - side)
}

fn samples_for_ms(delay_ms: f64, sample_rate: f64) -> usize {
    (safe_finite(delay_ms, 1.0).max(0.0) * sample_rate / 1000.0)
        .ceil()
        .max(1.0) as usize
}

#[cfg(test)]
mod tests;

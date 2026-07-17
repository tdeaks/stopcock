use crate::math::{clamp, safe_finite, TAU};

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
const DEFAULT_SHIFT_HZ: f64 = 0.0;
const DEFAULT_MIX: f64 = 1.0;
const HILBERT_TAPS: usize = 63;
const HILBERT_CENTER: usize = HILBERT_TAPS / 2;
const HILBERT_ODD_TAPS: [(usize, f64); 32] = [
    (0, hilbert_coeff_const(-31.0)),
    (2, hilbert_coeff_const(-29.0)),
    (4, hilbert_coeff_const(-27.0)),
    (6, hilbert_coeff_const(-25.0)),
    (8, hilbert_coeff_const(-23.0)),
    (10, hilbert_coeff_const(-21.0)),
    (12, hilbert_coeff_const(-19.0)),
    (14, hilbert_coeff_const(-17.0)),
    (16, hilbert_coeff_const(-15.0)),
    (18, hilbert_coeff_const(-13.0)),
    (20, hilbert_coeff_const(-11.0)),
    (22, hilbert_coeff_const(-9.0)),
    (24, hilbert_coeff_const(-7.0)),
    (26, hilbert_coeff_const(-5.0)),
    (28, hilbert_coeff_const(-3.0)),
    (30, hilbert_coeff_const(-1.0)),
    (32, hilbert_coeff_const(1.0)),
    (34, hilbert_coeff_const(3.0)),
    (36, hilbert_coeff_const(5.0)),
    (38, hilbert_coeff_const(7.0)),
    (40, hilbert_coeff_const(9.0)),
    (42, hilbert_coeff_const(11.0)),
    (44, hilbert_coeff_const(13.0)),
    (46, hilbert_coeff_const(15.0)),
    (48, hilbert_coeff_const(17.0)),
    (50, hilbert_coeff_const(19.0)),
    (52, hilbert_coeff_const(21.0)),
    (54, hilbert_coeff_const(23.0)),
    (56, hilbert_coeff_const(25.0)),
    (58, hilbert_coeff_const(27.0)),
    (60, hilbert_coeff_const(29.0)),
    (62, hilbert_coeff_const(31.0)),
];

#[derive(Clone, Copy, Debug)]
pub struct FrequencyShifterParams {
    pub shift_hz: f64,
    pub mix: f64,
}

impl FrequencyShifterParams {
    fn sanitized(self, sample_rate: f64) -> Self {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let max_shift = sample_rate * 0.45;
        Self {
            shift_hz: clamp(
                safe_finite(self.shift_hz, DEFAULT_SHIFT_HZ),
                -max_shift,
                max_shift,
            ),
            mix: clamp(safe_finite(self.mix, DEFAULT_MIX), 0.0, 1.0),
        }
    }
}

impl Default for FrequencyShifterParams {
    fn default() -> Self {
        Self {
            shift_hz: DEFAULT_SHIFT_HZ,
            mix: DEFAULT_MIX,
        }
    }
}

pub struct FrequencyShifterChannel {
    hilbert: HilbertFir,
    phase: f64,
}

impl FrequencyShifterChannel {
    pub fn new() -> Self {
        Self {
            hilbert: HilbertFir::default(),
            phase: 0.0,
        }
    }

    pub fn clear(&mut self) {
        self.hilbert.clear();
        self.phase = 0.0;
    }

    pub fn process(&mut self, input: f32, params: FrequencyShifterParams, sample_rate: f64) -> f32 {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let params = params.sanitized(sample_rate);
        let (real, imag) = self.hilbert.process(input as f64);

        if params.mix <= 0.0 || params.shift_hz.abs() < 1e-9 {
            return input;
        }

        self.phase = wrap_phase(self.phase + params.shift_hz * TAU / sample_rate);
        let (sin, cos) = self.phase.sin_cos();
        let wet = real * cos - imag * sin;
        let mixed = input as f64 * (1.0 - params.mix) + wet * params.mix;
        clamp(safe_finite(mixed, 0.0), -8.0, 8.0) as f32
    }
}

impl Default for FrequencyShifterChannel {
    fn default() -> Self {
        Self::new()
    }
}

pub struct FrequencyShifterState {
    left: FrequencyShifterChannel,
    right: FrequencyShifterChannel,
}

impl FrequencyShifterState {
    pub fn new() -> Self {
        Self {
            left: FrequencyShifterChannel::new(),
            right: FrequencyShifterChannel::new(),
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
        params: FrequencyShifterParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        (
            self.left.process(input_l, params, sample_rate),
            self.right.process(input_r, params, sample_rate),
        )
    }
}

impl Default for FrequencyShifterState {
    fn default() -> Self {
        Self::new()
    }
}

struct HilbertFir {
    samples: [f64; HILBERT_TAPS],
    write: usize,
}

impl Default for HilbertFir {
    fn default() -> Self {
        Self {
            samples: [0.0; HILBERT_TAPS],
            write: 0,
        }
    }
}

impl HilbertFir {
    fn clear(&mut self) {
        self.samples.fill(0.0);
        self.write = 0;
    }

    fn process(&mut self, input: f64) -> (f64, f64) {
        self.samples[self.write] = safe_finite(input, 0.0);
        self.write = (self.write + 1) % HILBERT_TAPS;

        let real = self.sample_at_delay(HILBERT_CENTER);
        let mut imag = 0.0;
        for &(offset, coefficient) in &HILBERT_ODD_TAPS {
            imag += coefficient * self.sample_at_delay(offset);
        }
        (real, safe_finite(imag, 0.0))
    }

    fn sample_at_delay(&self, delay: usize) -> f64 {
        let index = (self.write + HILBERT_TAPS - 1 - delay.min(HILBERT_TAPS - 1)) % HILBERT_TAPS;
        self.samples[index]
    }
}

#[inline]
const fn hilbert_coeff_const(k: f64) -> f64 {
    2.0 / (std::f64::consts::PI * k)
}

#[inline]
fn wrap_phase(value: f64) -> f64 {
    let wrapped = value % TAU;
    if wrapped < 0.0 {
        wrapped + TAU
    } else {
        wrapped
    }
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

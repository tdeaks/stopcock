use crate::math::{clamp, safe_finite};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FilterKind {
    Lowpass,
    Highpass,
    Bandpass,
    Notch,
    Allpass,
    Peak,
    Lowshelf,
    Highshelf,
}

impl FilterKind {
    pub fn from_optional(kind: Option<&str>) -> Self {
        match kind {
            Some("highpass") => Self::Highpass,
            Some("bandpass") => Self::Bandpass,
            Some("notch") => Self::Notch,
            Some("allpass") => Self::Allpass,
            Some("peak") => Self::Peak,
            Some("lowshelf") => Self::Lowshelf,
            Some("highshelf") => Self::Highshelf,
            Some("lowpass") | None => Self::Lowpass,
            Some(_) => Self::Lowpass,
        }
    }
}

#[derive(Default)]
pub struct BiquadState {
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
}

impl BiquadState {
    pub fn design(&mut self, kind: &str, freq: f64, q: f64, gain_db: f64, sample_rate: f64) {
        self.design_kind(
            FilterKind::from_optional(Some(kind)),
            freq,
            q,
            gain_db,
            sample_rate,
        );
    }

    pub fn design_kind(
        &mut self,
        kind: FilterKind,
        freq: f64,
        q: f64,
        gain_db: f64,
        sample_rate: f64,
    ) {
        let sample_rate = safe_finite(sample_rate, 48_000.0).max(1.0);
        let freq = clamp(safe_finite(freq, 0.0), 0.0, sample_rate * 0.499);
        let q = safe_finite(q, 0.707).max(1e-6);
        let w0 = 2.0 * std::f64::consts::PI * freq / sample_rate;
        let cos = w0.cos();
        let sin = w0.sin();
        let alpha = sin / (2.0 * q);
        let a = 10.0_f64.powf(safe_finite(gain_db, 0.0) / 40.0);
        let (b0, b1, b2, a0, a1, a2) = match kind {
            FilterKind::Highpass => (
                (1.0 + cos) / 2.0,
                -(1.0 + cos),
                (1.0 + cos) / 2.0,
                1.0 + alpha,
                -2.0 * cos,
                1.0 - alpha,
            ),
            FilterKind::Bandpass => (alpha, 0.0, -alpha, 1.0 + alpha, -2.0 * cos, 1.0 - alpha),
            FilterKind::Notch => (1.0, -2.0 * cos, 1.0, 1.0 + alpha, -2.0 * cos, 1.0 - alpha),
            FilterKind::Allpass => (
                1.0 - alpha,
                -2.0 * cos,
                1.0 + alpha,
                1.0 + alpha,
                -2.0 * cos,
                1.0 - alpha,
            ),
            FilterKind::Peak => (
                1.0 + alpha * a,
                -2.0 * cos,
                1.0 - alpha * a,
                1.0 + alpha / a,
                -2.0 * cos,
                1.0 - alpha / a,
            ),
            FilterKind::Lowshelf => {
                let sqrt_a = a.sqrt();
                let two = 2.0 * sqrt_a * alpha;
                (
                    a * ((a + 1.0) - (a - 1.0) * cos + two),
                    2.0 * a * ((a - 1.0) - (a + 1.0) * cos),
                    a * ((a + 1.0) - (a - 1.0) * cos - two),
                    (a + 1.0) + (a - 1.0) * cos + two,
                    -2.0 * ((a - 1.0) + (a + 1.0) * cos),
                    (a + 1.0) + (a - 1.0) * cos - two,
                )
            }
            FilterKind::Highshelf => {
                let sqrt_a = a.sqrt();
                let two = 2.0 * sqrt_a * alpha;
                (
                    a * ((a + 1.0) + (a - 1.0) * cos + two),
                    -2.0 * a * ((a - 1.0) + (a + 1.0) * cos),
                    a * ((a + 1.0) + (a - 1.0) * cos - two),
                    (a + 1.0) - (a - 1.0) * cos + two,
                    2.0 * ((a - 1.0) - (a + 1.0) * cos),
                    (a + 1.0) - (a - 1.0) * cos - two,
                )
            }
            FilterKind::Lowpass => (
                (1.0 - cos) / 2.0,
                1.0 - cos,
                (1.0 - cos) / 2.0,
                1.0 + alpha,
                -2.0 * cos,
                1.0 - alpha,
            ),
        };
        self.b0 = b0 / a0;
        self.b1 = b1 / a0;
        self.b2 = b2 / a0;
        self.a1 = a1 / a0;
        self.a2 = a2 / a0;
    }

    #[inline]
    pub fn process(&mut self, x: f64) -> f64 {
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = safe_finite(y, 0.0);
        self.y1
    }
}

#[derive(Default)]
pub struct OnePoleLowpass {
    z: f64,
    a: f64,
}

impl OnePoleLowpass {
    pub fn set_cutoff(&mut self, freq: f64, sample_rate: f64) {
        let sample_rate = safe_finite(sample_rate, 48_000.0).max(1.0);
        let freq = clamp(safe_finite(freq, 0.0), 0.0, sample_rate * 0.499);
        self.a = 1.0 - (-2.0 * std::f64::consts::PI * freq / sample_rate).exp();
    }

    #[inline]
    pub fn process(&mut self, input: f64) -> f64 {
        self.z += self.a * (input - self.z);
        self.z = safe_finite(self.z, 0.0);
        self.z
    }

    pub fn reset(&mut self, value: f64) {
        self.z = safe_finite(value, 0.0);
    }
}

pub struct DcBlocker {
    x1: f64,
    y1: f64,
    r: f64,
}

impl Default for DcBlocker {
    fn default() -> Self {
        Self {
            x1: 0.0,
            y1: 0.0,
            r: 0.995,
        }
    }
}

impl DcBlocker {
    pub fn new(pole: f64) -> Self {
        Self {
            r: clamp(safe_finite(pole, 0.995), 0.0, 0.999_999),
            ..Self::default()
        }
    }

    #[inline]
    pub fn process(&mut self, input: f64) -> f64 {
        let y = input - self.x1 + self.r * self.y1;
        self.x1 = input;
        self.y1 = safe_finite(y, 0.0);
        self.y1
    }

    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.y1 = 0.0;
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StateVariableFilterMode {
    Lowpass,
    Highpass,
    Bandpass,
    Notch,
}

impl StateVariableFilterMode {
    pub fn from_optional(mode: Option<&str>) -> Self {
        match mode {
            Some("highpass") => Self::Highpass,
            Some("bandpass") => Self::Bandpass,
            Some("notch") => Self::Notch,
            Some("lowpass") | None => Self::Lowpass,
            Some(_) => Self::Lowpass,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct StateVariableFilterParams {
    pub mode: StateVariableFilterMode,
    pub freq: f64,
    pub resonance: f64,
    pub drive: f64,
    pub mix: f64,
}

impl Default for StateVariableFilterParams {
    fn default() -> Self {
        Self {
            mode: StateVariableFilterMode::Lowpass,
            freq: 1_000.0,
            resonance: 0.0,
            drive: 0.0,
            mix: 1.0,
        }
    }
}

impl StateVariableFilterParams {
    fn sanitized(self, sample_rate: f64) -> Self {
        let sample_rate = safe_finite(sample_rate, 48_000.0).max(1.0);
        Self {
            mode: self.mode,
            freq: clamp(safe_finite(self.freq, 1_000.0), 1e-6, sample_rate * 0.49),
            resonance: clamp(safe_finite(self.resonance, 0.0), 0.0, 1.0),
            drive: clamp(safe_finite(self.drive, 0.0), 0.0, 2.0),
            mix: clamp(safe_finite(self.mix, 1.0), 0.0, 1.0),
        }
    }
}

#[derive(Default)]
pub struct StateVariableFilterState {
    ic1eq: f64,
    ic2eq: f64,
}

impl StateVariableFilterState {
    pub fn clear(&mut self) {
        self.ic1eq = 0.0;
        self.ic2eq = 0.0;
    }

    pub fn process(
        &mut self,
        input: f32,
        params: StateVariableFilterParams,
        sample_rate: f64,
    ) -> f32 {
        let sample_rate = safe_finite(sample_rate, 48_000.0).max(1.0);
        let params = params.sanitized(sample_rate);
        if params.mix <= 0.0 {
            return input;
        }

        let driven = drive_input(input as f64, params.drive);
        let g = (std::f64::consts::PI * params.freq / sample_rate).tan();
        let q = 0.5 + params.resonance * 24.5;
        let damping = 1.0 / q;
        let h = 1.0 / (1.0 + damping * g + g * g);
        let high = (driven - (damping + g) * self.ic1eq - self.ic2eq) * h;
        let band = g * high + self.ic1eq;
        let low = g * band + self.ic2eq;

        self.ic1eq = safe_finite(2.0 * band - self.ic1eq, 0.0);
        self.ic2eq = safe_finite(2.0 * low - self.ic2eq, 0.0);

        let wet = match params.mode {
            StateVariableFilterMode::Lowpass => low,
            StateVariableFilterMode::Highpass => high,
            StateVariableFilterMode::Bandpass => band,
            StateVariableFilterMode::Notch => low + high,
        };
        let mixed = input as f64 * (1.0 - params.mix) + wet * params.mix;
        clamp(safe_finite(mixed, 0.0), -8.0, 8.0) as f32
    }
}

fn drive_input(input: f64, drive: f64) -> f64 {
    if drive <= 0.0 {
        return safe_finite(input, 0.0);
    }
    let gain = 1.0 + drive * 8.0;
    let normalizer = gain.tanh().max(1e-12);
    safe_finite((input * gain).tanh() / normalizer, 0.0)
}

#[cfg(test)]
mod tests;

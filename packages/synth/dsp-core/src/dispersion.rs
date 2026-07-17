use crate::math::{clamp, safe_finite};

#[derive(Clone, Copy, Default)]
pub struct FirstOrderAllpass {
    x1: f64,
    y1: f64,
}

impl FirstOrderAllpass {
    #[inline]
    pub fn process(&mut self, input: f64, coefficient: f64) -> f64 {
        let coefficient = clamp(safe_finite(coefficient, 0.0), -0.98, 0.98);
        let output = -coefficient * input + self.x1 + coefficient * self.y1;
        self.x1 = safe_finite(input, 0.0);
        self.y1 = safe_finite(output, 0.0);
        self.y1
    }

    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.y1 = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_order_allpass_unit_impulse_stays_finite_and_bounded() {
        let mut allpass = FirstOrderAllpass::default();
        let mut energy = 0.0;

        for i in 0..128 {
            let input = if i == 0 { 1.0 } else { 0.0 };
            let output = allpass.process(input, 0.7);
            assert!(output.is_finite());
            energy += output * output;
        }

        assert!(energy > 0.9);
        assert!(energy < 1.1);
    }

    #[test]
    fn first_order_allpass_sanitizes_hostile_coefficients() {
        let mut allpass = FirstOrderAllpass::default();

        for coefficient in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 2.0, -2.0] {
            let output = allpass.process(1.0, coefficient);
            assert!(output.is_finite());
        }
    }

    #[test]
    fn first_order_allpass_reset_clears_history() {
        let mut allpass = FirstOrderAllpass::default();
        let _ = allpass.process(1.0, 0.5);
        allpass.reset();

        assert_eq!(allpass.process(0.0, 0.5), 0.0);
    }
}

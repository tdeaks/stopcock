use crate::math::{clamp, safe_finite};

pub fn tape_saturate(value: f64, drive: f64) -> f64 {
    let amount = 1.0 + safe_finite(drive, 0.0).max(0.0) * 8.0;
    (value * amount).tanh() / amount
}

pub fn soft_knee(over: f64, knee: f64) -> f64 {
    if knee <= 0.0 {
        over.max(0.0)
    } else if over < -knee / 2.0 {
        0.0
    } else if over > knee / 2.0 {
        over
    } else {
        let x = over + knee / 2.0;
        x * x / (2.0 * knee)
    }
}

pub fn hard_clip(value: f64, ceiling: f64) -> f64 {
    let ceiling = safe_finite(ceiling, 1.0).abs().max(1e-9);
    clamp(value, -ceiling, ceiling)
}

pub fn soft_clip(value: f64, drive: f64) -> f64 {
    let drive = 1.0 + safe_finite(drive, 0.0).max(0.0);
    (value * drive).tanh()
}

pub fn asymmetric_tanh(value: f64, drive: f64, bias: f64) -> f64 {
    let driven = value * (1.0 + safe_finite(drive, 0.0).max(0.0) * 8.0);
    let bias = safe_finite(bias, 0.0);
    let offset = bias.tanh();
    ((driven + bias).tanh() - offset) / (1.0 - offset.abs()).max(1e-6)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tape_saturation_is_bounded_and_odd() {
        let pos = tape_saturate(2.0, 0.5);
        let neg = tape_saturate(-2.0, 0.5);
        assert!(pos <= 1.0);
        assert!((pos + neg).abs() < 1e-12);
    }

    #[test]
    fn soft_knee_is_continuous_around_zero() {
        let left = soft_knee(-0.001, 1.0);
        let right = soft_knee(0.001, 1.0);
        assert!((right - left).abs() < 0.002);
    }

    #[test]
    fn asymmetric_tanh_stays_finite_under_large_drive() {
        for value in [-10.0, -1.0, 0.0, 1.0, 10.0] {
            assert!(asymmetric_tanh(value, 64.0, 0.2).is_finite());
        }
    }
}

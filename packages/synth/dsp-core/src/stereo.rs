use crate::math::clamp;

pub fn equal_power_pan(position: f64) -> (f64, f64) {
    let angle = (clamp(position, -1.0, 1.0) + 1.0) * std::f64::consts::PI / 4.0;
    (angle.cos(), angle.sin())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equal_power_pan_hits_hard_edges() {
        let (left, right) = equal_power_pan(-1.0);
        assert_eq!(left, 1.0);
        assert_eq!(right, 0.0);

        let (left, right) = equal_power_pan(1.0);
        assert!(left.abs() < 1e-12);
        assert_eq!(right, 1.0);
    }

    #[test]
    fn equal_power_pan_has_constant_center_power() {
        let (left, right) = equal_power_pan(0.0);

        assert!((left - std::f64::consts::FRAC_1_SQRT_2).abs() < 1e-12);
        assert!((right - std::f64::consts::FRAC_1_SQRT_2).abs() < 1e-12);
        assert!(((left * left + right * right) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn equal_power_pan_clamps_out_of_range_positions() {
        assert_eq!(equal_power_pan(-2.0), equal_power_pan(-1.0));
        assert_eq!(equal_power_pan(2.0), equal_power_pan(1.0));
    }
}

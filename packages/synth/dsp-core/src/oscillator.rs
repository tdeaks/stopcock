use crate::math::{clamp, TAU};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Waveform {
    Sine,
    Saw,
    Square,
    Triangle,
}

impl Waveform {
    pub fn from_optional(wave: Option<&str>) -> Self {
        match wave {
            Some("saw") => Self::Saw,
            Some("square") => Self::Square,
            Some("triangle") => Self::Triangle,
            Some("sine") | None => Self::Sine,
            Some(_) => Self::Triangle,
        }
    }
}

#[inline]
pub fn wrap_phase(mut phase: f64) -> f64 {
    phase %= 1.0;
    if phase < 0.0 {
        phase + 1.0
    } else {
        phase
    }
}

#[inline]
fn poly_blep(t: f64, dt: f64) -> f64 {
    if dt <= 0.0 {
        0.0
    } else if t < dt {
        let x = t / dt;
        x + x - x * x - 1.0
    } else if t > 1.0 - dt {
        let x = (t - 1.0) / dt;
        x * x + x + x + 1.0
    } else {
        0.0
    }
}

#[inline]
pub fn sample_polyblep(wave: &str, phase: f64, dt: f64, triangle: &mut f64) -> f64 {
    sample_waveform(Waveform::from_optional(Some(wave)), phase, dt, triangle)
}

#[inline]
pub fn sample_waveform(wave: Waveform, phase: f64, dt: f64, triangle: &mut f64) -> f64 {
    let t = wrap_phase(phase);
    match wave {
        Waveform::Sine => (TAU * t).sin(),
        Waveform::Saw => 2.0 * t - 1.0 - poly_blep(t, dt),
        Waveform::Square => {
            (if t < 0.5 { 1.0 } else { -1.0 }) + poly_blep(t, dt)
                - poly_blep(wrap_phase(t + 0.5), dt)
        }
        Waveform::Triangle => {
            let square = (if t < 0.5 { 1.0 } else { -1.0 }) + poly_blep(t, dt)
                - poly_blep(wrap_phase(t + 0.5), dt);
            *triangle = clamp((*triangle + square * dt * 4.0) * 0.999, -1.2, 1.2);
            *triangle
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_phase_normalizes_negative_and_overflow_values() {
        assert_eq!(wrap_phase(-0.25), 0.75);
        assert_eq!(wrap_phase(1.25), 0.25);
    }

    #[test]
    fn sine_wave_matches_unit_circle_quadrants() {
        let mut triangle = 0.0;
        assert!((sample_waveform(Waveform::Sine, 0.25, 0.0, &mut triangle) - 1.0).abs() < 1e-12);
        assert!((sample_waveform(Waveform::Sine, 0.75, 0.0, &mut triangle) + 1.0).abs() < 1e-12);
    }

    #[test]
    fn polyblep_square_is_bounded_at_edges() {
        let mut triangle = 0.0;
        for phase in [0.0, 0.001, 0.499, 0.5, 0.999] {
            let value = sample_waveform(Waveform::Square, phase, 0.01, &mut triangle);
            assert!(value.is_finite());
            assert!((-1.1..=1.1).contains(&value));
        }
    }
}

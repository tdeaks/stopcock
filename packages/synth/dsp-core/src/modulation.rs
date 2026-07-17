use crate::math::{clamp, safe_finite, TAU};
use crate::noise::Mulberry32;

#[inline]
pub fn sine_lfo_at(rate_hz: f64, sample_rate: f64, frame: usize, phase_radians: f64) -> f64 {
    let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
    let rate_hz = safe_finite(rate_hz, 0.0).max(0.0);
    (TAU * rate_hz * frame as f64 / sample_rate + safe_finite(phase_radians, 0.0)).sin()
}

pub struct PhaseLfo {
    phase: f64,
}

impl PhaseLfo {
    pub fn new(phase_radians: f64) -> Self {
        Self {
            phase: safe_finite(phase_radians, 0.0).rem_euclid(TAU),
        }
    }

    pub fn phase(&self) -> f64 {
        self.phase
    }

    pub fn reset(&mut self, phase_radians: f64) {
        self.phase = safe_finite(phase_radians, 0.0).rem_euclid(TAU);
    }

    pub fn process_sine(&mut self, rate_hz: f64, sample_rate: f64, phase_offset: f64) -> f64 {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        let rate_hz = safe_finite(rate_hz, 0.0).max(0.0);
        let out = (self.phase + safe_finite(phase_offset, 0.0)).sin();
        let step = clamp(TAU * rate_hz / sample_rate, 0.0, TAU);
        self.phase = (self.phase + step).rem_euclid(TAU);
        out
    }
}

pub struct SmoothedValue {
    current: f64,
}

impl SmoothedValue {
    pub fn new(initial: f64) -> Self {
        Self {
            current: safe_finite(initial, 0.0),
        }
    }

    pub fn value(&self) -> f64 {
        self.current
    }

    pub fn reset(&mut self, value: f64) {
        self.current = safe_finite(value, 0.0);
    }

    pub fn process(&mut self, target: f64, time_sec: f64, sample_rate: f64) -> f64 {
        let target = safe_finite(target, self.current);
        let time_sec = safe_finite(time_sec, 0.0).max(0.0);
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        if time_sec <= 0.0 {
            self.current = target;
            return self.current;
        }
        let coeff = (-1.0 / (time_sec * sample_rate)).exp();
        self.current = target + (self.current - target) * coeff;
        self.current
    }
}

pub struct EnvelopeFollower {
    level: f64,
}

impl EnvelopeFollower {
    pub fn new(initial: f64) -> Self {
        Self {
            level: safe_finite(initial, 0.0).abs(),
        }
    }

    pub fn level(&self) -> f64 {
        self.level
    }

    pub fn reset(&mut self, value: f64) {
        self.level = safe_finite(value, 0.0).abs();
    }

    pub fn process(
        &mut self,
        input: f32,
        attack_sec: f64,
        release_sec: f64,
        sample_rate: f64,
    ) -> f64 {
        let target = (input as f64).abs();
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        let time_sec = if target > self.level {
            safe_finite(attack_sec, 0.0).max(0.0)
        } else {
            safe_finite(release_sec, 0.0).max(0.0)
        };
        if time_sec <= 0.0 {
            self.level = target;
        } else {
            let coeff = (-1.0 / (time_sec * sample_rate)).exp();
            self.level = target + (self.level - target) * coeff;
        }
        self.level
    }
}

pub struct SampleAndHold {
    held: f64,
    frames_until_update: usize,
}

impl SampleAndHold {
    pub fn new(initial: f64) -> Self {
        Self {
            held: safe_finite(initial, 0.0),
            frames_until_update: 0,
        }
    }

    pub fn value(&self) -> f64 {
        self.held
    }

    pub fn reset(&mut self, value: f64) {
        self.held = safe_finite(value, 0.0);
        self.frames_until_update = 0;
    }

    pub fn process(&mut self, input: f64, rate_hz: f64, sample_rate: f64) -> f64 {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        let rate_hz = safe_finite(rate_hz, sample_rate).max(1e-6);
        let period = (sample_rate / rate_hz).round().max(1.0) as usize;
        if self.frames_until_update == 0 {
            self.held = safe_finite(input, self.held);
            self.frames_until_update = period;
        }
        self.frames_until_update -= 1;
        self.held
    }
}

pub struct RandomDrift {
    rng: Mulberry32,
    current: f64,
    target: f64,
    frames_until_target: usize,
}

impl RandomDrift {
    pub fn new(seed: u32) -> Self {
        Self {
            rng: Mulberry32::new(seed),
            current: 0.0,
            target: 0.0,
            frames_until_target: 0,
        }
    }

    pub fn value(&self) -> f64 {
        self.current
    }

    pub fn reset(&mut self, seed: u32) {
        *self = Self::new(seed);
    }

    pub fn process(&mut self, rate_hz: f64, depth: f64, slew_sec: f64, sample_rate: f64) -> f64 {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        let rate_hz = safe_finite(rate_hz, 1.0).max(1e-6);
        let period = (sample_rate / rate_hz).round().max(1.0) as usize;
        let depth = safe_finite(depth, 0.0).abs();
        if self.frames_until_target == 0 {
            self.target = (self.rng.next_f64() * 2.0 - 1.0) * depth;
            self.frames_until_target = period;
        }
        self.frames_until_target -= 1;

        if slew_sec <= 0.0 {
            self.current = self.target;
        } else {
            let coeff = (-1.0 / (safe_finite(slew_sec, 0.0).max(0.0) * sample_rate)).exp();
            self.current = self.target + (self.current - self.target) * coeff;
        }
        clamp(self.current, -depth, depth)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sine_lfo_at_hits_quadrants() {
        let sample_rate = 100.0;
        assert!((sine_lfo_at(1.0, sample_rate, 0, 0.0) - 0.0).abs() < 1e-12);
        assert!((sine_lfo_at(1.0, sample_rate, 25, 0.0) - 1.0).abs() < 1e-12);
        assert!((sine_lfo_at(1.0, sample_rate, 50, 0.0) - 0.0).abs() < 1e-12);
        assert!((sine_lfo_at(1.0, sample_rate, 75, 0.0) + 1.0).abs() < 1e-12);
    }

    #[test]
    fn phase_lfo_advances_without_leaving_unit_bounds() {
        let mut lfo = PhaseLfo::new(0.0);
        for _ in 0..256 {
            let sample = lfo.process_sine(5.0, 100.0, 0.0);
            assert!((-1.0..=1.0).contains(&sample));
            assert!((0.0..TAU).contains(&lfo.phase()));
        }
    }

    #[test]
    fn smoothed_value_moves_monotonically_toward_target() {
        let mut smoother = SmoothedValue::new(0.0);
        let mut previous = 0.0;
        for _ in 0..128 {
            let next = smoother.process(1.0, 0.02, 1_000.0);
            assert!(next >= previous);
            assert!(next < 1.0);
            previous = next;
        }
        assert_eq!(smoother.process(0.25, 0.0, 1_000.0), 0.25);
    }

    #[test]
    fn envelope_follower_uses_attack_and_release_paths() {
        let mut follower = EnvelopeFollower::new(0.0);
        let rising = follower.process(1.0, 0.01, 0.5, 1_000.0);
        assert!(rising > 0.0 && rising < 1.0);
        let before_release = follower.level();
        let falling = follower.process(0.0, 0.01, 0.5, 1_000.0);
        assert!(falling < before_release);
        assert!(falling > 0.0);
    }

    #[test]
    fn sample_and_hold_keeps_value_for_period() {
        let mut hold = SampleAndHold::new(0.0);
        assert_eq!(hold.process(1.0, 10.0, 100.0), 1.0);
        for value in 2..=10 {
            assert_eq!(hold.process(value as f64, 10.0, 100.0), 1.0);
        }
        assert_eq!(hold.process(11.0, 10.0, 100.0), 11.0);
    }

    #[test]
    fn random_drift_is_deterministic_and_bounded() {
        let mut first = RandomDrift::new(42);
        let mut second = RandomDrift::new(42);
        for _ in 0..512 {
            let a = first.process(2.0, 0.25, 0.01, 100.0);
            let b = second.process(2.0, 0.25, 0.01, 100.0);
            assert_eq!(a, b);
            assert!((-0.25..=0.25).contains(&a));
        }
    }
}

use crate::math::{clamp, safe_finite};

pub struct DelayLine {
    line: Vec<f32>,
    write: usize,
}

impl DelayLine {
    pub fn new(size: usize) -> Self {
        Self {
            line: vec![0.0; size.max(1)],
            write: 0,
        }
    }

    pub fn len(&self) -> usize {
        self.line.len()
    }

    pub fn is_empty(&self) -> bool {
        self.line.is_empty()
    }

    pub fn read_linear(&self, delay_samples: f64) -> f64 {
        read_delay_line(&self.line, self.write, delay_samples)
    }

    pub fn read_integer(&self, delay_samples: usize) -> f32 {
        let len = self.line.len();
        let read = (self.write + len - delay_samples.min(len - 1).max(1)) % len;
        self.line[read]
    }

    pub fn push(&mut self, sample: f32) {
        self.line[self.write] = sample;
        self.write = (self.write + 1) % self.line.len();
    }

    pub fn clear(&mut self) {
        self.line.fill(0.0);
        self.write = 0;
    }
}

pub struct FeedbackDelay {
    delay: DelayLine,
}

impl FeedbackDelay {
    pub fn new(size: usize) -> Self {
        Self {
            delay: DelayLine::new(size),
        }
    }

    pub fn len(&self) -> usize {
        self.delay.len()
    }

    pub fn is_empty(&self) -> bool {
        self.delay.is_empty()
    }

    pub fn clear(&mut self) {
        self.delay.clear();
    }

    pub fn process(&mut self, input: f32, delay_samples: usize, feedback: f64, mix: f64) -> f32 {
        let feedback = clamp(safe_finite(feedback, 0.0), -0.999, 0.999) as f32;
        let mix = clamp(safe_finite(mix, 0.0), 0.0, 1.0) as f32;
        let wet = self.delay.read_integer(delay_samples);
        let out = input * (1.0 - mix) + wet * mix;
        self.delay.push(input + wet * feedback);
        out
    }
}

pub struct DampedComb {
    delay: DelayLine,
    damp_state: f32,
}

impl DampedComb {
    pub fn new(size: usize) -> Self {
        Self {
            delay: DelayLine::new(size),
            damp_state: 0.0,
        }
    }

    pub fn len(&self) -> usize {
        self.delay.len()
    }

    pub fn is_empty(&self) -> bool {
        self.delay.is_empty()
    }

    pub fn clear(&mut self) {
        self.delay.clear();
        self.damp_state = 0.0;
    }

    pub fn damp_state(&self) -> f32 {
        self.damp_state
    }

    pub fn process(&mut self, input: f32, delay_samples: usize, feedback: f64, damp: f64) -> f32 {
        let feedback = clamp(safe_finite(feedback, 0.0), -0.999, 0.999) as f32;
        let damp = clamp(safe_finite(damp, 0.0), 0.0, 1.0) as f32;
        let delayed = self.delay.read_integer(delay_samples);
        self.damp_state = delayed * (1.0 - damp) + self.damp_state * damp;
        let out = input + self.damp_state;
        self.delay.push(input + self.damp_state * feedback);
        out
    }
}

pub fn sample_linear(samples: &[f32], index: f64) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let lo = index.floor().max(0.0) as usize;
    let hi = (lo + 1).min(samples.len() - 1);
    let frac = index - lo as f64;
    (samples[lo] as f64 * (1.0 - frac) + samples[hi] as f64 * frac) as f32
}

pub fn read_delay_line(line: &[f32], write: usize, delay_samples: f64) -> f64 {
    let len = line.len();
    if len == 0 {
        return 0.0;
    }
    let mut read = write as f64 - clamp(delay_samples, 1.0, (len - 1).max(1) as f64);
    while read < 0.0 {
        read += len as f64;
    }
    while read >= len as f64 {
        read -= len as f64;
    }
    let i0 = read.floor() as usize % len;
    let i1 = (i0 + 1) % len;
    let frac = read - i0 as f64;
    line[i0] as f64 * (1.0 - frac) + line[i1] as f64 * frac
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_linear_interpolates_between_neighboring_samples() {
        assert_eq!(sample_linear(&[0.0, 10.0, 20.0], 1.5), 15.0);
    }

    #[test]
    fn sample_linear_handles_empty_buffers() {
        assert_eq!(sample_linear(&[], 0.0), 0.0);
    }

    #[test]
    fn delay_line_reads_fractional_wrapped_positions() {
        let line = [0.0, 10.0, 20.0, 30.0];
        assert!((read_delay_line(&line, 1, 1.5) - 15.0).abs() < 1e-12);
    }

    #[test]
    fn delay_line_push_and_read_are_allocation_free_after_creation() {
        let mut delay = DelayLine::new(4);
        delay.push(1.0);
        delay.push(2.0);
        delay.push(3.0);

        assert_eq!(delay.len(), 4);
        assert_eq!(delay.read_integer(1), 3.0);
        assert!((delay.read_linear(1.5) - 2.5).abs() < 1e-12);
    }

    #[test]
    fn feedback_delay_returns_wet_signal_after_delay() {
        let mut delay = FeedbackDelay::new(4);

        assert_eq!(delay.process(1.0, 1, 0.0, 1.0), 0.0);
        assert_eq!(delay.process(0.0, 1, 0.0, 1.0), 1.0);
        assert_eq!(delay.process(0.0, 1, 0.0, 1.0), 0.0);
    }

    #[test]
    fn feedback_delay_clamps_feedback_and_mix() {
        let mut delay = FeedbackDelay::new(2);

        assert_eq!(delay.process(0.5, 1, f64::NAN, f64::NAN), 0.5);
        assert!(delay.process(0.0, 1, 2.0, 2.0).is_finite());
    }

    #[test]
    fn damped_comb_outputs_input_plus_filtered_delay() {
        let mut comb = DampedComb::new(4);

        assert_eq!(comb.process(1.0, 1, 0.0, 0.0), 1.0);
        assert_eq!(comb.process(0.0, 1, 0.0, 0.0), 1.0);
        assert_eq!(comb.process(0.0, 1, 0.0, 0.0), 0.0);
    }

    #[test]
    fn damped_comb_smooths_delayed_signal() {
        let mut comb = DampedComb::new(4);

        let _ = comb.process(1.0, 1, 0.0, 0.5);
        let second = comb.process(0.0, 1, 0.0, 0.5);
        let third = comb.process(0.0, 1, 0.0, 0.5);

        assert_eq!(second, 0.5);
        assert_eq!(third, 0.25);
        assert_eq!(comb.damp_state(), 0.25);
    }
}

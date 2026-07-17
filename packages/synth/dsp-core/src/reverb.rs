pub struct ReverbLine {
    history: Vec<f32>,
    write: usize,
}

impl ReverbLine {
    pub fn new(size: usize) -> Self {
        Self {
            history: vec![0.0; size.max(1)],
            write: 0,
        }
    }

    pub fn len(&self) -> usize {
        self.history.len()
    }

    pub fn is_empty(&self) -> bool {
        self.history.is_empty()
    }

    pub fn clear(&mut self) {
        self.history.fill(0.0);
        self.write = 0;
    }

    pub fn process(&mut self, input: f32, ir: &[f32]) -> f32 {
        if ir.is_empty() {
            return input;
        }
        if self.history.len() != ir.len() {
            self.history.resize(ir.len().max(1), 0.0);
            self.write = 0;
        }
        self.history[self.write] = input;
        let mut wet = 0.0_f32;
        let len = self.history.len();
        for (tap, coeff) in ir.iter().enumerate() {
            wet += self.history[(self.write + len - tap) % len] * coeff;
        }
        self.write = (self.write + 1) % len;
        wet
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reverb_line_streams_direct_convolution() {
        let mut line = ReverbLine::new(2);
        let ir = [0.5, 0.25];

        assert_eq!(line.process(1.0, &ir), 0.5);
        assert_eq!(line.process(0.0, &ir), 0.25);
        assert_eq!(line.process(0.0, &ir), 0.0);
    }

    #[test]
    fn reverb_line_empty_ir_is_bypass() {
        let mut line = ReverbLine::new(1);

        assert_eq!(line.process(0.75, &[]), 0.75);
    }

    #[test]
    fn reverb_line_resizes_when_ir_changes() {
        let mut line = ReverbLine::new(1);

        assert_eq!(line.process(1.0, &[1.0]), 1.0);
        assert_eq!(line.process(0.0, &[0.5, 0.25]), 0.0);
        assert_eq!(line.len(), 2);
    }

    #[test]
    fn reverb_line_clear_resets_history() {
        let mut line = ReverbLine::new(2);
        let ir = [0.5, 0.25];

        assert_eq!(line.process(1.0, &ir), 0.5);
        line.clear();
        assert_eq!(line.process(0.0, &ir), 0.0);
    }
}

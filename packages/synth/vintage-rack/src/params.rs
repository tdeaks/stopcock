use stopcock_dsp_core::{clamp, safe_finite};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RackMode {
    EnsembleChorus,
    DrumEcho,
    MicroPitch,
    Plate,
    Spring,
    LoFi,
    Saturator,
}

#[derive(Clone, Copy, Debug)]
pub struct RackParams {
    pub mode: RackMode,
    pub mix: f64,
    pub drive: f64,
    pub tone: f64,
    pub motion: f64,
    pub age: f64,
    pub width: f64,
    pub feedback: f64,
    pub time_ms: f64,
    pub decay: f64,
    pub output: f64,
}

impl Default for RackParams {
    fn default() -> Self {
        Self {
            mode: RackMode::EnsembleChorus,
            mix: 0.35,
            drive: 0.18,
            tone: 0.76,
            motion: 0.28,
            age: 0.2,
            width: 0.9,
            feedback: 0.32,
            time_ms: 140.0,
            decay: 0.55,
            output: 1.0,
        }
    }
}

impl RackParams {
    #[must_use]
    pub fn sanitized(self) -> Self {
        Self {
            mode: self.mode,
            mix: clamp(safe_finite(self.mix, 0.35), 0.0, 1.0),
            drive: clamp(safe_finite(self.drive, 0.18), 0.0, 1.0),
            tone: clamp(safe_finite(self.tone, 0.76), 0.0, 1.0),
            motion: clamp(safe_finite(self.motion, 0.28), 0.0, 1.0),
            age: clamp(safe_finite(self.age, 0.2), 0.0, 1.0),
            width: clamp(safe_finite(self.width, 0.9), 0.0, 1.0),
            feedback: clamp(safe_finite(self.feedback, 0.32), 0.0, 0.96),
            time_ms: clamp(safe_finite(self.time_ms, 140.0), 1.0, 1_500.0),
            decay: clamp(safe_finite(self.decay, 0.55), 0.0, 1.0),
            output: clamp(safe_finite(self.output, 1.0), 0.0, 4.0),
        }
    }
}

#[derive(Clone)]
pub struct SamplerZone {
    pub samples: Vec<f32>,
    pub sample_rate: f64,
    pub root_midi: f64,
    pub key_low: f64,
    pub key_high: f64,
    pub velocity_low: f64,
    pub velocity_high: f64,
    pub looped: bool,
    pub loop_start: usize,
    pub loop_end: usize,
    pub gain: f64,
    pub pan: f64,
}

impl SamplerZone {
    pub fn new(samples: Vec<f32>, root_midi: f64) -> Self {
        Self {
            samples,
            sample_rate: 44_100.0,
            root_midi,
            key_low: 0.0,
            key_high: 127.0,
            velocity_low: 0.0,
            velocity_high: 1.0,
            looped: false,
            loop_start: 0,
            loop_end: 0,
            gain: 1.0,
            pan: 0.0,
        }
    }
}

#[derive(Clone, Copy)]
pub struct SamplerParams {
    pub freq: f64,
    pub velocity: f64,
    pub attack: f64,
    pub release: f64,
    pub level: f64,
}

impl Default for SamplerParams {
    fn default() -> Self {
        Self {
            freq: 440.0,
            velocity: 1.0,
            attack: 0.0,
            release: 0.08,
            level: 1.0,
        }
    }
}

#[derive(Clone, Copy)]
pub(super) struct SanitizedSamplerParams {
    pub midi: f64,
    pub velocity: f64,
    pub attack: f64,
    pub release: f64,
    pub level: f64,
}

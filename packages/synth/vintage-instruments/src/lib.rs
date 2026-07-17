#![deny(unsafe_code)]

mod engine;
mod event;
mod params;
#[cfg(test)]
mod tests;
mod voice;

pub use engine::VintageInstruments;
pub use event::{InstrumentEvent, TimedInstrumentEvent};
pub use params::{InstrumentMode, InstrumentParams};

pub const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
pub const MAX_VOICES: usize = 16;

fn sanitize_sample_rate(sample_rate: f64) -> f64 {
    if sample_rate.is_finite() && sample_rate > 0.0 {
        sample_rate
    } else {
        DEFAULT_SAMPLE_RATE
    }
}

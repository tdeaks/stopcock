#![deny(unsafe_code)]

mod engine;
mod modes;
mod params;
#[cfg(test)]
mod tests;

pub use engine::VintageRack;
pub use params::{RackMode, RackParams};

pub const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;

fn sanitize_sample_rate(sample_rate: f64) -> f64 {
    if sample_rate.is_finite() && sample_rate > 0.0 {
        sample_rate
    } else {
        DEFAULT_SAMPLE_RATE
    }
}

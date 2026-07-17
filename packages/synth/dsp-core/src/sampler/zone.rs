use crate::math::{clamp, safe_finite};

use super::types::SamplerZone;

#[derive(Clone, Copy)]
pub(super) struct SanitizedZone<'a> {
    pub samples: &'a [f32],
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

impl<'a> SanitizedZone<'a> {
    pub(super) fn new(zone: &'a SamplerZone) -> Self {
        let len = zone.samples.len();
        let loop_start = zone.loop_start.min(len.saturating_sub(1));
        let default_end = if zone.loop_end == 0 {
            len
        } else {
            zone.loop_end
        };
        let loop_end = default_end.clamp(loop_start.saturating_add(1), len.max(1));
        Self {
            samples: &zone.samples,
            sample_rate: safe_finite(zone.sample_rate, 44_100.0).max(1.0),
            root_midi: clamp(safe_finite(zone.root_midi, 60.0), 0.0, 127.0),
            key_low: clamp(safe_finite(zone.key_low, 0.0), 0.0, 127.0),
            key_high: clamp(safe_finite(zone.key_high, 127.0), 0.0, 127.0),
            velocity_low: clamp(safe_finite(zone.velocity_low, 0.0), 0.0, 1.0),
            velocity_high: clamp(safe_finite(zone.velocity_high, 1.0), 0.0, 1.0),
            looped: zone.looped && len > 1 && loop_end > loop_start + 1,
            loop_start,
            loop_end,
            gain: clamp(safe_finite(zone.gain, 1.0), 0.0, 8.0),
            pan: clamp(safe_finite(zone.pan, 0.0), -1.0, 1.0),
        }
    }

    fn matches(&self, midi: f64, velocity: f64) -> bool {
        !self.samples.is_empty()
            && midi >= self.key_low.min(self.key_high)
            && midi <= self.key_low.max(self.key_high)
            && velocity >= self.velocity_low.min(self.velocity_high)
            && velocity <= self.velocity_low.max(self.velocity_high)
    }
}

pub fn select_zone(zones: &[SamplerZone], midi: f64, velocity: f64) -> Option<usize> {
    let midi = clamp(safe_finite(midi, 60.0), 0.0, 127.0);
    let velocity = clamp(safe_finite(velocity, 1.0), 0.0, 1.0);
    let mut fallback = None;
    for (index, zone) in zones.iter().enumerate() {
        let zone = SanitizedZone::new(zone);
        if zone.samples.is_empty() {
            continue;
        }
        fallback.get_or_insert(index);
        if zone.matches(midi, velocity) {
            return Some(index);
        }
    }
    fallback
}

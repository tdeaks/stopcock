use crate::math::safe_finite;
use crate::stereo::equal_power_pan;

use super::playback::{
    ar_envelope, playback_ratio, read_zone_sample, sanitize_params, wrap_loop_position,
};
use super::types::{SamplerParams, SamplerZone};
use super::zone::{select_zone, SanitizedZone};

#[derive(Default)]
pub struct SamplerVoiceState {
    selected_zone: Option<usize>,
    position: f64,
    frame: usize,
}

impl SamplerVoiceState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn clear(&mut self) {
        self.selected_zone = None;
        self.position = 0.0;
        self.frame = 0;
    }

    pub fn selected_zone(&self) -> Option<usize> {
        self.selected_zone
    }

    pub fn position(&self) -> f64 {
        self.position
    }

    pub fn process(
        &mut self,
        zones: &[SamplerZone],
        params: SamplerParams,
        sample_rate: f64,
        gate_sec: Option<f64>,
    ) -> (f32, f32) {
        let (left, right, _) = self.process_with_activity(zones, params, sample_rate, gate_sec);
        (left, right)
    }

    pub fn process_with_activity(
        &mut self,
        zones: &[SamplerZone],
        params: SamplerParams,
        sample_rate: f64,
        gate_sec: Option<f64>,
    ) -> (f32, f32, bool) {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        let params = sanitize_params(params);
        let zone_index = match self.selected_zone {
            Some(index) => index,
            None => {
                let Some(index) = select_zone(zones, params.midi, params.velocity) else {
                    self.frame = self.frame.saturating_add(1);
                    return (0.0, 0.0, false);
                };
                self.selected_zone = Some(index);
                index
            }
        };
        let Some(zone) = zones.get(zone_index) else {
            self.frame = self.frame.saturating_add(1);
            return (0.0, 0.0, false);
        };
        let zone = SanitizedZone::new(zone);
        let t = self.frame as f64 / sample_rate;
        let gate_sec = gate_sec.unwrap_or(f64::INFINITY);
        let envelope = ar_envelope(t, gate_sec, params.attack, params.release);
        if envelope <= 0.0 {
            self.frame = self.frame.saturating_add(1);
            return (0.0, 0.0, false);
        }

        wrap_loop_position(&mut self.position, &zone);
        let sample = read_zone_sample(&zone, self.position);
        let ratio = playback_ratio(params.midi, zone.root_midi, zone.sample_rate, sample_rate);
        self.position += ratio;
        let value = sample * envelope * params.velocity * params.level * zone.gain;
        let (left_gain, right_gain) = equal_power_pan(zone.pan);
        self.frame = self.frame.saturating_add(1);
        (
            (value * left_gain) as f32,
            (value * right_gain) as f32,
            true,
        )
    }
}

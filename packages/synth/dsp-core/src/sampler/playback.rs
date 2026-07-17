use crate::math::{clamp, safe_finite};

use super::types::{SamplerParams, SanitizedSamplerParams};
use super::zone::SanitizedZone;

pub(super) fn sanitize_params(params: SamplerParams) -> SanitizedSamplerParams {
    SanitizedSamplerParams {
        midi: freq_to_midi(params.freq),
        velocity: clamp(safe_finite(params.velocity, 1.0), 0.0, 1.0),
        attack: clamp(safe_finite(params.attack, 0.0), 0.0, 10.0),
        release: clamp(safe_finite(params.release, 0.08), 0.0, 20.0),
        level: clamp(safe_finite(params.level, 1.0), 0.0, 8.0),
    }
}

pub(super) fn freq_to_midi(freq: f64) -> f64 {
    let freq = safe_finite(freq, 440.0).max(1e-6);
    clamp(69.0 + 12.0 * (freq / 440.0).log2(), 0.0, 127.0)
}

pub(super) fn playback_ratio(midi: f64, root_midi: f64, source_rate: f64, output_rate: f64) -> f64 {
    let semitones = clamp(midi - root_midi, -72.0, 72.0);
    let pitch = 2.0_f64.powf(semitones / 12.0);
    clamp(pitch * source_rate / output_rate.max(1.0), 0.0, 64.0)
}

pub(super) fn read_zone_sample(zone: &SanitizedZone<'_>, position: f64) -> f64 {
    if zone.samples.is_empty() {
        return 0.0;
    }
    if !zone.looped && position >= (zone.samples.len() - 1) as f64 {
        return 0.0;
    }
    let len = zone.samples.len();
    let lo = position.floor().max(0.0) as usize;
    let hi = if zone.looped && lo + 1 >= zone.loop_end {
        zone.loop_start
    } else {
        (lo + 1).min(len - 1)
    };
    let lo = lo.min(len - 1);
    let frac = position - lo as f64;
    zone.samples[lo] as f64 * (1.0 - frac) + zone.samples[hi] as f64 * frac
}

pub(super) fn wrap_loop_position(position: &mut f64, zone: &SanitizedZone<'_>) {
    if !zone.looped || *position < zone.loop_end as f64 {
        return;
    }
    let len = (zone.loop_end - zone.loop_start).max(1) as f64;
    *position = zone.loop_start as f64 + (*position - zone.loop_end as f64).rem_euclid(len);
}

pub(super) fn ar_envelope(t: f64, gate_sec: f64, attack: f64, release: f64) -> f64 {
    if t < attack {
        if attack == 0.0 {
            1.0
        } else {
            t / attack
        }
    } else if t < gate_sec {
        1.0
    } else {
        let p = if release == 0.0 {
            1.0
        } else {
            (t - gate_sec) / release
        };
        1.0 - clamp(p, 0.0, 1.0)
    }
}

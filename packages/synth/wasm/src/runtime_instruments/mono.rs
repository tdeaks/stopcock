use super::common::trigger_velocity;
use crate::dsp::{AcidBassParams, AcidBassWaveform, DrumVoiceKind, DrumVoiceParams};
use crate::runtime_params::{
    param_at, ParamAccess, PARAM_ACCENT, PARAM_CUTOFF, PARAM_DECAY, PARAM_DRIVE, PARAM_ENV_MOD,
    PARAM_FREQ, PARAM_LEVEL, PARAM_NOISE, PARAM_RESONANCE, PARAM_SLIDE, PARAM_SNAP, PARAM_TONE,
};
use crate::runtime_state::NodeBuffer;

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_acid_bass(
    wave: AcidBassWaveform,
    base_freq: f64,
    base_velocity: f64,
    base_cutoff: f64,
    base_resonance: f64,
    base_env_mod: f64,
    base_decay: f64,
    base_accent: f64,
    base_slide: f64,
    base_drive: f64,
    base_level: f64,
    state: &mut crate::dsp::AcidBassState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    gate_sec: Option<f64>,
    request_velocity: f64,
) -> Option<()> {
    out.channels = 1;
    let velocity = trigger_velocity(base_velocity, request_velocity);

    if let (
        Some(freq),
        Some(cutoff),
        Some(resonance),
        Some(env_mod),
        Some(decay),
        Some(accent),
        Some(slide),
        Some(drive),
        Some(level),
    ) = (
        access.static_param(params, PARAM_FREQ, base_freq),
        access.static_param(params, PARAM_CUTOFF, base_cutoff),
        access.static_param(params, PARAM_RESONANCE, base_resonance),
        access.static_param(params, PARAM_ENV_MOD, base_env_mod),
        access.static_param(params, PARAM_DECAY, base_decay),
        access.static_param(params, PARAM_ACCENT, base_accent),
        access.static_param(params, PARAM_SLIDE, base_slide),
        access.static_param(params, PARAM_DRIVE, base_drive),
        access.static_param(params, PARAM_LEVEL, base_level),
    ) {
        let acid_params = AcidBassParams {
            freq,
            velocity,
            cutoff,
            resonance,
            env_mod,
            decay,
            accent,
            slide,
            drive,
            level,
        };
        for i in 0..frames {
            out.left[i] = state.process(wave, acid_params, sample_rate, gate_sec);
        }
        return Some(());
    }

    for i in 0..frames {
        let acid_params = AcidBassParams {
            freq: param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames),
            velocity,
            cutoff: param_at(access, prior, params, PARAM_CUTOFF, base_cutoff, i, frames),
            resonance: param_at(
                access,
                prior,
                params,
                PARAM_RESONANCE,
                base_resonance,
                i,
                frames,
            ),
            env_mod: param_at(
                access,
                prior,
                params,
                PARAM_ENV_MOD,
                base_env_mod,
                i,
                frames,
            ),
            decay: param_at(access, prior, params, PARAM_DECAY, base_decay, i, frames),
            accent: param_at(access, prior, params, PARAM_ACCENT, base_accent, i, frames),
            slide: param_at(access, prior, params, PARAM_SLIDE, base_slide, i, frames),
            drive: param_at(access, prior, params, PARAM_DRIVE, base_drive, i, frames),
            level: param_at(access, prior, params, PARAM_LEVEL, base_level, i, frames),
        };
        out.left[i] = state.process(wave, acid_params, sample_rate, gate_sec);
    }
    Some(())
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_drum_voice(
    kind: DrumVoiceKind,
    base_freq: f64,
    base_velocity: f64,
    base_decay: f64,
    base_tone: f64,
    base_snap: f64,
    base_noise: f64,
    base_drive: f64,
    base_level: f64,
    state: &mut crate::dsp::DrumVoiceState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    gate_sec: Option<f64>,
    request_velocity: f64,
) -> Option<()> {
    out.channels = 1;
    let velocity = trigger_velocity(base_velocity, request_velocity);

    if let (
        Some(freq),
        Some(decay),
        Some(tone),
        Some(snap),
        Some(noise),
        Some(drive),
        Some(level),
    ) = (
        access.static_param(params, PARAM_FREQ, base_freq),
        access.static_param(params, PARAM_DECAY, base_decay),
        access.static_param(params, PARAM_TONE, base_tone),
        access.static_param(params, PARAM_SNAP, base_snap),
        access.static_param(params, PARAM_NOISE, base_noise),
        access.static_param(params, PARAM_DRIVE, base_drive),
        access.static_param(params, PARAM_LEVEL, base_level),
    ) {
        let drum_params = DrumVoiceParams {
            freq,
            velocity,
            decay,
            tone,
            snap,
            noise,
            drive,
            level,
        };
        for i in 0..frames {
            out.left[i] = state.process(kind, drum_params, sample_rate, gate_sec);
        }
        return Some(());
    }

    for i in 0..frames {
        let drum_params = DrumVoiceParams {
            freq: param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames),
            velocity,
            decay: param_at(access, prior, params, PARAM_DECAY, base_decay, i, frames),
            tone: param_at(access, prior, params, PARAM_TONE, base_tone, i, frames),
            snap: param_at(access, prior, params, PARAM_SNAP, base_snap, i, frames),
            noise: param_at(access, prior, params, PARAM_NOISE, base_noise, i, frames),
            drive: param_at(access, prior, params, PARAM_DRIVE, base_drive, i, frames),
            level: param_at(access, prior, params, PARAM_LEVEL, base_level, i, frames),
        };
        out.left[i] = state.process(kind, drum_params, sample_rate, gate_sec);
    }
    Some(())
}

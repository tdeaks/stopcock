use super::common::trigger_velocity;
use crate::dsp::{PolySynthParams, StringMachineParams};
use crate::runtime_params::{
    param_at, ParamAccess, PARAM_ATTACK, PARAM_CHORUS, PARAM_CUTOFF, PARAM_DECAY, PARAM_DEPTH,
    PARAM_DETUNE, PARAM_DRIVE, PARAM_ENV_MOD, PARAM_FREQ, PARAM_LEVEL, PARAM_MODULATION,
    PARAM_NOISE, PARAM_PULSE_WIDTH, PARAM_RELEASE, PARAM_RESONANCE, PARAM_SUB, PARAM_SUSTAIN,
    PARAM_TONE, PARAM_WIDTH,
};
use crate::runtime_state::NodeBuffer;

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_string_machine(
    base_freq: f64,
    base_velocity: f64,
    base_detune: f64,
    base_attack: f64,
    base_release: f64,
    base_tone: f64,
    base_depth: f64,
    base_modulation: f64,
    base_width: f64,
    base_level: f64,
    state: &mut crate::dsp::StringMachineState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    gate_sec: Option<f64>,
    request_velocity: f64,
) -> Option<()> {
    out.channels = 2;
    let velocity = trigger_velocity(base_velocity, request_velocity);

    if let (
        Some(freq),
        Some(detune),
        Some(attack),
        Some(release),
        Some(tone),
        Some(depth),
        Some(modulation),
        Some(width),
        Some(level),
    ) = (
        access.static_param(params, PARAM_FREQ, base_freq),
        access.static_param(params, PARAM_DETUNE, base_detune),
        access.static_param(params, PARAM_ATTACK, base_attack),
        access.static_param(params, PARAM_RELEASE, base_release),
        access.static_param(params, PARAM_TONE, base_tone),
        access.static_param(params, PARAM_DEPTH, base_depth),
        access.static_param(params, PARAM_MODULATION, base_modulation),
        access.static_param(params, PARAM_WIDTH, base_width),
        access.static_param(params, PARAM_LEVEL, base_level),
    ) {
        let string_params = StringMachineParams {
            freq,
            velocity,
            detune,
            attack,
            release,
            tone,
            depth,
            modulation,
            width,
            level,
        };
        for i in 0..frames {
            (out.left[i], out.right[i]) = state.process(string_params, sample_rate, gate_sec);
        }
        return Some(());
    }

    for i in 0..frames {
        let string_params = StringMachineParams {
            freq: param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames),
            velocity,
            detune: param_at(access, prior, params, PARAM_DETUNE, base_detune, i, frames),
            attack: param_at(access, prior, params, PARAM_ATTACK, base_attack, i, frames),
            release: param_at(
                access,
                prior,
                params,
                PARAM_RELEASE,
                base_release,
                i,
                frames,
            ),
            tone: param_at(access, prior, params, PARAM_TONE, base_tone, i, frames),
            depth: param_at(access, prior, params, PARAM_DEPTH, base_depth, i, frames),
            modulation: param_at(
                access,
                prior,
                params,
                PARAM_MODULATION,
                base_modulation,
                i,
                frames,
            ),
            width: param_at(access, prior, params, PARAM_WIDTH, base_width, i, frames),
            level: param_at(access, prior, params, PARAM_LEVEL, base_level, i, frames),
        };
        (out.left[i], out.right[i]) = state.process(string_params, sample_rate, gate_sec);
    }
    Some(())
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_poly_synth(
    base_freq: f64,
    base_velocity: f64,
    base_detune: f64,
    base_pulse_width: f64,
    base_sub: f64,
    base_noise: f64,
    base_cutoff: f64,
    base_resonance: f64,
    base_env_mod: f64,
    base_attack: f64,
    base_decay: f64,
    base_sustain: f64,
    base_release: f64,
    base_drive: f64,
    base_chorus: f64,
    base_modulation: f64,
    base_width: f64,
    base_level: f64,
    state: &mut crate::dsp::PolySynthState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    gate_sec: Option<f64>,
    request_velocity: f64,
) -> Option<()> {
    out.channels = 2;
    let velocity = trigger_velocity(base_velocity, request_velocity);

    if let (
        Some(freq),
        Some(detune),
        Some(pulse_width),
        Some(sub),
        Some(noise),
        Some(cutoff),
        Some(resonance),
        Some(env_mod),
        Some(attack),
        Some(decay),
        Some(sustain),
        Some(release),
        Some(drive),
        Some(chorus),
        Some(modulation),
        Some(width),
        Some(level),
    ) = (
        access.static_param(params, PARAM_FREQ, base_freq),
        access.static_param(params, PARAM_DETUNE, base_detune),
        access.static_param(params, PARAM_PULSE_WIDTH, base_pulse_width),
        access.static_param(params, PARAM_SUB, base_sub),
        access.static_param(params, PARAM_NOISE, base_noise),
        access.static_param(params, PARAM_CUTOFF, base_cutoff),
        access.static_param(params, PARAM_RESONANCE, base_resonance),
        access.static_param(params, PARAM_ENV_MOD, base_env_mod),
        access.static_param(params, PARAM_ATTACK, base_attack),
        access.static_param(params, PARAM_DECAY, base_decay),
        access.static_param(params, PARAM_SUSTAIN, base_sustain),
        access.static_param(params, PARAM_RELEASE, base_release),
        access.static_param(params, PARAM_DRIVE, base_drive),
        access.static_param(params, PARAM_CHORUS, base_chorus),
        access.static_param(params, PARAM_MODULATION, base_modulation),
        access.static_param(params, PARAM_WIDTH, base_width),
        access.static_param(params, PARAM_LEVEL, base_level),
    ) {
        let poly_params = PolySynthParams {
            freq,
            velocity,
            detune,
            pulse_width,
            sub,
            noise,
            cutoff,
            resonance,
            env_mod,
            attack,
            decay,
            sustain,
            release,
            drive,
            chorus,
            modulation,
            width,
            level,
        };
        for i in 0..frames {
            (out.left[i], out.right[i]) = state.process(poly_params, sample_rate, gate_sec);
        }
        return Some(());
    }

    for i in 0..frames {
        let poly_params = PolySynthParams {
            freq: param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames),
            velocity,
            detune: param_at(access, prior, params, PARAM_DETUNE, base_detune, i, frames),
            pulse_width: param_at(
                access,
                prior,
                params,
                PARAM_PULSE_WIDTH,
                base_pulse_width,
                i,
                frames,
            ),
            sub: param_at(access, prior, params, PARAM_SUB, base_sub, i, frames),
            noise: param_at(access, prior, params, PARAM_NOISE, base_noise, i, frames),
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
            attack: param_at(access, prior, params, PARAM_ATTACK, base_attack, i, frames),
            decay: param_at(access, prior, params, PARAM_DECAY, base_decay, i, frames),
            sustain: param_at(
                access,
                prior,
                params,
                PARAM_SUSTAIN,
                base_sustain,
                i,
                frames,
            ),
            release: param_at(
                access,
                prior,
                params,
                PARAM_RELEASE,
                base_release,
                i,
                frames,
            ),
            drive: param_at(access, prior, params, PARAM_DRIVE, base_drive, i, frames),
            chorus: param_at(access, prior, params, PARAM_CHORUS, base_chorus, i, frames),
            modulation: param_at(
                access,
                prior,
                params,
                PARAM_MODULATION,
                base_modulation,
                i,
                frames,
            ),
            width: param_at(access, prior, params, PARAM_WIDTH, base_width, i, frames),
            level: param_at(access, prior, params, PARAM_LEVEL, base_level, i, frames),
        };
        (out.left[i], out.right[i]) = state.process(poly_params, sample_rate, gate_sec);
    }
    Some(())
}

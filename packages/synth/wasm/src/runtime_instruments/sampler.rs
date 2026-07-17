use super::common::trigger_velocity;
use crate::dsp::{LoFiSamplerParams, SamplerParams};
use crate::runtime_params::{
    param_at, ParamAccess, PARAM_ATTACK, PARAM_BITS, PARAM_DOWNSAMPLE, PARAM_DRIVE, PARAM_FREQ,
    PARAM_JITTER, PARAM_LEVEL, PARAM_MIX, PARAM_NOISE, PARAM_RELEASE, PARAM_TONE,
};
use crate::runtime_state::NodeBuffer;

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_sampler_instrument(
    zones: &[crate::dsp::SamplerZone],
    base_freq: f64,
    base_velocity: f64,
    base_attack: f64,
    base_release: f64,
    base_level: f64,
    state: &mut crate::dsp::SamplerVoiceState,
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

    if let (Some(freq), Some(attack), Some(release), Some(level)) = (
        access.static_param(params, PARAM_FREQ, base_freq),
        access.static_param(params, PARAM_ATTACK, base_attack),
        access.static_param(params, PARAM_RELEASE, base_release),
        access.static_param(params, PARAM_LEVEL, base_level),
    ) {
        let sampler_params = SamplerParams {
            freq,
            velocity,
            attack,
            release,
            level,
        };
        for i in 0..frames {
            (out.left[i], out.right[i]) =
                state.process(zones, sampler_params, sample_rate, gate_sec);
        }
        return Some(());
    }

    for i in 0..frames {
        let sampler_params = SamplerParams {
            freq: param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames),
            velocity,
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
            level: param_at(access, prior, params, PARAM_LEVEL, base_level, i, frames),
        };
        (out.left[i], out.right[i]) = state.process(zones, sampler_params, sample_rate, gate_sec);
    }
    Some(())
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_lofi_sampler(
    zones: &[crate::dsp::SamplerZone],
    base_freq: f64,
    base_velocity: f64,
    base_attack: f64,
    base_release: f64,
    base_level: f64,
    base_bits: f64,
    base_downsample: f64,
    base_jitter: f64,
    base_noise: f64,
    base_tone: f64,
    base_drive: f64,
    base_mix: f64,
    state: &mut crate::dsp::LoFiSamplerState,
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
        Some(attack),
        Some(release),
        Some(level),
        Some(bits),
        Some(downsample),
        Some(jitter),
        Some(noise),
        Some(tone),
        Some(drive),
        Some(mix),
    ) = (
        access.static_param(params, PARAM_FREQ, base_freq),
        access.static_param(params, PARAM_ATTACK, base_attack),
        access.static_param(params, PARAM_RELEASE, base_release),
        access.static_param(params, PARAM_LEVEL, base_level),
        access.static_param(params, PARAM_BITS, base_bits),
        access.static_param(params, PARAM_DOWNSAMPLE, base_downsample),
        access.static_param(params, PARAM_JITTER, base_jitter),
        access.static_param(params, PARAM_NOISE, base_noise),
        access.static_param(params, PARAM_TONE, base_tone),
        access.static_param(params, PARAM_DRIVE, base_drive),
        access.static_param(params, PARAM_MIX, base_mix),
    ) {
        let lofi_params = LoFiSamplerParams {
            freq,
            velocity,
            attack,
            release,
            level,
            bits,
            downsample,
            jitter,
            noise,
            tone,
            drive,
            mix,
        };
        for i in 0..frames {
            (out.left[i], out.right[i]) = state.process(zones, lofi_params, sample_rate, gate_sec);
        }
        return Some(());
    }

    for i in 0..frames {
        let lofi_params = LoFiSamplerParams {
            freq: param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames),
            velocity,
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
            level: param_at(access, prior, params, PARAM_LEVEL, base_level, i, frames),
            bits: param_at(access, prior, params, PARAM_BITS, base_bits, i, frames),
            downsample: param_at(
                access,
                prior,
                params,
                PARAM_DOWNSAMPLE,
                base_downsample,
                i,
                frames,
            ),
            jitter: param_at(access, prior, params, PARAM_JITTER, base_jitter, i, frames),
            noise: param_at(access, prior, params, PARAM_NOISE, base_noise, i, frames),
            tone: param_at(access, prior, params, PARAM_TONE, base_tone, i, frames),
            drive: param_at(access, prior, params, PARAM_DRIVE, base_drive, i, frames),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
        };
        (out.left[i], out.right[i]) = state.process(zones, lofi_params, sample_rate, gate_sec);
    }
    Some(())
}

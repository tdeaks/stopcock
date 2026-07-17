use super::common::stereo_input;
use crate::dsp::{
    NonlinearReverbParams, NonlinearReverbState, PlateReverbParams, PlateReverbState,
    SpringReverbParams, SpringReverbState,
};
use crate::runtime_params::{
    param_at, ParamAccess, PARAM_DAMPING, PARAM_DECAY, PARAM_DIFFUSION, PARAM_DRIP, PARAM_DRIVE,
    PARAM_MIX, PARAM_MODULATION, PARAM_PRE_DELAY_MS, PARAM_TENSION, PARAM_TIME_MS, PARAM_WIDTH,
};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_plate_reverb(
    input_index: usize,
    base_pre_delay_ms: f64,
    base_decay: f64,
    base_damping: f64,
    base_diffusion: f64,
    base_modulation: f64,
    base_mix: f64,
    base_width: f64,
    state: &mut PlateReverbState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = 2;

    if let (
        Some(pre_delay_ms),
        Some(decay),
        Some(damping),
        Some(diffusion),
        Some(modulation),
        Some(mix),
        Some(width),
    ) = (
        access.static_param(params, PARAM_PRE_DELAY_MS, base_pre_delay_ms),
        access.static_param(params, PARAM_DECAY, base_decay),
        access.static_param(params, PARAM_DAMPING, base_damping),
        access.static_param(params, PARAM_DIFFUSION, base_diffusion),
        access.static_param(params, PARAM_MODULATION, base_modulation),
        access.static_param(params, PARAM_MIX, base_mix),
        access.static_param(params, PARAM_WIDTH, base_width),
    ) {
        let reverb_params = PlateReverbParams {
            pre_delay_ms,
            decay,
            damping,
            diffusion,
            modulation,
            mix,
            width,
        };
        for i in 0..frames {
            let (input_l, input_r) = stereo_input(input, i);
            (out.left[i], out.right[i]) =
                state.process(input_l, input_r, reverb_params, sample_rate);
        }
        return Some(());
    }

    for i in 0..frames {
        let (input_l, input_r) = stereo_input(input, i);
        let reverb_params = PlateReverbParams {
            pre_delay_ms: param_at(
                access,
                prior,
                params,
                PARAM_PRE_DELAY_MS,
                base_pre_delay_ms,
                i,
                frames,
            ),
            decay: param_at(access, prior, params, PARAM_DECAY, base_decay, i, frames),
            damping: param_at(
                access,
                prior,
                params,
                PARAM_DAMPING,
                base_damping,
                i,
                frames,
            ),
            diffusion: param_at(
                access,
                prior,
                params,
                PARAM_DIFFUSION,
                base_diffusion,
                i,
                frames,
            ),
            modulation: param_at(
                access,
                prior,
                params,
                PARAM_MODULATION,
                base_modulation,
                i,
                frames,
            ),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
            width: param_at(access, prior, params, PARAM_WIDTH, base_width, i, frames),
        };
        (out.left[i], out.right[i]) = state.process(input_l, input_r, reverb_params, sample_rate);
    }
    Some(())
}

pub(crate) fn render_spring_reverb(
    input_index: usize,
    base_decay: f64,
    base_damping: f64,
    base_tension: f64,
    base_drip: f64,
    base_mix: f64,
    base_width: f64,
    state: &mut SpringReverbState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = 2;

    if let (Some(decay), Some(damping), Some(tension), Some(drip), Some(mix), Some(width)) = (
        access.static_param(params, PARAM_DECAY, base_decay),
        access.static_param(params, PARAM_DAMPING, base_damping),
        access.static_param(params, PARAM_TENSION, base_tension),
        access.static_param(params, PARAM_DRIP, base_drip),
        access.static_param(params, PARAM_MIX, base_mix),
        access.static_param(params, PARAM_WIDTH, base_width),
    ) {
        let reverb_params = SpringReverbParams {
            decay,
            damping,
            tension,
            drip,
            mix,
            width,
        };
        for i in 0..frames {
            let (input_l, input_r) = stereo_input(input, i);
            (out.left[i], out.right[i]) =
                state.process(input_l, input_r, reverb_params, sample_rate);
        }
        return Some(());
    }

    for i in 0..frames {
        let (input_l, input_r) = stereo_input(input, i);
        let reverb_params = SpringReverbParams {
            decay: param_at(access, prior, params, PARAM_DECAY, base_decay, i, frames),
            damping: param_at(
                access,
                prior,
                params,
                PARAM_DAMPING,
                base_damping,
                i,
                frames,
            ),
            tension: param_at(
                access,
                prior,
                params,
                PARAM_TENSION,
                base_tension,
                i,
                frames,
            ),
            drip: param_at(access, prior, params, PARAM_DRIP, base_drip, i, frames),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
            width: param_at(access, prior, params, PARAM_WIDTH, base_width, i, frames),
        };
        (out.left[i], out.right[i]) = state.process(input_l, input_r, reverb_params, sample_rate);
    }
    Some(())
}

pub(crate) fn render_nonlinear_reverb(
    input_index: usize,
    base_time_ms: f64,
    base_decay: f64,
    base_damping: f64,
    base_drive: f64,
    base_mix: f64,
    base_width: f64,
    state: &mut NonlinearReverbState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = 2;

    if let (Some(time_ms), Some(decay), Some(damping), Some(drive), Some(mix), Some(width)) = (
        access.static_param(params, PARAM_TIME_MS, base_time_ms),
        access.static_param(params, PARAM_DECAY, base_decay),
        access.static_param(params, PARAM_DAMPING, base_damping),
        access.static_param(params, PARAM_DRIVE, base_drive),
        access.static_param(params, PARAM_MIX, base_mix),
        access.static_param(params, PARAM_WIDTH, base_width),
    ) {
        let reverb_params = NonlinearReverbParams {
            time_ms,
            decay,
            damping,
            drive,
            mix,
            width,
        };
        for i in 0..frames {
            let (input_l, input_r) = stereo_input(input, i);
            (out.left[i], out.right[i]) =
                state.process(input_l, input_r, reverb_params, sample_rate);
        }
        return Some(());
    }

    for i in 0..frames {
        let (input_l, input_r) = stereo_input(input, i);
        let reverb_params = NonlinearReverbParams {
            time_ms: param_at(
                access,
                prior,
                params,
                PARAM_TIME_MS,
                base_time_ms,
                i,
                frames,
            ),
            decay: param_at(access, prior, params, PARAM_DECAY, base_decay, i, frames),
            damping: param_at(
                access,
                prior,
                params,
                PARAM_DAMPING,
                base_damping,
                i,
                frames,
            ),
            drive: param_at(access, prior, params, PARAM_DRIVE, base_drive, i, frames),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
            width: param_at(access, prior, params, PARAM_WIDTH, base_width, i, frames),
        };
        (out.left[i], out.right[i]) = state.process(input_l, input_r, reverb_params, sample_rate);
    }
    Some(())
}

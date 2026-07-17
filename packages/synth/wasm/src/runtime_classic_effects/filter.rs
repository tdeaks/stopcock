#![allow(clippy::too_many_arguments)]

use crate::dsp::{
    clamp, BiquadState, FilterKind, StateVariableFilterMode, StateVariableFilterParams,
    StateVariableFilterState,
};
use crate::runtime_params::{
    param_at, ParamAccess, PARAM_DRIVE, PARAM_FREQ, PARAM_GAIN_DB, PARAM_MIX, PARAM_Q,
    PARAM_RESONANCE,
};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_biquad(
    input_index: usize,
    filter: FilterKind,
    base_freq: f64,
    base_q: f64,
    base_gain_db: f64,
    left: &mut BiquadState,
    right: &mut BiquadState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let (Some(freq), Some(q), Some(gain_db)) = (
        access.static_param(params, PARAM_FREQ, base_freq),
        access.static_param(params, PARAM_Q, base_q),
        access.static_param(params, PARAM_GAIN_DB, base_gain_db),
    ) {
        let freq = clamp(freq, 1e-6, sample_rate / 2.0 - 1e-6);
        let q = q.max(1e-6);
        left.design_kind(filter, freq, q, gain_db, sample_rate);
        if input.channels == 2 {
            right.design_kind(filter, freq, q, gain_db, sample_rate);
        }
        for i in 0..frames {
            out.left[i] = left.process(input.left[i] as f64) as f32;
            if input.channels == 2 {
                out.right[i] = right.process(input.right[i] as f64) as f32;
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let freq = clamp(
            param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames),
            1e-6,
            sample_rate / 2.0 - 1e-6,
        );
        let q = param_at(access, prior, params, PARAM_Q, base_q, i, frames).max(1e-6);
        let gain_db = param_at(
            access,
            prior,
            params,
            PARAM_GAIN_DB,
            base_gain_db,
            i,
            frames,
        );
        left.design_kind(filter, freq, q, gain_db, sample_rate);
        out.left[i] = left.process(input.left[i] as f64) as f32;
        if input.channels == 2 {
            right.design_kind(filter, freq, q, gain_db, sample_rate);
            out.right[i] = right.process(input.right[i] as f64) as f32;
        }
    }
    Some(())
}

pub(crate) fn render_state_variable_filter(
    input_index: usize,
    mode: StateVariableFilterMode,
    base_freq: f64,
    base_resonance: f64,
    base_drive: f64,
    base_mix: f64,
    left: &mut StateVariableFilterState,
    right: &mut StateVariableFilterState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let (Some(freq), Some(resonance), Some(drive), Some(mix)) = (
        access.static_param(params, PARAM_FREQ, base_freq),
        access.static_param(params, PARAM_RESONANCE, base_resonance),
        access.static_param(params, PARAM_DRIVE, base_drive),
        access.static_param(params, PARAM_MIX, base_mix),
    ) {
        let params = StateVariableFilterParams {
            mode,
            freq,
            resonance,
            drive,
            mix,
        };
        for i in 0..frames {
            out.left[i] = left.process(input.left[i], params, sample_rate);
            if input.channels == 2 {
                out.right[i] = right.process(input.right[i], params, sample_rate);
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let params = StateVariableFilterParams {
            mode,
            freq: param_at(access, prior, params, PARAM_FREQ, base_freq, i, frames),
            resonance: param_at(
                access,
                prior,
                params,
                PARAM_RESONANCE,
                base_resonance,
                i,
                frames,
            ),
            drive: param_at(access, prior, params, PARAM_DRIVE, base_drive, i, frames),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
        };
        out.left[i] = left.process(input.left[i], params, sample_rate);
        if input.channels == 2 {
            out.right[i] = right.process(input.right[i], params, sample_rate);
        }
    }
    Some(())
}

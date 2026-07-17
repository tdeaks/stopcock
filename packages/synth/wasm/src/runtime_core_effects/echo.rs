use super::common::stereo_input;
use crate::dsp::{
    MicroPitchParams, MicroPitchState, MultiTapDelayParams, MultiTapDelayState, MultiTapDelayTap,
    TapeDelayParams, TapeDelayState, TapeEchoParams, TapeEchoState,
};
use crate::runtime_params::{
    param_at, ParamAccess, PARAM_DELAY_MS, PARAM_DETUNE, PARAM_DRIVE, PARAM_FEEDBACK,
    PARAM_FLUTTER, PARAM_MIX, PARAM_REVERB_MIX, PARAM_TAPE_AGE, PARAM_TIME_MS, PARAM_TONE,
    PARAM_WIDTH, PARAM_WOW,
};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

pub(crate) fn render_space_echo(
    input_index: usize,
    base_time_ms: f64,
    base_feedback: f64,
    base_mix: f64,
    base_reverb_mix: f64,
    base_wow: f64,
    base_flutter: f64,
    base_tape_age: f64,
    base_drive: f64,
    head_count: f64,
    head1: bool,
    head2: bool,
    head3: bool,
    state: &mut TapeEchoState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    frame_start: usize,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = 2;

    if let (
        Some(time_ms),
        Some(feedback),
        Some(mix),
        Some(reverb_mix),
        Some(wow),
        Some(flutter),
        Some(tape_age),
        Some(drive),
    ) = (
        access.static_param(params, PARAM_TIME_MS, base_time_ms),
        access.static_param(params, PARAM_FEEDBACK, base_feedback),
        access.static_param(params, PARAM_MIX, base_mix),
        access.static_param(params, PARAM_REVERB_MIX, base_reverb_mix),
        access.static_param(params, PARAM_WOW, base_wow),
        access.static_param(params, PARAM_FLUTTER, base_flutter),
        access.static_param(params, PARAM_TAPE_AGE, base_tape_age),
        access.static_param(params, PARAM_DRIVE, base_drive),
    ) {
        let echo_params = TapeEchoParams {
            time_ms,
            feedback,
            mix,
            reverb_mix,
            wow,
            flutter,
            tape_age,
            drive,
            head_count,
            head1,
            head2,
            head3,
        };
        for i in 0..frames {
            let (input_l, input_r) = stereo_input(input, i);
            let (left, right) =
                state.process(input_l, input_r, echo_params, sample_rate, frame_start + i);
            out.left[i] = left;
            out.right[i] = right;
        }
        return Some(());
    }

    for i in 0..frames {
        let (input_l, input_r) = stereo_input(input, i);
        let echo_params = TapeEchoParams {
            time_ms: param_at(
                access,
                prior,
                params,
                PARAM_TIME_MS,
                base_time_ms,
                i,
                frames,
            ),
            feedback: param_at(
                access,
                prior,
                params,
                PARAM_FEEDBACK,
                base_feedback,
                i,
                frames,
            ),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
            reverb_mix: param_at(
                access,
                prior,
                params,
                PARAM_REVERB_MIX,
                base_reverb_mix,
                i,
                frames,
            ),
            wow: param_at(access, prior, params, PARAM_WOW, base_wow, i, frames),
            flutter: param_at(
                access,
                prior,
                params,
                PARAM_FLUTTER,
                base_flutter,
                i,
                frames,
            ),
            tape_age: param_at(
                access,
                prior,
                params,
                PARAM_TAPE_AGE,
                base_tape_age,
                i,
                frames,
            ),
            drive: param_at(access, prior, params, PARAM_DRIVE, base_drive, i, frames),
            head_count,
            head1,
            head2,
            head3,
        };
        let (left, right) =
            state.process(input_l, input_r, echo_params, sample_rate, frame_start + i);
        out.left[i] = left;
        out.right[i] = right;
    }
    Some(())
}

pub(crate) fn render_tape_delay(
    input_index: usize,
    base_time_ms: f64,
    base_feedback: f64,
    base_mix: f64,
    base_wow: f64,
    base_flutter: f64,
    base_tape_age: f64,
    base_drive: f64,
    base_tone: f64,
    base_width: f64,
    state: &mut TapeDelayState,
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
        Some(time_ms),
        Some(feedback),
        Some(mix),
        Some(wow),
        Some(flutter),
        Some(tape_age),
        Some(drive),
        Some(tone),
        Some(width),
    ) = (
        access.static_param(params, PARAM_TIME_MS, base_time_ms),
        access.static_param(params, PARAM_FEEDBACK, base_feedback),
        access.static_param(params, PARAM_MIX, base_mix),
        access.static_param(params, PARAM_WOW, base_wow),
        access.static_param(params, PARAM_FLUTTER, base_flutter),
        access.static_param(params, PARAM_TAPE_AGE, base_tape_age),
        access.static_param(params, PARAM_DRIVE, base_drive),
        access.static_param(params, PARAM_TONE, base_tone),
        access.static_param(params, PARAM_WIDTH, base_width),
    ) {
        let delay_params = TapeDelayParams {
            time_ms,
            feedback,
            mix,
            wow,
            flutter,
            tape_age,
            drive,
            tone,
            width,
        };
        for i in 0..frames {
            let (input_l, input_r) = stereo_input(input, i);
            (out.left[i], out.right[i]) =
                state.process(input_l, input_r, delay_params, sample_rate);
        }
        return Some(());
    }

    for i in 0..frames {
        let (input_l, input_r) = stereo_input(input, i);
        let delay_params = TapeDelayParams {
            time_ms: param_at(
                access,
                prior,
                params,
                PARAM_TIME_MS,
                base_time_ms,
                i,
                frames,
            ),
            feedback: param_at(
                access,
                prior,
                params,
                PARAM_FEEDBACK,
                base_feedback,
                i,
                frames,
            ),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
            wow: param_at(access, prior, params, PARAM_WOW, base_wow, i, frames),
            flutter: param_at(
                access,
                prior,
                params,
                PARAM_FLUTTER,
                base_flutter,
                i,
                frames,
            ),
            tape_age: param_at(
                access,
                prior,
                params,
                PARAM_TAPE_AGE,
                base_tape_age,
                i,
                frames,
            ),
            drive: param_at(access, prior, params, PARAM_DRIVE, base_drive, i, frames),
            tone: param_at(access, prior, params, PARAM_TONE, base_tone, i, frames),
            width: param_at(access, prior, params, PARAM_WIDTH, base_width, i, frames),
        };
        (out.left[i], out.right[i]) = state.process(input_l, input_r, delay_params, sample_rate);
    }
    Some(())
}

pub(crate) fn render_micro_pitch(
    input_index: usize,
    base_detune: f64,
    base_width: f64,
    base_delay_ms: f64,
    base_mix: f64,
    state: &mut MicroPitchState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = 2;

    if let (Some(detune_cents), Some(width), Some(delay_ms), Some(mix)) = (
        access.static_param(params, PARAM_DETUNE, base_detune),
        access.static_param(params, PARAM_WIDTH, base_width),
        access.static_param(params, PARAM_DELAY_MS, base_delay_ms),
        access.static_param(params, PARAM_MIX, base_mix),
    ) {
        let params = MicroPitchParams {
            detune_cents,
            width,
            delay_ms,
            mix,
        };
        for i in 0..frames {
            let (input_l, input_r) = stereo_input(input, i);
            (out.left[i], out.right[i]) = state.process(input_l, input_r, params, sample_rate);
        }
        return Some(());
    }

    for i in 0..frames {
        let (input_l, input_r) = stereo_input(input, i);
        let params = MicroPitchParams {
            detune_cents: param_at(access, prior, params, PARAM_DETUNE, base_detune, i, frames),
            width: param_at(access, prior, params, PARAM_WIDTH, base_width, i, frames),
            delay_ms: param_at(
                access,
                prior,
                params,
                PARAM_DELAY_MS,
                base_delay_ms,
                i,
                frames,
            ),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
        };
        (out.left[i], out.right[i]) = state.process(input_l, input_r, params, sample_rate);
    }
    Some(())
}

pub(crate) fn render_multi_tap_delay(
    input_index: usize,
    base_time_ms: f64,
    base_feedback: f64,
    base_mix: f64,
    base_tone: f64,
    base_width: f64,
    taps: &[MultiTapDelayTap],
    state: &mut MultiTapDelayState,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = 2;

    if let (Some(time_ms), Some(feedback), Some(mix), Some(tone), Some(width)) = (
        access.static_param(params, PARAM_TIME_MS, base_time_ms),
        access.static_param(params, PARAM_FEEDBACK, base_feedback),
        access.static_param(params, PARAM_MIX, base_mix),
        access.static_param(params, PARAM_TONE, base_tone),
        access.static_param(params, PARAM_WIDTH, base_width),
    ) {
        let params = MultiTapDelayParams {
            time_ms,
            feedback,
            mix,
            tone,
            width,
        };
        for i in 0..frames {
            let (input_l, input_r) = stereo_input(input, i);
            (out.left[i], out.right[i]) =
                state.process(input_l, input_r, params, taps, sample_rate);
        }
        return Some(());
    }

    for i in 0..frames {
        let (input_l, input_r) = stereo_input(input, i);
        let params = MultiTapDelayParams {
            time_ms: param_at(
                access,
                prior,
                params,
                PARAM_TIME_MS,
                base_time_ms,
                i,
                frames,
            ),
            feedback: param_at(
                access,
                prior,
                params,
                PARAM_FEEDBACK,
                base_feedback,
                i,
                frames,
            ),
            mix: param_at(access, prior, params, PARAM_MIX, base_mix, i, frames),
            tone: param_at(access, prior, params, PARAM_TONE, base_tone, i, frames),
            width: param_at(access, prior, params, PARAM_WIDTH, base_width, i, frames),
        };
        (out.left[i], out.right[i]) = state.process(input_l, input_r, params, taps, sample_rate);
    }
    Some(())
}

use crate::dsp::{adsr_at, ar_at, clamp};
use crate::runtime_params::{
    param_at, ParamAccess, PARAM_ATTACK, PARAM_DECAY, PARAM_RELEASE, PARAM_SUSTAIN, PARAM_TAU,
};
use crate::runtime_routing::input_at;
use crate::runtime_state::NodeBuffer;

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_adsr(
    input_index: usize,
    base_attack: f64,
    base_decay: f64,
    base_sustain: f64,
    base_release: f64,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    frame_start: usize,
    gate_sec: Option<f64>,
    velocity: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;
    let gate_sec = gate_sec.unwrap_or((frame_start + frames) as f64 / sample_rate);

    if let (Some(attack), Some(decay), Some(sustain), Some(release)) = (
        access.static_param(params, PARAM_ATTACK, base_attack),
        access.static_param(params, PARAM_DECAY, base_decay),
        access.static_param(params, PARAM_SUSTAIN, base_sustain),
        access.static_param(params, PARAM_RELEASE, base_release),
    ) {
        let attack = attack.max(0.0);
        let decay = decay.max(0.0);
        let sustain = clamp(sustain, 0.0, 1.0);
        let release = release.max(0.0);
        for i in 0..frames {
            let t = (frame_start + i) as f64 / sample_rate;
            let amp =
                adsr_at(t, gate_sec, attack, decay, sustain, release) as f32 * velocity as f32;
            out.left[i] = input.left[i] * amp;
            if input.channels == 2 {
                out.right[i] = input.right[i] * amp;
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let t = (frame_start + i) as f64 / sample_rate;
        let amp = adsr_at(
            t,
            gate_sec,
            param_at(access, prior, params, PARAM_ATTACK, base_attack, i, frames).max(0.0),
            param_at(access, prior, params, PARAM_DECAY, base_decay, i, frames).max(0.0),
            clamp(
                param_at(
                    access,
                    prior,
                    params,
                    PARAM_SUSTAIN,
                    base_sustain,
                    i,
                    frames,
                ),
                0.0,
                1.0,
            ),
            param_at(
                access,
                prior,
                params,
                PARAM_RELEASE,
                base_release,
                i,
                frames,
            )
            .max(0.0),
        ) as f32
            * velocity as f32;
        out.left[i] = input.left[i] * amp;
        if input.channels == 2 {
            out.right[i] = input.right[i] * amp;
        }
    }
    Some(())
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_ar(
    input_index: usize,
    base_attack: f64,
    base_release: f64,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    frame_start: usize,
    gate_sec: Option<f64>,
    velocity: f64,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;
    let gate_sec = gate_sec.unwrap_or((frame_start + frames) as f64 / sample_rate);

    if let (Some(attack), Some(release)) = (
        access.static_param(params, PARAM_ATTACK, base_attack),
        access.static_param(params, PARAM_RELEASE, base_release),
    ) {
        let attack = attack.max(0.0);
        let release = release.max(0.0);
        for i in 0..frames {
            let t = (frame_start + i) as f64 / sample_rate;
            let amp = ar_at(t, gate_sec, attack, release) as f32 * velocity as f32;
            out.left[i] = input.left[i] * amp;
            if input.channels == 2 {
                out.right[i] = input.right[i] * amp;
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let t = (frame_start + i) as f64 / sample_rate;
        let attack = param_at(access, prior, params, PARAM_ATTACK, base_attack, i, frames).max(0.0);
        let release = param_at(
            access,
            prior,
            params,
            PARAM_RELEASE,
            base_release,
            i,
            frames,
        )
        .max(0.0);
        let amp = ar_at(t, gate_sec, attack, release) as f32 * velocity as f32;
        out.left[i] = input.left[i] * amp;
        if input.channels == 2 {
            out.right[i] = input.right[i] * amp;
        }
    }
    Some(())
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_exponential(
    input_index: usize,
    base_tau: f64,
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    out: &mut NodeBuffer,
    frames: usize,
    sample_rate: f64,
    frame_start: usize,
) -> Option<()> {
    let input = input_at(input_index, prior)?;
    out.channels = input.channels;

    if let Some(tau) = access.static_param(params, PARAM_TAU, base_tau) {
        let tau = tau.max(1e-6);
        for i in 0..frames {
            let amp = (-(((frame_start + i) as f64 / sample_rate) / tau)).exp() as f32;
            out.left[i] = input.left[i] * amp;
            if input.channels == 2 {
                out.right[i] = input.right[i] * amp;
            }
        }
        return Some(());
    }

    for i in 0..frames {
        let tau = param_at(access, prior, params, PARAM_TAU, base_tau, i, frames).max(1e-6);
        let amp = (-(((frame_start + i) as f64 / sample_rate) / tau)).exp() as f32;
        out.left[i] = input.left[i] * amp;
        if input.channels == 2 {
            out.right[i] = input.right[i] * amp;
        }
    }
    Some(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_close(actual: f32, expected: f32) {
        assert!(
            (actual - expected).abs() < 1e-6,
            "expected {expected}, got {actual}"
        );
    }

    fn mono_buffer(samples: &[f32]) -> NodeBuffer {
        let mut buffer = NodeBuffer::new(1, samples.len());
        buffer.left.copy_from_slice(samples);
        buffer
    }

    fn stereo_buffer(left: &[f32], right: &[f32]) -> NodeBuffer {
        let mut buffer = NodeBuffer::new(2, left.len());
        buffer.left.copy_from_slice(left);
        buffer.right.copy_from_slice(right);
        buffer
    }

    #[test]
    fn adsr_renderer_preserves_stereo_and_applies_velocity() {
        let prior = [stereo_buffer(&[1.0, 1.0, 1.0], &[2.0, 2.0, 2.0])];
        let mut out = NodeBuffer::new(1, 3);

        render_adsr(
            0,
            0.0,
            0.0,
            1.0,
            0.0,
            &ParamAccess::default(),
            &prior,
            &[],
            &mut out,
            3,
            10.0,
            0,
            Some(1.0),
            0.5,
        )
        .expect("adsr should render");

        assert_eq!(out.channels, 2);
        assert_eq!(&out.left[..3], &[0.5, 0.5, 0.5]);
        assert_eq!(&out.right[..3], &[1.0, 1.0, 1.0]);
    }

    #[test]
    fn adsr_renderer_uses_scalar_param_slots_as_static_params() {
        let prior = [mono_buffer(&[1.0, 1.0, 1.0])];
        let mut out = NodeBuffer::new(1, 3);
        let attack = [0.0];
        let decay = [0.0];
        let sustain = [0.5];
        let release = [0.0];
        let access = ParamAccess::for_test([
            (PARAM_ATTACK, 0),
            (PARAM_DECAY, 1),
            (PARAM_SUSTAIN, 2),
            (PARAM_RELEASE, 3),
        ]);

        render_adsr(
            0,
            1.0,
            1.0,
            1.0,
            1.0,
            &access,
            &prior,
            &[&attack, &decay, &sustain, &release],
            &mut out,
            3,
            10.0,
            0,
            Some(1.0),
            0.5,
        )
        .expect("adsr should render");

        assert_eq!(out.channels, 1);
        assert_eq!(&out.left[..3], &[0.25, 0.25, 0.25]);
    }

    #[test]
    fn ar_renderer_releases_after_gate() {
        let prior = [mono_buffer(&[1.0, 1.0, 1.0, 1.0])];
        let mut out = NodeBuffer::new(1, 4);

        render_ar(
            0,
            0.0,
            0.2,
            &ParamAccess::default(),
            &prior,
            &[],
            &mut out,
            4,
            10.0,
            0,
            Some(0.2),
            1.0,
        )
        .expect("ar should render");

        assert_eq!(out.channels, 1);
        assert_close(out.left[0], 1.0);
        assert_close(out.left[1], 1.0);
        assert_close(out.left[2], 1.0);
        assert_close(out.left[3], 0.5);
    }

    #[test]
    fn ar_renderer_uses_scalar_param_slots_as_static_params() {
        let prior = [mono_buffer(&[1.0, 1.0, 1.0, 1.0])];
        let mut out = NodeBuffer::new(1, 4);
        let attack = [0.0];
        let release = [0.2];
        let access = ParamAccess::for_test([(PARAM_ATTACK, 0), (PARAM_RELEASE, 1)]);

        render_ar(
            0,
            1.0,
            1.0,
            &access,
            &prior,
            &[&attack, &release],
            &mut out,
            4,
            10.0,
            0,
            Some(0.2),
            1.0,
        )
        .expect("ar should render");

        assert_eq!(out.channels, 1);
        assert_close(out.left[0], 1.0);
        assert_close(out.left[3], 0.5);
    }

    #[test]
    fn exponential_renderer_applies_sample_time_decay() {
        let prior = [mono_buffer(&[1.0, 1.0, 1.0])];
        let mut out = NodeBuffer::new(1, 3);

        render_exponential(
            0,
            1.0,
            &ParamAccess::default(),
            &prior,
            &[],
            &mut out,
            3,
            1.0,
            0,
        )
        .expect("exponential should render");

        assert_eq!(out.channels, 1);
        assert_close(out.left[0], 1.0);
        assert_close(out.left[1], std::f32::consts::E.powf(-1.0));
        assert_close(out.left[2], std::f32::consts::E.powf(-2.0));
    }

    #[test]
    fn exponential_renderer_uses_scalar_param_slots_as_static_params() {
        let prior = [mono_buffer(&[1.0, 1.0, 1.0])];
        let mut out = NodeBuffer::new(1, 3);
        let tau = [1.0];
        let access = ParamAccess::for_test([(PARAM_TAU, 0)]);

        render_exponential(0, 0.1, &access, &prior, &[&tau], &mut out, 3, 1.0, 0)
            .expect("exponential should render");

        assert_eq!(out.channels, 1);
        assert_close(out.left[0], 1.0);
        assert_close(out.left[2], std::f32::consts::E.powf(-2.0));
    }
}

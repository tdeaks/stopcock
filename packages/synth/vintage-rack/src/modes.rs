use stopcock_dsp_core::{
    clamp, DegradeParams, EnsembleChorusParams, MicroPitchParams, PlateReverbParams,
    SaturatorParams, SpringReverbParams, TapeEchoParams,
};

use crate::params::RackParams;

pub(crate) fn ensemble_params(params: RackParams) -> EnsembleChorusParams {
    EnsembleChorusParams {
        rate_hz: 0.08 + params.motion * 3.2,
        depth_ms: 1.0 + params.motion * 8.5,
        mix: params.mix,
        width: params.width,
        tone: params.tone,
        noise: params.age * 0.12,
    }
}

pub(crate) fn drum_echo_params(params: RackParams) -> TapeEchoParams {
    TapeEchoParams {
        time_ms: params.time_ms,
        feedback: params.feedback,
        mix: params.mix,
        reverb_mix: params.decay * 0.24,
        wow: params.motion * 0.42,
        flutter: params.motion * 0.18,
        tape_age: params.age,
        drive: params.drive,
        head_count: 3.0,
        head1: true,
        head2: params.feedback > 0.12,
        head3: true,
    }
}

pub(crate) fn micro_pitch_params(params: RackParams) -> MicroPitchParams {
    MicroPitchParams {
        detune_cents: 4.0 + params.motion * 22.0,
        width: params.width,
        delay_ms: clamp(params.time_ms, 4.0, 60.0),
        mix: params.mix,
    }
}

pub(crate) fn plate_params(params: RackParams) -> PlateReverbParams {
    PlateReverbParams {
        pre_delay_ms: clamp(params.time_ms * 0.08, 0.0, 120.0),
        decay: 0.15 + params.decay * 0.82,
        damping: 1.0 - params.tone,
        diffusion: 0.35 + params.motion * 0.6,
        modulation: params.motion * 0.32,
        mix: params.mix,
        width: params.width,
    }
}

pub(crate) fn spring_params(params: RackParams) -> SpringReverbParams {
    SpringReverbParams {
        decay: 0.12 + params.decay * 0.85,
        damping: 1.0 - params.tone,
        tension: params.motion,
        drip: params.age,
        mix: params.mix,
        width: params.width,
    }
}

pub(crate) fn lofi_params(params: RackParams) -> DegradeParams {
    DegradeParams {
        bits: 4.0 + params.tone * 16.0,
        downsample: 1.0 + params.age * 24.0 + params.motion * 8.0,
        jitter: params.motion * 0.22,
        noise: params.age * 0.18,
        tone: params.tone,
        mix: params.mix,
    }
}

pub(crate) fn saturator_params(params: RackParams) -> SaturatorParams {
    SaturatorParams {
        drive: params.drive,
        asymmetry: (params.motion - 0.5) * 1.2,
        tone: params.tone,
        mix: params.mix,
        output: 1.0,
    }
}

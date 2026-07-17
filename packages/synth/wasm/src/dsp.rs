pub(crate) use stopcock_dsp_core::{
    adsr_at, ar_at, bitcrush_sample, clamp, compress_sample, equal_power_pan, safe_finite,
    sample_linear, sample_waveform, sample_wavetable, sine_lfo_at, wrap_phase, AcidBassParams,
    AcidBassState, AcidBassWaveform, BiquadState, BitcrusherState, CompressorParams,
    CompressorState, DampedComb, DegradeParams, DegradeState, DelayLine, DrumVoiceKind,
    DrumVoiceParams, DrumVoiceState, EnsembleChorusParams, EnsembleChorusState, FeedbackDelay,
    FilterKind, FrequencyShifterParams, FrequencyShifterState, LoFiSamplerParams, LoFiSamplerState,
    MicroPitchParams, MicroPitchState, Mulberry32, MultiTapDelayParams, MultiTapDelayState,
    MultiTapDelayTap, NonlinearReverbParams, NonlinearReverbState, PhaserParams, PhaserState,
    PhaserVoicing, PlateReverbParams, PlateReverbState, PolySynthParams, PolySynthState,
    ReverbLine, RotarySpeakerParams,
    RotarySpeakerState, SamplerParams, SamplerVoiceState, SamplerZone, SaturatorParams,
    SaturatorState, SpringReverbParams, SpringReverbState, StateVariableFilterMode,
    StateVariableFilterParams, StateVariableFilterState, StereoSpreadParams, StereoSpreadState,
    StringMachineParams, StringMachineState, TapeDelayParams, TapeDelayState, TapeEchoParams,
    TapeEchoState, TiltEqParams, TiltEqState, WavefolderParams, WavefolderState, Waveform,
    WavetableSource, TAU,
};

use crate::model::WavetableBank;

impl WavetableSource for WavetableBank {
    fn size(&self) -> usize {
        self.size
    }

    fn frame_count(&self) -> usize {
        self.frame_count
    }

    fn levels(&self) -> &[Vec<f32>] {
        &self.levels
    }

    fn level_max_harmonics(&self) -> &[f64] {
        &self.level_max_harmonics
    }
}

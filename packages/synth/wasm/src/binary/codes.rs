use crate::dsp::{AcidBassWaveform, DrumVoiceKind, FilterKind, StateVariableFilterMode, Waveform};
use crate::model::{FmOperatorKind, NodeKind};

#[cfg(test)]
pub(super) fn kind_name(code: u8) -> Option<&'static str> {
    Some(node_kind(code)?.as_str())
}

pub(super) fn node_kind(code: u8) -> Option<NodeKind> {
    Some(match code {
        0 => NodeKind::Osc,
        1 => NodeKind::Wavetable,
        2 => NodeKind::Fm,
        3 => NodeKind::Noise,
        4 => NodeKind::Constant,
        5 => NodeKind::Buffer,
        6 => NodeKind::Input,
        7 => NodeKind::Gain,
        8 => NodeKind::Pan,
        9 => NodeKind::Mix,
        10 => NodeKind::Stereo,
        11 => NodeKind::Biquad,
        12 => NodeKind::Comb,
        13 => NodeKind::Adsr,
        14 => NodeKind::Ar,
        15 => NodeKind::Exponential,
        16 => NodeKind::Delay,
        17 => NodeKind::Reverb,
        18 => NodeKind::Distortion,
        19 => NodeKind::Chorus,
        20 => NodeKind::SpaceEcho,
        21 => NodeKind::Compressor,
        22 => NodeKind::Bitcrush,
        23 => NodeKind::MicroPitch,
        24 => NodeKind::MultiTapDelay,
        25 => NodeKind::Saturator,
        26 => NodeKind::Degrade,
        27 => NodeKind::EnsembleChorus,
        28 => NodeKind::TapeDelay,
        29 => NodeKind::PlateReverb,
        30 => NodeKind::SpringReverb,
        31 => NodeKind::NonlinearReverb,
        32 => NodeKind::SamplerInstrument,
        33 => NodeKind::AcidBass,
        34 => NodeKind::DrumVoice,
        35 => NodeKind::StringMachine,
        36 => NodeKind::PolySynth,
        37 => NodeKind::LofiSampler,
        38 => NodeKind::TiltEq,
        39 => NodeKind::StereoSpread,
        40 => NodeKind::FrequencyShifter,
        41 => NodeKind::RotarySpeaker,
        42 => NodeKind::StateVariableFilter,
        43 => NodeKind::Wavefolder,
        44 => NodeKind::Phaser,
        _ => return None,
    })
}

pub(super) fn param_name(code: u16) -> Option<&'static str> {
    Some(match code {
        0 => "freq",
        1 => "detune",
        2 => "phase",
        3 => "position",
        4 => "index",
        5 => "value",
        6 => "amount",
        7 => "q",
        8 => "gainDb",
        9 => "delayMs",
        10 => "feedback",
        11 => "damp",
        12 => "attack",
        13 => "decay",
        14 => "sustain",
        15 => "release",
        16 => "tau",
        17 => "mix",
        18 => "depth",
        19 => "rate",
        20 => "reverbMix",
        21 => "wow",
        22 => "flutter",
        23 => "tapeAge",
        24 => "drive",
        25 => "threshold",
        26 => "ratio",
        27 => "knee",
        28 => "bits",
        29 => "downsample",
        30 => "timeMs",
        31 => "width",
        32 => "tone",
        33 => "asymmetry",
        34 => "output",
        35 => "jitter",
        36 => "noise",
        37 => "damping",
        38 => "preDelayMs",
        39 => "diffusion",
        40 => "modulation",
        41 => "tension",
        42 => "drip",
        43 => "level",
        44 => "cutoff",
        45 => "resonance",
        46 => "envMod",
        47 => "accent",
        48 => "slide",
        49 => "snap",
        50 => "pulseWidth",
        51 => "sub",
        52 => "chorus",
        53 => "shiftHz",
        100 => "op1.ratio",
        101 => "op1.level",
        102 => "op1.feedback",
        103 => "op1.output",
        104 => "op2.ratio",
        105 => "op2.level",
        106 => "op2.feedback",
        107 => "op2.output",
        108 => "op3.ratio",
        109 => "op3.level",
        110 => "op3.feedback",
        111 => "op3.output",
        112 => "op4.ratio",
        113 => "op4.level",
        114 => "op4.feedback",
        115 => "op4.output",
        116 => "op5.ratio",
        117 => "op5.level",
        118 => "op5.feedback",
        119 => "op5.output",
        120 => "op6.ratio",
        121 => "op6.level",
        122 => "op6.feedback",
        123 => "op6.output",
        200 => "m1_1",
        201 => "m1_2",
        202 => "m1_3",
        203 => "m1_4",
        204 => "m1_5",
        205 => "m1_6",
        206 => "m2_1",
        207 => "m2_2",
        208 => "m2_3",
        209 => "m2_4",
        210 => "m2_5",
        211 => "m2_6",
        212 => "m3_1",
        213 => "m3_2",
        214 => "m3_3",
        215 => "m3_4",
        216 => "m3_5",
        217 => "m3_6",
        218 => "m4_1",
        219 => "m4_2",
        220 => "m4_3",
        221 => "m4_4",
        222 => "m4_5",
        223 => "m4_6",
        224 => "m5_1",
        225 => "m5_2",
        226 => "m5_3",
        227 => "m5_4",
        228 => "m5_5",
        229 => "m5_6",
        230 => "m6_1",
        231 => "m6_2",
        232 => "m6_3",
        233 => "m6_4",
        234 => "m6_5",
        235 => "m6_6",
        _ => return None,
    })
}

pub(super) fn param_code(code: u16) -> Option<u16> {
    param_name(code)?;
    Some(code)
}

#[cfg(test)]
pub(super) fn rate_name(code: u8) -> Option<&'static str> {
    match code {
        0 => Some("audio"),
        1 => Some("control"),
        _ => None,
    }
}

pub(super) fn rate_is_control(code: u8) -> Option<bool> {
    match code {
        0 => Some(false),
        1 => Some(true),
        _ => None,
    }
}

#[cfg(test)]
pub(super) fn wave_name(code: u8) -> Option<&'static str> {
    match code {
        0 => Some("sine"),
        1 => Some("saw"),
        2 => Some("square"),
        3 => Some("triangle"),
        _ => None,
    }
}

pub(super) fn wave_kind(code: u8) -> Option<Waveform> {
    Some(match code {
        0 => Waveform::Sine,
        1 => Waveform::Saw,
        2 => Waveform::Square,
        3 => Waveform::Triangle,
        _ => return None,
    })
}

#[cfg(test)]
pub(super) fn acid_wave_name(code: u8) -> Option<&'static str> {
    match code {
        0 => Some("saw"),
        1 => Some("square"),
        _ => None,
    }
}

pub(super) fn acid_wave_kind(code: u8) -> Option<AcidBassWaveform> {
    Some(match code {
        0 => AcidBassWaveform::Saw,
        1 => AcidBassWaveform::Square,
        _ => return None,
    })
}

#[cfg(test)]
pub(super) fn drum_voice_kind_name(code: u8) -> Option<&'static str> {
    match code {
        0 => Some("kick"),
        1 => Some("snare"),
        2 => Some("hat"),
        _ => None,
    }
}

pub(super) fn drum_voice_kind(code: u8) -> Option<DrumVoiceKind> {
    Some(match code {
        0 => DrumVoiceKind::Kick,
        1 => DrumVoiceKind::Snare,
        2 => DrumVoiceKind::Hat,
        _ => return None,
    })
}

pub(super) fn color_name(code: u8) -> Option<&'static str> {
    match code {
        0 => Some("white"),
        1 => Some("pink"),
        2 => Some("brown"),
        _ => None,
    }
}

#[cfg(test)]
pub(super) fn filter_name(code: u8) -> Option<&'static str> {
    Some(match code {
        0 => "lowpass",
        1 => "highpass",
        2 => "bandpass",
        3 => "notch",
        4 => "peak",
        5 => "lowshelf",
        6 => "highshelf",
        7 => "allpass",
        _ => return None,
    })
}

pub(super) fn filter_kind(code: u8) -> Option<FilterKind> {
    Some(match code {
        0 => FilterKind::Lowpass,
        1 => FilterKind::Highpass,
        2 => FilterKind::Bandpass,
        3 => FilterKind::Notch,
        4 => FilterKind::Peak,
        5 => FilterKind::Lowshelf,
        6 => FilterKind::Highshelf,
        7 => FilterKind::Allpass,
        _ => return None,
    })
}

pub(super) fn state_variable_filter_mode(code: u8) -> Option<StateVariableFilterMode> {
    Some(match filter_kind(code)? {
        FilterKind::Highpass => StateVariableFilterMode::Highpass,
        FilterKind::Bandpass => StateVariableFilterMode::Bandpass,
        FilterKind::Notch => StateVariableFilterMode::Notch,
        _ => StateVariableFilterMode::Lowpass,
    })
}

pub(super) fn shape_name(code: u8) -> Option<&'static str> {
    match code {
        0 => Some("tanh"),
        1 => Some("softclip"),
        2 => Some("hardclip"),
        _ => None,
    }
}

pub(super) fn phaser_voicing_name(code: u8) -> Option<&'static str> {
    match code {
        0 => Some("phase90"),
        1 => Some("smallStone"),
        2 => Some("uniVibe"),
        3 => Some("uniVibeVibrato"),
        _ => None,
    }
}

#[cfg(test)]
pub(super) fn operator_kind_name(code: u8) -> Option<&'static str> {
    match code {
        0 => Some("sine"),
        1 => Some("polyblep"),
        2 => Some("wavetable"),
        _ => None,
    }
}

pub(super) fn operator_kind(code: u8) -> Option<FmOperatorKind> {
    Some(match code {
        0 => FmOperatorKind::Sine,
        1 => FmOperatorKind::Polyblep,
        2 => FmOperatorKind::Wavetable,
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_code_tables_map_public_wire_values() {
        assert_eq!(kind_name(40), Some("frequencyShifter"));
        assert_eq!(kind_name(41), Some("rotarySpeaker"));
        assert_eq!(kind_name(42), Some("stateVariableFilter"));
        assert_eq!(kind_name(43), Some("wavefolder"));
        assert_eq!(node_kind(43), Some(NodeKind::Wavefolder));
        assert_eq!(kind_name(44), Some("phaser"));
        assert_eq!(node_kind(44), Some(NodeKind::Phaser));
        assert_eq!(param_name(53), Some("shiftHz"));
        assert_eq!(param_name(235), Some("m6_6"));
        assert_eq!(param_code(235), Some(235));
        assert_eq!(rate_name(1), Some("control"));
        assert_eq!(rate_is_control(1), Some(true));
        assert_eq!(wave_name(2), Some("square"));
        assert_eq!(wave_kind(2), Some(Waveform::Square));
        assert_eq!(acid_wave_kind(1), Some(AcidBassWaveform::Square));
        assert_eq!(drum_voice_kind(2), Some(DrumVoiceKind::Hat));
        assert_eq!(filter_name(7), Some("allpass"));
        assert_eq!(filter_kind(7), Some(FilterKind::Allpass));
        assert_eq!(
            state_variable_filter_mode(2),
            Some(StateVariableFilterMode::Bandpass)
        );
        assert_eq!(operator_kind(1), Some(FmOperatorKind::Polyblep));
        assert_eq!(operator_kind_name(2), Some("wavetable"));
    }

    #[test]
    fn unknown_codes_are_rejected() {
        assert_eq!(kind_name(45), None);
        assert_eq!(node_kind(45), None);
        assert_eq!(param_name(236), None);
        assert_eq!(param_code(236), None);
        assert_eq!(rate_name(2), None);
        assert_eq!(rate_is_control(2), None);
        assert_eq!(wave_kind(4), None);
        assert_eq!(acid_wave_name(2), None);
        assert_eq!(acid_wave_kind(2), None);
        assert_eq!(drum_voice_kind_name(3), None);
        assert_eq!(drum_voice_kind(3), None);
        assert_eq!(color_name(3), None);
        assert_eq!(filter_kind(8), None);
        assert_eq!(operator_kind(3), None);
        assert_eq!(shape_name(3), None);
    }
}

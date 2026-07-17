pub(crate) type ParamId = u16;

pub(crate) const PARAM_FREQ: ParamId = 0;
pub(crate) const PARAM_DETUNE: ParamId = 1;
pub(crate) const PARAM_PHASE: ParamId = 2;
pub(crate) const PARAM_POSITION: ParamId = 3;
pub(crate) const PARAM_INDEX: ParamId = 4;
pub(crate) const PARAM_VALUE: ParamId = 5;
pub(crate) const PARAM_AMOUNT: ParamId = 6;
pub(crate) const PARAM_Q: ParamId = 7;
pub(crate) const PARAM_GAIN_DB: ParamId = 8;
pub(crate) const PARAM_DELAY_MS: ParamId = 9;
pub(crate) const PARAM_FEEDBACK: ParamId = 10;
pub(crate) const PARAM_DAMP: ParamId = 11;
pub(crate) const PARAM_ATTACK: ParamId = 12;
pub(crate) const PARAM_DECAY: ParamId = 13;
pub(crate) const PARAM_SUSTAIN: ParamId = 14;
pub(crate) const PARAM_RELEASE: ParamId = 15;
pub(crate) const PARAM_TAU: ParamId = 16;
pub(crate) const PARAM_MIX: ParamId = 17;
pub(crate) const PARAM_DEPTH: ParamId = 18;
pub(crate) const PARAM_RATE: ParamId = 19;
pub(crate) const PARAM_REVERB_MIX: ParamId = 20;
pub(crate) const PARAM_WOW: ParamId = 21;
pub(crate) const PARAM_FLUTTER: ParamId = 22;
pub(crate) const PARAM_TAPE_AGE: ParamId = 23;
pub(crate) const PARAM_DRIVE: ParamId = 24;
pub(crate) const PARAM_THRESHOLD: ParamId = 25;
pub(crate) const PARAM_RATIO: ParamId = 26;
pub(crate) const PARAM_KNEE: ParamId = 27;
pub(crate) const PARAM_BITS: ParamId = 28;
pub(crate) const PARAM_DOWNSAMPLE: ParamId = 29;
pub(crate) const PARAM_TIME_MS: ParamId = 30;
pub(crate) const PARAM_WIDTH: ParamId = 31;
pub(crate) const PARAM_TONE: ParamId = 32;
pub(crate) const PARAM_ASYMMETRY: ParamId = 33;
pub(crate) const PARAM_OUTPUT: ParamId = 34;
pub(crate) const PARAM_JITTER: ParamId = 35;
pub(crate) const PARAM_NOISE: ParamId = 36;
pub(crate) const PARAM_DAMPING: ParamId = 37;
pub(crate) const PARAM_PRE_DELAY_MS: ParamId = 38;
pub(crate) const PARAM_DIFFUSION: ParamId = 39;
pub(crate) const PARAM_MODULATION: ParamId = 40;
pub(crate) const PARAM_TENSION: ParamId = 41;
pub(crate) const PARAM_DRIP: ParamId = 42;
pub(crate) const PARAM_LEVEL: ParamId = 43;
pub(crate) const PARAM_CUTOFF: ParamId = 44;
pub(crate) const PARAM_RESONANCE: ParamId = 45;
pub(crate) const PARAM_ENV_MOD: ParamId = 46;
pub(crate) const PARAM_ACCENT: ParamId = 47;
pub(crate) const PARAM_SLIDE: ParamId = 48;
pub(crate) const PARAM_SNAP: ParamId = 49;
pub(crate) const PARAM_PULSE_WIDTH: ParamId = 50;
pub(crate) const PARAM_SUB: ParamId = 51;
pub(crate) const PARAM_CHORUS: ParamId = 52;
pub(crate) const PARAM_SHIFT_HZ: ParamId = 53;

pub(crate) const FM_RATIO_PARAMS: [ParamId; 6] = [100, 104, 108, 112, 116, 120];
pub(crate) const FM_LEVEL_PARAMS: [ParamId; 6] = [101, 105, 109, 113, 117, 121];
pub(crate) const FM_FEEDBACK_PARAMS: [ParamId; 6] = [102, 106, 110, 114, 118, 122];
pub(crate) const FM_OUTPUT_PARAMS: [ParamId; 6] = [103, 107, 111, 115, 119, 123];
pub(crate) const FM_MATRIX_PARAMS: [[ParamId; 6]; 6] = [
    [200, 201, 202, 203, 204, 205],
    [206, 207, 208, 209, 210, 211],
    [212, 213, 214, 215, 216, 217],
    [218, 219, 220, 221, 222, 223],
    [224, 225, 226, 227, 228, 229],
    [230, 231, 232, 233, 234, 235],
];

pub(crate) const PARAM_BUCKETS: usize = 236;

pub(super) fn param_id(param: &str) -> Option<ParamId> {
    Some(match param {
        "freq" => PARAM_FREQ,
        "detune" => PARAM_DETUNE,
        "phase" => PARAM_PHASE,
        "position" => PARAM_POSITION,
        "index" => PARAM_INDEX,
        "value" => PARAM_VALUE,
        "amount" => PARAM_AMOUNT,
        "q" => PARAM_Q,
        "gainDb" => PARAM_GAIN_DB,
        "delayMs" => PARAM_DELAY_MS,
        "feedback" => PARAM_FEEDBACK,
        "damp" => PARAM_DAMP,
        "attack" => PARAM_ATTACK,
        "decay" => PARAM_DECAY,
        "sustain" => PARAM_SUSTAIN,
        "release" => PARAM_RELEASE,
        "tau" => PARAM_TAU,
        "mix" => PARAM_MIX,
        "depth" => PARAM_DEPTH,
        "rate" => PARAM_RATE,
        "reverbMix" => PARAM_REVERB_MIX,
        "wow" => PARAM_WOW,
        "flutter" => PARAM_FLUTTER,
        "tapeAge" => PARAM_TAPE_AGE,
        "drive" => PARAM_DRIVE,
        "threshold" => PARAM_THRESHOLD,
        "ratio" => PARAM_RATIO,
        "knee" => PARAM_KNEE,
        "bits" => PARAM_BITS,
        "downsample" => PARAM_DOWNSAMPLE,
        "timeMs" => PARAM_TIME_MS,
        "width" => PARAM_WIDTH,
        "tone" => PARAM_TONE,
        "asymmetry" => PARAM_ASYMMETRY,
        "output" => PARAM_OUTPUT,
        "jitter" => PARAM_JITTER,
        "noise" => PARAM_NOISE,
        "damping" => PARAM_DAMPING,
        "preDelayMs" => PARAM_PRE_DELAY_MS,
        "diffusion" => PARAM_DIFFUSION,
        "modulation" => PARAM_MODULATION,
        "tension" => PARAM_TENSION,
        "drip" => PARAM_DRIP,
        "level" => PARAM_LEVEL,
        "cutoff" => PARAM_CUTOFF,
        "resonance" => PARAM_RESONANCE,
        "envMod" => PARAM_ENV_MOD,
        "accent" => PARAM_ACCENT,
        "slide" => PARAM_SLIDE,
        "snap" => PARAM_SNAP,
        "pulseWidth" => PARAM_PULSE_WIDTH,
        "sub" => PARAM_SUB,
        "chorus" => PARAM_CHORUS,
        "shiftHz" => PARAM_SHIFT_HZ,
        _ => fm_param_id(param)?,
    })
}

fn fm_param_id(param: &str) -> Option<ParamId> {
    if let Some(op) = param.strip_prefix("op") {
        let (index, name) = op.split_once('.')?;
        let op_index = index.parse::<u16>().ok()?.checked_sub(1)?;
        if op_index >= 6 {
            return None;
        }
        let offset = match name {
            "ratio" => 0,
            "level" => 1,
            "feedback" => 2,
            "output" => 3,
            _ => return None,
        };
        return Some(100 + op_index * 4 + offset);
    }

    let matrix = param.strip_prefix('m')?;
    let (source, destination) = matrix.split_once('_')?;
    let source = source.parse::<u16>().ok()?.checked_sub(1)?;
    let destination = destination.parse::<u16>().ok()?.checked_sub(1)?;
    if source >= 6 || destination >= 6 {
        return None;
    }
    Some(200 + source * 6 + destination)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_scalar_and_fm_param_names_to_stable_numeric_ids() {
        assert_eq!(param_id("freq"), Some(PARAM_FREQ));
        assert_eq!(param_id("width"), Some(PARAM_WIDTH));
        assert_eq!(param_id("tone"), Some(PARAM_TONE));
        assert_eq!(param_id("asymmetry"), Some(PARAM_ASYMMETRY));
        assert_eq!(param_id("output"), Some(PARAM_OUTPUT));
        assert_eq!(param_id("jitter"), Some(PARAM_JITTER));
        assert_eq!(param_id("noise"), Some(PARAM_NOISE));
        assert_eq!(param_id("damping"), Some(PARAM_DAMPING));
        assert_eq!(param_id("preDelayMs"), Some(PARAM_PRE_DELAY_MS));
        assert_eq!(param_id("diffusion"), Some(PARAM_DIFFUSION));
        assert_eq!(param_id("modulation"), Some(PARAM_MODULATION));
        assert_eq!(param_id("tension"), Some(PARAM_TENSION));
        assert_eq!(param_id("drip"), Some(PARAM_DRIP));
        assert_eq!(param_id("level"), Some(PARAM_LEVEL));
        assert_eq!(param_id("cutoff"), Some(PARAM_CUTOFF));
        assert_eq!(param_id("resonance"), Some(PARAM_RESONANCE));
        assert_eq!(param_id("envMod"), Some(PARAM_ENV_MOD));
        assert_eq!(param_id("accent"), Some(PARAM_ACCENT));
        assert_eq!(param_id("slide"), Some(PARAM_SLIDE));
        assert_eq!(param_id("snap"), Some(PARAM_SNAP));
        assert_eq!(param_id("pulseWidth"), Some(PARAM_PULSE_WIDTH));
        assert_eq!(param_id("sub"), Some(PARAM_SUB));
        assert_eq!(param_id("chorus"), Some(PARAM_CHORUS));
        assert_eq!(param_id("shiftHz"), Some(PARAM_SHIFT_HZ));
        assert_eq!(param_id("op6.output"), Some(123));
        assert_eq!(param_id("m6_6"), Some(235));
        assert_eq!(param_id("op7.output"), None);
        assert_eq!(param_id("m1_7"), None);
        assert_eq!(param_id("unknown"), None);
    }
}

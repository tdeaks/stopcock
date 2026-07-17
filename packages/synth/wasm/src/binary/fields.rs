use crate::binary::codes::{
    acid_wave_kind, color_name, drum_voice_kind, filter_kind, operator_kind, phaser_voicing_name,
    shape_name, state_variable_filter_mode, wave_kind,
};
use crate::binary::reader::Reader;
use crate::model::{Fields, FmOperator, FmOperatorKind, SamplerZoneDef, WavetableBank};

pub(super) fn decode_fields(kind: u8, reader: &mut Reader) -> Option<Fields> {
    let mut fields = Fields::default();
    match kind {
        0 => {
            fields.wave_kind = Some(wave_kind(reader.u8()?)?);
            fields.freq = Some(reader.f64()?);
            fields.detune = Some(reader.f64()?);
            fields.phase = Some(reader.f64()?);
        }
        1 => {
            fields.bank = Some(decode_wavetable_bank(reader)?);
            fields.freq = Some(reader.f64()?);
            fields.detune = Some(reader.f64()?);
            fields.phase = Some(reader.f64()?);
            fields.position = Some(reader.f64()?);
        }
        2 => {
            fields.freq = Some(reader.f64()?);
            fields.detune = Some(reader.f64()?);
            fields.index = Some(reader.f64()?);
            fields.operators = Some(reader.vec(decode_operator)?);
            fields.matrix = Some(reader.vec(|r| r.f64_vec())?);
        }
        3 => {
            fields.color = Some(color_name(reader.u8()?)?.to_string());
            fields.seed = Some(reader.u32()?);
        }
        4 => fields.value = Some(reader.f64()?),
        5 => {
            fields.samples = Some(reader.f32_vec()?);
            fields.looped = Some(reader.bool()?);
            fields.rate = Some(reader.f64()?);
        }
        6 => fields.channel = Some(reader.usize()?),
        7 => fields.amount = Some(reader.f64()?),
        8 => fields.position = Some(reader.f64()?),
        9 | 10 => {}
        11 => {
            fields.filter_kind = Some(filter_kind(reader.u8()?)?);
            fields.freq = Some(reader.f64()?);
            fields.q = Some(reader.f64()?);
            fields.gain_db = Some(reader.f64()?);
        }
        12 => {
            fields.delay_ms = Some(reader.f64()?);
            fields.feedback = Some(reader.f64()?);
            fields.damp = Some(reader.f64()?);
        }
        13 => {
            fields.attack = Some(reader.f64()?);
            fields.decay = Some(reader.f64()?);
            fields.sustain = Some(reader.f64()?);
            fields.release = Some(reader.f64()?);
        }
        14 => {
            fields.attack = Some(reader.f64()?);
            fields.release = Some(reader.f64()?);
        }
        15 => fields.tau = Some(reader.f64()?),
        16 => {
            fields.delay_ms = Some(reader.f64()?);
            fields.feedback = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
        }
        17 => {
            fields.ir = Some(reader.f32_vec()?);
            fields.mix = Some(reader.f64()?);
        }
        18 => {
            fields.amount = Some(reader.f64()?);
            fields.shape = Some(shape_name(reader.u8()?)?.to_string());
        }
        19 => {
            fields.rate = Some(reader.f64()?);
            fields.depth = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
        }
        20 => {
            fields.time_ms = Some(reader.f64()?);
            fields.feedback = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
            fields.reverb_mix = Some(reader.f64()?);
            fields.wow = Some(reader.f64()?);
            fields.flutter = Some(reader.f64()?);
            fields.tape_age = Some(reader.f64()?);
            fields.drive = Some(reader.f64()?);
            fields.head1 = Some(reader.bool()?);
            fields.head2 = Some(reader.bool()?);
            fields.head3 = Some(reader.bool()?);
            fields.head_count = Some(reader.f64()?);
        }
        21 => {
            fields.threshold = Some(reader.f64()?);
            fields.ratio = Some(reader.f64()?);
            fields.attack = Some(reader.f64()?);
            fields.release = Some(reader.f64()?);
            fields.knee = Some(reader.f64()?);
        }
        22 => {
            fields.bits = Some(reader.f64()?);
            fields.downsample = Some(reader.f64()?);
        }
        23 => {
            fields.detune = Some(reader.f64()?);
            fields.width = Some(reader.f64()?);
            fields.delay_ms = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
        }
        24 => {
            fields.time_ms = Some(reader.f64()?);
            fields.feedback = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
            fields.tone = Some(reader.f64()?);
            fields.width = Some(reader.f64()?);
            fields.tap_ratios = Some(reader.f64_vec()?);
            fields.tap_gains = Some(reader.f64_vec()?);
            fields.tap_pans = Some(reader.f64_vec()?);
        }
        25 => {
            fields.drive = Some(reader.f64()?);
            fields.asymmetry = Some(reader.f64()?);
            fields.tone = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
            fields.output = Some(reader.f64()?);
        }
        26 => {
            fields.bits = Some(reader.f64()?);
            fields.downsample = Some(reader.f64()?);
            fields.jitter = Some(reader.f64()?);
            fields.noise = Some(reader.f64()?);
            fields.tone = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
        }
        27 => {
            fields.rate = Some(reader.f64()?);
            fields.depth = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
            fields.width = Some(reader.f64()?);
            fields.tone = Some(reader.f64()?);
            fields.noise = Some(reader.f64()?);
        }
        28 => {
            fields.time_ms = Some(reader.f64()?);
            fields.feedback = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
            fields.wow = Some(reader.f64()?);
            fields.flutter = Some(reader.f64()?);
            fields.tape_age = Some(reader.f64()?);
            fields.drive = Some(reader.f64()?);
            fields.tone = Some(reader.f64()?);
            fields.width = Some(reader.f64()?);
        }
        29 => {
            fields.pre_delay_ms = Some(reader.f64()?);
            fields.decay = Some(reader.f64()?);
            fields.damping = Some(reader.f64()?);
            fields.diffusion = Some(reader.f64()?);
            fields.modulation = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
            fields.width = Some(reader.f64()?);
        }
        30 => {
            fields.decay = Some(reader.f64()?);
            fields.damping = Some(reader.f64()?);
            fields.tension = Some(reader.f64()?);
            fields.drip = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
            fields.width = Some(reader.f64()?);
        }
        31 => {
            fields.time_ms = Some(reader.f64()?);
            fields.decay = Some(reader.f64()?);
            fields.damping = Some(reader.f64()?);
            fields.drive = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
            fields.width = Some(reader.f64()?);
        }
        32 => {
            fields.freq = Some(reader.f64()?);
            fields.value = Some(reader.f64()?);
            fields.attack = Some(reader.f64()?);
            fields.release = Some(reader.f64()?);
            fields.amount = Some(reader.f64()?);
            fields.zones = Some(reader.vec(decode_sampler_zone)?);
        }
        33 => {
            fields.acid_wave_kind = Some(acid_wave_kind(reader.u8()?)?);
            fields.freq = Some(reader.f64()?);
            fields.value = Some(reader.f64()?);
            fields.cutoff = Some(reader.f64()?);
            fields.resonance = Some(reader.f64()?);
            fields.env_mod = Some(reader.f64()?);
            fields.decay = Some(reader.f64()?);
            fields.accent = Some(reader.f64()?);
            fields.slide = Some(reader.f64()?);
            fields.drive = Some(reader.f64()?);
            fields.level = Some(reader.f64()?);
        }
        34 => {
            fields.drum_voice_kind = Some(drum_voice_kind(reader.u8()?)?);
            fields.freq = Some(reader.f64()?);
            fields.value = Some(reader.f64()?);
            fields.decay = Some(reader.f64()?);
            fields.tone = Some(reader.f64()?);
            fields.snap = Some(reader.f64()?);
            fields.noise = Some(reader.f64()?);
            fields.drive = Some(reader.f64()?);
            fields.level = Some(reader.f64()?);
        }
        35 => {
            fields.freq = Some(reader.f64()?);
            fields.value = Some(reader.f64()?);
            fields.detune = Some(reader.f64()?);
            fields.attack = Some(reader.f64()?);
            fields.release = Some(reader.f64()?);
            fields.tone = Some(reader.f64()?);
            fields.depth = Some(reader.f64()?);
            fields.modulation = Some(reader.f64()?);
            fields.width = Some(reader.f64()?);
            fields.level = Some(reader.f64()?);
        }
        36 => {
            fields.freq = Some(reader.f64()?);
            fields.value = Some(reader.f64()?);
            fields.detune = Some(reader.f64()?);
            fields.pulse_width = Some(reader.f64()?);
            fields.sub = Some(reader.f64()?);
            fields.noise = Some(reader.f64()?);
            fields.cutoff = Some(reader.f64()?);
            fields.resonance = Some(reader.f64()?);
            fields.env_mod = Some(reader.f64()?);
            fields.attack = Some(reader.f64()?);
            fields.decay = Some(reader.f64()?);
            fields.sustain = Some(reader.f64()?);
            fields.release = Some(reader.f64()?);
            fields.drive = Some(reader.f64()?);
            fields.chorus = Some(reader.f64()?);
            fields.modulation = Some(reader.f64()?);
            fields.width = Some(reader.f64()?);
            fields.level = Some(reader.f64()?);
        }
        37 => {
            fields.freq = Some(reader.f64()?);
            fields.value = Some(reader.f64()?);
            fields.attack = Some(reader.f64()?);
            fields.release = Some(reader.f64()?);
            fields.amount = Some(reader.f64()?);
            fields.bits = Some(reader.f64()?);
            fields.downsample = Some(reader.f64()?);
            fields.jitter = Some(reader.f64()?);
            fields.noise = Some(reader.f64()?);
            fields.tone = Some(reader.f64()?);
            fields.drive = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
            fields.zones = Some(reader.vec(decode_sampler_zone)?);
        }
        38 => {
            fields.freq = Some(reader.f64()?);
            fields.gain_db = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
        }
        39 => {
            fields.width = Some(reader.f64()?);
            fields.delay_ms = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
        }
        40 => {
            fields.shift_hz = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
        }
        41 => {
            fields.rate = Some(reader.f64()?);
            fields.depth = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
            fields.drive = Some(reader.f64()?);
            fields.width = Some(reader.f64()?);
            fields.freq = Some(reader.f64()?);
        }
        42 => {
            let filter_code = reader.u8()?;
            fields.filter_kind = Some(filter_kind(filter_code)?);
            fields.state_variable_filter_mode = Some(state_variable_filter_mode(filter_code)?);
            fields.freq = Some(reader.f64()?);
            fields.resonance = Some(reader.f64()?);
            fields.drive = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
        }
        43 => {
            fields.drive = Some(reader.f64()?);
            fields.depth = Some(reader.f64()?);
            fields.asymmetry = Some(reader.f64()?);
            fields.tone = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
            fields.output = Some(reader.f64()?);
        }
        44 => {
            fields.voicing = Some(phaser_voicing_name(reader.u8()?)?.to_string());
            fields.rate = Some(reader.f64()?);
            fields.depth = Some(reader.f64()?);
            fields.mix = Some(reader.f64()?);
        }
        _ => return None,
    }
    Some(fields)
}

fn decode_operator(reader: &mut Reader) -> Option<FmOperator> {
    let kind_code = reader.u8()?;
    let operator_kind = operator_kind(kind_code)?;
    let ratio = reader.f64()?;
    let detune = reader.f64()?;
    let level = reader.f64()?;
    let feedback = reader.f64()?;
    let output = reader.f64()?;
    let phase = reader.f64()?;
    let wave_kind = if operator_kind == FmOperatorKind::Polyblep {
        Some(wave_kind(reader.u8()?)?)
    } else {
        None
    };
    let (bank, position) = if operator_kind == FmOperatorKind::Wavetable {
        (Some(decode_wavetable_bank(reader)?), Some(reader.f64()?))
    } else {
        (None, None)
    };
    Some(FmOperator {
        kind: String::new(),
        operator_kind: Some(operator_kind),
        ratio,
        detune,
        level,
        feedback,
        output,
        phase,
        wave: None,
        wave_kind,
        bank,
        position,
    })
}

fn decode_wavetable_bank(reader: &mut Reader) -> Option<WavetableBank> {
    Some(WavetableBank {
        size: reader.usize()?,
        frame_count: reader.usize()?,
        levels: reader.vec(|r| r.f32_vec())?,
        level_max_harmonics: reader.f64_vec()?,
    })
}

fn decode_sampler_zone(reader: &mut Reader) -> Option<SamplerZoneDef> {
    Some(SamplerZoneDef {
        samples: reader.f32_vec()?,
        sample_rate: reader.f64()?,
        root_midi: reader.f64()?,
        key_low: reader.f64()?,
        key_high: reader.f64()?,
        velocity_low: reader.f64()?,
        velocity_high: reader.f64()?,
        looped: reader.bool()?,
        loop_start: reader.usize()?,
        loop_end: reader.usize()?,
        gain: reader.f64()?,
        pan: reader.f64()?,
    })
}

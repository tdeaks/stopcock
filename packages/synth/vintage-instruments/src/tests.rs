use stopcock_dsp_core::{DrumVoiceKind, SamplerZone};

use crate::{
    InstrumentEvent, InstrumentMode, InstrumentParams, TimedInstrumentEvent, VintageInstruments,
    MAX_VOICES,
};

fn peak(left: &[f32], right: &[f32]) -> f32 {
    left.iter()
        .chain(right.iter())
        .fold(0.0_f32, |acc, sample| acc.max(sample.abs()))
}

fn zone() -> SamplerZone {
    SamplerZone {
        samples: vec![0.0, 0.8, 0.2, -0.4, -0.1, 0.3, 0.0],
        sample_rate: 48_000.0,
        root_midi: 69.0,
        key_low: 0.0,
        key_high: 127.0,
        velocity_low: 0.0,
        velocity_high: 1.0,
        looped: true,
        loop_start: 1,
        loop_end: 6,
        gain: 1.0,
        pan: 0.0,
    }
}

#[test]
fn note_on_renders_poly_synth_block() {
    let mut instrument = VintageInstruments::new(48_000.0);
    instrument.note_on(60, 0.8);
    let mut left = [0.0_f32; 128];
    let mut right = [0.0_f32; 128];

    instrument
        .process_block(&mut left, &mut right, InstrumentParams::default(), &[])
        .expect("render");

    assert_eq!(instrument.active_voice_count(), 1);
    assert!(left.iter().all(|sample| sample.is_finite()));
    assert!(right.iter().all(|sample| sample.is_finite()));
    assert!(peak(&left, &right) > 1e-5);
}

#[test]
fn voice_stealing_reuses_oldest_slot() {
    let mut instrument = VintageInstruments::new(48_000.0);
    for note in 0..=MAX_VOICES {
        instrument.note_on((60 + note) as u8, 0.7);
    }

    assert_eq!(instrument.active_voice_count(), MAX_VOICES);
    assert!(!instrument.is_note_active(60));
    assert!(instrument.is_note_active((60 + MAX_VOICES) as u8));
}

#[test]
fn sustain_holds_note_off_until_pedal_lifts() {
    let mut instrument = VintageInstruments::new(1_000.0);
    let params = InstrumentParams {
        mode: InstrumentMode::AcidBass,
        release: 0.01,
        decay: 0.02,
        ..InstrumentParams::default()
    };
    let mut left = [0.0_f32; 160];
    let mut right = [0.0_f32; 160];

    instrument.note_on(45, 0.8);
    instrument.set_sustain(true);
    instrument.note_off(45);
    instrument
        .process_block(&mut left[..32], &mut right[..32], params, &[])
        .expect("sustain render");

    assert!(instrument.is_note_active(45));
    instrument.set_sustain(false);
    instrument
        .process_block(&mut left, &mut right, params, &[])
        .expect("release render");

    assert!(!instrument.is_note_active(45));
}

#[test]
fn timed_events_render_at_offsets() {
    let mut instrument = VintageInstruments::new(48_000.0);
    let mut left = [0.0_f32; 64];
    let mut right = [0.0_f32; 64];
    let events = [TimedInstrumentEvent {
        frame: 8,
        event: InstrumentEvent::NoteOn {
            note: 60,
            velocity: 1.0,
        },
    }];

    instrument
        .process_block_with_events(
            &mut left,
            &mut right,
            InstrumentParams {
                mode: InstrumentMode::AcidBass,
                attack: 0.0,
                ..InstrumentParams::default()
            },
            &[],
            &events,
        )
        .expect("timed render");

    assert!(left[..8].iter().all(|sample| *sample == 0.0));
    assert!(peak(&left[8..], &right[8..]) > 1e-5);
}

#[test]
fn lofi_sampler_mode_uses_sampler_zones() {
    let mut instrument = VintageInstruments::new(48_000.0);
    let zones = [zone()];
    let mut left = [0.0_f32; 128];
    let mut right = [0.0_f32; 128];
    instrument.note_on(69, 0.9);

    instrument
        .process_block(
            &mut left,
            &mut right,
            InstrumentParams {
                mode: InstrumentMode::LoFiSampler,
                attack: 0.0,
                level: 1.0,
                ..InstrumentParams::default()
            },
            &zones,
        )
        .expect("lofi render");

    assert!(peak(&left, &right) > 1e-4);
    assert!(left.iter().all(|sample| sample.is_finite()));
    assert!(right.iter().all(|sample| sample.is_finite()));
}

#[test]
fn process_block_rejects_mismatched_outputs() {
    let mut instrument = VintageInstruments::default();
    let mut left = [0.0_f32; 4];
    let mut right = [0.0_f32; 3];

    assert!(instrument
        .process_block(&mut left, &mut right, InstrumentParams::default(), &[])
        .is_none());
}

#[test]
fn hostile_params_stay_finite_and_bounded() {
    let mut instrument = VintageInstruments::new(f64::NAN);
    instrument.note_on(60, f64::INFINITY);
    let params = InstrumentParams {
        mode: InstrumentMode::StringMachine,
        level: 100.0,
        tone: f64::NAN,
        motion: f64::INFINITY,
        age: f64::INFINITY,
        width: f64::INFINITY,
        drive: f64::INFINITY,
        cutoff: f64::INFINITY,
        resonance: f64::INFINITY,
        env_mod: f64::INFINITY,
        attack: f64::NAN,
        decay: f64::INFINITY,
        sustain: f64::INFINITY,
        release: f64::INFINITY,
        accent: f64::INFINITY,
        slide: f64::INFINITY,
        detune: f64::INFINITY,
        pulse_width: f64::INFINITY,
        sub: f64::INFINITY,
        noise: f64::INFINITY,
        bits: f64::INFINITY,
        downsample: f64::INFINITY,
        mix: f64::INFINITY,
        ..InstrumentParams::default()
    };
    let mut peak = 0.0_f32;

    for _ in 0..1024 {
        let (left, right) = instrument.process_sample(params, &[]);
        assert!(left.is_finite());
        assert!(right.is_finite());
        peak = peak.max(left.abs()).max(right.abs());
    }

    assert!(peak <= 4.0);
}

#[test]
fn reset_restarts_deterministic_state() {
    let params = InstrumentParams {
        mode: InstrumentMode::DrumVoice,
        drum_kind: DrumVoiceKind::Snare,
        decay: 0.08,
        ..InstrumentParams::default()
    };
    let mut instrument = VintageInstruments::new(48_000.0);
    let mut first_l = [0.0_f32; 96];
    let mut first_r = [0.0_f32; 96];
    let mut second_l = [0.0_f32; 96];
    let mut second_r = [0.0_f32; 96];

    instrument.note_on(38, 0.9);
    instrument
        .process_block(&mut first_l, &mut first_r, params, &[])
        .expect("first render");
    instrument.reset(48_000.0);
    instrument.note_on(38, 0.9);
    instrument
        .process_block(&mut second_l, &mut second_r, params, &[])
        .expect("second render");

    assert_eq!(first_l, second_l);
    assert_eq!(first_r, second_r);
}

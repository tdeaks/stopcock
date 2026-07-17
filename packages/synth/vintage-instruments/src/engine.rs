use stopcock_dsp_core::{clamp, safe_finite, SamplerZone};

use crate::event::{InstrumentEvent, TimedInstrumentEvent};
use crate::params::InstrumentParams;
use crate::voice::VoiceSlot;
use crate::{sanitize_sample_rate, DEFAULT_SAMPLE_RATE, MAX_VOICES};

pub struct VintageInstruments {
    sample_rate: f64,
    order: u64,
    sustain_down: bool,
    voices: [VoiceSlot; MAX_VOICES],
}

impl VintageInstruments {
    #[must_use]
    pub fn new(sample_rate: f64) -> Self {
        let sample_rate = sanitize_sample_rate(sample_rate);
        Self {
            sample_rate,
            order: 0,
            sustain_down: false,
            voices: std::array::from_fn(|_| VoiceSlot::new(sample_rate)),
        }
    }

    pub fn reset(&mut self, sample_rate: f64) {
        let sample_rate = sanitize_sample_rate(sample_rate);
        if (self.sample_rate - sample_rate).abs() > f64::EPSILON {
            *self = Self::new(sample_rate);
        } else {
            self.clear();
        }
    }

    pub fn clear(&mut self) {
        self.order = 0;
        self.sustain_down = false;
        for voice in &mut self.voices {
            voice.clear(self.sample_rate);
        }
    }

    #[must_use]
    pub fn sample_rate(&self) -> f64 {
        self.sample_rate
    }

    #[must_use]
    pub fn active_voice_count(&self) -> usize {
        self.voices.iter().filter(|voice| voice.active).count()
    }

    #[must_use]
    pub fn is_note_active(&self, note: u8) -> bool {
        let note = note.min(127);
        self.voices
            .iter()
            .any(|voice| voice.active && voice.note == note)
    }

    pub fn apply_event(&mut self, event: InstrumentEvent) {
        match event {
            InstrumentEvent::NoteOn { note, velocity } => self.note_on(note, velocity),
            InstrumentEvent::NoteOff { note } => self.note_off(note),
            InstrumentEvent::Sustain { down } => self.set_sustain(down),
            InstrumentEvent::AllNotesOff => self.all_notes_off(),
        }
    }

    pub fn note_on(&mut self, note: u8, velocity: f64) {
        let velocity = clamp(safe_finite(velocity, 1.0), 0.0, 1.0);
        let note = note.min(127);
        if velocity <= 0.0 {
            self.note_off(note);
            return;
        }

        let index = self.allocate_voice(note);
        self.order = self.order.saturating_add(1);
        self.voices[index].trigger(note, velocity, self.order, self.sample_rate);
    }

    pub fn note_off(&mut self, note: u8) {
        let note = note.min(127);
        for voice in &mut self.voices {
            if voice.active && voice.note == note {
                if self.sustain_down {
                    voice.sustained = true;
                } else {
                    voice.release();
                }
            }
        }
    }

    pub fn set_sustain(&mut self, down: bool) {
        self.sustain_down = down;
        if down {
            return;
        }
        for voice in &mut self.voices {
            if voice.active && voice.sustained {
                voice.sustained = false;
                voice.release();
            }
        }
    }

    pub fn all_notes_off(&mut self) {
        for voice in &mut self.voices {
            if voice.active {
                voice.sustained = false;
                voice.release();
            }
        }
    }

    pub fn process_sample(
        &mut self,
        params: InstrumentParams,
        sampler_zones: &[SamplerZone],
    ) -> (f32, f32) {
        let params = params.sanitized();
        let mut left = 0.0;
        let mut right = 0.0;

        for voice in &mut self.voices {
            if !voice.active {
                continue;
            }
            let (voice_l, voice_r) = voice.process(params, self.sample_rate, sampler_zones);
            left += voice_l as f64;
            right += voice_r as f64;
            if voice.should_stop(params, self.sample_rate) {
                voice.active = false;
            }
        }

        (
            clamp(left, -4.0, 4.0) as f32,
            clamp(right, -4.0, 4.0) as f32,
        )
    }

    pub fn process_block(
        &mut self,
        output_l: &mut [f32],
        output_r: &mut [f32],
        params: InstrumentParams,
        sampler_zones: &[SamplerZone],
    ) -> Option<()> {
        if output_l.len() != output_r.len() {
            return None;
        }
        for frame in 0..output_l.len() {
            let (left, right) = self.process_sample(params, sampler_zones);
            output_l[frame] = left;
            output_r[frame] = right;
        }
        Some(())
    }

    pub fn process_block_with_events(
        &mut self,
        output_l: &mut [f32],
        output_r: &mut [f32],
        params: InstrumentParams,
        sampler_zones: &[SamplerZone],
        events: &[TimedInstrumentEvent],
    ) -> Option<()> {
        if output_l.len() != output_r.len() {
            return None;
        }
        let mut event_index = 0;
        for frame in 0..output_l.len() {
            while event_index < events.len() && events[event_index].frame <= frame {
                self.apply_event(events[event_index].event);
                event_index += 1;
            }
            let (left, right) = self.process_sample(params, sampler_zones);
            output_l[frame] = left;
            output_r[frame] = right;
        }
        Some(())
    }

    fn allocate_voice(&self, note: u8) -> usize {
        if let Some(index) = self
            .voices
            .iter()
            .position(|voice| voice.active && voice.note == note)
        {
            return index;
        }
        if let Some(index) = self.voices.iter().position(|voice| !voice.active) {
            return index;
        }
        self.voices
            .iter()
            .enumerate()
            .min_by_key(|(_, voice)| voice.order)
            .map(|(index, _)| index)
            .unwrap_or(0)
    }
}

impl Default for VintageInstruments {
    fn default() -> Self {
        Self::new(DEFAULT_SAMPLE_RATE)
    }
}

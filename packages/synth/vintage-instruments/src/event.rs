#[derive(Clone, Copy, Debug, PartialEq)]
pub enum InstrumentEvent {
    NoteOn { note: u8, velocity: f64 },
    NoteOff { note: u8 },
    Sustain { down: bool },
    AllNotesOff,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TimedInstrumentEvent {
    pub frame: usize,
    pub event: InstrumentEvent,
}

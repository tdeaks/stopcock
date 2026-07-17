use crate::delay::DelayLine;
use crate::filter::DcBlocker;
use crate::math::{clamp, safe_finite, TAU};
use crate::noise::Mulberry32;
use crate::nonlinear::tape_saturate;

#[derive(Clone, Copy)]
pub struct TapeDelayParams {
    pub time_ms: f64,
    pub feedback: f64,
    pub mix: f64,
    pub wow: f64,
    pub flutter: f64,
    pub tape_age: f64,
    pub drive: f64,
    pub tone: f64,
    pub width: f64,
}

impl Default for TapeDelayParams {
    fn default() -> Self {
        Self {
            time_ms: 180.0,
            feedback: 0.42,
            mix: 0.35,
            wow: 0.24,
            flutter: 0.1,
            tape_age: 0.3,
            drive: 0.18,
            tone: 0.72,
            width: 0.9,
        }
    }
}

#[derive(Clone, Copy)]
struct SanitizedTapeDelayParams {
    time_samples: f64,
    feedback: f64,
    mix: f64,
    wow: f64,
    flutter: f64,
    tape_age: f64,
    drive: f64,
    tone: f64,
    width: f64,
}

pub struct TapeDelayState {
    delay_l: DelayLine,
    delay_r: DelayLine,
    tone_l: f64,
    tone_r: f64,
    dc_l: DcBlocker,
    dc_r: DcBlocker,
    rng: Mulberry32,
    seed: u32,
    wow_phase: f64,
    flutter_phase: f64,
}

impl TapeDelayState {
    pub fn new(sample_rate: f64) -> Self {
        Self::with_seed(sample_rate, 0x7A9E_DA11)
    }

    pub fn with_seed(sample_rate: f64, seed: u32) -> Self {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        let max_delay = (sample_rate * 2.4).ceil().max(1.0) as usize;
        Self {
            delay_l: DelayLine::new(max_delay),
            delay_r: DelayLine::new(max_delay),
            tone_l: 0.0,
            tone_r: 0.0,
            dc_l: DcBlocker::new(0.995),
            dc_r: DcBlocker::new(0.995),
            rng: Mulberry32::new(seed),
            seed,
            wow_phase: 0.0,
            flutter_phase: 0.31,
        }
    }

    pub fn clear(&mut self) {
        self.delay_l.clear();
        self.delay_r.clear();
        self.tone_l = 0.0;
        self.tone_r = 0.0;
        self.dc_l.reset();
        self.dc_r.reset();
        self.rng = Mulberry32::new(self.seed);
        self.wow_phase = 0.0;
        self.flutter_phase = 0.31;
    }

    pub fn delay_len(&self) -> usize {
        self.delay_l.len()
    }

    pub fn process(
        &mut self,
        input_l: f32,
        input_r: f32,
        params: TapeDelayParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        let params = sanitize_params(params, sample_rate);
        let (delay_l, delay_r) = self.modulated_delays(params, sample_rate);
        let wet_l = self.delay_l.read_linear(delay_l);
        let wet_r = self.delay_r.read_linear(delay_r);
        let filtered_l = process_tape_tone(&mut self.tone_l, &mut self.dc_l, wet_l, params);
        let filtered_r = process_tape_tone(&mut self.tone_r, &mut self.dc_r, wet_r, params);
        let hiss_l = tape_hiss(&mut self.rng, params);
        let hiss_r = tape_hiss(&mut self.rng, params);
        let wet_l = filtered_l + hiss_l;
        let wet_r = filtered_r + hiss_r;
        let feedback_l = tape_saturate(wet_l, params.drive + params.tape_age * 0.22);
        let feedback_r = tape_saturate(wet_r, params.drive + params.tape_age * 0.22);
        let crossfeed = (1.0 - params.width) * 0.18;
        let in_l = input_l as f64;
        let in_r = input_r as f64;
        let record_drive = 0.04 + params.drive * 0.58 + params.tape_age * 0.08;

        self.delay_l.push(tape_saturate(
            in_l + feedback_l * params.feedback + feedback_r * params.feedback * crossfeed,
            record_drive,
        ) as f32);
        self.delay_r.push(tape_saturate(
            in_r + feedback_r * params.feedback + feedback_l * params.feedback * crossfeed,
            record_drive,
        ) as f32);

        let (wide_l, wide_r) = apply_width(wet_l, wet_r, params.width);
        (
            (in_l * (1.0 - params.mix) + wide_l * params.mix) as f32,
            (in_r * (1.0 - params.mix) + wide_r * params.mix) as f32,
        )
    }

    fn modulated_delays(
        &mut self,
        params: SanitizedTapeDelayParams,
        sample_rate: f64,
    ) -> (f64, f64) {
        let wow = self.wow_phase.sin() * params.wow * (0.004 + params.tape_age * 0.012);
        let flutter =
            self.flutter_phase.sin() * params.flutter * (0.0014 + params.tape_age * 0.0038);
        let right_wow =
            (self.wow_phase + 1.37).sin() * params.wow * (0.003 + params.tape_age * 0.009);
        let right_flutter =
            (self.flutter_phase + 2.11).sin() * params.flutter * (0.001 + params.tape_age * 0.003);
        advance_phase(
            &mut self.wow_phase,
            0.23 + params.tape_age * 0.08,
            sample_rate,
        );
        advance_phase(
            &mut self.flutter_phase,
            5.7 + params.tape_age * 1.9,
            sample_rate,
        );
        (
            params.time_samples * (1.0 + wow + flutter),
            params.time_samples * (1.0 + right_wow + right_flutter + params.width * 0.008),
        )
    }
}

fn sanitize_params(params: TapeDelayParams, sample_rate: f64) -> SanitizedTapeDelayParams {
    SanitizedTapeDelayParams {
        time_samples: clamp(safe_finite(params.time_ms, 180.0), 5.0, 2000.0) * sample_rate / 1000.0,
        feedback: clamp(safe_finite(params.feedback, 0.42), 0.0, 0.965),
        mix: clamp(safe_finite(params.mix, 0.35), 0.0, 1.0),
        wow: clamp(safe_finite(params.wow, 0.0), 0.0, 1.0),
        flutter: clamp(safe_finite(params.flutter, 0.0), 0.0, 1.0),
        tape_age: clamp(safe_finite(params.tape_age, 0.0), 0.0, 1.0),
        drive: clamp(safe_finite(params.drive, 0.0), 0.0, 2.0),
        tone: clamp(safe_finite(params.tone, 0.72), 0.0, 1.0),
        width: clamp(safe_finite(params.width, 0.9), 0.0, 1.0),
    }
}

fn process_tape_tone(
    state: &mut f64,
    dc: &mut DcBlocker,
    input: f64,
    params: SanitizedTapeDelayParams,
) -> f64 {
    let darkening = (1.0 - params.tone).powi(2) * 0.54 + params.tape_age * 0.28;
    let coefficient = clamp(0.045 + darkening, 0.02, 0.92);
    *state += (input - *state) * (1.0 - coefficient);
    *state = safe_finite(*state, 0.0);
    dc.process(*state)
}

fn tape_hiss(rng: &mut Mulberry32, params: SanitizedTapeDelayParams) -> f64 {
    if params.tape_age <= 0.0 && params.drive <= 0.0 {
        return 0.0;
    }
    let white = rng.next_f64() * 2.0 - 1.0;
    white * params.tape_age * (0.00018 + params.drive * 0.00008)
}

fn apply_width(left: f64, right: f64, width: f64) -> (f64, f64) {
    let mid = (left + right) * 0.5;
    let side = (left - right) * 0.5 * width;
    (mid + side, mid - side)
}

fn advance_phase(phase: &mut f64, freq: f64, sample_rate: f64) {
    *phase += TAU * freq / sample_rate;
    if *phase >= TAU {
        *phase -= TAU;
    }
}

#[cfg(test)]
mod tests;

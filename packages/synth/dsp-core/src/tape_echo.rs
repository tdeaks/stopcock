use crate::delay::DelayLine;
use crate::math::{clamp, safe_finite};
use crate::modulation::sine_lfo_at;
use crate::nonlinear::{asymmetric_tanh, tape_saturate};

#[derive(Clone, Copy)]
pub struct TapeEchoParams {
    pub time_ms: f64,
    pub feedback: f64,
    pub mix: f64,
    pub reverb_mix: f64,
    pub wow: f64,
    pub flutter: f64,
    pub tape_age: f64,
    pub drive: f64,
    pub head_count: f64,
    pub head1: bool,
    pub head2: bool,
    pub head3: bool,
}

impl Default for TapeEchoParams {
    fn default() -> Self {
        Self {
            time_ms: 120.0,
            feedback: 0.55,
            mix: 0.35,
            reverb_mix: 0.08,
            wow: 0.32,
            flutter: 0.12,
            tape_age: 0.42,
            drive: 0.18,
            head_count: 3.0,
            head1: false,
            head2: false,
            head3: false,
        }
    }
}

pub struct TapeEchoState {
    delay_l: DelayLine,
    delay_r: DelayLine,
    spring_l: DelayLine,
    spring_r: DelayLine,
    spring_tap_l: usize,
    spring_tap_r: usize,
    tone_l: f64,
    tone_r: f64,
    tone2_l: f64,
    tone2_r: f64,
    dc_l: f64,
    dc_r: f64,
    bump_l: f64,
    bump_r: f64,
}

impl TapeEchoState {
    pub fn new(sample_rate: f64) -> Self {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        let max_delay = (sample_rate * 5.0).ceil().max(1.0) as usize;
        let spring_len = (sample_rate * 0.09).ceil().max(1.0) as usize;
        let spring_tap_l =
            ((sample_rate * 0.029).round() as usize).clamp(1, spring_len.saturating_sub(1).max(1));
        let spring_tap_r =
            ((sample_rate * 0.041).round() as usize).clamp(1, spring_len.saturating_sub(1).max(1));
        Self {
            delay_l: DelayLine::new(max_delay),
            delay_r: DelayLine::new(max_delay),
            spring_l: DelayLine::new(spring_len),
            spring_r: DelayLine::new(spring_len),
            spring_tap_l,
            spring_tap_r,
            tone_l: 0.0,
            tone_r: 0.0,
            tone2_l: 0.0,
            tone2_r: 0.0,
            dc_l: 0.0,
            dc_r: 0.0,
            bump_l: 0.0,
            bump_r: 0.0,
        }
    }

    pub fn clear(&mut self) {
        self.delay_l.clear();
        self.delay_r.clear();
        self.spring_l.clear();
        self.spring_r.clear();
        self.tone_l = 0.0;
        self.tone_r = 0.0;
        self.tone2_l = 0.0;
        self.tone2_r = 0.0;
        self.dc_l = 0.0;
        self.dc_r = 0.0;
        self.bump_l = 0.0;
        self.bump_r = 0.0;
    }

    pub fn delay_len(&self) -> usize {
        self.delay_l.len()
    }

    pub fn spring_len(&self) -> usize {
        self.spring_l.len()
    }

    pub fn process(
        &mut self,
        input_l: f32,
        input_r: f32,
        params: TapeEchoParams,
        sample_rate: f64,
        frame: usize,
    ) -> (f32, f32) {
        let sample_rate = safe_finite(sample_rate, 44_100.0).max(1.0);
        let time_ms = clamp(safe_finite(params.time_ms, 120.0), 20.0, 1500.0);
        let feedback = clamp(safe_finite(params.feedback, 0.0), 0.0, 0.97);
        let mix = clamp(safe_finite(params.mix, 0.0), 0.0, 1.0);
        let reverb_mix = clamp(safe_finite(params.reverb_mix, 0.0), 0.0, 0.7);
        let wow = clamp(safe_finite(params.wow, 0.0), 0.0, 1.0);
        let flutter = clamp(safe_finite(params.flutter, 0.0), 0.0, 1.0);
        let tape_age = clamp(safe_finite(params.tape_age, 0.0), 0.0, 1.0);
        let drive = safe_finite(params.drive, 0.0).max(0.0);
        let head_count = safe_finite(params.head_count, 1.0).max(1.0);
        // Wow ≈ 0.55 Hz (RE-201 capstan instability), flutter ≈ 7.8 Hz
        // (pinch-roller / pressure-pad). A second slow tremor at 0.13 Hz
        // gives the tape that "breathing" drift between long taps.
        let modulation = 1.0
            + sine_lfo_at(0.55, sample_rate, frame, 0.0) * wow * 0.013
            + sine_lfo_at(0.13, sample_rate, frame, 1.1) * wow * 0.006
            + sine_lfo_at(7.8, sample_rate, frame, 1.7) * flutter * 0.0035;
        let base_delay = time_ms * sample_rate / 1000.0 * modulation;
        let head_gain = 0.88 / head_count;
        let mut wet_l = 0.0;
        let mut wet_r = 0.0;

        if params.head1 {
            let tap =
                (self.delay_l.read_linear(base_delay) + self.delay_r.read_linear(base_delay)) * 0.5;
            wet_l += tap * 0.94 * head_gain;
            wet_r += tap * 0.42 * head_gain;
        }
        if params.head2 {
            let tap = (self.delay_l.read_linear(base_delay * 1.5)
                + self.delay_r.read_linear(base_delay * 1.5))
                * 0.5;
            wet_l += tap * 0.68 * head_gain;
            wet_r += tap * 0.68 * head_gain;
        }
        if params.head3 {
            let tap = (self.delay_l.read_linear(base_delay * 2.0)
                + self.delay_r.read_linear(base_delay * 2.0))
                * 0.5;
            wet_l += tap * 0.42 * head_gain;
            wet_r += tap * 0.94 * head_gain;
        }

        let spring_read_l = self.spring_l.read_integer(self.spring_tap_l) as f64;
        let spring_read_r = self.spring_r.read_integer(self.spring_tap_r) as f64;
        let spring_wet_l = spring_read_l * 0.72 + spring_read_r * 0.28;
        let spring_wet_r = spring_read_r * 0.72 + spring_read_l * 0.28;
        let in_l = input_l as f64;
        let in_r = input_r as f64;

        self.spring_l.push(tape_saturate(
            (wet_l + in_l * 0.18 + spring_wet_r * 0.32) * 0.55,
            0.08 + drive * 0.25,
        ) as f32);
        self.spring_r.push(tape_saturate(
            (wet_r + in_r * 0.18 + spring_wet_l * 0.32) * 0.55,
            0.08 + drive * 0.25,
        ) as f32);

        // Two cascaded one-pole LPs in series → 12 dB/oct rolloff that
        // sharpens aggressively as tape_age increases. A single pole was too
        // gentle to match a worn RE-201 cartridge's spectral droop.
        let lp_coeff = 0.18 + tape_age * 0.62;
        let dc_coeff = 0.002 + tape_age * 0.006;
        let pre_tone_l = wet_l + spring_wet_l * 0.18;
        let pre_tone_r = wet_r + spring_wet_r * 0.18;
        self.tone_l = pre_tone_l * (1.0 - lp_coeff) + self.tone_l * lp_coeff;
        self.tone_r = pre_tone_r * (1.0 - lp_coeff) + self.tone_r * lp_coeff;
        self.tone2_l = self.tone_l * (1.0 - lp_coeff) + self.tone2_l * lp_coeff;
        self.tone2_r = self.tone_r * (1.0 - lp_coeff) + self.tone2_r * lp_coeff;
        self.dc_l += (self.tone2_l - self.dc_l) * dc_coeff;
        self.dc_r += (self.tone2_r - self.dc_r) * dc_coeff;
        // Tape bias adds even harmonics — asymmetric saturation in the
        // feedback loop accumulates that warmth across repeats.
        let bias = 0.12 + drive * 0.18;
        let sat_drive = drive + tape_age * 0.22;
        let feedback_l = asymmetric_tanh(self.tone2_l - self.dc_l, sat_drive, bias);
        let feedback_r = asymmetric_tanh(self.tone2_r - self.dc_r, sat_drive, -bias);
        let input_drive = 0.04 + drive * 0.5;

        self.delay_l
            .push((tape_saturate(in_l, input_drive) + feedback_l * feedback) as f32);
        self.delay_r
            .push((tape_saturate(in_r, input_drive) + feedback_r * feedback) as f32);

        // Head bump: one-pole low-shelf around ~100 Hz lifts the wet path
        // by a few dB, mimicking head-gap aperture loss + playback EQ.
        let bump_coeff = 0.984;
        self.bump_l = wet_l * (1.0 - bump_coeff) + self.bump_l * bump_coeff;
        self.bump_r = wet_r * (1.0 - bump_coeff) + self.bump_r * bump_coeff;
        let bumped_l = wet_l + self.bump_l * 0.42;
        let bumped_r = wet_r + self.bump_r * 0.42;

        (
            (in_l * (1.0 - mix) + bumped_l * mix + spring_wet_l * reverb_mix) as f32,
            (in_r * (1.0 - mix) + bumped_r * mix + spring_wet_r * reverb_mix) as f32,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn impulse_params() -> TapeEchoParams {
        TapeEchoParams {
            time_ms: 10.0,
            feedback: 0.0,
            mix: 1.0,
            reverb_mix: 0.0,
            wow: 0.0,
            flutter: 0.0,
            tape_age: 0.0,
            drive: 0.0,
            head_count: 3.0,
            head1: true,
            head2: true,
            head3: true,
        }
    }

    #[test]
    fn tape_echo_renders_clamped_multi_head_impulse_taps() {
        let sample_rate = 1_000.0;
        let mut state = TapeEchoState::new(sample_rate);
        let params = impulse_params();
        let mut left = [0.0; 64];
        let mut right = [0.0; 64];

        for i in 0..left.len() {
            let input = if i == 0 { 1.0 } else { 0.0 };
            (left[i], right[i]) = state.process(input, input, params, sample_rate, i);
        }

        assert!(left[20] > 0.0);
        assert!(left[30] > 0.0);
        assert!(right[40] > 0.0);
        assert_eq!(left[0], 0.0);
        assert!(left.iter().all(|sample| sample.is_finite()));
        assert!(right.iter().all(|sample| sample.is_finite()));
    }

    #[test]
    fn tape_echo_clear_resets_delay_and_spring_history() {
        let sample_rate = 1_000.0;
        let params = impulse_params();
        let mut state = TapeEchoState::new(sample_rate);
        for i in 0..48 {
            let input = if i == 0 { 1.0 } else { 0.0 };
            state.process(input, input, params, sample_rate, i);
        }

        state.clear();

        for i in 0..48 {
            let (left, right) = state.process(0.0, 0.0, params, sample_rate, i);
            assert_eq!(left, 0.0);
            assert_eq!(right, 0.0);
        }
    }

    #[test]
    fn tape_echo_sanitizes_hostile_params() {
        let mut state = TapeEchoState::new(f64::NAN);
        let params = TapeEchoParams {
            time_ms: f64::NAN,
            feedback: f64::INFINITY,
            mix: f64::NAN,
            reverb_mix: f64::INFINITY,
            wow: f64::NAN,
            flutter: f64::NEG_INFINITY,
            tape_age: f64::NAN,
            drive: f64::NAN,
            head_count: f64::NAN,
            head1: true,
            head2: true,
            head3: true,
        };

        for i in 0..256 {
            let (left, right) = state.process(1.0, -1.0, params, f64::NAN, i);
            assert!(left.is_finite());
            assert!(right.is_finite());
        }
    }

    #[test]
    fn tape_echo_sizes_delay_and_spring_from_sample_rate() {
        let state = TapeEchoState::new(1_000.0);
        assert_eq!(state.delay_len(), 5_000);
        assert_eq!(state.spring_len(), 90);
    }
}

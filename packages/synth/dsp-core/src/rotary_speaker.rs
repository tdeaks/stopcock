use crate::delay::DelayLine;
use crate::filter::{BiquadState, FilterKind};
use crate::math::{clamp, safe_finite, TAU};
use crate::nonlinear::tape_saturate;

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
const DEFAULT_RATE_HZ: f64 = 6.4;
const DEFAULT_DEPTH: f64 = 0.72;
const DEFAULT_MIX: f64 = 0.5;
const DEFAULT_DRIVE: f64 = 0.0;
const DEFAULT_WIDTH: f64 = 1.0;
const DEFAULT_CROSSOVER_HZ: f64 = 800.0;
const MAX_DELAY_SECONDS: f64 = 0.05;

#[derive(Clone, Copy, Debug)]
pub struct RotarySpeakerParams {
    pub rate_hz: f64,
    pub depth: f64,
    pub mix: f64,
    pub drive: f64,
    pub width: f64,
    pub crossover_hz: f64,
}

impl RotarySpeakerParams {
    fn sanitized(self, sample_rate: f64) -> Self {
        let sample_rate = sanitize_sample_rate(sample_rate);
        Self {
            rate_hz: clamp(safe_finite(self.rate_hz, DEFAULT_RATE_HZ), 0.0, 14.0),
            depth: clamp(safe_finite(self.depth, DEFAULT_DEPTH), 0.0, 1.0),
            mix: clamp(safe_finite(self.mix, DEFAULT_MIX), 0.0, 1.0),
            drive: clamp(safe_finite(self.drive, DEFAULT_DRIVE), 0.0, 2.0),
            width: clamp(safe_finite(self.width, DEFAULT_WIDTH), 0.0, 1.5),
            crossover_hz: clamp(
                safe_finite(self.crossover_hz, DEFAULT_CROSSOVER_HZ),
                80.0,
                sample_rate * 0.45,
            ),
        }
    }
}

impl Default for RotarySpeakerParams {
    fn default() -> Self {
        Self {
            rate_hz: DEFAULT_RATE_HZ,
            depth: DEFAULT_DEPTH,
            mix: DEFAULT_MIX,
            drive: DEFAULT_DRIVE,
            width: DEFAULT_WIDTH,
            crossover_hz: DEFAULT_CROSSOVER_HZ,
        }
    }
}

pub struct RotarySpeakerState {
    horn_delay: DelayLine,
    drum_delay: DelayLine,
    lowpass: BiquadState,
    highpass: BiquadState,
    horn_phase: f64,
    drum_phase: f64,
    last_crossover_hz: f64,
    last_sample_rate: f64,
}

impl RotarySpeakerState {
    pub fn new(sample_rate: f64) -> Self {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let size = (sample_rate * MAX_DELAY_SECONDS).ceil().max(64.0) as usize;
        let mut state = Self {
            horn_delay: DelayLine::new(size),
            drum_delay: DelayLine::new(size),
            lowpass: BiquadState::default(),
            highpass: BiquadState::default(),
            horn_phase: 0.0,
            drum_phase: 0.25,
            last_crossover_hz: f64::NAN,
            last_sample_rate: f64::NAN,
        };
        state.design_crossover(DEFAULT_CROSSOVER_HZ, sample_rate);
        state
    }

    pub fn clear(&mut self) {
        self.horn_delay.clear();
        self.drum_delay.clear();
        self.lowpass = BiquadState::default();
        self.highpass = BiquadState::default();
        self.horn_phase = 0.0;
        self.drum_phase = 0.25;
        self.last_crossover_hz = f64::NAN;
        self.last_sample_rate = f64::NAN;
    }

    pub fn process(
        &mut self,
        input_l: f32,
        input_r: f32,
        params: RotarySpeakerParams,
        sample_rate: f64,
    ) -> (f32, f32) {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let params = params.sanitized(sample_rate);
        if params.mix <= 0.0 || params.depth <= 0.0 {
            return (input_l, input_r);
        }

        self.design_crossover(params.crossover_hz, sample_rate);
        self.horn_phase = wrap_phase(self.horn_phase + params.rate_hz / sample_rate);
        self.drum_phase = wrap_phase(self.drum_phase - params.rate_hz * 0.82 / sample_rate);

        let dry_l = safe_finite(input_l as f64, 0.0);
        let dry_r = safe_finite(input_r as f64, 0.0);
        let mono = (dry_l + dry_r) * 0.5;
        let driven = tape_saturate(mono, 1.0 + params.drive * 2.0);
        let low = self.lowpass.process(driven);
        let high = self.highpass.process(driven);

        let horn = render_rotor(
            &self.horn_delay,
            high,
            self.horn_phase,
            params.depth,
            params.width,
            2.2,
            4.8,
            0.52,
            sample_rate,
        );
        let drum = render_rotor(
            &self.drum_delay,
            low,
            self.drum_phase,
            params.depth * 0.62,
            params.width * 0.72,
            3.5,
            2.2,
            0.28,
            sample_rate,
        );
        self.horn_delay.push(high as f32);
        self.drum_delay.push(low as f32);

        let wet_l = horn.0 + drum.0;
        let wet_r = horn.1 + drum.1;
        let mixed_l = dry_l * (1.0 - params.mix) + wet_l * params.mix;
        let mixed_r = dry_r * (1.0 - params.mix) + wet_r * params.mix;
        (
            clamp(safe_finite(mixed_l, 0.0), -8.0, 8.0) as f32,
            clamp(safe_finite(mixed_r, 0.0), -8.0, 8.0) as f32,
        )
    }

    fn design_crossover(&mut self, crossover_hz: f64, sample_rate: f64) {
        if (crossover_hz - self.last_crossover_hz).abs() < 1e-9
            && (sample_rate - self.last_sample_rate).abs() < 1e-9
        {
            return;
        }
        self.lowpass.design_kind(
            FilterKind::Lowpass,
            crossover_hz,
            std::f64::consts::FRAC_1_SQRT_2,
            0.0,
            sample_rate,
        );
        self.highpass.design_kind(
            FilterKind::Highpass,
            crossover_hz,
            std::f64::consts::FRAC_1_SQRT_2,
            0.0,
            sample_rate,
        );
        self.last_crossover_hz = crossover_hz;
        self.last_sample_rate = sample_rate;
    }
}

impl Default for RotarySpeakerState {
    fn default() -> Self {
        Self::new(DEFAULT_SAMPLE_RATE)
    }
}

#[allow(clippy::too_many_arguments)]
fn render_rotor(
    delay: &DelayLine,
    input: f64,
    phase: f64,
    depth: f64,
    width: f64,
    base_delay_ms: f64,
    sweep_delay_ms: f64,
    amp_depth: f64,
    sample_rate: f64,
) -> (f64, f64) {
    let angle = phase * TAU;
    let spread = clamp(width, 0.0, 1.5);
    let sweep = sweep_delay_ms * depth;
    let center_delay = base_delay_ms + sweep * 0.5;
    let side_delay = sweep * 0.5 * spread;
    let left_delay = center_delay + side_delay * angle.sin();
    let right_delay = center_delay - side_delay * angle.sin();
    let amp = amp_depth * depth * spread;
    let left_amp = 1.0 + amp * angle.cos();
    let right_amp = 1.0 - amp * angle.cos();
    let left = delay.read_linear(left_delay * sample_rate / 1000.0) * left_amp;
    let right = delay.read_linear(right_delay * sample_rate / 1000.0) * right_amp;
    let direct = input * (1.0 - depth * 0.12);
    (
        safe_finite(left + direct * 0.15, 0.0),
        safe_finite(right + direct * 0.15, 0.0),
    )
}

#[inline]
fn wrap_phase(value: f64) -> f64 {
    let wrapped = value % 1.0;
    if wrapped < 0.0 {
        wrapped + 1.0
    } else {
        wrapped
    }
}

fn sanitize_sample_rate(sample_rate: f64) -> f64 {
    if sample_rate.is_finite() && sample_rate > 0.0 {
        sample_rate
    } else {
        DEFAULT_SAMPLE_RATE
    }
}

#[cfg(test)]
mod tests;

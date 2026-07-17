use crate::dispersion::FirstOrderAllpass;
use crate::math::{clamp, safe_finite};
use crate::modulation::PhaseLfo;

const DEFAULT_SAMPLE_RATE: f64 = 48_000.0;
const MAX_STAGES: usize = 12;

/// Named voicings approximating classic hardware phaser pedals. Voicing
/// constants live in `voicing_profile()` below — that table is what makes a
/// "Phase 90" sound like a Phase 90 instead of a generic phaser.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PhaserVoicing {
    Phase90,
    SmallStoneColor,
    UniVibeChorus,
    UniVibeVibrato,
}

#[derive(Clone, Copy, Debug)]
pub enum LfoShape {
    Sine,
    /// Quasi-triangle: triangle whose peaks are rounded by a 1-pole smoother.
    /// Approximates the CA3094 OTA's LFO in the original Small Stone.
    QuasiTriangle,
    /// Sine fed through an asymmetric one-pole, modelling an incandescent
    /// lamp + photocell (LDR) — the heart of Uni-Vibe's signature pulse.
    OptoSmoothed,
}

#[derive(Clone, Copy, Debug)]
pub struct VoicingProfile {
    pub stages: usize,
    pub lfo_shape: LfoShape,
    pub feedback: f64,
    pub sweep_lo_hz: f64,
    pub sweep_hi_hz: f64,
    /// Per-stage offset in Hz applied on top of the swept centre.
    /// `[0, 0, 0, 0]` for unison voicings (Phase 90, Small Stone).
    /// Nonzero for Uni-Vibe-style staggered cascades.
    pub stagger_hz: [f64; MAX_STAGES],
    /// `+1.0` = additive blend (dry + wet). `-1.0` = subtractive (dry - wet),
    /// which emphasises the notches and is closer to Small Stone's voicing.
    pub wet_polarity: f64,
    /// `false` = output dry (chorus-like). `true` = output 100% wet (vibrato).
    pub vibrato_mode: bool,
}

// TODO(tom): voicing constants live here. Each profile is ~8 numbers that
// together define the personality of one named pedal. Suggested starting
// points below — replace with your preferred era / reissue feel.
//
// References to play against by ear:
//   Phase 90 (script):   rate ~0.5 Hz default, 4 stages, no feedback, sine.
//   Small Stone (color): rate ~0.4 Hz default, 4 stages, ~0.5 feedback,
//                        quasi-triangle, subtractive blend for the deep notch.
//   Uni-Vibe (chorus):   4 staggered stages around 300/600/1200/2400 Hz,
//                        opto-smoothed sine, low feedback, dry+wet mix.
//   Uni-Vibe (vibrato):  same stagger, but vibrato_mode = true (100% wet).
pub fn voicing_profile(voicing: PhaserVoicing) -> VoicingProfile {
    match voicing {
        PhaserVoicing::Phase90 => VoicingProfile {
            stages: 4,
            lfo_shape: LfoShape::Sine,
            feedback: 0.0,
            sweep_lo_hz: 100.0,
            sweep_hi_hz: 1_500.0,
            stagger_hz: [0.0; MAX_STAGES],
            wet_polarity: 1.0,
            vibrato_mode: false,
        },
        PhaserVoicing::SmallStoneColor => VoicingProfile {
            stages: 4,
            lfo_shape: LfoShape::QuasiTriangle,
            feedback: 0.55,
            sweep_lo_hz: 80.0,
            sweep_hi_hz: 1_200.0,
            stagger_hz: [0.0; MAX_STAGES],
            wet_polarity: -1.0,
            vibrato_mode: false,
        },
        PhaserVoicing::UniVibeChorus => VoicingProfile {
            stages: 4,
            lfo_shape: LfoShape::OptoSmoothed,
            feedback: 0.15,
            sweep_lo_hz: 400.0,
            sweep_hi_hz: 1_000.0,
            stagger_hz: {
                let mut s = [0.0; MAX_STAGES];
                s[0] = -150.0;
                s[1] = -50.0;
                s[2] = 200.0;
                s[3] = 600.0;
                s
            },
            wet_polarity: 1.0,
            vibrato_mode: false,
        },
        PhaserVoicing::UniVibeVibrato => VoicingProfile {
            vibrato_mode: true,
            ..voicing_profile(PhaserVoicing::UniVibeChorus)
        },
    }
}

#[derive(Clone, Copy, Debug)]
pub struct PhaserParams {
    pub voicing: PhaserVoicing,
    pub rate_hz: f64,
    pub depth: f64,
    pub mix: f64,
}

impl PhaserParams {
    fn sanitized(self) -> Self {
        Self {
            voicing: self.voicing,
            rate_hz: clamp(safe_finite(self.rate_hz, 0.5), 0.01, 12.0),
            depth: clamp(safe_finite(self.depth, 0.7), 0.0, 1.0),
            mix: clamp(safe_finite(self.mix, 0.5), 0.0, 1.0),
        }
    }
}

impl Default for PhaserParams {
    fn default() -> Self {
        Self {
            voicing: PhaserVoicing::Phase90,
            rate_hz: 0.5,
            depth: 0.7,
            mix: 0.5,
        }
    }
}

pub struct PhaserState {
    sample_rate: f64,
    stages: [FirstOrderAllpass; MAX_STAGES],
    lfo: PhaseLfo,
    feedback_state: f64,
    /// One-pole smoother for opto/quasi-tri shapes. Holds the previous output.
    shape_z1: f64,
}

impl PhaserState {
    pub fn new(sample_rate: f64) -> Self {
        Self {
            sample_rate: sanitize_sample_rate(sample_rate),
            stages: [FirstOrderAllpass::default(); MAX_STAGES],
            lfo: PhaseLfo::new(0.0),
            feedback_state: 0.0,
            shape_z1: 0.0,
        }
    }

    pub fn clear(&mut self) {
        for s in &mut self.stages {
            s.reset();
        }
        self.lfo.reset(0.0);
        self.feedback_state = 0.0;
        self.shape_z1 = 0.0;
    }

    pub fn process_sample(&mut self, input: f64, params: PhaserParams) -> f64 {
        let p = params.sanitized();
        let profile = voicing_profile(p.voicing);
        let stages = profile.stages.min(MAX_STAGES);
        if stages == 0 {
            return input;
        }

        // 1. LFO → bipolar [-1, 1], shaped to the voicing.
        let raw = self.lfo.process_sine(p.rate_hz, self.sample_rate, 0.0);
        let lfo = shape_lfo(raw, profile.lfo_shape, &mut self.shape_z1);

        // 2. Sweep the all-pass break frequency between sweep_lo_hz and
        //    sweep_hi_hz on a log scale (matches the ear's pitch perception).
        let depth_norm = (lfo * 0.5 + 0.5) * p.depth;
        let lo = profile.sweep_lo_hz.max(20.0);
        let hi = profile.sweep_hi_hz.max(lo + 1.0);
        let centre_hz = lo * (hi / lo).powf(depth_norm);

        // 3. Feed input + feedback through the all-pass chain. Each stage's
        //    coefficient is computed from its individual break frequency,
        //    which is centre_hz + stagger_hz[i].
        let mut wet = input + profile.feedback * self.feedback_state;
        for i in 0..stages {
            let stage_hz = (centre_hz + profile.stagger_hz[i]).max(20.0);
            let coeff = allpass_coefficient(stage_hz, self.sample_rate);
            wet = self.stages[i].process(wet, coeff);
        }
        self.feedback_state = safe_finite(wet, 0.0);

        // 4. Blend dry/wet. Subtractive polarity emphasises the notches.
        let blended = input + profile.wet_polarity * wet;
        if profile.vibrato_mode {
            // 100% wet, signal phase fully rotated — vibrato character.
            wet
        } else {
            input * (1.0 - p.mix) + blended * p.mix * 0.5
        }
    }
}

/// First-order all-pass tuning formula. Maps a break frequency in Hz to the
/// coefficient `c` for `y = -c·x + x_{-1} + c·y_{-1}`.
#[inline]
fn allpass_coefficient(break_hz: f64, sample_rate: f64) -> f64 {
    let nyquist = sample_rate * 0.5;
    let f = clamp(break_hz, 20.0, nyquist * 0.99);
    let t = (std::f64::consts::PI * f / sample_rate).tan();
    clamp((t - 1.0) / (t + 1.0), -0.98, 0.98)
}

#[inline]
fn shape_lfo(raw_sine: f64, shape: LfoShape, z1: &mut f64) -> f64 {
    // TODO(tom): shape functions are the second place where voicing character
    // lives. Sine is trivial; the other two are short DSP recipes:
    //
    // QuasiTriangle:  feed an arcsine-ish curve, then smooth. E.g.
    //     let tri = (2.0 / PI) * raw_sine.asin();   // sine → triangle
    //     *z1 = *z1 * 0.85 + tri * 0.15;            // round the peaks
    //     *z1
    //
    // OptoSmoothed:   asymmetric one-pole (fast attack, slow release) to
    //   mimic the lamp+LDR response in a Uni-Vibe. E.g.
    //     let target = raw_sine;
    //     let coeff = if target > *z1 { 0.15 } else { 0.04 };  // attack > release
    //     *z1 += (target - *z1) * coeff;
    //     *z1
    //
    // Pick the exact smoothing coefficients by ear. The numbers above are
    // a starting point, not gospel.
    match shape {
        LfoShape::Sine => raw_sine,
        LfoShape::QuasiTriangle => {
            let clamped = clamp(raw_sine, -1.0, 1.0);
            let tri = (2.0 / std::f64::consts::PI) * clamped.asin();
            *z1 = *z1 * 0.85 + tri * 0.15;
            *z1
        }
        LfoShape::OptoSmoothed => {
            let target = raw_sine;
            let coeff = if target > *z1 { 0.15 } else { 0.04 };
            *z1 += (target - *z1) * coeff;
            *z1
        }
    }
}

fn sanitize_sample_rate(sample_rate: f64) -> f64 {
    let sr = safe_finite(sample_rate, DEFAULT_SAMPLE_RATE);
    if sr <= 0.0 { DEFAULT_SAMPLE_RATE } else { sr }
}

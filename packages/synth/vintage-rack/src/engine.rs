use stopcock_dsp_core::{
    clamp, safe_finite, DegradeState, EnsembleChorusState, MicroPitchState, PlateReverbState,
    SaturatorState, SpringReverbState, TapeEchoState,
};

use crate::modes::{
    drum_echo_params, ensemble_params, lofi_params, micro_pitch_params, plate_params,
    saturator_params, spring_params,
};
use crate::params::{RackMode, RackParams};
use crate::{sanitize_sample_rate, DEFAULT_SAMPLE_RATE};

pub struct VintageRack {
    sample_rate: f64,
    frame: usize,
    ensemble: EnsembleChorusState,
    drum_echo: TapeEchoState,
    micro_pitch: MicroPitchState,
    plate: PlateReverbState,
    spring: SpringReverbState,
    lofi: DegradeState,
    saturator: SaturatorState,
}

impl VintageRack {
    #[must_use]
    pub fn new(sample_rate: f64) -> Self {
        let sample_rate = sanitize_sample_rate(sample_rate);
        Self {
            sample_rate,
            frame: 0,
            ensemble: EnsembleChorusState::new(sample_rate),
            drum_echo: TapeEchoState::new(sample_rate),
            micro_pitch: MicroPitchState::new(sample_rate),
            plate: PlateReverbState::new(sample_rate),
            spring: SpringReverbState::new(sample_rate),
            lofi: DegradeState::new(),
            saturator: SaturatorState::new(),
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
        self.frame = 0;
        self.ensemble.clear();
        self.drum_echo.clear();
        self.micro_pitch.clear();
        self.plate.clear();
        self.spring.clear();
        self.lofi.clear();
        self.saturator.clear();
    }

    #[must_use]
    pub fn sample_rate(&self) -> f64 {
        self.sample_rate
    }

    #[must_use]
    pub fn frame(&self) -> usize {
        self.frame
    }

    #[must_use]
    pub fn process_sample(&mut self, input_l: f32, input_r: f32, params: RackParams) -> (f32, f32) {
        let params = params.sanitized();
        let (left, right) = match params.mode {
            RackMode::EnsembleChorus => {
                self.ensemble
                    .process(input_l, input_r, ensemble_params(params), self.sample_rate)
            }
            RackMode::DrumEcho => self.drum_echo.process(
                input_l,
                input_r,
                drum_echo_params(params),
                self.sample_rate,
                self.frame,
            ),
            RackMode::MicroPitch => self.micro_pitch.process(
                input_l,
                input_r,
                micro_pitch_params(params),
                self.sample_rate,
            ),
            RackMode::Plate => {
                self.plate
                    .process(input_l, input_r, plate_params(params), self.sample_rate)
            }
            RackMode::Spring => {
                self.spring
                    .process(input_l, input_r, spring_params(params), self.sample_rate)
            }
            RackMode::LoFi => {
                self.lofi
                    .process(input_l, input_r, lofi_params(params), self.sample_rate)
            }
            RackMode::Saturator => {
                self.saturator
                    .process(input_l, input_r, saturator_params(params), self.sample_rate)
            }
        };
        self.frame = self.frame.saturating_add(1);
        apply_output(left, right, params.output)
    }

    pub fn process_block_in_place(
        &mut self,
        left: &mut [f32],
        right: &mut [f32],
        params: RackParams,
    ) {
        let frames = left.len().min(right.len());
        for sample in 0..frames {
            let (out_l, out_r) = self.process_sample(left[sample], right[sample], params);
            left[sample] = out_l;
            right[sample] = out_r;
        }
    }

    pub fn process_block(
        &mut self,
        input_l: &[f32],
        input_r: &[f32],
        output_l: &mut [f32],
        output_r: &mut [f32],
        params: RackParams,
    ) -> Option<()> {
        let frames = input_l.len();
        if input_r.len() != frames || output_l.len() < frames || output_r.len() < frames {
            return None;
        }

        for sample in 0..frames {
            let (left, right) = self.process_sample(input_l[sample], input_r[sample], params);
            output_l[sample] = left;
            output_r[sample] = right;
        }
        Some(())
    }
}

impl Default for VintageRack {
    fn default() -> Self {
        Self::new(DEFAULT_SAMPLE_RATE)
    }
}

fn apply_output(left: f32, right: f32, output: f64) -> (f32, f32) {
    let output = clamp(safe_finite(output, 1.0), 0.0, 4.0) as f32;
    (
        clamp(left as f64 * output as f64, -4.0, 4.0) as f32,
        clamp(right as f64 * output as f64, -4.0, 4.0) as f32,
    )
}

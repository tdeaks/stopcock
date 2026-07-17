#![allow(clippy::too_many_arguments)]

mod common;
mod dynamics;
mod echo;
mod modulation;
mod phaser;
mod pitch;
mod reverb;
mod rotary;
mod spatial;
#[cfg(test)]
mod tests;
mod tone;

pub(crate) use dynamics::{
    render_bitcrush, render_compressor, render_degrade, render_saturator, render_wavefolder,
};
pub(crate) use echo::{
    render_micro_pitch, render_multi_tap_delay, render_space_echo, render_tape_delay,
};
pub(crate) use modulation::render_ensemble_chorus;
pub(crate) use phaser::render_phaser;
pub(crate) use pitch::render_frequency_shifter;
pub(crate) use reverb::{render_nonlinear_reverb, render_plate_reverb, render_spring_reverb};
pub(crate) use rotary::render_rotary_speaker;
pub(crate) use spatial::render_stereo_spread;
pub(crate) use tone::render_tilt_eq;

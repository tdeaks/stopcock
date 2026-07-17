use crate::dsp::{clamp, Mulberry32};
use crate::runtime_node::NoiseColor;
use crate::runtime_state::NodeBuffer;

pub(crate) struct NoiseRenderState<'a> {
    pub(crate) rng: &'a mut Mulberry32,
    pub(crate) pink0: &'a mut f64,
    pub(crate) pink1: &'a mut f64,
    pub(crate) pink2: &'a mut f64,
    pub(crate) brown: &'a mut f64,
}

pub(crate) fn render_noise(
    out: &mut NodeBuffer,
    frames: usize,
    color: NoiseColor,
    state: NoiseRenderState<'_>,
) -> Option<()> {
    for i in 0..frames {
        let white = state.rng.next_f64() * 2.0 - 1.0;
        out.left[i] = match color {
            NoiseColor::Pink => {
                *state.pink0 = 0.99765 * *state.pink0 + white * 0.099046;
                *state.pink1 = 0.963 * *state.pink1 + white * 0.2965164;
                *state.pink2 = 0.57 * *state.pink2 + white * 1.0526913;
                clamp(
                    (*state.pink0 + *state.pink1 + *state.pink2 + white * 0.1848) * 0.14,
                    -1.0,
                    1.0,
                ) as f32
            }
            NoiseColor::Brown => {
                *state.brown = clamp((*state.brown + 0.02 * white) / 1.02, -1.0, 1.0);
                (*state.brown * 3.5) as f32
            }
            NoiseColor::White => white as f32,
        };
    }
    Some(())
}

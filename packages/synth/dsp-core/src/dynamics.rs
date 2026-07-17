use crate::math::safe_finite;
use crate::nonlinear::soft_knee;

#[derive(Clone, Copy, Debug)]
pub struct CompressorParams {
    pub threshold_db: f64,
    pub ratio: f64,
    pub attack_sec: f64,
    pub release_sec: f64,
    pub knee_db: f64,
    pub sample_rate: f64,
}

impl CompressorParams {
    #[inline]
    fn sanitized(self) -> Self {
        Self {
            threshold_db: safe_finite(self.threshold_db, -24.0),
            ratio: safe_finite(self.ratio, 1.0).max(1.0),
            attack_sec: safe_finite(self.attack_sec, 0.003).max(1e-6),
            release_sec: safe_finite(self.release_sec, 0.25).max(1e-6),
            knee_db: safe_finite(self.knee_db, 0.0).max(0.0),
            sample_rate: safe_finite(self.sample_rate, 48_000.0).max(1.0),
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct CompressorState {
    pub envelope: f64,
}

#[inline]
pub fn compress_sample(input: f32, state: &mut CompressorState, params: CompressorParams) -> f32 {
    let params = params.sanitized();
    let x = input as f64;
    let level = x.abs();
    let coeff = if level > state.envelope {
        (-1.0 / (params.attack_sec * params.sample_rate)).exp()
    } else {
        (-1.0 / (params.release_sec * params.sample_rate)).exp()
    };
    state.envelope = coeff * state.envelope + (1.0 - coeff) * level;

    let db = 20.0 * state.envelope.max(1e-9).log10();
    let over = soft_knee(db - params.threshold_db, params.knee_db);
    let gain_db = if over > 0.0 {
        -(over - over / params.ratio)
    } else {
        0.0
    };
    (x * 10.0_f64.powf(gain_db / 20.0)) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compressor_reduces_sustained_signal_above_threshold() {
        let mut state = CompressorState::default();
        let params = CompressorParams {
            threshold_db: -18.0,
            ratio: 4.0,
            attack_sec: 0.001,
            release_sec: 0.1,
            knee_db: 0.0,
            sample_rate: 48_000.0,
        };
        let mut out = 0.0;
        for _ in 0..2_000 {
            out = compress_sample(1.0, &mut state, params);
        }

        assert!(out < 1.0);
        assert!(out > 0.0);
    }

    #[test]
    fn compressor_releases_toward_silence_without_nan() {
        let mut state = CompressorState::default();
        let params = CompressorParams {
            threshold_db: -24.0,
            ratio: 8.0,
            attack_sec: 0.001,
            release_sec: 0.01,
            knee_db: 6.0,
            sample_rate: 48_000.0,
        };
        for _ in 0..512 {
            let _ = compress_sample(1.0, &mut state, params);
        }
        for _ in 0..512 {
            let out = compress_sample(0.0, &mut state, params);
            assert!(out.is_finite());
        }

        assert!(state.envelope < 1.0);
    }

    #[test]
    fn compressor_sanitizes_hostile_params() {
        let mut state = CompressorState::default();
        let out = compress_sample(
            0.5,
            &mut state,
            CompressorParams {
                threshold_db: f64::NAN,
                ratio: -10.0,
                attack_sec: f64::NAN,
                release_sec: -1.0,
                knee_db: f64::NAN,
                sample_rate: 0.0,
            },
        );

        assert!(out.is_finite());
        assert!(state.envelope.is_finite());
    }
}

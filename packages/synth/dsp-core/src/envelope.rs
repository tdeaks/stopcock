use crate::math::clamp;

pub fn adsr_at(t: f64, gate_sec: f64, attack: f64, decay: f64, sustain: f64, release: f64) -> f64 {
    if t < attack {
        if attack == 0.0 {
            1.0
        } else {
            t / attack
        }
    } else if t < attack + decay {
        let p = if decay == 0.0 {
            1.0
        } else {
            (t - attack) / decay
        };
        1.0 + (sustain - 1.0) * p
    } else if t < gate_sec {
        sustain
    } else {
        let p = if release == 0.0 {
            1.0
        } else {
            (t - gate_sec) / release
        };
        sustain * (1.0 - clamp(p, 0.0, 1.0))
    }
}

pub fn ar_at(t: f64, gate_sec: f64, attack: f64, release: f64) -> f64 {
    if t < attack {
        if attack == 0.0 {
            1.0
        } else {
            t / attack
        }
    } else if t < gate_sec {
        1.0
    } else {
        let p = if release == 0.0 {
            1.0
        } else {
            (t - gate_sec) / release
        };
        1.0 - clamp(p, 0.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adsr_envelope_enters_release_after_gate() {
        let sustain = adsr_at(0.25, 0.2, 0.0, 0.1, 0.5, 0.1);
        assert!(sustain < 0.5);
        assert!(sustain > 0.0);
    }

    #[test]
    fn ar_envelope_reaches_silence_after_release() {
        assert_eq!(ar_at(0.4, 0.2, 0.01, 0.1), 0.0);
    }
}

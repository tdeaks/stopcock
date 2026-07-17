use crate::math::clamp;
use crate::oscillator::wrap_phase;

pub trait WavetableSource {
    fn size(&self) -> usize;
    fn frame_count(&self) -> usize;
    fn levels(&self) -> &[Vec<f32>];
    fn level_max_harmonics(&self) -> &[f64];
}

pub fn sample_wavetable(
    bank: &impl WavetableSource,
    phase: f64,
    freq: f64,
    sample_rate: f64,
    position: f64,
) -> f64 {
    let size = bank.size();
    let levels = bank.levels();
    if size == 0 || levels.is_empty() {
        return 0.0;
    }

    let level = table_level_for(bank, freq.abs().max(1.0), sample_rate);
    let table = levels
        .get(level)
        .or_else(|| levels.first())
        .expect("levels is known to be non-empty");
    let frames = bank.frame_count().max(1);
    let frame_position = clamp(position, 0.0, 1.0) * (frames - 1) as f64;
    let frame0 = frame_position.floor() as usize;
    let frame1 = (frame0 + 1).min(frames - 1);
    let frac = frame_position - frame0 as f64;
    let a = sample_table_frame(table, size, frame0, phase);
    let b = if frame1 == frame0 {
        a
    } else {
        sample_table_frame(table, size, frame1, phase)
    };
    a * (1.0 - frac) + b * frac
}

fn table_level_for(bank: &impl WavetableSource, freq: f64, sample_rate: f64) -> usize {
    let allowed = (sample_rate / (2.0 * freq.max(1.0))).max(1.0);
    let harmonics = bank.level_max_harmonics();
    let mut level = 0usize;
    while level + 1 < harmonics.len() && harmonics[level] > allowed {
        level += 1;
    }
    level
}

fn sample_table_frame(table: &[f32], size: usize, frame: usize, phase: f64) -> f64 {
    let position = wrap_phase(phase) * size as f64;
    let lo = position.floor() as usize % size;
    let hi = (lo + 1) % size;
    let frac = position - position.floor();
    let offset = frame * size;
    let a = table.get(offset + lo).copied().unwrap_or(0.0) as f64;
    let b = table.get(offset + hi).copied().unwrap_or(0.0) as f64;
    a * (1.0 - frac) + b * frac
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Bank {
        size: usize,
        frame_count: usize,
        levels: Vec<Vec<f32>>,
        level_max_harmonics: Vec<f64>,
    }

    impl WavetableSource for Bank {
        fn size(&self) -> usize {
            self.size
        }

        fn frame_count(&self) -> usize {
            self.frame_count
        }

        fn levels(&self) -> &[Vec<f32>] {
            &self.levels
        }

        fn level_max_harmonics(&self) -> &[f64] {
            &self.level_max_harmonics
        }
    }

    #[test]
    fn wavetable_interpolates_between_frames_and_samples() {
        let bank = Bank {
            size: 4,
            frame_count: 2,
            levels: vec![vec![0.0, 1.0, 0.0, -1.0, 0.0, 0.5, 0.0, -0.5]],
            level_max_harmonics: vec![2.0],
        };

        let value = sample_wavetable(&bank, 0.125, 100.0, 48_000.0, 0.5);
        assert!((value - 0.375).abs() < 1e-12);
    }
}

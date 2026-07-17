use crate::dsp::{sample_waveform, sample_wavetable, Waveform};
use crate::model::{FmOperator, FmOperatorKind, WavetableBank};

#[derive(Clone)]
enum RuntimeOperatorKind {
    Wave(Waveform),
    Wavetable {
        bank: Option<WavetableBank>,
        position: f64,
    },
}

#[derive(Clone)]
pub(crate) struct RuntimeFmOperator {
    kind: RuntimeOperatorKind,
    pub(crate) ratio: f64,
    pub(crate) detune: f64,
    pub(crate) level: f64,
    pub(crate) feedback: f64,
    pub(crate) output: f64,
    pub(crate) phase: f64,
}

pub(crate) type RuntimeFmOperators = [RuntimeFmOperator; 6];

pub(crate) fn sample_runtime_operator(
    spec: &RuntimeFmOperator,
    phase: f64,
    dt: f64,
    freq: f64,
    sample_rate: f64,
    triangle: &mut [f64; 6],
    op: usize,
) -> f64 {
    match &spec.kind {
        RuntimeOperatorKind::Wavetable { bank, position } => {
            if let Some(bank) = bank.as_ref() {
                sample_wavetable(bank, phase, freq, sample_rate, *position)
            } else {
                0.0
            }
        }
        RuntimeOperatorKind::Wave(wave) => sample_waveform(*wave, phase, dt, &mut triangle[op]),
    }
}

pub(super) fn compile_operators(raw: &[FmOperator]) -> RuntimeFmOperators {
    std::array::from_fn(|op| compile_operator(raw.get(op)))
}

pub(super) fn matrix_from_rows(rows: Option<&[Vec<f64>]>) -> [[f64; 6]; 6] {
    let mut matrix = [[0.0; 6]; 6];
    if let Some(rows) = rows {
        for (row, values) in matrix.iter_mut().enumerate() {
            for (col, value) in values.iter_mut().enumerate() {
                *value = rows
                    .get(row)
                    .and_then(|values| values.get(col))
                    .copied()
                    .unwrap_or(0.0);
            }
        }
    }
    matrix
}

pub(super) fn compile_operator(spec: Option<&FmOperator>) -> RuntimeFmOperator {
    let Some(spec) = spec else {
        return default_operator();
    };
    let kind = match spec.operator_kind {
        Some(FmOperatorKind::Wavetable) => RuntimeOperatorKind::Wavetable {
            bank: spec.bank.clone(),
            position: spec.position.unwrap_or(0.0),
        },
        Some(FmOperatorKind::Sine) => RuntimeOperatorKind::Wave(Waveform::Sine),
        Some(FmOperatorKind::Polyblep) => RuntimeOperatorKind::Wave(
            spec.wave_kind
                .unwrap_or_else(|| Waveform::from_optional(spec.wave.as_deref())),
        ),
        None if spec.kind == "wavetable" => RuntimeOperatorKind::Wavetable {
            bank: spec.bank.clone(),
            position: spec.position.unwrap_or(0.0),
        },
        None => RuntimeOperatorKind::Wave(Waveform::from_optional(spec.wave.as_deref())),
    };
    RuntimeFmOperator {
        kind,
        ratio: spec.ratio,
        detune: spec.detune,
        level: spec.level,
        feedback: spec.feedback,
        output: spec.output,
        phase: spec.phase,
    }
}

fn default_operator() -> RuntimeFmOperator {
    RuntimeFmOperator {
        kind: RuntimeOperatorKind::Wave(Waveform::Sine),
        ratio: 1.0,
        detune: 0.0,
        level: 0.0,
        feedback: 0.0,
        output: 0.0,
        phase: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fm_matrix_pads_missing_rows_and_columns() {
        let matrix = matrix_from_rows(Some(&[vec![0.0, 0.5], vec![0.25]]));
        assert_eq!(matrix[0][1], 0.5);
        assert_eq!(matrix[1][0], 0.25);
        assert_eq!(matrix[1][1], 0.0);
        assert_eq!(matrix[5][5], 0.0);
    }

    #[test]
    fn missing_fm_operator_defaults_to_silent_sine() {
        let operator = compile_operator(None);
        assert!(matches!(
            operator.kind,
            RuntimeOperatorKind::Wave(Waveform::Sine)
        ));
        assert_eq!(operator.ratio, 1.0);
        assert_eq!(operator.level, 0.0);
        assert_eq!(operator.output, 0.0);
    }

    #[test]
    fn compile_operators_always_returns_six_runtime_slots() {
        let operators = compile_operators(&[]);
        assert_eq!(operators.len(), 6);
        for operator in operators {
            assert_eq!(operator.level, 0.0);
            assert_eq!(operator.output, 0.0);
        }
    }

    #[test]
    fn compile_operator_prefers_binary_decoded_kind_and_wave() {
        let operator = compile_operator(Some(&FmOperator {
            kind: "sine".to_string(),
            operator_kind: Some(FmOperatorKind::Polyblep),
            ratio: 1.0,
            detune: 0.0,
            level: 1.0,
            feedback: 0.0,
            output: 1.0,
            phase: 0.0,
            wave: Some("sine".to_string()),
            wave_kind: Some(Waveform::Square),
            bank: None,
            position: None,
        }));

        assert!(matches!(
            operator.kind,
            RuntimeOperatorKind::Wave(Waveform::Square)
        ));
    }
}

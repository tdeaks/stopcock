use crate::dsp::{
    safe_finite, wrap_phase, AcidBassState, AcidBassWaveform, BiquadState, BitcrusherState,
    CompressorState, DampedComb, DegradeState, DelayLine, DrumVoiceKind, DrumVoiceState,
    EnsembleChorusState, FeedbackDelay, FilterKind, FrequencyShifterState, LoFiSamplerState,
    MicroPitchState, Mulberry32, MultiTapDelayState, MultiTapDelayTap, NonlinearReverbState,
    PhaserState, PlateReverbState, PolySynthState, ReverbLine, RotarySpeakerState,
    SamplerVoiceState,
    SamplerZone, SaturatorState, SpringReverbState, StateVariableFilterMode,
    StateVariableFilterState, StereoSpreadState, StringMachineState, TapeDelayState, TapeEchoState,
    TiltEqState, WavefolderState, Waveform, TAU,
};
use crate::model::{NodeDef, NodeKind, SamplerZoneDef};
use crate::runtime_node::fm::{compile_operators, matrix_from_rows};
use crate::runtime_node::{DistortionShape, NoiseColor, RuntimeNode};

impl RuntimeNode {
    pub(crate) fn from_node(node: NodeDef, sample_rate: f64) -> Option<Self> {
        let NodeDef {
            kind,
            kind_id,
            out,
            inputs,
            fields,
            ..
        } = node;
        let kind = kind_id.or_else(|| NodeKind::from_name(&kind))?;
        Some(match kind {
            NodeKind::Osc => Self::Osc {
                out,
                freq: fields.freq.unwrap_or(0.0),
                detune: fields.detune.unwrap_or(0.0),
                base_phase: fields.phase.unwrap_or(0.0),
                wave: fields
                    .wave_kind
                    .unwrap_or_else(|| Waveform::from_optional(fields.wave.as_deref())),
                phase: wrap_phase(fields.phase.unwrap_or(0.0) / TAU),
                triangle: 0.0,
            },
            NodeKind::Wavetable => Self::Wavetable {
                out,
                bank: fields.bank,
                freq: fields.freq.unwrap_or(0.0),
                detune: fields.detune.unwrap_or(0.0),
                base_phase: fields.phase.unwrap_or(0.0),
                position: fields.position.unwrap_or(0.0),
                phase: wrap_phase(fields.phase.unwrap_or(0.0) / TAU),
            },
            NodeKind::Fm => compile_fm_node(
                out,
                fields.freq.unwrap_or(0.0),
                fields.detune.unwrap_or(0.0),
                fields.index.unwrap_or(1.0),
                fields.operators.unwrap_or_default(),
                fields.matrix.as_deref(),
            ),
            NodeKind::Noise => {
                let seed = fields.seed.unwrap_or(0);
                Self::Noise {
                    out,
                    color: NoiseColor::from_optional(fields.color.as_deref()),
                    rng: Mulberry32::new(seed),
                    seed,
                    pink0: 0.0,
                    pink1: 0.0,
                    pink2: 0.0,
                    brown: 0.0,
                }
            }
            NodeKind::Constant => Self::Constant {
                out,
                value: fields.value.unwrap_or(0.0),
            },
            NodeKind::Buffer => Self::Buffer {
                out,
                samples: fields.samples.unwrap_or_default(),
                rate: safe_finite(fields.rate.unwrap_or(1.0), 0.0),
                looped: fields.looped.unwrap_or(false),
                position: 0.0,
            },
            NodeKind::SamplerInstrument => Self::SamplerInstrument {
                zones: sampler_zones(fields.zones.unwrap_or_default()),
                freq: fields.freq.unwrap_or(440.0),
                velocity: fields.value.unwrap_or(f64::NAN),
                attack: fields.attack.unwrap_or(0.0),
                release: fields.release.unwrap_or(0.08),
                level: fields.amount.unwrap_or(1.0),
                state: SamplerVoiceState::new(),
            },
            NodeKind::LofiSampler => Self::LofiSampler {
                zones: sampler_zones(fields.zones.unwrap_or_default()),
                freq: fields.freq.unwrap_or(440.0),
                velocity: fields.value.unwrap_or(f64::NAN),
                attack: fields.attack.unwrap_or(0.0),
                release: fields.release.unwrap_or(0.08),
                level: fields.amount.unwrap_or(1.0),
                bits: fields.bits.unwrap_or(12.0),
                downsample: fields.downsample.unwrap_or(2.0),
                jitter: fields.jitter.unwrap_or(0.04),
                noise: fields.noise.unwrap_or(0.06),
                tone: fields.tone.unwrap_or(0.58),
                drive: fields.drive.unwrap_or(0.16),
                mix: fields.mix.unwrap_or(1.0),
                state: LoFiSamplerState::new(),
            },
            NodeKind::AcidBass => Self::AcidBass {
                wave: fields
                    .acid_wave_kind
                    .unwrap_or_else(|| AcidBassWaveform::from_optional(fields.wave.as_deref())),
                freq: fields.freq.unwrap_or(110.0),
                velocity: fields.value.unwrap_or(f64::NAN),
                cutoff: fields.cutoff.unwrap_or(760.0),
                resonance: fields.resonance.unwrap_or(0.58),
                env_mod: fields.env_mod.unwrap_or(0.62),
                decay: fields.decay.unwrap_or(0.22),
                accent: fields.accent.unwrap_or(0.0),
                slide: fields.slide.unwrap_or(0.0),
                drive: fields.drive.unwrap_or(0.18),
                level: fields.level.unwrap_or(1.0),
                state: AcidBassState::new(),
            },
            NodeKind::DrumVoice => Self::DrumVoice {
                kind: fields
                    .drum_voice_kind
                    .unwrap_or_else(|| DrumVoiceKind::from_optional(fields.drum_kind.as_deref())),
                freq: fields.freq.unwrap_or(55.0),
                velocity: fields.value.unwrap_or(f64::NAN),
                decay: fields.decay.unwrap_or(0.52),
                tone: fields.tone.unwrap_or(0.58),
                snap: fields.snap.unwrap_or(0.48),
                noise: fields.noise.unwrap_or(0.05),
                drive: fields.drive.unwrap_or(0.16),
                level: fields.level.unwrap_or(1.0),
                state: DrumVoiceState::new(),
            },
            NodeKind::StringMachine => Self::StringMachine {
                freq: fields.freq.unwrap_or(220.0),
                velocity: fields.value.unwrap_or(f64::NAN),
                detune: fields.detune.unwrap_or(7.0),
                attack: fields.attack.unwrap_or(0.18),
                release: fields.release.unwrap_or(0.8),
                tone: fields.tone.unwrap_or(0.72),
                depth: fields.depth.unwrap_or(0.72),
                modulation: fields.modulation.unwrap_or(0.46),
                width: fields.width.unwrap_or(1.0),
                level: fields.level.unwrap_or(1.0),
                state: StringMachineState::new(sample_rate),
            },
            NodeKind::PolySynth => Self::PolySynth {
                freq: fields.freq.unwrap_or(220.0),
                velocity: fields.value.unwrap_or(f64::NAN),
                detune: fields.detune.unwrap_or(4.0),
                pulse_width: fields.pulse_width.unwrap_or(0.48),
                sub: fields.sub.unwrap_or(0.32),
                noise: fields.noise.unwrap_or(0.03),
                cutoff: fields.cutoff.unwrap_or(1_800.0),
                resonance: fields.resonance.unwrap_or(0.28),
                env_mod: fields.env_mod.unwrap_or(0.36),
                attack: fields.attack.unwrap_or(0.006),
                decay: fields.decay.unwrap_or(0.28),
                sustain: fields.sustain.unwrap_or(0.68),
                release: fields.release.unwrap_or(0.36),
                drive: fields.drive.unwrap_or(0.12),
                chorus: fields.chorus.unwrap_or(0.38),
                modulation: fields.modulation.unwrap_or(0.18),
                width: fields.width.unwrap_or(0.9),
                level: fields.level.unwrap_or(1.0),
                state: PolySynthState::new(sample_rate),
            },
            NodeKind::Input => Self::Input {
                out,
                channel: fields.channel.unwrap_or(0),
            },
            NodeKind::Gain => Self::Gain {
                out,
                input: required_input(&inputs, 0)?,
                amount: fields.amount.unwrap_or(1.0),
            },
            NodeKind::Pan => Self::Pan {
                input: required_input(&inputs, 0)?,
                position: fields.position.unwrap_or(0.0),
            },
            NodeKind::Mix => Self::Mix { out, inputs },
            NodeKind::Stereo => Self::Stereo {
                left: required_input(&inputs, 0)?,
                right: required_input(&inputs, 1)?,
            },
            NodeKind::Biquad => Self::Biquad {
                out,
                input: required_input(&inputs, 0)?,
                filter: fields
                    .filter_kind
                    .unwrap_or_else(|| FilterKind::from_optional(fields.filter.as_deref())),
                freq: fields.freq.unwrap_or(0.0),
                q: fields.q.unwrap_or(std::f64::consts::FRAC_1_SQRT_2),
                gain_db: fields.gain_db.unwrap_or(0.0),
                left: BiquadState::default(),
                right: BiquadState::default(),
            },
            NodeKind::StateVariableFilter => Self::StateVariableFilter {
                out,
                input: required_input(&inputs, 0)?,
                mode: fields.state_variable_filter_mode.unwrap_or_else(|| {
                    StateVariableFilterMode::from_optional(fields.filter.as_deref())
                }),
                freq: fields.freq.unwrap_or(1_000.0),
                resonance: fields.resonance.unwrap_or(0.0),
                drive: fields.drive.unwrap_or(0.0),
                mix: fields.mix.unwrap_or(1.0),
                left: StateVariableFilterState::default(),
                right: StateVariableFilterState::default(),
            },
            NodeKind::Comb => Self::Comb {
                out,
                input: required_input(&inputs, 0)?,
                delay_ms: fields.delay_ms.unwrap_or(0.0),
                feedback: fields.feedback.unwrap_or(0.0),
                damp: fields.damp.unwrap_or(0.0),
                left: DampedComb::new((sample_rate * 2.0).ceil().max(1.0) as usize),
                right: DampedComb::new((sample_rate * 2.0).ceil().max(1.0) as usize),
            },
            NodeKind::Adsr => Self::Adsr {
                out,
                input: required_input(&inputs, 0)?,
                attack: fields.attack.unwrap_or(0.0),
                decay: fields.decay.unwrap_or(0.0),
                sustain: fields.sustain.unwrap_or(1.0),
                release: fields.release.unwrap_or(0.0),
            },
            NodeKind::Ar => Self::Ar {
                out,
                input: required_input(&inputs, 0)?,
                attack: fields.attack.unwrap_or(0.0),
                release: fields.release.unwrap_or(0.0),
            },
            NodeKind::Exponential => Self::Exponential {
                out,
                input: required_input(&inputs, 0)?,
                tau: fields.tau.unwrap_or(1.0),
            },
            NodeKind::Delay => Self::Delay {
                out,
                input: required_input(&inputs, 0)?,
                delay_ms: fields.delay_ms.unwrap_or(0.0),
                feedback: fields.feedback.unwrap_or(0.0),
                mix: fields.mix.unwrap_or(0.0),
                left: FeedbackDelay::new((sample_rate * 5.0).ceil().max(1.0) as usize),
                right: FeedbackDelay::new((sample_rate * 5.0).ceil().max(1.0) as usize),
            },
            NodeKind::Reverb => {
                let ir = fields.ir.unwrap_or_default();
                let size = ir.len().max(1);
                Self::Reverb {
                    out,
                    input: required_input(&inputs, 0)?,
                    ir,
                    mix: fields.mix.unwrap_or(0.0),
                    left: ReverbLine::new(size),
                    right: ReverbLine::new(size),
                }
            }
            NodeKind::Distortion => Self::Distortion {
                out,
                input: required_input(&inputs, 0)?,
                shape: DistortionShape::from_optional(fields.shape.as_deref()),
                amount: fields.amount.unwrap_or(0.0),
            },
            NodeKind::Chorus => Self::Chorus {
                out,
                input: required_input(&inputs, 0)?,
                rate: fields.rate.unwrap_or(0.8),
                depth: fields.depth.unwrap_or(8.0),
                mix: fields.mix.unwrap_or(0.0),
                left: DelayLine::new((sample_rate * 0.1).ceil().max(1.0) as usize),
                right: DelayLine::new((sample_rate * 0.1).ceil().max(1.0) as usize),
            },
            NodeKind::SpaceEcho => Self::SpaceEcho {
                input: required_input(&inputs, 0)?,
                time_ms: fields.time_ms.unwrap_or(120.0),
                feedback: fields.feedback.unwrap_or(0.55),
                mix: fields.mix.unwrap_or(0.35),
                reverb_mix: fields.reverb_mix.unwrap_or(0.08),
                wow: fields.wow.unwrap_or(0.32),
                flutter: fields.flutter.unwrap_or(0.12),
                tape_age: fields.tape_age.unwrap_or(0.42),
                drive: fields.drive.unwrap_or(0.18),
                head_count: fields.head_count.unwrap_or(3.0).max(1.0),
                head1: fields.head1.unwrap_or(false),
                head2: fields.head2.unwrap_or(false),
                head3: fields.head3.unwrap_or(false),
                state: TapeEchoState::new(sample_rate),
            },
            NodeKind::TapeDelay => Self::TapeDelay {
                input: required_input(&inputs, 0)?,
                time_ms: fields.time_ms.unwrap_or(180.0),
                feedback: fields.feedback.unwrap_or(0.42),
                mix: fields.mix.unwrap_or(0.35),
                wow: fields.wow.unwrap_or(0.24),
                flutter: fields.flutter.unwrap_or(0.1),
                tape_age: fields.tape_age.unwrap_or(0.3),
                drive: fields.drive.unwrap_or(0.18),
                tone: fields.tone.unwrap_or(0.72),
                width: fields.width.unwrap_or(0.9),
                state: TapeDelayState::new(sample_rate),
            },
            NodeKind::PlateReverb => Self::PlateReverb {
                input: required_input(&inputs, 0)?,
                pre_delay_ms: fields.pre_delay_ms.unwrap_or(12.0),
                decay: fields.decay.unwrap_or(0.55),
                damping: fields.damping.unwrap_or(0.42),
                diffusion: fields.diffusion.unwrap_or(0.72),
                modulation: fields.modulation.unwrap_or(0.18),
                mix: fields.mix.unwrap_or(0.28),
                width: fields.width.unwrap_or(1.0),
                state: Box::new(PlateReverbState::new(sample_rate)),
            },
            NodeKind::SpringReverb => Self::SpringReverb {
                input: required_input(&inputs, 0)?,
                decay: fields.decay.unwrap_or(0.62),
                damping: fields.damping.unwrap_or(0.36),
                tension: fields.tension.unwrap_or(0.52),
                drip: fields.drip.unwrap_or(0.28),
                mix: fields.mix.unwrap_or(0.25),
                width: fields.width.unwrap_or(1.0),
                state: Box::new(SpringReverbState::new(sample_rate)),
            },
            NodeKind::NonlinearReverb => Self::NonlinearReverb {
                input: required_input(&inputs, 0)?,
                time_ms: fields.time_ms.unwrap_or(180.0),
                decay: fields.decay.unwrap_or(0.68),
                damping: fields.damping.unwrap_or(0.38),
                drive: fields.drive.unwrap_or(0.18),
                mix: fields.mix.unwrap_or(0.24),
                width: fields.width.unwrap_or(1.0),
                state: Box::new(NonlinearReverbState::new(sample_rate)),
            },
            NodeKind::Compressor => Self::Compressor {
                out,
                input: required_input(&inputs, 0)?,
                threshold: fields.threshold.unwrap_or(-24.0),
                ratio: fields.ratio.unwrap_or(4.0),
                attack: fields.attack.unwrap_or(0.003),
                release: fields.release.unwrap_or(0.25),
                knee: fields.knee.unwrap_or(30.0).max(0.0),
                left: CompressorState::default(),
                right: CompressorState::default(),
            },
            NodeKind::Bitcrush => Self::Bitcrush {
                out,
                input: required_input(&inputs, 0)?,
                bits: fields.bits.unwrap_or(8.0),
                downsample: fields.downsample.unwrap_or(1.0),
                left: BitcrusherState::default(),
                right: BitcrusherState::default(),
            },
            NodeKind::MicroPitch => Self::MicroPitch {
                input: required_input(&inputs, 0)?,
                detune: fields.detune.unwrap_or(9.0),
                width: fields.width.unwrap_or(1.0),
                delay_ms: fields.delay_ms.unwrap_or(12.0),
                mix: fields.mix.unwrap_or(0.35),
                state: MicroPitchState::new(sample_rate),
            },
            NodeKind::MultiTapDelay => Self::MultiTapDelay {
                input: required_input(&inputs, 0)?,
                time_ms: fields.time_ms.unwrap_or(96.0),
                feedback: fields.feedback.unwrap_or(0.28),
                mix: fields.mix.unwrap_or(0.35),
                tone: fields.tone.unwrap_or(0.72),
                width: fields.width.unwrap_or(1.0),
                taps: multi_tap_delay_taps(
                    fields.tap_ratios.as_deref(),
                    fields.tap_gains.as_deref(),
                    fields.tap_pans.as_deref(),
                ),
                state: MultiTapDelayState::new(sample_rate),
            },
            NodeKind::Saturator => Self::Saturator {
                out,
                input: required_input(&inputs, 0)?,
                drive: fields.drive.unwrap_or(0.35),
                asymmetry: fields.asymmetry.unwrap_or(0.0),
                tone: fields.tone.unwrap_or(0.75),
                mix: fields.mix.unwrap_or(1.0),
                output: fields.output.unwrap_or(1.0),
                state: SaturatorState::new(),
            },
            NodeKind::Wavefolder => Self::Wavefolder {
                out,
                input: required_input(&inputs, 0)?,
                drive: fields.drive.unwrap_or(0.32),
                depth: fields.depth.unwrap_or(0.58),
                asymmetry: fields.asymmetry.unwrap_or(0.0),
                tone: fields.tone.unwrap_or(0.78),
                mix: fields.mix.unwrap_or(1.0),
                output: fields.output.unwrap_or(1.0),
                state: WavefolderState::new(),
            },
            NodeKind::Degrade => Self::Degrade {
                out,
                input: required_input(&inputs, 0)?,
                bits: fields.bits.unwrap_or(10.0),
                downsample: fields.downsample.unwrap_or(3.0),
                jitter: fields.jitter.unwrap_or(0.0),
                noise: fields.noise.unwrap_or(0.0),
                tone: fields.tone.unwrap_or(0.72),
                mix: fields.mix.unwrap_or(0.65),
                state: DegradeState::new(),
            },
            NodeKind::TiltEq => Self::TiltEq {
                out,
                input: required_input(&inputs, 0)?,
                freq: fields.freq.unwrap_or(1_000.0),
                gain_db: fields.gain_db.unwrap_or(0.0),
                mix: fields.mix.unwrap_or(1.0),
                state: TiltEqState::new(),
            },
            NodeKind::StereoSpread => Self::StereoSpread {
                input: required_input(&inputs, 0)?,
                width: fields.width.unwrap_or(1.0),
                delay_ms: fields.delay_ms.unwrap_or(9.0),
                mix: fields.mix.unwrap_or(1.0),
                state: StereoSpreadState::new(sample_rate),
            },
            NodeKind::FrequencyShifter => Self::FrequencyShifter {
                out,
                input: required_input(&inputs, 0)?,
                shift_hz: fields.shift_hz.unwrap_or(0.0),
                mix: fields.mix.unwrap_or(1.0),
                state: Box::new(FrequencyShifterState::new()),
            },
            NodeKind::RotarySpeaker => Self::RotarySpeaker {
                input: required_input(&inputs, 0)?,
                rate: fields.rate.unwrap_or(6.4),
                depth: fields.depth.unwrap_or(0.72),
                mix: fields.mix.unwrap_or(0.5),
                drive: fields.drive.unwrap_or(0.0),
                width: fields.width.unwrap_or(1.0),
                freq: fields.freq.unwrap_or(800.0),
                state: Box::new(RotarySpeakerState::new(sample_rate)),
            },
            NodeKind::EnsembleChorus => Self::EnsembleChorus {
                input: required_input(&inputs, 0)?,
                rate: fields.rate.unwrap_or(0.4),
                depth: fields.depth.unwrap_or(4.44),
                mix: fields.mix.unwrap_or(0.5),
                width: fields.width.unwrap_or(1.0),
                tone: fields.tone.unwrap_or(0.82),
                noise: fields.noise.unwrap_or(0.0),
                state: EnsembleChorusState::new(sample_rate),
            },
            NodeKind::Phaser => Self::Phaser {
                out,
                input: required_input(&inputs, 0)?,
                voicing: crate::runtime_node::phaser_voicing_from_optional(
                    fields.voicing.as_deref(),
                ),
                rate: fields.rate.unwrap_or(0.5),
                depth: fields.depth.unwrap_or(0.7),
                mix: fields.mix.unwrap_or(0.5),
                left: Box::new(PhaserState::new(sample_rate)),
                right: Box::new(PhaserState::new(sample_rate)),
            },
        })
    }
}

fn compile_fm_node(
    out: u8,
    freq: f64,
    detune: f64,
    index: f64,
    raw: Vec<crate::model::FmOperator>,
    matrix_rows: Option<&[Vec<f64>]>,
) -> RuntimeNode {
    let operators = compile_operators(&raw);
    let phase = std::array::from_fn(|op| wrap_phase(operators[op].phase / TAU));
    RuntimeNode::Fm {
        out,
        freq,
        detune,
        index,
        operators: Box::new(operators),
        matrix: Box::new(matrix_from_rows(matrix_rows)),
        phase,
        previous: [0.0; 6],
        current: [0.0; 6],
        triangle: [0.0; 6],
    }
}

fn required_input(inputs: &[usize], index: usize) -> Option<usize> {
    inputs.get(index).copied()
}

fn multi_tap_delay_taps(
    ratios: Option<&[f64]>,
    gains: Option<&[f64]>,
    pans: Option<&[f64]>,
) -> Vec<MultiTapDelayTap> {
    let ratios = ratios.unwrap_or(&[1.0, 1.618, 2.618]);
    let gains = gains.unwrap_or(&[0.85, 0.62, 0.42]);
    let pans = pans.unwrap_or(&[-0.65, 0.35, 0.85]);
    ratios
        .iter()
        .take(16)
        .enumerate()
        .map(|(index, ratio)| {
            MultiTapDelayTap::new(
                *ratio,
                gains.get(index).copied().unwrap_or(0.0),
                pans.get(index).copied().unwrap_or(0.0),
            )
        })
        .collect()
}

fn sampler_zones(zones: Vec<SamplerZoneDef>) -> Vec<SamplerZone> {
    zones
        .into_iter()
        .map(|zone| SamplerZone {
            samples: zone.samples,
            sample_rate: zone.sample_rate,
            root_midi: zone.root_midi,
            key_low: zone.key_low,
            key_high: zone.key_high,
            velocity_low: zone.velocity_low,
            velocity_high: zone.velocity_high,
            looped: zone.looped,
            loop_start: zone.loop_start,
            loop_end: zone.loop_end,
            gain: zone.gain,
            pan: zone.pan,
        })
        .collect()
}

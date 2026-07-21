import { instrument, type DrumVoiceKind, type Node } from '@stopcock/synth'

export type DrumPieceId = 'kick' | 'snare' | 'hatClosed' | 'hatOpen' | 'clap'

export type DrumPieceDef = {
  id: DrumPieceId
  label: string
  /** Two-letter step-grid tag */
  tag: string
  /** Default keyboard key for the pad */
  key: string
  /** Build the Rust-DSP-backed voice node. Compiled once at engine init. */
  build(): Node
  /**
   * Choke group: pieces in the same group cut each other off on trigger.
   * Used to model the real-world closed-hat-mutes-open-hat behavior.
   * null = no choke.
   */
  chokeGroup: string | null
}

const drumVoice = (
  kind: DrumVoiceKind,
  params: {
    freq?: number
    decay?: number
    tone?: number
    snap?: number
    noise?: number
    drive?: number
    level?: number
  },
): Node => instrument.drumVoice({ kind, ...params })

export const DRUM_KIT: ReadonlyArray<DrumPieceDef> = [
  {
    id: 'kick',
    label: 'KICK',
    tag: 'KK',
    key: 'q',
    chokeGroup: null,
    build: () =>
      drumVoice('kick', {
        freq: 55,
        decay: 0.42,
        tone: 0.55,
        snap: 0.5,
        noise: 0.04,
        drive: 0.25,
        level: 1,
      }),
  },
  {
    id: 'snare',
    label: 'SNARE',
    tag: 'SN',
    key: 'w',
    chokeGroup: null,
    // Bias the body/noise crossfade hard towards noise — real snares are
    // dominated by the wires, not the shell tone. Higher snap + shorter decay
    // tightens the transient; higher tone shifts the sizzle into the 1.3 kHz
    // band where snare wires live.
    build: () =>
      drumVoice('snare', {
        freq: 185,
        decay: 0.18,
        tone: 0.78,
        snap: 0.85,
        noise: 0.95,
        drive: 0.05,
        level: 1.0,
      }),
  },
  {
    id: 'hatClosed',
    label: 'HAT C',
    tag: 'HC',
    key: 'e',
    chokeGroup: 'hat',
    build: () =>
      drumVoice('hat', {
        freq: 8000,
        decay: 0.05,
        tone: 0.85,
        snap: 0.6,
        noise: 0.95,
        drive: 0.05,
        level: 0.55,
      }),
  },
  {
    id: 'hatOpen',
    label: 'HAT O',
    tag: 'HO',
    key: 'r',
    chokeGroup: 'hat',
    // TODO(user): Voice the open hat. It's the same underlying 'hat' kind as
    // closed hat, but with a longer decay and (usually) a slightly different
    // tone so it sits behind the closed version when both fire. Try:
    //   - decay around 0.35–0.5 (vs. 0.05 closed)
    //   - tone slightly warmer (lower)
    //   - level a touch quieter so closed-hat accents read on top
    // Replace this stub with your tuning.
    build: () =>
      drumVoice('hat', {
        freq: 8000,
        decay: 0.4,
        tone: 0.7,
        snap: 0.4,
        noise: 0.9,
        drive: 0.05,
        level: 0.5,
      }),
  },
  {
    id: 'clap',
    label: 'CLAP',
    tag: 'CP',
    key: 't',
    chokeGroup: null,
    // TODO(user): Voice the clap. There's no dedicated 'clap' kind, so we
    // borrow the 'snare' kind (it already has the body + noise components a
    // clap needs). What makes it READ as a clap rather than a snare:
    //   - low/zero tone (no shell ring — claps are nearly all noise)
    //   - very high noise (≈0.95)
    //   - short decay (≈0.12) with snap close to 1 for the burst
    //   - level slightly under snare
    // Replace this stub with your tuning.
    build: () =>
      drumVoice('snare', {
        freq: 350,
        decay: 0.15,
        tone: 0.1,
        snap: 0.95,
        noise: 0.95,
        drive: 0.1,
        level: 0.7,
      }),
  },
]

export const DRUM_PIECE_INDEX: Readonly<Record<DrumPieceId, number>> = DRUM_KIT.reduce(
  (acc, piece, i) => {
    ;(acc as Record<DrumPieceId, number>)[piece.id] = i
    return acc
  },
  {} as Record<DrumPieceId, number>,
)

import { For, type Component } from 'solid-js'
import { activeArpNotes, activeNotes, noteOff, noteOn } from '../state'

type WhiteKey = { midi: number; label: string }
type BlackKey = { midi: number; afterWhite: number; label: string }

const WHITE_KEYS: ReadonlyArray<WhiteKey> = [
  { midi: 48, label: 'C3' },
  { midi: 50, label: 'D3' },
  { midi: 52, label: 'E3' },
  { midi: 53, label: 'F3' },
  { midi: 55, label: 'G3' },
  { midi: 57, label: 'A3' },
  { midi: 59, label: 'B3' },
  { midi: 60, label: 'C4' },
  { midi: 62, label: 'D4' },
  { midi: 64, label: 'E4' },
  { midi: 65, label: 'F4' },
  { midi: 67, label: 'G4' },
  { midi: 69, label: 'A4' },
  { midi: 71, label: 'B4' },
  { midi: 72, label: 'C5' },
]

const BLACK_KEYS: ReadonlyArray<BlackKey> = [
  { afterWhite: 0, midi: 49, label: 'C#3' },
  { afterWhite: 1, midi: 51, label: 'D#3' },
  { afterWhite: 3, midi: 54, label: 'F#3' },
  { afterWhite: 4, midi: 56, label: 'G#3' },
  { afterWhite: 5, midi: 58, label: 'A#3' },
  { afterWhite: 7, midi: 61, label: 'C#4' },
  { afterWhite: 8, midi: 63, label: 'D#4' },
  { afterWhite: 10, midi: 66, label: 'F#4' },
  { afterWhite: 11, midi: 68, label: 'G#4' },
  { afterWhite: 12, midi: 70, label: 'A#4' },
]

/** Inverse of QWERTY_MAP from input handlers — kept here for display only. */
const QWERTY_HINTS: Record<number, string> = {
  60: 'A',
  62: 'S',
  64: 'D',
  65: 'F',
  67: 'G',
  69: 'H',
  71: 'J',
  72: 'K',
  61: 'W',
  63: 'E',
  66: 'T',
  68: 'Y',
  70: 'U',
  48: 'Z',
  50: 'X',
  52: 'C',
  53: 'V',
  55: 'B',
  57: 'N',
  59: 'M',
}

const whiteWidth = 100 / WHITE_KEYS.length

export const Keyboard: Component<{ midiStatus: string }> = (props) => {
  const isHeld = (midi: number): boolean => activeNotes().has(midi)
  const isArped = (midi: number): boolean => activeArpNotes().has(midi)
  const keyClass = (base: string, midi: number): string =>
    base + (isHeld(midi) ? ' pressed' : '') + (isArped(midi) ? ' arped' : '')

  return (
    <section class="keyboard-wrap">
      <div class="keyboard-header">
        <div class="viz-title">Performance Surface</div>
        <div class="keyboard-info">
          <span>
            OCTAVE<strong>C3 – C5</strong>
          </span>
          <span>
            QWERTY<strong>A S D F G H J K · W E T Y U</strong>
          </span>
          <span>
            MIDI<strong>{props.midiStatus}</strong>
          </span>
          <span>
            VOICES<strong>poly · 8 · {activeNotes().size} held</strong>
          </span>
        </div>
      </div>
      <div class="keyboard">
        <For each={WHITE_KEYS}>
          {(k) => (
            <div
              class={keyClass('key-white', k.midi)}
              data-label={k.label.startsWith('C') ? k.label : ''}
              onMouseDown={(e) => {
                e.preventDefault()
                noteOn(k.midi)
              }}
              onMouseUp={() => noteOff(k.midi)}
              onMouseLeave={() => noteOff(k.midi)}
            >
              {QWERTY_HINTS[k.midi] && <span class="key-hint">{QWERTY_HINTS[k.midi]}</span>}
            </div>
          )}
        </For>
        <For each={BLACK_KEYS}>
          {(k) => (
            <div
              class={keyClass('key-black', k.midi)}
              style={{ left: `calc(${(k.afterWhite + 1) * whiteWidth}% - 2.5%)` }}
              onMouseDown={(e) => {
                e.preventDefault()
                noteOn(k.midi)
              }}
              onMouseUp={() => noteOff(k.midi)}
              onMouseLeave={() => noteOff(k.midi)}
            >
              {QWERTY_HINTS[k.midi] && <span class="key-hint">{QWERTY_HINTS[k.midi]}</span>}
            </div>
          )}
        </For>
      </div>
    </section>
  )
}

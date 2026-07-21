import { onCleanup, onMount, createSignal } from 'solid-js'
import { noteOff, noteOn } from './state'

const QWERTY_MAP: Record<string, number> = {
  a: 60,
  s: 62,
  d: 64,
  f: 65,
  g: 67,
  h: 69,
  j: 71,
  k: 72,
  w: 61,
  e: 63,
  t: 66,
  y: 68,
  u: 70,
  z: 48,
  x: 50,
  c: 52,
  v: 53,
  b: 55,
  n: 57,
  m: 59,
}

/**
 * Attaches QWERTY → noteOn/noteOff handlers to the window for the lifetime
 * of the calling component.
 */
export function useQwertyInput(): void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return
    const midi = QWERTY_MAP[e.key.toLowerCase()]
    if (midi !== undefined) noteOn(midi)
  }
  const onKeyUp = (e: KeyboardEvent): void => {
    const midi = QWERTY_MAP[e.key.toLowerCase()]
    if (midi !== undefined) noteOff(midi)
  }
  onMount(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  })
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  })
}

type MidiInputLike = {
  id: string
  name?: string | null
  onmidimessage?: ((event: { data?: Uint8Array | number[] | null }) => void) | null
}
type MidiAccessLike = {
  inputs: Map<string, MidiInputLike>
  onstatechange?: ((e: unknown) => void) | null
}

const [midiStatus, setMidiStatus] = createSignal<string>('not requested')
export { midiStatus }

/**
 * Requests Web MIDI access on mount and routes incoming note events into the
 * shared state. Updates `midiStatus()` so the UI can show device names.
 */
export function useMidiInput(): void {
  onMount(() => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?(opts?: { sysex?: boolean }): Promise<MidiAccessLike>
    }
    if (typeof nav.requestMIDIAccess !== 'function') {
      setMidiStatus('not supported')
      return
    }
    setMidiStatus('connecting…')
    nav
      .requestMIDIAccess()
      .then((access) => {
        const wire = (): void => {
          const names: string[] = []
          for (const input of access.inputs.values()) {
            input.onmidimessage = (e) => {
              const data = e.data
              if (!data || data.length < 3) return
              const status = data[0] & 0xf0
              const midi = data[1]
              const velocity = data[2]
              if (status === 0x90 && velocity > 0) noteOn(midi, velocity / 127)
              else if (status === 0x80 || (status === 0x90 && velocity === 0)) noteOff(midi)
            }
            if (input.name) names.push(input.name)
          }
          setMidiStatus(names.length ? names.join(', ') : 'no devices')
        }
        wire()
        access.onstatechange = wire
      })
      .catch(() => {
        setMidiStatus('blocked')
      })
  })
}

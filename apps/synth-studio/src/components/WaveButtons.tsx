import { For, type Component, type JSX } from 'solid-js'
import type { Waveform } from '@stopcock/synth'

export type OscWave = Waveform | 'noise'

type IconProps = { kind: OscWave }

const Icon: Component<IconProps> = (props): JSX.Element => {
  switch (props.kind) {
    case 'sine':
      return (
        <svg viewBox="0 0 32 16">
          <path d="M0,8 Q4,0 8,8 T16,8 T24,8 T32,8" />
        </svg>
      )
    case 'saw':
      return (
        <svg viewBox="0 0 32 16">
          <path d="M0,14 L8,2 L8,14 L16,2 L16,14 L24,2 L24,14 L32,2" />
        </svg>
      )
    case 'square':
      return (
        <svg viewBox="0 0 32 16">
          <path d="M0,14 L0,2 L8,2 L8,14 L16,14 L16,2 L24,2 L24,14 L32,14" />
        </svg>
      )
    case 'triangle':
      return (
        <svg viewBox="0 0 32 16">
          <path d="M0,8 L4,2 L12,14 L20,2 L28,14 L32,8" />
        </svg>
      )
    case 'noise':
      return (
        <svg viewBox="0 0 32 16">
          <path d="M0,8 L2,4 L4,12 L6,5 L8,11 L10,3 L12,13 L14,6 L16,10 L18,4 L20,12 L22,7 L24,11 L26,3 L28,13 L30,6 L32,9" />
        </svg>
      )
  }
}

const WAVES: OscWave[] = ['sine', 'saw', 'square', 'triangle', 'noise']

export type WaveButtonsProps = {
  current: OscWave
  onSelect(wave: OscWave): void
}

export const WaveButtons: Component<WaveButtonsProps> = (props) => (
  <div class="waveforms">
    <For each={WAVES}>
      {(w) => (
        <button
          type="button"
          class={'wave-btn' + (props.current === w ? ' active' : '')}
          onClick={() => props.onSelect(w)}
        >
          <Icon kind={w} />
        </button>
      )}
    </For>
  </div>
)

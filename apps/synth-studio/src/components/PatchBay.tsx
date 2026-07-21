import { For, type Component } from 'solid-js'
import { setRouting, state } from '../state'
import type { RackState } from '../engine'

type JackKey = keyof RackState['routing']

type JackDef = {
  key: JackKey
  label: string
  locked?: boolean
}

const JACKS: ReadonlyArray<JackDef> = [
  { key: 'osc-flt', label: 'OSC → FLT' },
  { key: 'env-amp', label: 'ENV → AMP' },
  { key: 'env-flt', label: 'ENV → FLT' },
  { key: 'lfo-pitch', label: 'LFO → PITCH' },
  { key: 'lfo-flt', label: 'LFO → FLT' },
  { key: 'lfo-amp', label: 'LFO → AMP' },
  { key: 'master', label: 'MASTER', locked: true },
]

export const PatchBay: Component = () => (
  <div class="patch-bar">
    <span class="patch-label">Routing</span>
    <For each={JACKS}>
      {(jack) => (
        <div
          class="jack"
          onClick={() => {
            if (!jack.locked) setRouting(jack.key, !state.routing[jack.key])
          }}
        >
          <div
            class={
              'jack-port' +
              (state.routing[jack.key] ? ' connected' : '') +
              (jack.locked ? ' locked' : '')
            }
          />
          <span class="jack-label">{jack.label}</span>
        </div>
      )}
    </For>
  </div>
)

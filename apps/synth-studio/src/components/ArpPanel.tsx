import { createMemo, For, type Component } from 'solid-js'
import { activeArpNotes, activeNotes, latchedNotes, setArpEnabled, setArpParam, state } from '../state'
import { midiNoteName, type ArpMode, type ArpRate } from '../arp'
import { Module } from './Module'
import { Segments } from './Segments'
import { Knob } from './Knob'

const MODE_OPTIONS = [
  { value: 'up', label: 'UP' },
  { value: 'down', label: 'DOWN' },
  { value: 'upDown', label: 'UP DN' },
  { value: 'asPlayed', label: 'PLAYED' },
  { value: 'random', label: 'RAND' },
  { value: 'chord', label: 'CHORD' },
] as const satisfies ReadonlyArray<{ value: ArpMode; label: string }>

const RATE_OPTIONS = [
  { value: '1/4', label: '1/4' },
  { value: '1/8', label: '1/8' },
  { value: '1/8t', label: '1/8T' },
  { value: '1/16', label: '1/16' },
  { value: '1/16t', label: '1/16T' },
  { value: '1/32', label: '1/32' },
] as const satisfies ReadonlyArray<{ value: ArpRate; label: string }>

export const ArpPanel: Component = () => {
  const pool = createMemo(() => Array.from(state.arp.latch ? latchedNotes() : activeNotes()))
  const playing = createMemo(() => Array.from(activeArpNotes()))
  const poolNames = createMemo(() => pool().map(midiNoteName).join(' '))
  const playingNames = createMemo(() => playing().map(midiNoteName).join(' '))

  return (
    <section class="arp-rack" aria-label="Arpeggiator">
      <Module
        slotId="E —"
        name="ARP.01 ▸ Arpeggiator"
        class="arp-module"
        bypass={{
          on: state.arp.enabled,
          onToggle: () => setArpEnabled(!state.arp.enabled),
        }}
      >
        <div class="arp-layout">
          <div class="arp-group">
            <div class="arp-group-title">Order</div>
            <Segments
              class="seg-6 seg-tight"
              current={state.arp.mode}
              options={MODE_OPTIONS}
              onSelect={(mode) => setArpParam('mode', mode)}
            />
          </div>

          <div class="arp-group">
            <div class="arp-group-title">Clock</div>
            <Segments
              class="seg-6 seg-tight"
              current={state.arp.rate}
              options={RATE_OPTIONS}
              onSelect={(rate) => setArpParam('rate', rate)}
            />
          </div>

          <div class="arp-switches">
            <button
              type="button"
              class={'arp-toggle' + (state.arp.latch ? ' on' : '')}
              onClick={() => setArpParam('latch', !state.arp.latch)}
            >
              Latch
            </button>
            <div class="arp-readout">
              <span>In <strong>{pool().length}</strong></span>
              <span>Play <strong>{playingNames() || '—'}</strong></span>
            </div>
          </div>

          <div class="knob-row cols-5 arp-knobs">
            <Knob
              label="BPM"
              value={state.arp.bpm}
              min={40}
              max={220}
              formatValue={(v) => Math.round(v).toString()}
              onChange={(v) => setArpParam('bpm', Math.round(v))}
            />
            <Knob
              label="OCT"
              value={state.arp.octaves}
              min={1}
              max={4}
              formatValue={(v) => Math.round(v).toString()}
              onChange={(v) => setArpParam('octaves', Math.round(v))}
            />
            <Knob
              label="GATE"
              value={state.arp.gate * 100}
              min={5}
              max={100}
              unit="%"
              onChange={(v) => setArpParam('gate', v / 100)}
            />
            <Knob
              label="SWING"
              value={state.arp.swing * 100}
              min={0}
              max={75}
              unit="%"
              onChange={(v) => setArpParam('swing', v / 100)}
            />
            <Knob
              label="VEL"
              value={state.arp.velocity * 100}
              min={5}
              max={100}
              unit="%"
              onChange={(v) => setArpParam('velocity', v / 100)}
            />
          </div>

          <div class="arp-note-list" aria-label="Arpeggiator input notes">
            <For each={pool()}>{(midi) => (
              <span class={activeArpNotes().has(midi) ? 'active' : ''}>{midiNoteName(midi)}</span>
            )}</For>
            {poolNames() === '' && <span>—</span>}
          </div>
        </div>
      </Module>
    </section>
  )
}

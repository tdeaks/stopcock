import { createSignal, type Component } from 'solid-js'
import { Module, SwapMenu, type SwapOption } from './Module'
import { Knob } from './Knob'
import { Segments } from './Segments'
import { WaveButtons, type OscWave } from './WaveButtons'
import { EnvelopeViz } from './EnvelopeViz'
import { LfoViz } from './LfoViz'
import { setState, state } from '../state'
import type { EnvEngine, FltEngine, FltMode, LfoEngine, OscEngine } from '../engine'

const OSC_ENGINES: ReadonlyArray<SwapOption<OscEngine>> = [
  { value: 'wavetable', label: 'Wavetable', tag: 'OSC' },
  { value: 'fm', label: 'FM Operator', tag: 'FM' },
  { value: 'noise', label: 'Noise Source', tag: 'NSE' },
  { value: 'acid', label: 'Acid Bass', tag: '303' },
  { value: 'poly', label: 'Poly Stack', tag: 'PLY' },
]
const FLT_ENGINES: ReadonlyArray<SwapOption<FltEngine>> = [
  { value: 'ladder', label: 'Ladder', tag: 'FLT' },
  { value: 'svf', label: 'State Variable', tag: 'SVF' },
  { value: 'comb', label: 'Comb', tag: 'CMB' },
  { value: 'formant', label: 'Formant', tag: 'FRM' },
]
const ENV_ENGINES: ReadonlyArray<SwapOption<EnvEngine>> = [
  { value: 'adsr', label: 'ADSR', tag: 'ENV' },
  { value: 'ar', label: 'AR (Snap)', tag: 'AR' },
  { value: 'looping', label: 'Looping', tag: 'LPE' },
]
const LFO_ENGINES: ReadonlyArray<SwapOption<LfoEngine>> = [
  { value: 'sine', label: 'Sine LFO', tag: 'LFO' },
  { value: 'tri', label: 'Triangle', tag: 'TRI' },
  { value: 'sh', label: 'Sample & Hold', tag: 'S&H' },
  { value: 'square', label: 'Square', tag: 'SQR' },
]

const FLT_MODES = [
  { value: 'lp', label: 'LP' },
  { value: 'hp', label: 'HP' },
  { value: 'bp', label: 'BP' },
  { value: 'notch', label: 'NTC' },
] as const satisfies ReadonlyArray<{ value: FltMode; label: string }>

const moduleName = <T extends string>(
  opts: ReadonlyArray<SwapOption<T>>,
  current: T,
  fallbackTag: string,
): string => {
  const opt = opts.find((o) => o.value === current)
  return opt ? `${opt.tag}.01 ▸ ${opt.label}` : `${fallbackTag}.01 ▸ ?`
}

export const VoiceRack: Component = () => {
  const [oscSwap, setOscSwap] = createSignal(false)
  const [fltSwap, setFltSwap] = createSignal(false)
  const [envSwap, setEnvSwap] = createSignal(false)
  const [lfoSwap, setLfoSwap] = createSignal(false)

  return (
    <section class="rack" aria-label="Voice rack">
      <Module
        slotId="A —"
        name={moduleName(OSC_ENGINES, state.osc.engine, 'OSC')}
        swap={{
          open: oscSwap(),
          toggle: () => setOscSwap((o) => !o),
          menu: (
            <SwapMenu
              open={oscSwap()}
              current={state.osc.engine}
              options={OSC_ENGINES}
              onSelect={(v) => setState('osc', 'engine', v)}
              onRequestClose={() => setOscSwap(false)}
            />
          ),
        }}
      >
        <WaveButtons
          current={state.osc.wave}
          onSelect={(w) => setState('osc', 'wave', w as OscWave)}
        />
        <div class="knob-row cols-4">
          <Knob
            label="TUNE"
            value={state.osc.tune}
            min={-24}
            max={24}
            unit="st"
            onChange={(v) => setState('osc', 'tune', v)}
          />
          <Knob
            label="FINE"
            value={state.osc.fine}
            min={-100}
            max={100}
            unit="¢"
            onChange={(v) => setState('osc', 'fine', v)}
          />
          <Knob
            label="LEVEL"
            value={state.osc.level * 100}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => setState('osc', 'level', v / 100)}
          />
          <Knob
            label="UNISON"
            value={state.osc.detune * 100}
            min={0}
            max={100}
            onChange={(v) => setState('osc', 'detune', v / 100)}
          />
        </div>
      </Module>

      <Module
        slotId="B —"
        name={moduleName(FLT_ENGINES, state.flt.engine, 'FLT')}
        swap={{
          open: fltSwap(),
          toggle: () => setFltSwap((o) => !o),
          menu: (
            <SwapMenu
              open={fltSwap()}
              current={state.flt.engine}
              options={FLT_ENGINES}
              onSelect={(v) => setState('flt', 'engine', v)}
              onRequestClose={() => setFltSwap(false)}
            />
          ),
        }}
      >
        <Segments
          current={state.flt.mode}
          options={FLT_MODES}
          onSelect={(m) => setState('flt', 'mode', m)}
        />
        <div class="knob-row cols-4">
          <Knob
            label="CUTOFF"
            value={state.flt.cutoff}
            min={40}
            max={14000}
            unit="Hz"
            log
            onChange={(v) => setState('flt', 'cutoff', v)}
          />
          <Knob
            label="RES"
            value={state.flt.res * 100}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => setState('flt', 'res', v / 100)}
          />
          <Knob
            label="DRIVE"
            value={state.flt.drive * 100}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => setState('flt', 'drive', v / 100)}
          />
          <Knob
            label="KEY"
            value={state.flt.key * 100}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => setState('flt', 'key', v / 100)}
          />
        </div>
      </Module>

      <Module
        slotId="C —"
        name={moduleName(ENV_ENGINES, state.env.engine, 'ENV')}
        swap={{
          open: envSwap(),
          toggle: () => setEnvSwap((o) => !o),
          menu: (
            <SwapMenu
              open={envSwap()}
              current={state.env.engine}
              options={ENV_ENGINES}
              onSelect={(v) => setState('env', 'engine', v)}
              onRequestClose={() => setEnvSwap(false)}
            />
          ),
        }}
      >
        <EnvelopeViz
          attack={state.env.atk}
          decay={state.env.dec}
          sustain={state.env.sus}
          release={state.env.rel}
        />
        <div class="knob-row cols-4">
          <Knob
            label="ATK"
            value={state.env.atk * 1000}
            min={0}
            max={2000}
            unit="ms"
            log
            onChange={(v) => setState('env', 'atk', v / 1000)}
          />
          <Knob
            label="DEC"
            value={state.env.dec * 1000}
            min={0}
            max={2000}
            unit="ms"
            log
            onChange={(v) => setState('env', 'dec', v / 1000)}
          />
          <Knob
            label="SUS"
            value={state.env.sus * 100}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => setState('env', 'sus', v / 100)}
          />
          <Knob
            label="REL"
            value={state.env.rel * 1000}
            min={0}
            max={3000}
            unit="ms"
            log
            onChange={(v) => setState('env', 'rel', v / 1000)}
          />
        </div>
      </Module>

      <Module
        slotId="D —"
        name={moduleName(LFO_ENGINES, state.lfo.engine, 'LFO')}
        swap={{
          open: lfoSwap(),
          toggle: () => setLfoSwap((o) => !o),
          menu: (
            <SwapMenu
              open={lfoSwap()}
              current={state.lfo.engine}
              options={LFO_ENGINES}
              onSelect={(v) => setState('lfo', 'engine', v)}
              onRequestClose={() => setLfoSwap(false)}
            />
          ),
        }}
      >
        <LfoViz
          shape={state.lfo.engine}
          rate={state.lfo.rate}
          depth={state.lfo.depth}
          phase={state.lfo.phase}
        />
        <div class="knob-row cols-3">
          <Knob
            label="RATE"
            value={state.lfo.rate}
            min={0.05}
            max={20}
            unit="Hz"
            log
            onChange={(v) => setState('lfo', 'rate', v)}
          />
          <Knob
            label="DEPTH"
            value={state.lfo.depth * 100}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => setState('lfo', 'depth', v / 100)}
          />
          <Knob
            label="PHASE"
            value={state.lfo.phase}
            min={0}
            max={360}
            unit="°"
            onChange={(v) => setState('lfo', 'phase', v)}
          />
        </div>
      </Module>
    </section>
  )
}

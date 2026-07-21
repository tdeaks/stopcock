import { For, Show, createMemo, createSignal, type Component } from 'solid-js'
import { Module, SwapMenu, type SwapOption } from './Module'
import { Knob } from './Knob'
import { state, swapFxKind, setFxParam, toggleFxBypass, moveFxSlot } from '../state'
import { fxCatalog, fxCategories, fxKinds, isEnumSpec, type FxKind, type FxParamSpec } from '../fx'

const swapOptions: ReadonlyArray<SwapOption<FxKind>> = fxKinds.map((kind) => ({
  value: kind,
  label: fxCatalog[kind].label,
  tag: fxCatalog[kind].tag,
  group: fxCatalog[kind].category,
}))

const swapGroups = fxCategories.map((c) => ({ key: c.key, label: c.label }))

type SelectorOption = { value: string; label: string }
type SelectorProps = {
  label: string
  value: number
  options: ReadonlyArray<SelectorOption>
  onChange: (index: number) => void
}

const Selector: Component<SelectorProps> = (props) => {
  const safeIndex = createMemo(() => {
    const n = props.options.length
    if (n === 0) return 0
    return ((props.value % n) + n) % n
  })
  const step = (delta: number): void => {
    const n = props.options.length
    if (n === 0) return
    props.onChange((safeIndex() + delta + n) % n)
  }
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    step(e.deltaY < 0 ? 1 : -1)
  }
  return (
    <div class="knob">
      <div class="knob-dial selector-dial" onWheel={onWheel} role="group" aria-label={props.label}>
        <button type="button" class="selector-step" aria-label="Previous" onClick={() => step(-1)}>
          ‹
        </button>
        <div class="selector-value">{props.options[safeIndex()]?.label ?? '—'}</div>
        <button type="button" class="selector-step" aria-label="Next" onClick={() => step(1)}>
          ›
        </button>
      </div>
      <div class="knob-label">{props.label}</div>
      <div class="knob-value">
        {safeIndex() + 1}/{props.options.length}
      </div>
    </div>
  )
}

type RowChunk = ReadonlyArray<FxParamSpec>

const chunkParams = (params: ReadonlyArray<FxParamSpec>): ReadonlyArray<RowChunk> => {
  if (params.length === 0) return []
  const out: RowChunk[] = []
  for (let i = 0; i < params.length; i += 4) out.push(params.slice(i, i + 4))
  return out
}

const FxSlot: Component<{ index: number }> = (props) => {
  const slot = createMemo(() => state.fx[props.index])
  const def = createMemo(() => fxCatalog[slot().kind])
  const [open, setOpen] = createSignal(false)
  const cols = createMemo(() => (def().params.length <= 4 ? def().params.length : 4))

  const onDragStart = (e: DragEvent): void => {
    if (!e.dataTransfer) return
    e.dataTransfer.setData('text/plain', String(props.index))
    e.dataTransfer.effectAllowed = 'move'
    const target = (e.currentTarget as HTMLElement).closest('.fx-slot')
    if (target) e.dataTransfer.setDragImage(target, 60, 20)
  }

  const onDragOver = (e: DragEvent): void => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('drag-over')
  }
  const onDragLeave = (e: DragEvent): void => {
    ;(e.currentTarget as HTMLElement).classList.remove('drag-over')
  }
  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).classList.remove('drag-over')
    const raw = e.dataTransfer?.getData('text/plain')
    const from = raw ? Number(raw) : Number.NaN
    if (Number.isFinite(from)) moveFxSlot(from, props.index)
  }

  return (
    <Module
      slotId={`FX${props.index + 1} —`}
      name={`${def().tag}.0${props.index + 1} ▸ ${def().label}`}
      class={'fx-slot' + (slot().kind === 'none' ? ' empty' : '')}
      draggable={true}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      bypass={
        slot().kind === 'none'
          ? undefined
          : {
              on: slot().enabled,
              onToggle: () => toggleFxBypass(props.index),
            }
      }
      swap={{
        open: open(),
        toggle: () => setOpen((o) => !o),
        menu: (
          <SwapMenu
            open={open()}
            current={slot().kind}
            options={swapOptions}
            groups={swapGroups}
            onSelect={(kind) => swapFxKind(props.index, kind)}
            onRequestClose={() => setOpen(false)}
          />
        ),
      }}
    >
      <Show
        when={slot().kind !== 'none'}
        fallback={<div class="fx-empty-placeholder">tap SWAP to pick an effect</div>}
      >
        <For each={chunkParams(def().params)}>
          {(row) => (
            <div class={`knob-row cols-${cols()}`}>
              <For each={row}>
                {(spec) =>
                  isEnumSpec(spec) ? (
                    <Selector
                      label={spec.label}
                      value={Math.round(slot().params[spec.id] ?? spec.value)}
                      options={spec.options}
                      onChange={(i) => setFxParam(props.index, spec.id, i)}
                    />
                  ) : (
                    <Knob
                      label={spec.label}
                      value={slot().params[spec.id] ?? spec.value}
                      min={spec.min}
                      max={spec.max}
                      log={spec.log}
                      unit={spec.unit}
                      onChange={(v) => setFxParam(props.index, spec.id, v)}
                    />
                  )
                }
              </For>
            </div>
          )}
        </For>
      </Show>
    </Module>
  )
}

export const FxRack: Component = () => (
  <section class="rack rack-fx" id="fx-rack" aria-label="Effects rack">
    <For each={[0, 1, 2, 3]}>{(i) => <FxSlot index={i} />}</For>
  </section>
)

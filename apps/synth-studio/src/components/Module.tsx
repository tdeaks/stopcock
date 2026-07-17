import { For, Show, type Component, type JSX } from 'solid-js'

/**
 * One option in a SwapMenu. The value is opaque to the menu — the consumer
 * provides whatever discriminator type makes sense.
 */
export type SwapOption<T extends string> = {
  value: T
  label: string
  tag: string
  group?: string
}

export type SwapMenuProps<T extends string> = {
  open: boolean
  current: T
  options: ReadonlyArray<SwapOption<T>>
  /** Optional category order. If omitted, options render in given order without headers. */
  groups?: ReadonlyArray<{ key: string; label: string }>
  onSelect(value: T): void
  onRequestClose(): void
}

export function SwapMenu<T extends string>(props: SwapMenuProps<T>): JSX.Element {
  const groups = (): Array<{ key: string; label: string; items: ReadonlyArray<SwapOption<T>> }> => {
    if (!props.groups) return [{ key: '_', label: '', items: props.options }]
    return props.groups.map(g => ({
      key: g.key,
      label: g.label,
      items: props.options.filter(o => o.group === g.key),
    })).filter(g => g.items.length > 0)
  }
  return (
    <div class={'swap-menu' + (props.open ? ' open' : '')} onClick={e => e.stopPropagation()}>
      <For each={groups()}>{(group) => (
        <>
          <Show when={group.label !== ''}>
            <div class="swap-section">{group.label}</div>
          </Show>
          <For each={group.items}>{(opt) => (
            <div
              class={'swap-option' + (opt.value === props.current ? ' active' : '')}
              onClick={() => { props.onSelect(opt.value); props.onRequestClose() }}
            >
              {opt.label}
              <span class="opt-tag">{opt.tag}</span>
            </div>
          )}</For>
        </>
      )}</For>
    </div>
  )
}

/**
 * The visual shell of a rack module: header (slot id + name + optional bypass + optional swap),
 * and a body where the consumer puts knobs/visuals. Also handles drag-from-header behavior
 * when `onDragStart` is provided.
 */
export type ModuleProps = {
  slotId: string
  name: string
  bypass?: { on: boolean; onToggle(): void }
  swap?: { open: boolean; toggle(): void; menu: JSX.Element }
  draggable?: boolean
  onDragStart?(e: DragEvent): void
  onDragEnd?(e: DragEvent): void
  onDragOver?(e: DragEvent): void
  onDragLeave?(e: DragEvent): void
  onDrop?(e: DragEvent): void
  class?: string
  children: JSX.Element
}

export const Module: Component<ModuleProps> = (props) => {
  return (
    <article
      class={'module' + (props.class ? ' ' + props.class : '')}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
    >
      <div
        class="module-header"
        draggable={props.draggable ?? false}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
      >
        <div class="module-title">
          <span class="module-id">{props.slotId}</span>
          <span class="module-name">{props.name}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <Show when={props.bypass}>{(b) => (
            <button
              type="button"
              class={'fx-bypass' + (b().on ? ' on' : '')}
              onClick={() => b().onToggle()}
            >ON</button>
          )}</Show>
          <Show when={props.swap}>{(s) => (
            <button
              type="button"
              class="swap-btn"
              onClick={(e) => { e.stopPropagation(); s().toggle() }}
            >
              SWAP
              {s().menu}
            </button>
          )}</Show>
        </div>
      </div>
      <div class="module-body">
        {props.children}
      </div>
    </article>
  )
}

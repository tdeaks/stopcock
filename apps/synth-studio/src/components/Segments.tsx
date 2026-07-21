import { For, type Component, type JSX } from 'solid-js'

export type SegmentOption<T extends string> = {
  value: T
  label: string
  /** Optional inline SVG icon. */
  icon?: JSX.Element
}

export type SegmentsProps<T extends string> = {
  current: T
  options: ReadonlyArray<SegmentOption<T>>
  onSelect(value: T): void
  class?: string
}

/**
 * Generic segmented button group. Used for filter modes, wave selectors, etc.
 */
export function Segments<T extends string>(props: SegmentsProps<T>): JSX.Element {
  return (
    <div class={'seg' + (props.class ? ' ' + props.class : '')}>
      <For each={props.options}>
        {(opt) => (
          <button
            type="button"
            class={opt.value === props.current ? 'active' : ''}
            data-value={opt.value}
            onClick={() => props.onSelect(opt.value)}
          >
            {opt.icon ?? opt.label}
          </button>
        )}
      </For>
    </div>
  )
}

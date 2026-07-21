import { createMemo, type Component } from 'solid-js'

/**
 * Generic continuous control. Drag up to increase, wheel adjusts in small steps,
 * double-click resets to centre. Values are passed through `value`/`onChange` —
 * the knob holds no state.
 */
export type KnobProps = {
  label: string
  value: number
  min: number
  max: number
  log?: boolean
  unit?: string
  formatValue?: (raw: number) => string
  onChange: (raw: number) => void
}

const CIRCUMFERENCE = 2 * Math.PI * 26
const ARC_SPAN = CIRCUMFERENCE * 0.75

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

const valueToNormalized = (raw: number, min: number, max: number, log: boolean): number => {
  if (log) {
    const safeMin = Math.max(min, 1e-6)
    return clamp01(
      (Math.log(Math.max(raw, safeMin)) - Math.log(safeMin)) / (Math.log(max) - Math.log(safeMin)),
    )
  }
  return clamp01((raw - min) / (max - min))
}

const normalizedToValue = (n: number, min: number, max: number, log: boolean): number => {
  if (log) {
    const safeMin = Math.max(min, 1e-6)
    return Math.exp(Math.log(safeMin) + n * (Math.log(max) - Math.log(safeMin)))
  }
  return min + n * (max - min)
}

const defaultFormat = (raw: number, unit?: string): string => {
  const abs = Math.abs(raw)
  let s: string
  if (abs >= 1000) s = (raw / 1000).toFixed(2) + ' k'
  else if (abs >= 100) s = raw.toFixed(0)
  else if (abs >= 10) s = raw.toFixed(1)
  else s = raw.toFixed(2)
  return unit ? `${s} ${unit}` : s
}

export const Knob: Component<KnobProps> = (props) => {
  const normalized = createMemo(() =>
    valueToNormalized(props.value, props.min, props.max, props.log ?? false),
  )
  const dashOffset = createMemo(() => CIRCUMFERENCE - ARC_SPAN * normalized())
  const indicatorAngle = createMemo(() => -135 + normalized() * 270)
  const displayed = createMemo(() =>
    props.formatValue ? props.formatValue(props.value) : defaultFormat(props.value, props.unit),
  )

  const emit = (next01: number): void => {
    props.onChange(normalizedToValue(clamp01(next01), props.min, props.max, props.log ?? false))
  }

  const onMouseDown = (e: MouseEvent): void => {
    e.preventDefault()
    const startY = e.clientY
    const startNorm = normalized()
    const onMove = (m: MouseEvent): void => {
      emit(startNorm + (startY - m.clientY) / 200)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'ns-resize'
  }

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    emit(normalized() + (e.deltaY < 0 ? 0.02 : -0.02))
  }

  const onDoubleClick = (): void => {
    const isBipolar = props.min < 0
    emit(isBipolar ? 0.5 : 0.5)
  }

  return (
    <div class="knob">
      <div class="knob-dial" onMouseDown={onMouseDown} onWheel={onWheel} onDblClick={onDoubleClick}>
        <svg viewBox="0 0 60 60">
          <circle
            class="knob-track"
            cx="30"
            cy="30"
            r="26"
            stroke-dasharray={ARC_SPAN.toFixed(2)}
            stroke-dashoffset="0"
            transform="rotate(135 30 30)"
          />
          <circle
            class="knob-arc"
            cx="30"
            cy="30"
            r="26"
            stroke-dasharray={CIRCUMFERENCE.toFixed(2)}
            stroke-dashoffset={dashOffset().toFixed(2)}
            transform="rotate(135 30 30)"
          />
          <circle class="knob-cap" cx="30" cy="30" r="20" />
          <circle class="knob-cap-inner" cx="30" cy="30" r="16" />
          <line
            class="knob-indicator"
            x1="30"
            y1="16"
            x2="30"
            y2="22"
            transform={`rotate(${indicatorAngle().toFixed(2)} 30 30)`}
          />
        </svg>
      </div>
      <div class="knob-label">{props.label}</div>
      <div class="knob-value">{displayed()}</div>
    </div>
  )
}

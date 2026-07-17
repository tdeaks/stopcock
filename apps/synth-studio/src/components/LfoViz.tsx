import { createMemo, type Component } from 'solid-js'

export type LfoShape = 'sine' | 'tri' | 'sh' | 'square'

export type LfoVizProps = {
  shape: LfoShape
  rate: number
  /** Depth 0..1 */
  depth: number
  /** Phase in degrees */
  phase: number
}

const SAMPLES = 100

export const LfoViz: Component<LfoVizProps> = (props) => {
  const path = createMemo(() => {
    const cycles = Math.max(1, Math.min(8, props.rate))
    let d = ''
    for (let i = 0; i < SAMPLES; i++) {
      const phase = (i / SAMPLES) * Math.PI * 2 * cycles + (props.phase / 360) * Math.PI * 2
      let y: number
      switch (props.shape) {
        case 'tri':    y = (2 / Math.PI) * Math.asin(Math.sin(phase)); break
        case 'square': y = Math.sin(phase) >= 0 ? 1 : -1; break
        case 'sh':     y = Math.sin(Math.floor(phase / Math.PI) * 1.61803); break
        case 'sine':
        default:       y = Math.sin(phase)
      }
      const yPos = 30 - y * 22 * props.depth
      d += (i === 0 ? 'M' : 'L') + ((i / (SAMPLES - 1)) * 200).toFixed(1) + ',' + yPos.toFixed(1) + ' '
    }
    return d
  })

  return (
    <div class="lfo-shape">
      <svg viewBox="0 0 200 60" preserveAspectRatio="none">
        <path
          d={path()}
          stroke="var(--signal)"
          stroke-width="1.4"
          fill="none"
          stroke-linejoin="round"
          style={{ filter: 'drop-shadow(0 0 4px rgba(125, 211, 168, 0.4))' }}
        />
      </svg>
    </div>
  )
}

import { createMemo, type Component } from 'solid-js'

export type EnvelopeVizProps = {
  /** Attack in seconds */
  attack: number
  /** Decay in seconds */
  decay: number
  /** Sustain level, 0..1 */
  sustain: number
  /** Release in seconds */
  release: number
}

/**
 * Renders the canonical ADSR shape scaled to fit the viz box. Time-scale is
 * approximate — long envelopes compress horizontally so the shape is always
 * legible.
 */
export const EnvelopeViz: Component<EnvelopeVizProps> = (props) => {
  const path = createMemo(() => {
    const ms = (s: number): number => s * 1000
    const SUSTAIN_HOLD_MS = 600
    const totalMs = ms(props.attack) + ms(props.decay) + SUSTAIN_HOLD_MS + ms(props.release)
    const scale = 196 / Math.max(400, totalMs)
    const atkX = ms(props.attack) * scale
    const decX = atkX + ms(props.decay) * scale
    const susY = 8 + (1 - props.sustain) * 64
    const susX = decX + SUSTAIN_HOLD_MS * scale
    const relX = Math.min(196, susX + ms(props.release) * scale)
    return {
      stroke: `M0,72 L${atkX.toFixed(1)},8 L${decX.toFixed(1)},${susY.toFixed(1)} L${susX.toFixed(1)},${susY.toFixed(1)} L${relX.toFixed(1)},72`,
      fill: `M0,72 L${atkX.toFixed(1)},8 L${decX.toFixed(1)},${susY.toFixed(1)} L${susX.toFixed(1)},${susY.toFixed(1)} L${relX.toFixed(1)},72 L${relX.toFixed(1)},76 L0,76 Z`,
    }
  })

  return (
    <div class="adsr-viz">
      <svg viewBox="0 0 200 76" preserveAspectRatio="none">
        <path
          d={path().stroke}
          stroke="var(--accent)"
          stroke-width="1.6"
          fill="none"
          stroke-linejoin="round"
          style={{ filter: 'drop-shadow(0 0 4px var(--accent-glow))' }}
        />
        <path d={path().fill} fill="var(--accent)" opacity="0.08" />
      </svg>
    </div>
  )
}

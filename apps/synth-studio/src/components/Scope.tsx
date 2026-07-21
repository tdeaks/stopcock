import { onCleanup, onMount, type Component } from 'solid-js'
import { registerScope } from '../visualizer'

/**
 * Hands its <path> element to the visualizer singleton on mount; the rAF loop
 * updates the `d` attribute directly. No props, no reactive subscription.
 */
export const Scope: Component = () => {
  let pathEl!: SVGPathElement

  onMount(() => {
    onCleanup(registerScope(pathEl))
  })

  return (
    <div class="viz">
      <div class="viz-header">
        <span class="viz-title">Oscilloscope</span>
        <span class="viz-meta">5 ms/DIV · TRIG: AUTO</span>
      </div>
      <div class="viz-body">
        <div class="osc-canvas">
          <div class="osc-grid-overlay" />
          <svg viewBox="0 0 400 130" preserveAspectRatio="none">
            <path ref={pathEl} class="osc-trace" d="M0,65 L400,65" />
          </svg>
        </div>
        <div class="osc-axis">
          <span>−25 ms</span>
          <span>0</span>
          <span>+25 ms</span>
        </div>
      </div>
    </div>
  )
}

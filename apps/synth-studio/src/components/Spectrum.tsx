import { For, onCleanup, onMount, type Component } from 'solid-js'
import { registerSpectrum, SPECTRUM_BAR_COUNT } from '../visualizer'

const AXIS_LABELS = ['20', '50', '100', '250', '500', '1k', '2.5k', '5k', '10k', '20k'] as const

/**
 * Pure visual shell. Hands its bar DOM nodes to the visualizer singleton on
 * mount so the rAF loop can mutate `style.height` directly. No props, no
 * reactive subscription — animation runs outside Solid's reactive graph.
 */
export const Spectrum: Component = () => {
  const bars: HTMLElement[] = new Array(SPECTRUM_BAR_COUNT)

  onMount(() => {
    onCleanup(registerSpectrum(bars))
  })

  return (
    <div class="viz">
      <div class="viz-header">
        <span class="viz-title">Frequency Analyser</span>
        <span class="viz-meta">FFT 2048 · WINDOW: HANN · −90 dB</span>
      </div>
      <div class="viz-body">
        <div class="spectrum">
          <For each={Array.from({ length: SPECTRUM_BAR_COUNT }, (_, i) => i)}>
            {(i) => (
              <div
                class="spectrum-bar"
                ref={(el) => {
                  bars[i] = el
                }}
                style="height:2%"
              />
            )}
          </For>
        </div>
        <div class="spectrum-axis">
          {AXIS_LABELS.map((l) => (
            <span>{l}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

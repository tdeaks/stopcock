import { type Component } from 'solid-js'
import { engine } from '../state'

export const Footer: Component = () => (
  <footer class="footer">
    <div class="footer-meta">
      <span>
        BUILD<strong>0.2.0 · DEV</strong>
      </span>
      <span>
        ENGINE<strong>@stopcock/synth · AudioWorklet</strong>
      </span>
      <span>
        LATENCY
        <strong>{engine() ? (engine()!.ctx.baseLatency * 1000).toFixed(2) + ' ms' : '— ms'}</strong>
      </span>
      <span>
        STATE<strong>{engine() ? 'running' : 'idle'}</strong>
      </span>
    </div>
    <div class="colophon">An instrument, written carefully.</div>
  </footer>
)

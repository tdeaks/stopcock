import { describe, expect, it } from 'vitest'
import { MAX_WORKLET_FRAMES, wasmProcessorBody } from '../render/worklet-processor'

describe('WASM worklet processor source', () => {
  it('embeds parameter descriptors and the runtime frame cap', () => {
    const body = wasmProcessorBody([
      { name: 'node0_amount', defaultValue: 0, automationRate: 'a-rate' },
    ])

    expect(body).toContain('"node0_amount"')
    expect(body).toContain(`const MAX_FRAMES = ${MAX_WORKLET_FRAMES};`)
    expect(body).toContain('stopcock_synth_runtime_process_mixed_direct')
    expect(body).toContain('stopcock_synth_runtime_output_left_ptr')
    expect(() => new Function('AudioWorkletProcessor', body)(class {})).not.toThrow()
  })
})

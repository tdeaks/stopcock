import puppeteer from 'puppeteer'

const url = process.env.SYNTH_SMOKE_URL ?? 'http://127.0.0.1:4321/libraries/synth/'
const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
})

try {
  const page = await browser.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[browser] ${message.text()}`)
  })

  await page.evaluateOnNewDocument(() => {
    const smoke = {
      errors: [],
      nodes: [],
      workletSources: [],
    }
    Object.defineProperty(window, '__synthWasmSmoke', {
      configurable: true,
      value: smoke,
    })

    const originalCreateObjectURL = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (value) => {
      if (value && typeof value.text === 'function') {
        void value.text().then((source) => {
          if (!source.includes('StopcockSynthProcessor')) return
          smoke.workletSources.push({
            bytes: source.length,
            hasDirectRuntime: source.includes('stopcock_synth_runtime_process_direct')
              && source.includes('stopcock_synth_runtime_process_mixed_direct')
              && source.includes('stopcock_synth_runtime_output_left_ptr')
              && source.includes('stopcock_synth_runtime_output_right_ptr'),
            hasMixedRuntime: source.includes('stopcock_synth_runtime_process_mixed'),
            hasRuntimeProcess: source.includes('stopcock_synth_runtime_process'),
            hasWasmInstance: source.includes('WebAssembly.Instance'),
            noJsDspKernel: !source.includes('samplePolyblep'),
          })
        }).catch((error) => {
          smoke.errors.push(`blob:${error?.message ?? String(error)}`)
        })
      }
      return originalCreateObjectURL(value)
    }

    const OriginalAudioWorkletNode = window.AudioWorkletNode
    if (OriginalAudioWorkletNode) {
      const InstrumentedAudioWorkletNode = class extends OriginalAudioWorkletNode {
        constructor(ctx, name, options) {
          const processorOptions = options?.processorOptions ?? {}
          const wasmGraph = processorOptions.wasmGraph
          const wasmBytes = processorOptions.wasmBytes
          smoke.nodes.push({
            graphBytes: wasmGraph?.byteLength ?? wasmGraph?.length ?? 0,
            hasWasmBase64: typeof processorOptions.wasmBase64 === 'string' && processorOptions.wasmBase64.length > 0,
            hasWasmBytes: wasmBytes instanceof Uint8Array && wasmBytes.byteLength > 0,
            inputChannels: processorOptions.wasmInputChannels ?? 0,
            name,
            paramCount: processorOptions.wasmParamNames?.length ?? 0,
            wasmBase64Length: processorOptions.wasmBase64?.length ?? 0,
            wasmBytesLength: wasmBytes?.byteLength ?? 0,
          })
          super(ctx, name, options)
        }
      }
      Object.defineProperty(window, 'AudioWorkletNode', {
        configurable: true,
        value: InstrumentedAudioWorkletNode,
      })
    } else {
      smoke.errors.push('AudioWorkletNode missing before page load')
    }

    window.addEventListener('error', (event) => {
      smoke.errors.push(`error:${event.message}`)
    })
    window.addEventListener('unhandledrejection', (event) => {
      smoke.errors.push(`rejection:${event.reason?.message ?? String(event.reason)}`)
    })
  })

	  await page.goto(url, { waitUntil: 'networkidle0' })
	  await page.waitForSelector('#synth-demo-play', { timeout: 15_000 })
	  await page.waitForFunction(() => document.querySelector('#synth-demo-status')?.textContent === 'ready', { timeout: 15_000 })
	  const presetState = await page.evaluate(() => {
	    const state = () => ({
	      activePatch: document.querySelector('#synth-demo-patches button.is-active')?.textContent?.trim() ?? '',
	      activeSource: document.querySelector('#synth-demo-sources button.is-active')?.dataset?.value ?? '',
	      chordRows: document.querySelectorAll('.sy-arp-lane.is-chord').length,
	      activeChordCells: document.querySelectorAll('.sy-arp-cell.is-chord.is-active').length,
	    })
	    const clickPreset = (label) => {
	      const button = Array.from(document.querySelectorAll('#synth-demo-patches button'))
	        .find((candidate) => candidate.textContent?.trim() === label)
	      if (!(button instanceof HTMLButtonElement)) throw new Error(`missing preset ${label}`)
	      button.click()
	      return state()
	    }
	    return {
	      acid: clickPreset('Acid Bass'),
	      tape: clickPreset('Tape Echo'),
	    }
	  })
	  if (
	    presetState.acid.activeSource !== 'acid'
	    || presetState.tape.activeSource !== 'poly'
	    || presetState.tape.chordRows < 3
	    || presetState.tape.activeChordCells < 1
	  ) {
	    throw new Error(`unexpected synth preset state: ${JSON.stringify(presetState)}`)
	  }
	  await page.click('#synth-demo-play')
  await page.waitForFunction(() => {
    const smoke = window.__synthWasmSmoke
    const status = document.querySelector('#synth-demo-status')?.textContent
    return status === 'playing worklet'
      && smoke?.workletSources?.some((item) =>
        item.hasWasmInstance
        && item.hasRuntimeProcess
        && item.hasMixedRuntime
        && item.hasDirectRuntime
        && item.noJsDspKernel)
      && smoke?.nodes?.some((item) =>
        item.hasWasmBase64
        && item.hasWasmBytes
        && item.wasmBase64Length > 1024
        && item.wasmBytesLength > 1024
        && item.graphBytes > 0
        && item.paramCount > 0)
  }, { timeout: 20_000 })

  const result = await page.evaluate(() => ({
    smoke: window.__synthWasmSmoke,
    status: document.querySelector('#synth-demo-status')?.textContent,
  }))
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}

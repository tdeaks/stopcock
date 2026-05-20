# @stopcock/signal

DSP kernel library. Deterministic kernels over typed arrays. No audio concept, no graph, no I/O. Shared by `synth`, `img`, `motion`, and anything else that needs FFTs, filters, or windows.

Kernels are deterministic but not pure: block processors mutate caller-owned `out` buffers, IIR filter `state`, and plan workspaces. Coefficient builders, design functions, and analysis functions are pure. Decision #9 below makes the mutation contract explicit.

signal is **not** where the pipe abstraction lives. The pipe-clean value layer lives in `@stopcock/synth` (Nodes), `@stopcock/img` (Images), and `@stopcock/motion` (Tweens). signal is the toolkit those packages' renderers call in their inner loops. See [Layering](#layering) below.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Numeric types | `Float32Array` for audio sample buffers — matches Web Audio and AudioWorklet. `Float64Array` for math-heavy work where precision matters: FFT bins, filter state, twiddle factors, accumulators. The two coexist on the hot path; the rule is "audio in float32, DSP internals in float64". |
| 2 | Block boundary | Buffers are caller-sized. No assumed block length. Web Audio's 128 is one valid case, FFT sizes another. |
| 3 | Mutation | Every hot-path function takes a **required** pre-allocated output (`out`, or a workspace/`plan` for FFT-using stages). Callers own buffer lifecycle. The library never allocates inside a function that's expected to be called per audio block. Convenience one-shot forms may allocate output, scratch, or a transient plan (`fft`, `ifft`, `rfft`, `irfft`, `convolve.direct`) and are documented as such; `Into` variants are the zero-alloc forms. |
| 4 | Complex numbers | Interleaved real/imag in a single `Float64Array` of length `2 * n`. No `{re, im}` object pairs anywhere. |
| 5 | FFT API shape | Two-tier. One-shot: `fft(buf)`/`ifft(buf)` mutate in place but may allocate a transient plan; `rfft(real) -> Complex` and `irfft(complex, n) -> Real` allocate output. Zero-alloc per-block: `fftInto(buf, plan)`, `ifftInto(buf, plan)`, `rfftInto(real, plan, out)`, `irfftInto(complex, plan, out)`. Convolution and reverb use the `Into` family via a `convolve.plan` workspace. Transform sizes are power-of-two only; per-function validation listed in the FFT section. |
| 6 | Filter representation | `BiquadCoeffs = readonly [b0, b1, b2, a1, a2]` (a0 normalized to 1, sign convention: `y[n] = b0 x[n] + b1 x[n-1] + b2 x[n-2] - a1 y[n-1] - a2 y[n-2]`). State is a `Float64Array(4)` per filter, owned by the caller. Coefficient builders are pure. Processing is `(buf, coeffs, state, out)` — buf first, matching repo data-first convention. |
| 7 | Sample rate | Passed at call sites, never stored. Functions that need it take a `{ sampleRate }` opt or a `sampleRate` field. |
| 8 | Determinism | All functions are deterministic. No internal RNG, no clock. Anything stochastic lives in `@stopcock/rand`. |
| 9 | Dual / pipe | Block processors are `dual`-compatible: `process(buf, coeffs, state, out)` (data-first, repo convention) and `process(coeffs, state, out)` returning `(buf) => Real`. **The curried form closes over `state` and `out` by reference; calling it on successive blocks mutates state.** This is mathematically necessary for IIR filters (output at sample n depends on samples n-1, n-2). Composing signal processors inline via pipe is an explicit opt-in to mutation, not a pipe-purity violation. Synth's pipe stages remain pure values; signal sits one layer below that. |
| 10 | Errors | Validate at the API boundary, throw `RangeError`. Per-function constraints enumerated in the operator sections below. Inner loops trust inputs. |

## Layering

```
@stopcock/synth          ← pure pipe values (Node = plain data)
       │
       ▼ renderer (offline.ts, web.ts, worklet.ts)
       │   owns: filter state, scratch buffers, scheduling
       ▼
@stopcock/signal         ← stateful kernels (buf, coeffs, state, out)
       │
       ▼ Float32Array / Float64Array math
```

Synth users compose Nodes. The renderer walks the Node graph, allocates state once per filter instance, then calls signal's block processors in a hot loop. State lives in the renderer's per-graph memory, not in the user's pipe.

Direct signal users (people writing DSP loops by hand) get the stateful processors as-is. The dual currying is a convenience for inline use; it does not change the underlying mutation contract.

## Types

```ts
export type Real = Float32Array
export type Complex = Float64Array              // interleaved [re0, im0, re1, im1, ...]
export type BiquadCoeffs = readonly [b0: number, b1: number, b2: number, a1: number, a2: number]
export type BiquadState = Float64Array          // length 4: [x1, x2, y1, y2]
export type OnePoleCoeffs = readonly [a: number, b: number]
export type OnePoleState = Float64Array         // length 1: [y1]

export type Window =
  | 'hann' | 'hamming' | 'blackman' | 'blackman-harris' | 'rect' | 'triangular'

export type FilterKind =
  | 'lowpass' | 'highpass' | 'bandpass' | 'notch'
  | 'peak' | 'lowshelf' | 'highshelf' | 'allpass'

export type FilterSpec = {
  kind: FilterKind
  freq: number          // Hz, must be in (0, sampleRate / 2)
  q: number             // > 0
  gainDb?: number       // peak / shelf only, defaults to 0 (filter becomes unity at the band)
  sampleRate: number    // > 0, finite
}

export type FirKind = 'lowpass' | 'highpass' | 'bandpass' | 'notch'

export type FirSpec = {
  kind: FirKind
  freq: number          // Hz for lowpass/highpass; center Hz for bandpass/notch
  bandwidth?: number    // Hz, bandpass/notch only
  sampleRate: number
  taps: number          // odd recommended for linear phase
  window?: Window       // defaults to 'hann'
}

export type FftPlan = {
  readonly n: number              // power of two
  readonly twiddles: Complex      // length 2 * n
}

export type ConvolvePlan = {
  readonly blockSize: number
  readonly kernelLength: number    // taps in the original kernel
  readonly tailLength: number      // === kernelLength - 1; flush emits exactly this many trailing samples
  readonly fftSize: number         // next power of two >= blockSize + kernelLength - 1
  readonly fft: FftPlan
  readonly kernelSpectrum: Complex // precomputed rfft of zero-padded kernel
  readonly input: Real             // length fftSize, zero-padded block input workspace
  readonly spectrum: Complex       // length 2 * (fftSize / 2 + 1), per-block rfft/multiply workspace
  readonly time: Real              // length fftSize, irfft output workspace
}

export type Spectrum = {
  magnitudes: Real      // one-sided, length n/2 + 1 for an n-point FFT
  fftSize: number       // n, power of two
  sampleRate: number
}
```

## Operators

### Window functions
```
window.hann(n)                 : Real
window.hamming(n)              : Real
window.blackman(n)             : Real
window.blackmanHarris(n)       : Real
window.triangular(n)           : Real
window.apply(buf, w, out)      : Real          // elementwise multiply, buf first (data-first)
```

Validation: `n >= 1`. `window.apply` requires `buf.length === w.length === out.length`.

### FFT
```
fft.plan(n: number): FftPlan                              // builds twiddle table for size n

// One-shot forms (analysis, offline, small one-time use; may allocate transient plans):
fft(buf: Complex): Complex                                // in place, returns same buffer
ifft(buf: Complex): Complex                               // in place
rfft(real: Real): Complex                                 // allocates Complex of length 2 * (n/2 + 1)
irfft(complex: Complex, n: number): Real                  // allocates Real of length n

// Zero-alloc per-block forms (drive these from a renderer hot loop):
fftInto(buf: Complex, plan: FftPlan): Complex             // in place
ifftInto(buf: Complex, plan: FftPlan): Complex            // in place
rfftInto(real: Real, plan: FftPlan, out: Complex): Complex
irfftInto(complex: Complex, plan: FftPlan, out: Real): Real

// Bin-wise helpers (no FFT inside, just elementwise math):
magnitude(complex: Complex, out: Real): Real
phase(complex: Complex, out: Real): Real
power(complex: Complex, out: Real): Real
```

Per-function validation:
- `fft.plan(n)`: `n` finite integer, power of two, `n >= 2`.
- `fft(buf)` / `ifft(buf)`: `buf.length === 2 * n`, where `n` is a finite integer, power of two, `n >= 2`.
- `fftInto(buf, plan)` / `ifftInto(buf, plan)`: `buf.length === 2 * plan.n`.
- `rfft(real)`: `real.length === n`, where `n` is a finite integer, power of two, `n >= 2`.
- `rfftInto(real, plan, out)`: `real.length === plan.n`, `out.length === 2 * (plan.n / 2 + 1)`.
- `irfft(complex, n)`: `n` finite integer, power of two, `n >= 2`, and `complex.length === 2 * (n / 2 + 1)`.
- `irfftInto(complex, plan, out)`: `complex.length === 2 * (plan.n / 2 + 1)`, `out.length === plan.n`.
- `magnitude` / `phase` / `power`: `complex.length` even, `out.length === complex.length / 2`. **No power-of-two requirement** — bin-wise helpers work on any interleaved buffer, including the `2 * (n/2 + 1)` layout produced by `rfft`.

To get a one-sided spectrum from a full `fft` of a real signal, slice the first `n/2 + 1` complex bins (`complex.subarray(0, 2 * (n/2 + 1))`) before calling `magnitude`. `rfft` does this layout natively.

Memory note: `Complex` is `Float64Array`. FFT bins are intentionally double precision — round-trip drift through repeated rfft/irfft becomes audible at 32-bit, especially in convolution reverb with long tails. This is the deliberate Float64 exception called out in decision #1.

### Biquad filters
```
biquad.design(spec: FilterSpec): BiquadCoeffs       // RBJ cookbook formulas
biquad.state(): BiquadState                          // zeroed
biquad.process(buf, coeffs, state, out): Real        // mutates state, fills out
biquad.reset(state): void
biquad.freqResponse(coeffs, freqs: Real, sampleRate, magOut: Real, phaseOut: Real): void
```

Validation for `biquad.design`:
- `sampleRate` finite and `> 0`
- `freq` finite and in `(0, sampleRate / 2)` strictly
- `q` finite and `> 0`
- `gainDb` finite if provided (defaults to `0`)
- `kind` one of the listed `FilterKind` values

Validation for `biquad.process`:
- `buf.length === out.length`.
- `coeffs.length === 5` (`BiquadCoeffs` is a length-5 readonly tuple).
- `state.length === 4` (the `BiquadState` array holds `[x1, x2, y1, y2]`).

Validation for `biquad.freqResponse`:
- `coeffs.length === 5`.
- `sampleRate` finite, `> 0`.
- `freqs.length === magOut.length === phaseOut.length`. All three buffers must be allocated by the caller; the function fills `magOut` and `phaseOut` in place from each frequency in `freqs`.

Validation for `biquad.reset`: `state.length === 4`. Zeros the four state slots.

### One-pole filters
```
onepole.lp(cutoff: number, sampleRate: number): OnePoleCoeffs
onepole.hp(cutoff: number, sampleRate: number): OnePoleCoeffs
onepole.state(): OnePoleState
onepole.process(buf, coeffs, state, out): Real
```

Cheap, control-rate friendly. Used for envelope smoothing and modulation lag.

Validation for `onepole.lp` / `onepole.hp`:
- `sampleRate` finite, `> 0`.
- `cutoff` finite, in `(0, sampleRate / 2)`.

Validation for `onepole.process`:
- `buf.length === out.length`.
- `state.length === 1` (the `OnePoleState` tuple holds the single feedback term `y1`).
- `coeffs` is a length-2 readonly tuple (`OnePoleCoeffs`).

### FIR
```
fir.design(spec: FirSpec): Real                          // windowed-sinc, lowpass/highpass/bandpass/notch only
fir.state(tapCount: number): Real                        // history buffer, length tapCount - 1
fir.process(buf, taps, state, out): Real                 // direct convolution with history
```

`FirSpec` is intentionally narrower than `FilterSpec`. Windowed-sinc design produces brick-wall filters by truncating an ideal impulse response; peak, shelf, and allpass shapes need different design methods (frequency sampling, Parks-McClellan, minimum-phase derivation) and don't ship in v0.

Validation for `fir.design`:
- `taps >= 3`, odd recommended (linear phase requires odd length for type-I FIR).
- `sampleRate` finite, `> 0`.
- `freq` finite, in `(0, sampleRate / 2)`.
- For bandpass/notch: `bandwidth` finite, `> 0`, `freq - bandwidth/2 > 0`, `freq + bandwidth/2 < sampleRate / 2`.
- `window`, if provided, one of the `Window` values; defaults to `'hann'`.

Bandpass and notch are derived from lowpass via spectral inversion/translation. Other kinds (peak, shelves, allpass) belong in a future `fir.designAdvanced` once a caller justifies the design code.

Validation for `fir.state`: `tapCount >= 1`; returns `new Float32Array(tapCount - 1)`, zero-initialized. The history holds the previous `tapCount - 1` input samples; the current input is `x[n]` and is read directly from `buf`.

Validation for `fir.process`:
- `buf.length === out.length`.
- `taps.length >= 1`.
- `state.length === taps.length - 1`.
- `state` holds the running input history `[x[n-1], x[n-2], ..., x[n-taps.length+1]]`; the library writes to it. Caller passes the same state across consecutive blocks.
- For full convolution semantics (matching `convolve.direct`), feed `taps.length - 1` zero-valued samples after the final input block to drain the history; the corresponding `out` samples are the convolution tail.

### Convolution
```
convolve.plan(kernel: Real, blockSize: number): ConvolvePlan
convolve.state(plan: ConvolvePlan): Real                      // overlap-add tail buffer, length plan.tailLength
convolve.direct(signal: Real, kernel: Real): Real             // allocates full output
convolve.directInto(signal: Real, kernel: Real, out: Real): Real
convolve.overlapAdd(signal: Real, plan: ConvolvePlan, state: Real, out: Real): Real
convolve.flush(plan: ConvolvePlan, state: Real, out: Real): Real
```

`convolve.plan` pre-computes the FFT plan, the zero-padded kernel spectrum, and all scratch workspaces. Build it once at filter-construction time (e.g. when a synth `effects.reverb` Node is compiled) and reuse it across every block.

The streaming pipeline is:

1. Per block, call `overlapAdd(signalBlock, plan, state, outBlock)`. Internally:
   1. Copy `signalBlock` into `plan.input[0..blockSize]`, zero-pad `plan.input[blockSize..fftSize]`.
   2. `rfftInto(plan.input, plan.fft, plan.spectrum)`, multiply `plan.spectrum` by `plan.kernelSpectrum` in place, then `irfftInto(plan.spectrum, plan.fft, plan.time)`. The result `plan.time[0..blockSize+kernelLength-1]` is the convolution of this block with the kernel.
   3. Emit output: for `i in [0, blockSize)`, `outBlock[i] = plan.time[i] + (i < tailLength ? state[i] : 0)`. The first `min(blockSize, tailLength)` output samples mix the new convolution head with the saved tail; if `blockSize > tailLength`, the remaining output samples come only from `plan.time`.
   4. Update state: shift the unused part of the old state left by `blockSize` (or zero it if `blockSize >= tailLength`), then add the new tail from `plan.time[blockSize..blockSize+tailLength]`. Concretely:
      ```
      for i in [0, tailLength):
        const carried = (i + blockSize < tailLength) ? state[i + blockSize] : 0
        state[i] = carried + plan.time[blockSize + i]
      ```
      For short kernels (`tailLength <= blockSize`), the carried term is always 0 and the update collapses to `state[i] = plan.time[blockSize + i]`. For long kernels (e.g. reverb, where `tailLength` can be much larger than `blockSize`), the shift is what stops overlapping tails from being dropped or double-counted across consecutive blocks.
2. After the final input block, call `flush(plan, state, tailOut)` exactly once. It copies the remaining `plan.tailLength` samples from `state` into `tailOut` and zeroes `state` so the plan can be reused on a new signal. This is the convolution-reverb tail; in synth, the reverb stage's worklet keeps calling `overlapAdd` with silence blocks for the same effect, but `flush` is the cheaper one-shot when the caller knows the signal has ended.

The streaming variants do zero allocation per call.

Validation:
- `convolve.direct`: `kernel.length >= 1`; returns `new Float32Array(signal.length + kernel.length - 1)`. Use for one-shot work and kernels under ~64 taps.
- `convolve.directInto`: `kernel.length >= 1`, `out.length === signal.length + kernel.length - 1`.
- `convolve.plan`: `blockSize` positive integer, `kernel.length >= 1`. `fftSize` computed as the next power of two `>= blockSize + kernel.length - 1`. `tailLength === kernelLength - 1`.
- `convolve.state(plan)`: returns `new Float32Array(plan.tailLength)`, zero-initialized.
- `convolve.overlapAdd`: `signal.length === plan.blockSize`, `out.length === plan.blockSize`, `state.length === plan.tailLength`. Streaming: caller carries `state` across calls.
- `convolve.flush`: `out.length === plan.tailLength`, `state.length === plan.tailLength`. Idempotent if called on a freshly-zeroed state (writes silence).

`convolve.direct` is for one-shot use and short kernels; it allocates because the output length differs from input. Use `convolve.directInto` when the caller already owns the output buffer. Streaming hot loops must use the `plan`-based variants.

**Partial final blocks.** Callers whose signal length is not a multiple of `blockSize` zero-pad the final block before calling `overlapAdd`. The protocol for a signal of length `L`:

1. Process complete blocks 0..N-1 normally, where `N = floor(L / blockSize)`.
2. If `L > N * blockSize`, the final partial block has `R = L - N * blockSize` real samples and `blockSize - R` zero-padding. Call `overlapAdd` with the padded block; the output is still `blockSize` samples long.
3. Call `flush` to drain the remaining `tailLength` samples.
4. The concatenated overlapAdd + flush output has length `(N+1) * blockSize + tailLength` (or `N * blockSize + tailLength` if `R === 0`). The convolution result occupies the **first `L + tailLength` = `L + kernelLength - 1` samples**; any trailing samples (from convolving the zero-padding with the kernel) are zero and can be discarded.

This is equivalent because the convolution of `[signal, 0, 0, ...]` with kernel equals the convolution of `signal` with kernel, zero-extended on the right. Adding `validLength` to the API was considered and rejected: the trim is one slice at the end, easier for the caller than threading a length through every call.

Overlap-save is not in v0. It needs different state semantics (input history, not output tail) and a different `tailLength` definition; ship if measured benefit appears. See open questions.

### Resampling
```
resample.outputLength(inLen: number, ratio: number): number
resample.linear(buf, ratio, out): Real
resample.sinc(buf, ratio, opts: { width: number, window: Window, out: Real }): Real
resample.polyphase(buf, up: number, down: number, taps: Real, out: Real): Real
```

Caller sizes `out` per `ratio` (or `up/down`). `resample.outputLength` returns `Math.floor(inLen * ratio)`; for polyphase the output length is `Math.floor(inLen * up / down)`.

Validation for `resample.linear`:
- `ratio` finite, `> 0`.
- `out.length === resample.outputLength(buf.length, ratio)`.

Validation for `resample.sinc`:
- `ratio` finite, `> 0`.
- `opts.width` positive integer, `>= 1` (typically 4 to 32; the half-width of the sinc kernel in input samples).
- `opts.window` one of the `Window` values.
- `opts.out.length === resample.outputLength(buf.length, ratio)`.

Validation for `resample.polyphase`:
- `up`, `down` positive integers, `>= 1`.
- `taps.length >= up` (the polyphase decomposition splits `taps` into `up` subfilters; each subfilter must have at least one tap).
- `out.length === Math.floor(buf.length * up / down)`.

`resample.polyphase` is **one-shot** in v0. It takes a full input buffer and produces a full output buffer. Streaming polyphase resampling requires tracking fractional output phase across calls — with `up=1, down=2`, two one-sample chunks each produce zero output but together should produce one, and a stateless `floor(buf.length * up / down)` per call loses that sample. See open questions for the streaming design.

### Analysis
```
analysis.rms(buf): number
analysis.peak(buf): number
analysis.zeroCrossings(buf): number
analysis.spectralCentroid(spectrum: Spectrum): number
analysis.spectralFlatness(spectrum: Spectrum): number
analysis.spectralRolloff(spectrum: Spectrum, percentile: number): number
```

`Spectrum` carries the one-sided magnitudes plus the `fftSize` and `sampleRate` needed to map bin index to Hz. Feeding raw FFT output to these would put negative-frequency bins at false high frequencies, so the type makes the layout explicit.

Validation for `analysis.rms` / `peak` / `zeroCrossings`: `buf.length >= 1`.

Semantic conventions:
- `analysis.peak`: returns the **absolute** peak — `max(|buf[i]|)` over all `i`. Standard audio-metering convention; returns a non-negative value. Use `analysis.signedMax(buf)` if you need the signed extremum (added later if a caller justifies it).
- `analysis.zeroCrossings`: counts the number of index pairs `(i, i+1)` where `buf[i] * buf[i+1] < 0` (strict sign change). Zero samples count as **neither** sign; sequences like `[1, 0, -1]` have **zero** crossings, while `[1, -1]` has one. Rationale: this counts true sign reversals only, so DC-with-silence runs don't inflate the count. Equivalent to the conventional ZCR definition in MIR.

Validation for any function taking a `Spectrum`:
- `spectrum.fftSize >= 2`, power of two.
- `spectrum.sampleRate` finite, `> 0`.
- `spectrum.magnitudes.length === spectrum.fftSize / 2 + 1` (one-sided layout, DC through Nyquist inclusive).

Validation for `analysis.spectralRolloff`: in addition to the `Spectrum` constraints, `percentile` finite, in `(0, 1)` strictly. Common values: `0.85` (85% roll-off), `0.95`.

**Zero-energy contract.** All three spectral analyzers face a divide-by-zero on an all-zero magnitude spectrum (silence after the FFT). Behavior is defined, not undefined:
- `spectralCentroid`: returns `0` when total magnitude is `0`. A silent signal has no meaningful centroid; `0` is the natural floor (and the bin-0 frequency).
- `spectralRolloff`: returns `0` when total energy is `0`. No energy means no roll-off frequency to report; `0` matches the centroid convention.
- `spectralFlatness`: returns `0` when total magnitude is `0`. Treating silence as the minimum-flatness sentinel; the value range is `[0, 1]` with `0` for pure tones and `1` for white noise, and silence sits at the pure-tone end (degenerate "single tone" of zero amplitude).

None of these throw on zero spectra. Callers gating effects on these values (e.g., "if flatness > 0.7 then noise-suppress") get predictable falsy behavior in silence rather than `NaN` contaminating downstream math.

## Conventions

- Every hot-path function takes a pre-allocated output buffer or workspace. The library does **not** allocate in any function intended to run per audio block.
- Allocating one-shot helpers exist where layout changes (`rfft`, `irfft`, `convolve.direct`) and are documented as such. Their `Into` / `plan`-based counterparts (`rfftInto`, `irfftInto`, `convolve.directInto`, `convolve.overlapAdd`) are the reusable-buffer forms.
- `resample.*` is alloc-free per call: caller sizes `out` via `resample.outputLength(inLen, ratio)` and reuses the buffer across calls.
- Filter state is owned by the caller. The library never mutates anything it didn't receive as a parameter.
- No global state, no module-level caches, no warm-up.
- Coefficients are immutable `readonly` tuples. State arrays and workspaces are mutable by definition.
- Data-first argument order, matching `@stopcock/fp` dual convention: `(buf, ...rest, out)`.
- Validation runs once at the API boundary. Inner loops contain no defensive checks.

## Build order

1. `types.ts`, `validate.ts` (per-kind validators returning `void` or throwing), `window.hann`, `window.apply`. Unblocks FFT tests.
2. `fft.plan`, `fft` / `ifft` (radix-2 in-place with bit-reversal permutation). Test against hand-computed 4-point and 8-point cases. Validate power-of-two at the plan boundary.
3. `magnitude`, `phase`, `power`. Test on a single-bin sinusoid.
4. `biquad.design` (RBJ cookbook). Test coefficient values against published references for lowpass at `fc/sr = 0.1`, `Q = 0.7071`. Validation tests for each failure mode listed above.
5. `biquad.process` direct form I. Test impulse response against `freqResponse`. Test that the curried form on consecutive blocks matches the same-length single call (block-invariance test — catches forgotten state).
6. `onepole`, `fir.design` windowed-sinc (lowpass first, then highpass/bandpass/notch by spectral inversion), `fir.process`.
7. `rfft` / `irfft` (allocating) and `rfftInto` / `irfftInto` (alloc-free). Test round-trip: `irfft(rfft(real))` reconstructs the input to within 1e-12.
8. `convolve.direct` / `convolve.directInto`. Test against `fir.process` of equivalent taps, comparing the **first `signal.length`** samples of `convolve.direct` against the `fir.process` output. Then feed `taps.length - 1` zeros through `fir.process` and check the trailing samples match `convolve.direct[signal.length..]` — this is the FIR analogue of `convolve.flush` and proves the streaming form is a true prefix of full convolution.
9. `convolve.plan`, `convolve.state`, `convolve.overlapAdd`, `convolve.flush`. Three streaming-vs-direct equivalence tests, all within 1e-6 of a reference `convolve.direct`:
   - **Exact multiple**: signal length `N * blockSize`. `[overlapAdd × N, flush]` must equal `convolve.direct`.
   - **Non-multiple (partial final block)**: signal length not a multiple of `blockSize` — exercises the zero-pad-and-trim protocol. Caller pads the last block, runs `overlapAdd`, then `flush`, then trims to `signal.length + kernelLength - 1` samples. Must equal `convolve.direct`.
   - **Long kernel (`kernelLength > blockSize`)**: e.g. `kernelLength = 4 * blockSize`. Exercises the state-shift in `overlapAdd`'s step 4 — without it, overlapping tails get dropped or double-counted.
10. `resample.linear`, `resample.sinc`, `resample.outputLength`, `resample.polyphase` (one-shot). Polyphase tests:
    - **Output length**: for `up=1, down=2` and `up=2, down=1`, `out.length === resample.outputLength(buf.length, up/down)`. Not a round-trip — decimation is lossy and interpolation doesn't recover lost bins.
    - **Identity ratio**: `up === down` (e.g., `up=2, down=2`) on a generic input must reproduce the input exactly within 1e-6, since the polyphase filter at unity ratio is the identity.
    - **DC fixture**: a constant-value input at any `up/down` must produce a constant-value output of the same value (within taps-startup tolerance after the first `taps.length` samples). Cheap and unambiguous; catches normalization bugs in the polyphase decomposition.
    - **Known-fixture spot check**: a short hand-computed reference (e.g., a triangular impulse at `up=3, down=2` with a specific 7-tap kernel) compared sample-by-sample.
    - **Chunking-failure regression**: the documented chunking failure case (two one-sample chunks at `up=1, down=2`) is **explicitly unsupported** — a streaming wrapper should be rejected at the API boundary in v0, or, if no such wrapper exists, the test simply documents the contract.
11. `analysis.*` — small functions, ship together. `Spectrum` constructor helper. Tests must cover the zero-energy contract for `spectralCentroid`/`spectralRolloff`/`spectralFlatness` (all return `0` on a zero-magnitude spectrum, not `NaN`).

## What this commits us to

- Two-type numeric backbone: `Float32Array` for audio sample buffers, `Float64Array` for math-heavy internals (FFT bins, filter state, twiddles, accumulators). Both live on the hot path; the boundary is "signal vs DSP work", not "hot vs cold".
- Caller controls allocation. No library function intended for per-block use allocates.
- Anything stateful (filter history, overlap tails) and any cached precomputation (FFT plans, kernel spectra) is an explicit value the caller carries.
- Statefulness is honest: IIR processors mutate the `state` array they're handed. The dual currying lets you compose them in a pipe; it does not pretend they're pure.
- Every hot loop is shaped `(buf, ...config, state, out)` or `(buf, plan, state, out)`. WASM kernel swap is a future change to the inner loop, not the API.

## Open questions

- **`convolve.overlapSave`.** Not in v0. Needs different state semantics from overlap-add (input-history window instead of output-tail accumulator), a separate `validRegion`/`historyLength` field on the plan, and a different correctness story for partial blocks. Ship only if measurement shows overlap-save outperforms overlap-add for synth reverb's specific shapes.
- **Streaming polyphase resampling.** v0's `resample.polyphase` is one-shot. Streaming needs a `PolyphaseState = { history: Real, phase: number }` struct (breaks the uniform "state is a typed array" pattern), with `outputLength(inLen, up, down, state) = floor((inLen * up + state.phase) / down)` and `newPhase = (inLen * up + state.phase) % down`. Worth designing carefully when the first real-time SRC caller lands.
- **SIMD.** Bun and modern V8 don't expose SIMD intrinsics from JS yet. Hold the line on plain typed-array loops; WASM is the escape hatch.
- **Stereo.** Stereo is two `Real` buffers. No stereo type. `synth` handles channels at its level.
- **Higher-order filters.** Cascade biquads. The cascade is just a `ReadonlyArray<{coeffs, state}>` plus a fold over `biquad.process`. Probably ships as a thin helper in `synth` rather than here.
- **Non-power-of-two FFT.** Bluestein or mixed-radix. Real work, ship when a caller needs it.
- **Pure-functional filter form.** A `(buf, coeffs, stateIn) => [out, stateOut]` shape exists for callers who want strict purity, at the cost of an allocation per block. Could ship as `biquad.processPure` if demand appears; not in v0.
- **`fir.designAdvanced`.** Frequency sampling or Parks-McClellan to cover peak/shelf/allpass FIR. Not v0 — windowed-sinc covers what synth needs.
- **Plan sharing across sizes.** A renderer with many convolution stages at the same `fftSize` could share one `FftPlan` across multiple `ConvolvePlan`s. The types already allow this (plan is read-only twiddles); just needs a constructor that takes an existing `FftPlan` instead of building one.

export type WasmAccelerator = {
  dot(a: Float64Array, b: Float64Array, n: number): number
  axpy(alpha: number, x: Float64Array, y: Float64Array, out: Float64Array, n: number): void
  matmul(a: Float64Array, b: Float64Array, out: Float64Array, M: number, K: number, N: number): void
  convolve1d(src: Float64Array, kernel: Float64Array, out: Float64Array, srcLen: number, kernelLen: number): void
  colorMatrix3x3(src: Uint8ClampedArray, dst: Uint8ClampedArray, matrix: Float64Array, numPixels: number): void
}

let accel: WasmAccelerator | null = null

export function accelerate(wasm: WasmAccelerator): void { accel = wasm }
export function decelerate(): void { accel = null }
export function isAccelerated(): boolean { return accel !== null }

export function getDot() { return accel?.dot ?? null }
export function getAxpy() { return accel?.axpy ?? null }
export function getMatmul() { return accel?.matmul ?? null }
export function getConvolve1d() { return accel?.convolve1d ?? null }
export function getColorMatrix3x3() { return accel?.colorMatrix3x3 ?? null }

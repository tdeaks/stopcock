import {
  NoActiveTapeError,
  ShapeError,
  type AnyTapeEntry,
  type Grad,
  type Mat,
  type Tape,
  type TapeEntry,
  type Var,
} from './types'

const tapeStack: Tape[] = []

export const isVar = <G extends Grad>(value: Var<G> | G): value is Var<G> =>
  typeof value === 'object' && value !== null && (value as Var<G>)._tag === 'Var'

export const constant = <G extends Grad>(value: G): Var<G> => ({
  _tag: 'Var',
  id: -1,
  value,
})

export const currentTape = (): Tape => {
  const tape = tapeStack[tapeStack.length - 1]
  if (!tape) throw new NoActiveTapeError()
  return tape
}

export const withTape = <T>(fn: (tape: Tape) => T): T => {
  const tape: Tape = { entries: [] }
  tapeStack.push(tape)
  try {
    return fn(tape)
  } finally {
    tapeStack.pop()
  }
}

export const asVar = <G extends Grad>(value: Var<G> | G): Var<G> => {
  currentTape()
  return isVar(value) ? value : constant(value)
}

const cloneMat = (m: Mat): Mat => ({
  data: new Float64Array(m.data),
  rows: m.rows,
  cols: m.cols,
})

const cloneGrad = <G extends Grad>(value: G): G => {
  if (typeof value === 'number') return value
  if (value instanceof Float64Array) return new Float64Array(value) as G
  return cloneMat(value) as G
}

const zeroLike = <G extends Grad>(value: G): G => {
  if (typeof value === 'number') return 0 as G
  if (value instanceof Float64Array) return new Float64Array(value.length) as G
  return { data: new Float64Array(value.data.length), rows: value.rows, cols: value.cols } as G
}

const onesLike = <G extends Grad>(value: G): G => {
  if (typeof value === 'number') return 1 as G
  if (value instanceof Float64Array) {
    const out = new Float64Array(value.length)
    out.fill(1)
    return out as G
  }
  const data = new Float64Array(value.data.length)
  data.fill(1)
  return { data, rows: value.rows, cols: value.cols } as G
}

const assertMatShape = (op: string, a: Mat, b: Mat) => {
  if (a.rows !== b.rows || a.cols !== b.cols)
    throw new ShapeError(`${op}: ${a.rows}x${a.cols} vs ${b.rows}x${b.cols}`)
}

const addMat = (a: Mat, b: Mat): Mat => {
  assertMatShape('accumulate', a, b)
  const data = new Float64Array(a.data.length)
  for (let i = 0; i < data.length; i++) data[i] = a.data[i] + b.data[i]
  return { data, rows: a.rows, cols: a.cols }
}

export const accumulate = (existing: Grad | undefined, incoming: Grad): Grad => {
  if (existing === undefined) return cloneGrad(incoming)

  if (typeof existing === 'number') {
    if (typeof incoming !== 'number') throw new ShapeError('accumulate: scalar vs non-scalar')
    return existing + incoming
  }

  if (existing instanceof Float64Array) {
    if (!(incoming instanceof Float64Array))
      throw new ShapeError('accumulate: vector vs non-vector')
    if (existing.length !== incoming.length)
      throw new ShapeError(`accumulate: ${existing.length} vs ${incoming.length}`)
    const out = new Float64Array(existing.length)
    for (let i = 0; i < out.length; i++) out[i] = existing[i] + incoming[i]
    return out
  }

  if (typeof incoming === 'number' || incoming instanceof Float64Array)
    throw new ShapeError('accumulate: matrix vs non-matrix')
  return addMat(existing, incoming)
}

export const record = <G extends Grad>(
  value: G,
  parents: readonly Var<Grad>[],
  backward: (grad: G) => readonly Grad[],
): Var<G> => {
  const tape = currentTape()
  const id = tape.entries.length
  const entry: TapeEntry<G> = {
    parents: parents.map(parent => parent.id),
    value,
    backward,
    grad: undefined,
  }
  tape.entries.push(entry as unknown as AnyTapeEntry)
  return { _tag: 'Var', id, value }
}

export const variable = <G extends Grad>(value: G): Var<G> =>
  record(value, [], () => [])

export const backward = (output: Var<Grad>, tape: Tape): void => {
  for (const entry of tape.entries) entry.grad = undefined
  if (output.id < 0) return

  const outputEntry = tape.entries[output.id]
  if (!outputEntry) throw new Error(`Unknown autodiff variable id ${output.id}`)

  outputEntry.grad = accumulate(outputEntry.grad, onesLike(outputEntry.value))

  for (let i = tape.entries.length - 1; i >= 0; i--) {
    const entry = tape.entries[i]
    if (entry.grad === undefined) continue

    const parentGrads = entry.backward(entry.grad)
    for (let j = 0; j < entry.parents.length; j++) {
      const parentId = entry.parents[j]
      if (parentId < 0) continue
      const parentEntry = tape.entries[parentId]
      if (!parentEntry) throw new Error(`Unknown autodiff parent id ${parentId}`)
      parentEntry.grad = accumulate(parentEntry.grad, parentGrads[j])
    }
  }
}

export const gradOf = <G extends Grad>(v: Var<G>, tape: Tape): G => {
  if (v.id < 0) return zeroLike(v.value)
  const entry = tape.entries[v.id]
  if (!entry || entry.grad === undefined) return zeroLike(v.value)
  return cloneGrad(entry.grad as G)
}

export type Vec = Float64Array

export type Mat = {
  readonly data: Float64Array
  readonly rows: number
  readonly cols: number
}

export type Grad = number | Float64Array | Mat

export type VarId = number

export interface Var<G extends Grad = number> {
  readonly _tag: 'Var'
  readonly id: VarId
  readonly value: G
}

export interface TapeEntry<G extends Grad = Grad> {
  readonly parents: readonly VarId[]
  readonly value: G
  readonly backward: (grad: G) => readonly Grad[]
  grad: G | undefined
}

export type AnyTapeEntry = {
  readonly parents: readonly VarId[]
  readonly value: Grad
  readonly backward: (grad: Grad) => readonly Grad[]
  grad: Grad | undefined
}

export interface Tape {
  /** @internal */
  readonly entries: AnyTapeEntry[]
}

export type UnvarsOf<Vs extends readonly Var<Grad>[]> = {
  readonly [K in keyof Vs]: Vs[K] extends Var<infer G> ? G : never
}

export type GradReturn<Args extends readonly unknown[]> =
  Args extends readonly [infer A] ? A : Args

export interface DiffFn<Args extends readonly unknown[]> {
  readonly forward: (...args: Args) => number
  readonly gradient: (...args: Args) => GradReturn<Args>
  readonly valueAndGradient: (...args: Args) => {
    readonly value: number
    readonly gradient: GradReturn<Args>
  }
}

export class NoActiveTapeError extends Error {
  readonly _tag = 'NoActiveTapeError' as const

  constructor(message = 'No active autodiff tape. Wrap AD ops in differentiable() or withTape().') {
    super(message)
    this.name = 'NoActiveTapeError'
  }
}

export class ShapeError extends Error {
  readonly _tag = 'ShapeError' as const

  constructor(message: string) {
    super(message)
    this.name = 'ShapeError'
  }
}

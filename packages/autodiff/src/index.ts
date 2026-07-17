export type {
  DiffFn,
  Grad,
  GradReturn,
  Mat,
  Tape,
  UnvarsOf,
  Var,
  VarId,
  Vec,
} from './types'
export { NoActiveTapeError, ShapeError } from './types'

export {
  accumulate,
  backward,
  constant,
  currentTape,
  gradOf,
  variable,
  withTape,
} from './tape'
export { differentiable } from './differentiable'
export { add, div, mul, neg, pow, square, sub, type ScalarInput } from './scalar'
export {
  abs,
  cos,
  exp,
  leakyRelu,
  log,
  relu,
  sigmoid,
  sin,
  softplus,
  sqrt,
  tan,
  tanh,
} from './math'
export { vecAdd, vecDot, vecNorm, vecScale, vecSub, vecSum, type VecInput } from './vec'
export {
  matAdd,
  matMean,
  matMul,
  matNormSquared,
  matScale,
  matSub,
  matSum,
  matTranspose,
  type MatInput,
} from './mat'

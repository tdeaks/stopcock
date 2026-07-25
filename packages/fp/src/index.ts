export type { Fn, LazyValue } from './types'

export { pipe } from './pipe'
export { flow } from './flow'

/**
 * `dual`, `compile`, `compilePure`, and `explain` are no longer root exports.
 * They moved to the subpaths that name what they are:
 *
 *   dual                     -> @stopcock/fp/dual
 *   compile, compilePure     -> @stopcock/fp/compile
 *   explain                  -> @stopcock/fp/fusion/debug
 *
 * The root is the surface most consumers import, and it should not carry the
 * optimizer for everyone who wanted `pipe`.
 */

export {
  type None,
  type Option,
  type Some,
  fromNullable as optionFromNullable,
  isNone,
  isSome,
  none,
  some,
} from './option'

export { type Err, type Ok, type Result, err, isErr, isOk, ok } from './result'

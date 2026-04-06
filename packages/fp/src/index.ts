export type { Fn, LazyValue } from './types'
export { pipe } from './pipe'
export { flow } from './flow'
export { dual } from './dual'

export {
  type None,
  type Some,
  type Option,
  some,
  none,
  fromNullable as optionFromNullable,
  fromPredicate,
  isSome,
  isNone,
  map as mapOption,
  flatMap as flatMapOption,
  filter as filterOption,
  getOrElse as getOrElseOption,
  getWithDefault,
  match as matchOption,
  tap as tapOption,
  toNullable,
  toUndefined,
  toResult,
} from './option'

export {
  type Ok,
  type Err,
  type Result,
  ok,
  err,
  isOk,
  isErr,
  map as mapResult,
  mapErr,
  flatMap as flatMapResult,
  getOrElse as getOrElseResult,
  match as matchResult,
  tryCatch,
  fromNullable as resultFromNullable,
  toOption,
  tap as tapResult,
  tapErr,
} from './result'

export {
  is,
  isNil,
  isNotNil,
  propIs,
  isArray,
  isBigInt,
  isBoolean,
  isDate,
  isDeepEqual,
  isDefined,
  isEmpty,
  isEmptyish,
  isError,
  isFunction,
  isNonNull,
  isNonNullish,
  isNullish,
  isNumber,
  isObjectType,
  isPlainObject,
  isPromise,
  isShallowEqual,
  isStrictEqual,
  isString,
  isSymbol,
  isTruthy,
} from './guard'

export {
  identity, always, flip, complement, memoize, once, converge, juxt,
} from './function'

import * as O from './option'
import * as R from './result'
import * as G from './guard'
import * as A from './array'
import * as S from './string'
import * as D from './dict'
import * as N from './number'
import * as B from './boolean'
import * as Obj from './object'
import * as Logic from './logic'
import * as M from './math'
import * as Stream from './stream'
export { O, R, G, A, S, D, N, B, Obj, Logic, M, Stream }

export { type Lens, lens, prop, index, path, view, set, over, compose as composeLens } from './lens'
export { type Prism, prism, fromPredicate as prismFromPredicate, some as somePrism, ok as okPrism, preview, set as setPrism, over as overPrism, compose as composePrism } from './prism'
export { type Traversal, traversal, each, filtered, compose as composeTraversal, toArray, modify, set as setTraversal } from './traversal'
export { type Iso, iso, reverse, compose as composeIso } from './iso'
export { composeOptics } from './optics-compose'

import { dual as publicDual, type DualTag } from './dual'

type AnyFunction = (...args: never[]) => unknown

interface InternalDual {
  <Body extends AnyFunction, Operation extends AnyFunction>(
    arity: Parameters<Body>['length'],
    body: Body,
    tag?: DualTag,
  ): Operation
}

/**
 * Contextual escape hatch for the package's explicitly declared generic operations.
 * It is deliberately absent from the package export map.
 */
export const dual = publicDual as unknown as InternalDual

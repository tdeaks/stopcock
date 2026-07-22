import { dual } from './dual'

// Arity 1
export const not_: (a: boolean) => boolean = (a: any) => !a

// Arity 2
export const and_: {
  (a: boolean, b: boolean): boolean
  (b: boolean): (a: boolean) => boolean
} = dual(2, (a: any, b: any) => {
  if (a) {
    return b;
  } else {
    return false;
  }
})

export const or_: {
  (a: boolean, b: boolean): boolean
  (b: boolean): (a: boolean) => boolean
} = dual(2, (a: any, b: any) => {
  if (a) {
    return true;
  } else {
    return b;
  }
})

// Arity 3
export const ifElse: {
  <A>(cond: boolean, onTrue: () => A, onFalse: () => A): A
  <A>(onTrue: () => A, onFalse: () => A): (cond: boolean) => A
} = dual(3, (cond: any, onTrue: any, onFalse: any) => {
  if (cond) {
    return onTrue();
  } else {
    return onFalse();
  }
})

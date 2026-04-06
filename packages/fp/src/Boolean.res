/** Evaluates `onTrue` or `onFalse` lazily based on the condition. */
@genType
let ifElse = (cond: bool, onTrue: () => 'a, onFalse: () => 'a): 'a =>
  if cond {
    onTrue()
  } else {
    onFalse()
  }

/** Logical AND of two booleans. */
@genType
let and_ = (a: bool, b: bool): bool => a && b

/** Logical OR of two booleans. */
@genType
let or_ = (a: bool, b: bool): bool => a || b

/** Logical negation. */
@genType
let not_ = (a: bool): bool => !a

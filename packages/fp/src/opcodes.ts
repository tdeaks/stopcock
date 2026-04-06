// Fuseable stream ops
export const OP_MAP = 1
export const OP_FILTER = 2
export const OP_TAKE = 3
export const OP_DROP = 4
export const OP_TAKE_WHILE = 5
export const OP_DROP_WHILE = 6
export const OP_FLAT_MAP = 7

// Fuseable terminal ops
export const OP_REDUCE = 8
export const OP_FOR_EACH = 9
export const OP_EVERY = 10
export const OP_SOME = 11
export const OP_FIND = 12
export const OP_FIND_INDEX = 13

// Fuseable stream ops (extended)
export const OP_REJECT = 16

// Fuseable terminal ops (extended)
export const OP_NONE = 17
export const OP_COUNT = 18

// Non-fuseable but recognized (for pattern matching at boundaries)
export const OP_SORT_BY = 20
export const OP_SORT = 21

// Accessor terminal ops (operate on completed result, not per-element)
export const OP_HEAD = 30
export const OP_LAST = 31
export const OP_LENGTH = 32
export const OP_IS_EMPTY = 33
export const OP_TAIL = 34
export const OP_INIT = 35
export const OP_REVERSE = 36
export const OP_SORT_INLINE = 37
export const OP_UNIQ_INLINE = 38
export const OP_JOIN = 39
export const OP_FLATTEN = 40
export const OP_SUM = 41
export const OP_MIN = 42
export const OP_MAX = 43

// String accessor ops (transforms on string values, no callback)
export const OP_STR_TRIM = 50
export const OP_STR_LOWER = 51
export const OP_STR_UPPER = 52
export const OP_STR_TRIM_START = 53
export const OP_STR_TRIM_END = 54
export const OP_STR_SPLIT = 55
export const OP_STR_LENGTH = 56
export const OP_STR_IS_EMPTY = 57

// Dict accessor ops
export const OP_DICT_KEYS = 60
export const OP_DICT_VALUES = 61
export const OP_DICT_IS_EMPTY = 62

// Math stream ops (inline arithmetic, no callback)
export const OP_MATH_ADD = 70
export const OP_MATH_SUBTRACT = 71
export const OP_MATH_MULTIPLY = 72
export const OP_MATH_DIVIDE = 73
export const OP_MATH_NEGATE = 74
export const OP_MATH_INC = 75
export const OP_MATH_DEC = 76

// Guard predicate ops (inline typeof checks)
export const OP_GUARD_IS_NUMBER = 80
export const OP_GUARD_IS_STRING = 81
export const OP_GUARD_IS_BOOLEAN = 82
export const OP_GUARD_IS_NIL = 83
export const OP_GUARD_IS_ARRAY = 84
export const OP_GUARD_IS_OBJECT = 85
export const OP_GUARD_IS_FUNCTION = 86

// Sort specialization
export const OP_SORT_ASC = 90
export const OP_SORT_DESC = 91

// Non-fuseable (tagged but materialization boundary)
export const OP_NON_FUSEABLE = 0

// Lookup table: op name → opcode (used by dual to tag)
export const OP_CODES: Record<string, number> = {
  // Array stream
  map: OP_MAP, filter: OP_FILTER, take: OP_TAKE, drop: OP_DROP,
  takeWhile: OP_TAKE_WHILE, dropWhile: OP_DROP_WHILE, flatMap: OP_FLAT_MAP, reject: OP_REJECT,
  // Array terminal
  reduce: OP_REDUCE, forEach: OP_FOR_EACH, every: OP_EVERY, some: OP_SOME,
  find: OP_FIND, findIndex: OP_FIND_INDEX, none: OP_NONE, count: OP_COUNT,
  // Array accessor
  head: OP_HEAD, last: OP_LAST, length: OP_LENGTH, isEmpty: OP_IS_EMPTY,
  tail: OP_TAIL, init: OP_INIT, reverse: OP_REVERSE, uniq: OP_UNIQ_INLINE,
  join: OP_JOIN, flatten: OP_FLATTEN, sum: OP_SUM, min: OP_MIN, max: OP_MAX,
  // Sort
  sort: OP_SORT, sortBy: OP_SORT_BY, sortAsc: OP_SORT_ASC, sortDesc: OP_SORT_DESC,
  // String
  trim: OP_STR_TRIM, toLowerCase: OP_STR_LOWER, toUpperCase: OP_STR_UPPER,
  trimStart: OP_STR_TRIM_START, trimEnd: OP_STR_TRIM_END, split: OP_STR_SPLIT,
  strLength: OP_STR_LENGTH, strIsEmpty: OP_STR_IS_EMPTY,
  // Dict
  keys: OP_DICT_KEYS, values: OP_DICT_VALUES, dictIsEmpty: OP_DICT_IS_EMPTY,
  // Math
  add: OP_MATH_ADD, subtract: OP_MATH_SUBTRACT, multiply: OP_MATH_MULTIPLY,
  divide: OP_MATH_DIVIDE, negate: OP_MATH_NEGATE, inc: OP_MATH_INC, dec: OP_MATH_DEC,
  // Guards
  isNumber: OP_GUARD_IS_NUMBER, isString: OP_GUARD_IS_STRING, isBoolean: OP_GUARD_IS_BOOLEAN,
  isNil: OP_GUARD_IS_NIL, isArray: OP_GUARD_IS_ARRAY, isObject: OP_GUARD_IS_OBJECT,
  isFunction: OP_GUARD_IS_FUNCTION,
}

// Fast range checks
export const isFuseableOp = (op: number): boolean =>
  (op >= OP_MAP && op <= OP_FLAT_MAP) || op === OP_REJECT

export const isTerminalOp = (op: number): boolean =>
  (op >= OP_REDUCE && op <= OP_FIND_INDEX) || op === OP_NONE || op === OP_COUNT

export const isAccessorOp = (op: number): boolean =>
  op >= OP_HEAD && op <= OP_MAX

export const isScalarOp = (op: number): boolean =>
  (op >= OP_STR_TRIM && op <= OP_STR_IS_EMPTY) ||
  (op >= OP_DICT_KEYS && op <= OP_DICT_IS_EMPTY) ||
  (op >= OP_MATH_ADD && op <= OP_MATH_DEC) ||
  (op >= OP_GUARD_IS_NUMBER && op <= OP_GUARD_IS_FUNCTION)

export const isFuseableOrTerminal = (op: number): boolean =>
  isFuseableOp(op) || isTerminalOp(op) || isAccessorOp(op) || isScalarOp(op)

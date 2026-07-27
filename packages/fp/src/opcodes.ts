// GENERATED FILE -- do not edit by hand.
// Source: packages/fp/codegen/protocol/operator-definitions.ts
// Numeric opcodes are compact internal encodings, never semantic identity or authority.

export const OP_MAP = 1
export const OP_FILTER = 2
export const OP_TAKE = 3
export const OP_DROP = 4
export const OP_TAKE_WHILE = 5
export const OP_DROP_WHILE = 6
export const OP_FLAT_MAP = 7
export const OP_REDUCE = 8
export const OP_FOR_EACH = 9
export const OP_EVERY = 10
export const OP_SOME = 11
export const OP_FIND = 12
export const OP_FIND_INDEX = 13
export const OP_FILTER_MAP = 14
export const OP_MAP_WHILE = 15
export const OP_REJECT = 16
export const OP_TAKE_UNTIL = 19
export const OP_NONE = 17
export const OP_COUNT = 18
export const OP_FIND_MAP = 22
export const OP_SORT_BY = 20
export const OP_SORT = 21
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
export const OP_STR_TRIM = 50
export const OP_STR_LOWER = 51
export const OP_STR_UPPER = 52
export const OP_STR_TRIM_START = 53
export const OP_STR_TRIM_END = 54
export const OP_STR_SPLIT = 55
export const OP_STR_LENGTH = 56
export const OP_STR_IS_EMPTY = 57
export const OP_DICT_KEYS = 60
export const OP_DICT_VALUES = 61
export const OP_DICT_IS_EMPTY = 62
export const OP_MATH_ADD = 70
export const OP_MATH_SUBTRACT = 71
export const OP_MATH_MULTIPLY = 72
export const OP_MATH_DIVIDE = 73
export const OP_MATH_NEGATE = 74
export const OP_MATH_INC = 75
export const OP_MATH_DEC = 76
export const OP_GUARD_IS_NUMBER = 80
export const OP_GUARD_IS_STRING = 81
export const OP_GUARD_IS_BOOLEAN = 82
export const OP_GUARD_IS_NIL = 83
export const OP_GUARD_IS_ARRAY = 84
export const OP_GUARD_IS_OBJECT = 85
export const OP_GUARD_IS_FUNCTION = 86
export const OP_SORT_ASC = 90
export const OP_SORT_DESC = 91
export const OP_SCAN = 102
export const OP_WITHOUT = 103
export const OP_DROP_REPEATS = 23

export const OP_NON_FUSEABLE = 0

export const OP_CODES: Record<string, number> = {
  map: OP_MAP,
  filter: OP_FILTER,
  take: OP_TAKE,
  drop: OP_DROP,
  takeWhile: OP_TAKE_WHILE,
  dropWhile: OP_DROP_WHILE,
  flatMap: OP_FLAT_MAP,
  reject: OP_REJECT,
  filterMap: OP_FILTER_MAP,
  mapWhile: OP_MAP_WHILE,
  takeUntil: OP_TAKE_UNTIL,
  reduce: OP_REDUCE,
  forEach: OP_FOR_EACH,
  every: OP_EVERY,
  some: OP_SOME,
  find: OP_FIND,
  findIndex: OP_FIND_INDEX,
  none: OP_NONE,
  count: OP_COUNT,
  findMap: OP_FIND_MAP,
  head: OP_HEAD,
  last: OP_LAST,
  length: OP_LENGTH,
  isEmpty: OP_IS_EMPTY,
  tail: OP_TAIL,
  init: OP_INIT,
  reverse: OP_REVERSE,
  uniq: OP_UNIQ_INLINE,
  join: OP_JOIN,
  flatten: OP_FLATTEN,
  sum: OP_SUM,
  min: OP_MIN,
  max: OP_MAX,
  scan: OP_SCAN,
  without: OP_WITHOUT,
  sort: OP_SORT,
  sortBy: OP_SORT_BY,
  sortAsc: OP_SORT_ASC,
  sortDesc: OP_SORT_DESC,
  trim: OP_STR_TRIM,
  toLowerCase: OP_STR_LOWER,
  toUpperCase: OP_STR_UPPER,
  trimStart: OP_STR_TRIM_START,
  trimEnd: OP_STR_TRIM_END,
  split: OP_STR_SPLIT,
  strLength: OP_STR_LENGTH,
  strIsEmpty: OP_STR_IS_EMPTY,
  keys: OP_DICT_KEYS,
  values: OP_DICT_VALUES,
  dictIsEmpty: OP_DICT_IS_EMPTY,
  add: OP_MATH_ADD,
  subtract: OP_MATH_SUBTRACT,
  multiply: OP_MATH_MULTIPLY,
  divide: OP_MATH_DIVIDE,
  negate: OP_MATH_NEGATE,
  inc: OP_MATH_INC,
  dec: OP_MATH_DEC,
  isNumber: OP_GUARD_IS_NUMBER,
  isString: OP_GUARD_IS_STRING,
  isBoolean: OP_GUARD_IS_BOOLEAN,
  isNil: OP_GUARD_IS_NIL,
  isArray: OP_GUARD_IS_ARRAY,
  isObject: OP_GUARD_IS_OBJECT,
  isFunction: OP_GUARD_IS_FUNCTION,
  dropRepeats: OP_DROP_REPEATS,
}

export const isFuseableOp = (op: number): boolean =>
  (op >= OP_MAP && op <= OP_FLAT_MAP) ||
  op === OP_FILTER_MAP ||
  op === OP_MAP_WHILE ||
  op === OP_REJECT ||
  op === OP_TAKE_UNTIL ||
  op === OP_SCAN

export const isTerminalOp = (op: number): boolean =>
  (op >= OP_REDUCE && op <= OP_FIND_INDEX) ||
  op === OP_NONE ||
  op === OP_COUNT ||
  op === OP_FIND_MAP

export const isAccessorOp = (op: number): boolean =>
  (op >= OP_HEAD && op <= OP_MAX) || op === OP_WITHOUT

export const isScalarOp = (op: number): boolean =>
  (op >= OP_STR_TRIM && op <= OP_STR_IS_EMPTY) ||
  (op >= OP_DICT_KEYS && op <= OP_DICT_IS_EMPTY) ||
  (op >= OP_MATH_ADD && op <= OP_MATH_DEC) ||
  (op >= OP_GUARD_IS_NUMBER && op <= OP_GUARD_IS_FUNCTION)

export const isFuseableOrTerminal = (op: number): boolean =>
  isFuseableOp(op) || isTerminalOp(op) || isAccessorOp(op) || isScalarOp(op)

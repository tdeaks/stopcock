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
export const OP_CHUNK = 104
export const OP_SLIDING_WINDOW = 105
export const OP_APERTURE = 106
export const OP_INTERSPERSE = 107
export const OP_UNIQ_BY = 108
export const OP_GROUP_BY = 109
export const OP_PARTITION = 110
export const OP_ZIP = 111
export const OP_ZIP_WITH = 112
export const OP_XPROD = 113
export const OP_INTERSECTION = 114
export const OP_UNION = 115
export const OP_DIFFERENCE = 116
export const OP_SYMMETRIC_DIFFERENCE = 117
export const OP_ADJUST = 118
export const OP_UPDATE = 119
export const OP_INSERT = 120
export const OP_REMOVE = 121
export const OP_INCLUDES = 122
export const OP_FIND_OR_UNDEFINED = 24
export const OP_FIND_INDEX_OR_UNDEFINED = 25
export const OP_FIND_MAP_OR_UNDEFINED = 26
export const OP_PLUCK = 27
export const OP_DROP_LAST = 28
export const OP_TAKE_LAST = 29
export const OP_DROP_LAST_WHILE = 44
export const OP_TAKE_LAST_WHILE = 45
export const OP_APPEND = 46
export const OP_PREPEND = 47
export const OP_INDEX_OF = 48
export const OP_LAST_INDEX_OF = 49
export const OP_FIND_LAST = 92
export const OP_FIND_LAST_INDEX = 93
export const OP_REDUCE_RIGHT = 94
export const OP_REDUCE_WHILE = 95
export const OP_SUM_BY = 96
export const OP_MEAN_BY = 97
export const OP_HAS_AT_LEAST = 98
export const OP_ARRAY_STARTS_WITH = 99
export const OP_ARRAY_ENDS_WITH = 100
export const OP_NTH = 101
export const OP_SPLIT_AT = 123
export const OP_SPLIT_WHEN = 124
export const OP_SPLIT_WHENEVER = 125
export const OP_UNIQ_WITH = 126
export const OP_GROUP_WITH = 127
export const OP_CONCAT = 128
export const OP_INDEX_BY = 129
export const OP_COLLECT_BY = 130
export const OP_DROP_REPEATS_BY = 131
export const OP_DROP_REPEATS_WITH = 132
export const OP_MAP_TO_OBJ = 133
export const OP_ZIP_OBJ = 134
export const OP_GROUP_BY_PROP = 135
export const OP_SLICE = 136
export const OP_SWAP = 137
export const OP_INSERT_ALL = 138
export const OP_SPLICE = 139
export const OP_UNION_BY = 140
export const OP_UNION_WITH = 141
export const OP_INTERSECTION_BY = 142
export const OP_DIFFERENCE_BY = 143
export const OP_DIFFERENCE_WITH = 144
export const OP_SYMMETRIC_DIFFERENCE_BY = 145
export const OP_SYMMETRIC_DIFFERENCE_WITH = 146
export const OP_WITHOUT_BY = 147
export const OP_MAP_ACCUM = 148
export const OP_MAP_ACCUM_RIGHT = 149
export const OP_REDUCE_BY = 150
export const OP_TAKE_SORTED_BY = 151
export const OP_SORTED_INDEX_BY = 152
export const OP_SORTED_INDEX_WITH = 153
export const OP_SORTED_LAST_INDEX_BY = 154
export const OP_NTH_OR_UNDEFINED = 155
export const OP_INDEX_OF_OR_UNDEFINED = 156
export const OP_LAST_INDEX_OF_OR_UNDEFINED = 157
export const OP_FIND_LAST_OR_UNDEFINED = 158
export const OP_FIND_LAST_INDEX_OR_UNDEFINED = 159
export const OP_MEAN_BY_OR_UNDEFINED = 160
export const OP_MEAN_BY_NON_EMPTY = 161
export const OP_HEAD_OR_UNDEFINED = 162
export const OP_HEAD_NON_EMPTY = 163
export const OP_LAST_OR_UNDEFINED = 164
export const OP_LAST_NON_EMPTY = 165
export const OP_MIN_OR_UNDEFINED = 166
export const OP_MIN_NON_EMPTY = 167
export const OP_MAX_OR_UNDEFINED = 168
export const OP_MAX_NON_EMPTY = 169
export const OP_ONLY_OR_UNDEFINED = 170
export const OP_ONLY = 171
export const OP_MERGE_ALL = 172
export const OP_TRANSPOSE = 173
export const OP_UNNEST = 174

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
  chunk: OP_CHUNK,
  slidingWindow: OP_SLIDING_WINDOW,
  aperture: OP_APERTURE,
  intersperse: OP_INTERSPERSE,
  uniqBy: OP_UNIQ_BY,
  groupBy: OP_GROUP_BY,
  partition: OP_PARTITION,
  zip: OP_ZIP,
  zipWith: OP_ZIP_WITH,
  xprod: OP_XPROD,
  intersection: OP_INTERSECTION,
  union: OP_UNION,
  difference: OP_DIFFERENCE,
  symmetricDifference: OP_SYMMETRIC_DIFFERENCE,
  adjust: OP_ADJUST,
  update: OP_UPDATE,
  insert: OP_INSERT,
  remove: OP_REMOVE,
  includes: OP_INCLUDES,
  findOrUndefined: OP_FIND_OR_UNDEFINED,
  findIndexOrUndefined: OP_FIND_INDEX_OR_UNDEFINED,
  findMapOrUndefined: OP_FIND_MAP_OR_UNDEFINED,
  pluck: OP_PLUCK,
  dropLast: OP_DROP_LAST,
  takeLast: OP_TAKE_LAST,
  dropLastWhile: OP_DROP_LAST_WHILE,
  takeLastWhile: OP_TAKE_LAST_WHILE,
  append: OP_APPEND,
  prepend: OP_PREPEND,
  indexOf: OP_INDEX_OF,
  lastIndexOf: OP_LAST_INDEX_OF,
  findLast: OP_FIND_LAST,
  findLastIndex: OP_FIND_LAST_INDEX,
  reduceRight: OP_REDUCE_RIGHT,
  reduceWhile: OP_REDUCE_WHILE,
  sumBy: OP_SUM_BY,
  meanBy: OP_MEAN_BY,
  hasAtLeast: OP_HAS_AT_LEAST,
  arrayStartsWith: OP_ARRAY_STARTS_WITH,
  arrayEndsWith: OP_ARRAY_ENDS_WITH,
  nth: OP_NTH,
  splitAt: OP_SPLIT_AT,
  splitWhen: OP_SPLIT_WHEN,
  splitWhenever: OP_SPLIT_WHENEVER,
  uniqWith: OP_UNIQ_WITH,
  groupWith: OP_GROUP_WITH,
  concat: OP_CONCAT,
  indexBy: OP_INDEX_BY,
  collectBy: OP_COLLECT_BY,
  dropRepeatsBy: OP_DROP_REPEATS_BY,
  dropRepeatsWith: OP_DROP_REPEATS_WITH,
  mapToObj: OP_MAP_TO_OBJ,
  zipObj: OP_ZIP_OBJ,
  groupByProp: OP_GROUP_BY_PROP,
  slice: OP_SLICE,
  swap: OP_SWAP,
  insertAll: OP_INSERT_ALL,
  splice: OP_SPLICE,
  unionBy: OP_UNION_BY,
  unionWith: OP_UNION_WITH,
  intersectionBy: OP_INTERSECTION_BY,
  differenceBy: OP_DIFFERENCE_BY,
  differenceWith: OP_DIFFERENCE_WITH,
  symmetricDifferenceBy: OP_SYMMETRIC_DIFFERENCE_BY,
  symmetricDifferenceWith: OP_SYMMETRIC_DIFFERENCE_WITH,
  withoutBy: OP_WITHOUT_BY,
  mapAccum: OP_MAP_ACCUM,
  mapAccumRight: OP_MAP_ACCUM_RIGHT,
  reduceBy: OP_REDUCE_BY,
  takeSortedBy: OP_TAKE_SORTED_BY,
  sortedIndexBy: OP_SORTED_INDEX_BY,
  sortedIndexWith: OP_SORTED_INDEX_WITH,
  sortedLastIndexBy: OP_SORTED_LAST_INDEX_BY,
  nthOrUndefined: OP_NTH_OR_UNDEFINED,
  indexOfOrUndefined: OP_INDEX_OF_OR_UNDEFINED,
  lastIndexOfOrUndefined: OP_LAST_INDEX_OF_OR_UNDEFINED,
  findLastOrUndefined: OP_FIND_LAST_OR_UNDEFINED,
  findLastIndexOrUndefined: OP_FIND_LAST_INDEX_OR_UNDEFINED,
  meanByOrUndefined: OP_MEAN_BY_OR_UNDEFINED,
  meanByNonEmpty: OP_MEAN_BY_NON_EMPTY,
  headOrUndefined: OP_HEAD_OR_UNDEFINED,
  headNonEmpty: OP_HEAD_NON_EMPTY,
  lastOrUndefined: OP_LAST_OR_UNDEFINED,
  lastNonEmpty: OP_LAST_NON_EMPTY,
  minOrUndefined: OP_MIN_OR_UNDEFINED,
  minNonEmpty: OP_MIN_NON_EMPTY,
  maxOrUndefined: OP_MAX_OR_UNDEFINED,
  maxNonEmpty: OP_MAX_NON_EMPTY,
  onlyOrUndefined: OP_ONLY_OR_UNDEFINED,
  only: OP_ONLY,
  mergeAll: OP_MERGE_ALL,
  transpose: OP_TRANSPOSE,
  unnest: OP_UNNEST,
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

// GENERATED FILE -- do not edit by hand.
// Run `bun run scripts/gen-ops-table.ts` from packages/fp-compiler to regenerate.
// Source of truth: packages/fp/src/registry.ts (REGISTERED_OP_CODES).

export interface OpsTableEntry {
  readonly name: string
  readonly callbackArity: 0 | 1 | 2
  readonly bindingCount: number
}

export const OPS_TABLE: readonly OpsTableEntry[] = [
  {
    "name": "map",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "filter",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "take",
    "callbackArity": 0,
    "bindingCount": 1
  },
  {
    "name": "drop",
    "callbackArity": 0,
    "bindingCount": 1
  },
  {
    "name": "takeWhile",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "dropWhile",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "flatMap",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "reduce",
    "callbackArity": 2,
    "bindingCount": 2
  },
  {
    "name": "forEach",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "every",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "some",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "find",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "findIndex",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "filterMap",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "mapWhile",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "reject",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "none",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "count",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "takeUntil",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "sortBy",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "sort",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "findMap",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "head",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "last",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "length",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "isEmpty",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "tail",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "init",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "reverse",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "sortInline",
    "callbackArity": 1,
    "bindingCount": 1
  },
  {
    "name": "uniq",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "join",
    "callbackArity": 0,
    "bindingCount": 1
  },
  {
    "name": "flatten",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "sum",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "min",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "max",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "trim",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "toLowerCase",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "toUpperCase",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "trimStart",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "trimEnd",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "split",
    "callbackArity": 0,
    "bindingCount": 1
  },
  {
    "name": "strLength",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "strIsEmpty",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "keys",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "values",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "dictIsEmpty",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "add",
    "callbackArity": 0,
    "bindingCount": 1
  },
  {
    "name": "subtract",
    "callbackArity": 0,
    "bindingCount": 1
  },
  {
    "name": "multiply",
    "callbackArity": 0,
    "bindingCount": 1
  },
  {
    "name": "divide",
    "callbackArity": 0,
    "bindingCount": 1
  },
  {
    "name": "negate",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "inc",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "dec",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "isNumber",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "isString",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "isBoolean",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "isNil",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "isArray",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "isObject",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "isFunction",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "sortAsc",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "sortDesc",
    "callbackArity": 0,
    "bindingCount": 0
  },
  {
    "name": "takeStream",
    "callbackArity": 0,
    "bindingCount": 1
  },
  {
    "name": "scanStream",
    "callbackArity": 2,
    "bindingCount": 2
  },
  {
    "name": "scan",
    "callbackArity": 2,
    "bindingCount": 2
  },
  {
    "name": "without",
    "callbackArity": 0,
    "bindingCount": 1
  }
]

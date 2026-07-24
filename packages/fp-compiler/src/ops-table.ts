// GENERATED FILE -- do not edit by hand.
// Run `bun run scripts/gen-ops-table.ts` from packages/fp-compiler to regenerate.
// Sources of truth: packages/fp/src/array.ts public exports and registry metadata.

export interface OpsTableEntry {
  readonly name: string
  readonly callbackArity: 0 | 1 | 2
  readonly bindings: readonly ('fn' | 'a1' | 'a2')[]
}

export const OPS_TABLE: readonly OpsTableEntry[] = [
  {
    "name": "map",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "filter",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "take",
    "callbackArity": 0,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "drop",
    "callbackArity": 0,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "takeWhile",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "dropWhile",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "flatMap",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "reduce",
    "callbackArity": 2,
    "bindings": [
      "fn",
      "a1"
    ]
  },
  {
    "name": "forEach",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "every",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "some",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "find",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "findIndex",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "filterMap",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "mapWhile",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "reject",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "none",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "count",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "takeUntil",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "sortBy",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "sort",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "findMap",
    "callbackArity": 1,
    "bindings": [
      "fn"
    ]
  },
  {
    "name": "head",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "last",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "length",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "isEmpty",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "tail",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "init",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "reverse",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "uniq",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "join",
    "callbackArity": 0,
    "bindings": [
      "a1"
    ]
  },
  {
    "name": "flatten",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "sum",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "min",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "max",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "sortAsc",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "sortDesc",
    "callbackArity": 0,
    "bindings": []
  },
  {
    "name": "scan",
    "callbackArity": 2,
    "bindings": [
      "fn",
      "a1"
    ]
  },
  {
    "name": "without",
    "callbackArity": 0,
    "bindings": [
      "fn"
    ]
  }
]

export type PathSegment = string | number
export type Path = readonly PathSegment[]

export type Operation =
  | { readonly op: 'add'; readonly path: Path; readonly value: unknown }
  | { readonly op: 'remove'; readonly path: Path; readonly oldValue: unknown }
  | { readonly op: 'replace'; readonly path: Path; readonly oldValue: unknown; readonly newValue: unknown }
  | { readonly op: 'move'; readonly from: Path; readonly path: Path }
  | { readonly op: 'rename'; readonly path: Path; readonly oldKey: string; readonly newKey: string }
  | { readonly op: 'test'; readonly path: Path; readonly value: unknown }

export type Patch = { readonly _tag: 'Patch'; readonly ops: readonly Operation[] }

export type PatchError = {
  readonly _tag: 'PatchError'
  readonly message: string
  readonly op: Operation
  readonly path: Path
}

export type ConflictError = {
  readonly _tag: 'ConflictError'
  readonly message: string
  readonly local: Operation
  readonly remote: Operation
}

export type DiffOptions = {
  readonly eq?: (a: unknown, b: unknown) => boolean
  readonly detectMoves?: boolean
  readonly detectRenames?: boolean
}

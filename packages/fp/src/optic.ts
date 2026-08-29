import { deep as deepEq } from './eq'
import { isNone, isSome, none, some as optionSome, type Option } from './option'
import { err as resultErr, isErr, isOk, ok as resultOk, type Result } from './result'

export interface Lens<S, A, T = S, B = A> {
  readonly _tag: 'Lens'
  readonly get: (source: S) => A
  readonly replace: (source: S, focus: B) => T
}

export interface Optional<S, A, T = S, B = A> {
  readonly _tag: 'Optional'
  readonly preview: (source: S) => Option<A>
  readonly replace: (source: S, focus: B) => T
}

export interface Prism<S, A, T = S, B = A> {
  readonly _tag: 'Prism'
  readonly preview: (source: S) => Option<A>
  readonly replace: (source: S, focus: B) => T
}

export interface Traversal<S, A, T = S, B = A> {
  readonly _tag: 'Traversal'
  readonly collect: (source: S) => readonly A[]
  readonly modify: (source: S, f: (focus: A) => B) => T
}

export interface Iso<S, A, T = S, B = A> {
  readonly _tag: 'Iso'
  readonly to: (source: S) => A
  readonly from: (focus: B) => T
}

export interface Getter<S, A> {
  readonly _tag: 'Getter'
  readonly get: (source: S) => A
}

export interface Fold<S, A> {
  readonly _tag: 'Fold'
  readonly collect: (source: S) => readonly A[]
}

export interface Setter<S, A, T = S, B = A> {
  readonly _tag: 'Setter'
  readonly modify: (source: S, f: (focus: A) => B) => T
}

export type At<S, A, T = S, B = A> = Lens<S, Option<A>, T, Option<B>>

export type Optic<S, A, T = S, B = A> =
  | Lens<S, A, T, B>
  | Optional<S, A, T, B>
  | Prism<S, A, T, B>
  | Traversal<S, A, T, B>
  | Iso<S, A, T, B>
  | Getter<S, A>
  | Fold<S, A>
  | Setter<S, A, T, B>

export const lens = <S, A, T = S, B = A>(
  get: (source: S) => A,
  replace: (source: S, focus: B) => T,
): Lens<S, A, T, B> => ({ _tag: 'Lens', get, replace })

export const optional = <S, A, T = S, B = A>(
  preview: (source: S) => Option<A>,
  replace: (source: S, focus: B) => T,
): Optional<S, A, T, B> => ({ _tag: 'Optional', preview, replace })

export const prism = <S, A, T = S, B = A>(
  preview: (source: S) => Option<A>,
  replace: (source: S, focus: B) => T,
): Prism<S, A, T, B> => ({ _tag: 'Prism', preview, replace })

export const traversal = <S, A, T = S, B = A>(
  collect: (source: S) => readonly A[],
  modify: (source: S, f: (focus: A) => B) => T,
): Traversal<S, A, T, B> => ({ _tag: 'Traversal', collect, modify })

export const iso = <S, A, T = S, B = A>(
  to: (source: S) => A,
  from: (focus: B) => T,
): Iso<S, A, T, B> => ({ _tag: 'Iso', to, from })

export const getter = <S, A>(get: (source: S) => A): Getter<S, A> => ({
  _tag: 'Getter',
  get,
})

export const fold = <S, A>(collect: (source: S) => readonly A[]): Fold<S, A> => ({
  _tag: 'Fold',
  collect,
})

export const setter = <S, A, T = S, B = A>(
  modify: (source: S, f: (focus: A) => B) => T,
): Setter<S, A, T, B> => ({ _tag: 'Setter', modify })

export const prop = <S extends object, K extends keyof S>(key: K): Lens<S, S[K]> =>
  lens(
    (source) => source[key],
    (source, focus) => {
      if (Object.is(source[key], focus)) return source
      return Object.assign(Object.create(Object.getPrototypeOf(source)), source, {
        [key]: focus,
      }) as S
    },
  )

export const index = <A>(position: number): Optional<readonly A[], A, A[]> =>
  optional(
    (source) => (position >= 0 && position < source.length ? optionSome(source[position]) : none),
    (source, focus) => {
      if (position < 0 || position >= source.length) return source.slice()
      const output = source.slice()
      output[position] = focus
      return output
    },
  )

export const find = <A>(
  predicate: (value: A, index: number) => boolean,
): Optional<readonly A[], A, A[]> =>
  optional(
    (source) => {
      const position = source.findIndex(predicate)
      return position === -1 ? none : optionSome(source[position])
    },
    (source, focus) => {
      const position = source.findIndex(predicate)
      if (position === -1) return source.slice()
      const output = source.slice()
      output[position] = focus
      return output
    },
  )

export const each = <A>(): Traversal<readonly A[], A, A[]> =>
  traversal(
    (source) => source,
    (source, f) => {
      const output = new Array<A>(source.length)
      for (let position = 0; position < source.length; position++) {
        output[position] = f(source[position])
      }
      return output
    },
  )

export const filtered = <A>(predicate: (value: A) => boolean): Traversal<readonly A[], A, A[]> =>
  traversal(
    (source) => source.filter(predicate),
    (source, f) => source.map((value) => (predicate(value) ? f(value) : value)),
  )

/** Focuses a value only when the predicate accepts it. */
export const fromPredicate = <A>(predicate: (value: A) => boolean): Prism<A, A> =>
  prism(
    (source) => (predicate(source) ? optionSome(source) : none),
    (_source, focus) => focus,
  )

/** Focuses the present branch of an Option. */
export const some = <A, B = A>(): Prism<Option<A>, A, Option<B>, B> =>
  prism(
    (source) => (isSome(source) ? optionSome(source.value) : none),
    (_source, focus) => optionSome(focus),
  )

/** Focuses the success branch of a Result. */
export const ok = <A, E, B = A>(): Prism<Result<A, E>, A, Result<B, E>, B> =>
  prism(
    (source) => (isOk(source) ? optionSome(source.value) : none),
    (_source, focus) => resultOk(focus),
  )

/** Focuses the failure branch of a Result. */
export const err = <A, E, F = E>(): Prism<Result<A, E>, E, Result<A, F>, F> =>
  prism(
    (source) => (isErr(source) ? optionSome(source.error) : none),
    (_source, focus) => resultErr(focus),
  )

/** Focuses non-nullish values while leaving nullish inputs unchanged. */
export const nonNullable = <A>(): Prism<A | null | undefined, A> =>
  prism(
    (source) => (source == null ? none : optionSome(source)),
    (_source, focus) => focus,
  )

/** Reverses the direction of an isomorphism. */
export const reverse = <S, A, T = S, B = A>(value: Iso<S, A, T, B>): Iso<B, T, A, S> =>
  iso(value.from, value.to)

export const at = <K, V>(key: K): At<ReadonlyMap<K, V>, V, Map<K, V>> =>
  lens(
    (source) => (source.has(key) ? optionSome(source.get(key) as V) : none),
    (source, focus) => {
      const output = new Map(source)
      if (isSome(focus)) output.set(key, focus.value)
      else output.delete(key)
      return output
    },
  )

export const atKey = <K extends PropertyKey, V>(
  key: K,
): At<Readonly<Partial<Record<K, V>>>, V, Partial<Record<K, V>>> =>
  lens(
    (source) =>
      Object.prototype.hasOwnProperty.call(source, key) ? optionSome(source[key] as V) : none,
    (source, focus) => {
      const output = Object.assign(Object.create(null), source) as Partial<Record<K, V>>
      if (isSome(focus)) {
        Object.defineProperty(output, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: focus.value,
        })
      } else {
        Reflect.deleteProperty(output, key)
      }
      return output
    },
  )

const previewAny = <S, A, T, B>(optic: Optic<S, A, T, B>, source: S): Option<A> => {
  switch (optic._tag) {
    case 'Lens':
    case 'Getter':
      return optionSome(optic.get(source))
    case 'Iso':
      return optionSome(optic.to(source))
    case 'Optional':
    case 'Prism':
      return optic.preview(source)
    case 'Traversal':
    case 'Fold': {
      const values = optic.collect(source)
      return values.length === 0 ? none : optionSome(values[0])
    }
    case 'Setter':
      return none
  }
}

const collectAny = <S, A, T, B>(optic: Optic<S, A, T, B>, source: S): readonly A[] => {
  switch (optic._tag) {
    case 'Lens':
    case 'Getter':
      return [optic.get(source)]
    case 'Iso':
      return [optic.to(source)]
    case 'Optional':
    case 'Prism': {
      const value = optic.preview(source)
      return isSome(value) ? [value.value] : []
    }
    case 'Traversal':
    case 'Fold':
      return optic.collect(source)
    case 'Setter':
      return []
  }
}

const modifyAny = <S, A, T, B>(optic: Optic<S, A, T, B>, source: S, f: (focus: A) => B): T => {
  switch (optic._tag) {
    case 'Lens':
      return optic.replace(source, f(optic.get(source)))
    case 'Iso':
      return optic.from(f(optic.to(source)))
    case 'Optional':
    case 'Prism': {
      const focus = optic.preview(source)
      return isSome(focus) ? optic.replace(source, f(focus.value)) : (source as unknown as T)
    }
    case 'Traversal':
    case 'Setter':
      return optic.modify(source, f)
    case 'Getter':
    case 'Fold':
      throw new TypeError(`Cannot modify a read-only ${optic._tag}`)
  }
}

const replaceAny = <S, A, T, B>(optic: Optic<S, A, T, B>, source: S, focus: B): T => {
  switch (optic._tag) {
    case 'Lens':
      return optic.replace(source, focus)
    case 'Iso':
      return optic.from(focus)
    case 'Optional':
    case 'Prism':
      return isSome(optic.preview(source)) ? optic.replace(source, focus) : (source as unknown as T)
    case 'Traversal':
    case 'Setter':
      return optic.modify(source, () => focus)
    case 'Getter':
    case 'Fold':
      throw new TypeError(`Cannot modify a read-only ${optic._tag}`)
  }
}

const maximumSafeSpreadLength = 16_384

export function view<S, A>(optic: Lens<S, A> | Iso<S, A> | Getter<S, A>, source: S): A
export function view<S, A>(optic: Lens<S, A> | Iso<S, A> | Getter<S, A>): (source: S) => A
export function view<S, A>(
  optic: Lens<S, A> | Iso<S, A> | Getter<S, A>,
  source?: S,
): A | ((source: S) => A) {
  if (arguments.length !== 1) {
    return optic._tag === 'Iso' ? optic.to(source as S) : optic.get(source as S)
  }
  return (source: S): A =>
    optic._tag === 'Iso' ? optic.to(source) : optic.get(source)
}

export function preview<S, A, T, B>(optic: Optic<S, A, T, B>, source: S): Option<A>
export function preview<S, A, T, B>(optic: Optic<S, A, T, B>): (source: S) => Option<A>
export function preview<S, A, T, B>(
  optic: Optic<S, A, T, B>,
  source?: S,
): Option<A> | ((source: S) => Option<A>) {
  if (arguments.length !== 1) {
    switch (optic._tag) {
      case 'Lens':
      case 'Getter':
        return optionSome(optic.get(source as S))
      case 'Iso':
        return optionSome(optic.to(source as S))
      case 'Optional':
      case 'Prism':
        return optic.preview(source as S)
      case 'Traversal':
      case 'Fold': {
        const values = optic.collect(source as S)
        return values.length === 0 ? none : optionSome(values[0])
      }
      case 'Setter':
        return none
    }
  }
  return (source: S): Option<A> =>
    previewAny(optic, source)
}

export function collect<S, A, T, B>(optic: Optic<S, A, T, B>, source: S): readonly A[]
export function collect<S, A, T, B>(optic: Optic<S, A, T, B>): (source: S) => readonly A[]
export function collect<S, A, T, B>(
  optic: Optic<S, A, T, B>,
  source?: S,
): readonly A[] | ((source: S) => readonly A[]) {
  if (arguments.length !== 1) {
    switch (optic._tag) {
      case 'Lens':
      case 'Getter':
        return [optic.get(source as S)]
      case 'Iso':
        return [optic.to(source as S)]
      case 'Optional':
      case 'Prism': {
        const value = optic.preview(source as S)
        return isSome(value) ? [value.value] : []
      }
      case 'Traversal':
      case 'Fold':
        return optic.collect(source as S)
      case 'Setter':
        return []
    }
  }
  return (source: S): readonly A[] =>
    collectAny(optic, source)
}

export function modify<S, A, T, B>(optic: Optic<S, A, T, B>, source: S, f: (focus: A) => B): T
export function modify<S, A, T, B>(optic: Optic<S, A, T, B>, f: (focus: A) => B): (source: S) => T
export function modify<S, A, T, B>(
  optic: Optic<S, A, T, B>,
  sourceOrFn: S | ((focus: A) => B),
  maybeFn?: (focus: A) => B,
): T | ((source: S) => T) {
  if (arguments.length !== 2) {
    const source = sourceOrFn as S
    const f = maybeFn as (focus: A) => B
    switch (optic._tag) {
      case 'Lens':
        return optic.replace(source, f(optic.get(source)))
      case 'Iso':
        return optic.from(f(optic.to(source)))
      case 'Optional':
      case 'Prism': {
        const focus = optic.preview(source)
        return isSome(focus) ? optic.replace(source, f(focus.value)) : (source as unknown as T)
      }
      case 'Traversal':
      case 'Setter':
        return optic.modify(source, f)
      case 'Getter':
      case 'Fold':
        throw new TypeError(`Cannot modify a read-only ${optic._tag}`)
    }
  }
  const f = sourceOrFn as (focus: A) => B
  return (source: S): T =>
    modifyAny(optic, source, f)
}

export function set<S, A, T, B>(optic: Optic<S, A, T, B>, source: S, focus: B): T
export function set<S, A, T, B>(optic: Optic<S, A, T, B>, focus: B): (source: S) => T
export function set<S, A, T, B>(
  optic: Optic<S, A, T, B>,
  sourceOrFocus: S | B,
  maybeFocus?: B,
): T | ((source: S) => T) {
  if (arguments.length !== 2) {
    const source = sourceOrFocus as S
    const focus = maybeFocus as B
    switch (optic._tag) {
      case 'Lens':
        return optic.replace(source, focus)
      case 'Iso':
        return optic.from(focus)
      case 'Optional':
      case 'Prism':
        return isSome(optic.preview(source))
          ? optic.replace(source, focus)
          : (source as unknown as T)
      case 'Traversal':
      case 'Setter':
        return optic.modify(source, () => focus)
      case 'Getter':
      case 'Fold':
        throw new TypeError(`Cannot modify a read-only ${optic._tag}`)
    }
  }
  const focus = sourceOrFocus as B
  return (source: S): T =>
    replaceAny(optic, source, focus)
}

export function compose<S, A, T, B, C, U, D>(
  outer: Lens<S, A, T, B>,
  inner: Lens<A, C, B, D>,
): Lens<S, C, T, D>
export function compose<S, A, T, B, C, U, D>(
  outer: Lens<S, A, T, B>,
  inner: Optional<A, C, B, D> | Prism<A, C, B, D>,
): Optional<S, C, T, D>
export function compose<S, A, T, B, C, U, D>(
  outer: Optional<S, A, T, B> | Prism<S, A, T, B>,
  inner: Lens<A, C, B, D> | Optional<A, C, B, D> | Prism<A, C, B, D>,
): Optional<S, C, T, D>
export function compose<S, A, T, B, C, U, D>(
  outer: Optic<S, A, T, B>,
  inner: Optic<A, C, B, D>,
): Traversal<S, C, T, D>
export function compose<S, A, T, B, C, D>(
  outer: Optic<S, A, T, B>,
  inner: Optic<A, C, B, D>,
): Optic<S, C, T, D> {
  if (outer._tag === 'Lens' && inner._tag === 'Lens') {
    return lens(
      (source) => inner.get(outer.get(source)),
      (source, focus) => outer.replace(source, inner.replace(outer.get(source), focus)),
    )
  }
  const outerAtMostOne =
    outer._tag === 'Lens' ||
    outer._tag === 'Optional' ||
    outer._tag === 'Prism' ||
    outer._tag === 'Iso'
  const innerAtMostOne =
    inner._tag === 'Lens' ||
    inner._tag === 'Optional' ||
    inner._tag === 'Prism' ||
    inner._tag === 'Iso'
  if (outerAtMostOne && innerAtMostOne) {
    return optional<S, C, T, D>(
      (source) => {
        const first = previewAny<S, A, T, B>(outer, source)
        return isNone(first) ? none : previewAny<A, C, B, D>(inner, first.value)
      },
      (source, focus) =>
        modifyAny<S, A, T, B>(
          outer,
          source,
          (first): B => replaceAny<A, C, B, D>(inner, first, focus),
        ),
    )
  }
  return traversal<S, C, T, D>(
    (source) => {
      const output: C[] = []
      for (const first of collectAny<S, A, T, B>(outer, source)) {
        const values = collectAny<A, C, B, D>(inner, first)
        if (values.length <= maximumSafeSpreadLength) {
          output.push(...values)
        } else {
          for (const value of values) output.push(value)
        }
      }
      return output
    },
    (source, f) =>
      modifyAny<S, A, T, B>(outer, source, (first): B => modifyAny<A, C, B, D>(inner, first, f)),
  )
}

export interface OpticBuilder<S, A> {
  readonly value: Optic<S, A>
  readonly prop: A extends object ? <K extends keyof A>(key: K) => OpticBuilder<S, A[K]> : never
  readonly index: A extends readonly (infer B)[] ? (position: number) => OpticBuilder<S, B> : never
}

const builder = <S, A>(value: Optic<S, A>): OpticBuilder<S, A> => ({
  value,
  prop: ((key: PropertyKey): OpticBuilder<S, unknown> =>
    builder(
      compose(
        value as unknown as Optic<S, Record<PropertyKey, unknown>>,
        prop<Record<PropertyKey, unknown>, PropertyKey>(key),
      ),
    )) as OpticBuilder<S, A>['prop'],
  index: ((position: number) =>
    builder(
      compose(value as unknown as Optic<S, readonly unknown[]>, index(position)),
    )) as OpticBuilder<S, A>['index'],
})

export const optic = <S>(): OpticBuilder<S, S> =>
  builder(
    lens(
      (source: S) => source,
      (_source, focus: S) => focus,
    ),
  )

export const laws = {
  lensGetSet: <S, A>(
    optic: Lens<S, A>,
    source: S,
    equals: (left: S, right: S) => boolean = deepEq.equals,
  ): boolean => equals(set(optic, view(optic)(source))(source), source),
  lensSetGet: <S, A>(
    optic: Lens<S, A>,
    source: S,
    focus: A,
    equals: (left: A, right: A) => boolean = deepEq.equals,
  ): boolean => equals(view(optic)(set(optic, focus)(source)), focus),
  lensSetSet: <S, A>(
    optic: Lens<S, A>,
    source: S,
    first: A,
    second: A,
    equals: (left: S, right: S) => boolean = deepEq.equals,
  ): boolean => equals(set(optic, second)(set(optic, first)(source)), set(optic, second)(source)),
}

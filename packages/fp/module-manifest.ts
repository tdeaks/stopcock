export interface PublicModule {
  readonly subpath: string
  readonly entry: string
}

/**
 * Canonical @stopcock/fp 2.x entrypoint manifest.
 *
 * Vite entries, package exports, package-contract tests, and generated API
 * documentation consume this list. Keep specialist modules off the root.
 */
export const PUBLIC_MODULES = [
  { subpath: '.', entry: 'src/index.ts' },
  { subpath: './array', entry: 'src/array.ts' },
  { subpath: './readonly-array', entry: 'src/readonly-array.ts' },
  { subpath: './non-empty-array', entry: 'src/non-empty-array.ts' },
  { subpath: './tuple', entry: 'src/tuple.ts' },
  { subpath: './record', entry: 'src/record.ts' },
  { subpath: './map', entry: 'src/map.ts' },
  { subpath: './set', entry: 'src/set.ts' },
  { subpath: './typed-array', entry: 'src/typed-array.ts' },
  { subpath: './indexed', entry: 'src/indexed.ts' },
  { subpath: './iter', entry: 'src/iter.ts' },
  { subpath: './option', entry: 'src/option.ts' },
  { subpath: './result', entry: 'src/result.ts' },
  { subpath: './validation', entry: 'src/validation.ts' },
  { subpath: './schema', entry: 'src/schema.ts' },
  { subpath: './these', entry: 'src/these.ts' },
  { subpath: './nullable', entry: 'src/nullable.ts' },
  { subpath: './eq', entry: 'src/eq.ts' },
  { subpath: './hash', entry: 'src/hash.ts' },
  { subpath: './ord', entry: 'src/ord.ts' },
  { subpath: './ordering', entry: 'src/ordering.ts' },
  { subpath: './semigroup', entry: 'src/semigroup.ts' },
  { subpath: './monoid', entry: 'src/monoid.ts' },
  { subpath: './group', entry: 'src/group.ts' },
  { subpath: './function', entry: 'src/function.ts' },
  { subpath: './guard', entry: 'src/guard.ts' },
  { subpath: './object', entry: 'src/object.ts' },
  { subpath: './string', entry: 'src/string.ts' },
  { subpath: './number', entry: 'src/number.ts' },
  { subpath: './math', entry: 'src/math.ts' },
  { subpath: './boolean', entry: 'src/boolean.ts' },
  { subpath: './dual', entry: 'src/dual.ts' },
  { subpath: './compile', entry: 'src/compile.ts' },
  { subpath: './fusion', entry: 'src/fusion.ts' },
  { subpath: './fusion/optimized', entry: 'src/fusion-optimized.ts' },
  { subpath: './fusion/debug', entry: 'src/fusion-debug.ts' },
  { subpath: './optic', entry: 'src/optic.ts' },
  { subpath: './match', entry: 'src/match.ts' },
  { subpath: './transducer', entry: 'src/transducer.ts' },
  { subpath: './collector', entry: 'src/collector.ts' },
  { subpath: './reader', entry: 'src/reader.ts' },
  { subpath: './state-fn', entry: 'src/state-fn.ts' },
  { subpath: './writer', entry: 'src/writer.ts' },
  { subpath: './recursion', entry: 'src/recursion.ts' },
] as const satisfies readonly PublicModule[]

export const buildEntries = (): Record<string, string> =>
  Object.fromEntries(
    PUBLIC_MODULES.map(({ subpath, entry }) => [
      subpath === '.' ? 'index' : subpath.slice(2),
      entry,
    ]),
  )

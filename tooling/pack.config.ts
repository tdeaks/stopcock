import { resolve } from 'node:path'
import type { PackUserConfig } from 'vite-plus/pack'

const virtualPrefix = 'virtual:stopcock-pack-entry/'
const resolvedVirtualPrefix = `\0${virtualPrefix}`

export const libraryBuildTask = () => ({
  command: 'node ../../tooling/build-package.mjs',
  input: [{ auto: true as const }, '!dist/**'],
  output: ['dist/**'],
})

export const libraryPack = (
  entries: Record<string, string>,
  bundledDependencies: Array<string | RegExp> = [],
): PackUserConfig => {
  const names = Object.keys(entries)
  const multipleEntries = names.length > 1
  const [primaryEntry, ...facadeEntries] = names

  return {
    entry: multipleEntries
      ? Object.fromEntries([
          [primaryEntry, entries[primaryEntry]],
          ...facadeEntries.map((name) => [name, `${virtualPrefix}${name}`]),
        ])
      : Object.values(entries),
    format: ['esm'],
    dts: false,
    fixedExtension: false,
    // Published ESM is an input to the consumer's bundler. Keeping it
    // unminified preserves useful stack traces and avoids engine optimiser
    // cliffs caused by pre-mangling very large shared chunks; applications
    // still minify the final, tree-shaken output.
    minify: false,
    treeshake: true,
    sourcemap: false,
    clean: true,
    deps: {
      onlyBundle: bundledDependencies,
    },
    inputOptions: {
      preserveEntrySignatures: 'strict',
    },
    plugins: multipleEntries
      ? [
          {
            name: 'stopcock-pack-entry-facades',
            resolveId(id) {
              if (id.startsWith(virtualPrefix)) return `\0${id}`
            },
            load(id) {
              if (!id.startsWith(resolvedVirtualPrefix)) return
              const name = id.slice(resolvedVirtualPrefix.length)
              const source = entries[name]
              if (!source) return
              return `export * from ${JSON.stringify(resolve(source))}`
            },
          },
        ]
      : [],
  }
}

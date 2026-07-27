import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

const pack = libraryPack({
  index: 'src/index.ts',
  vite: 'src/vite.ts',
  rollup: 'src/rollup.ts',
  esbuild: 'src/esbuild.ts',
})
const packPlugins = Array.isArray(pack.plugins)
  ? pack.plugins
  : pack.plugins === undefined
    ? []
    : [pack.plugins]

// The `stopcock` bin is a real entry rather than a re-export facade: it has to
// keep its shebang and must not drag the transform pipeline into its chunk.
const shebang = {
  name: 'stopcock-cli-shebang',
  renderChunk(code: string, chunk: { name: string }) {
    if (chunk.name !== 'cli' || code.startsWith('#!')) return null
    return { code: `#!/usr/bin/env node\n${code}`, map: null }
  },
}

export default defineConfig({
  pack: {
    ...pack,
    entry: {
      ...(pack.entry as Record<string, string>),
      cli: 'src/cli.ts',
    },
    plugins: [...packPlugins, shebang],
  },
  run: {
    tasks: {
      build: libraryBuildTask(),
    },
  },
})

import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const src = (mod: string) => path.resolve(__dirname, `../packages/${mod}/src/index.ts`)

export default defineConfig({
  resolve: {
    alias: {
      '@stopcock/fp': src('fp'),
      '@stopcock/autodiff': src('autodiff'),
      '@stopcock/la': src('la'),
    },
  },
  test: {
    include: ['src/ensure-identical-output.ts', 'src/autodiff-validate.test.ts'],
  },
})

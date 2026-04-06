import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = (mod: string) => path.resolve(__dirname, `../packages/stopcock/dist/${mod}.js`)

export default defineConfig({
  resolve: {
    alias: {
      '@stopcock/fp': dist('fp'),
      '@stopcock/date': dist('date'),
    },
  },
  test: {
    benchmark: {
      include: ['src/**/*.bench.ts'],
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: undefined,
      },
    },
    fileParallelism: true,
  },
})

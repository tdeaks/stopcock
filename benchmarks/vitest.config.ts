import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const src = (mod: string) => path.resolve(__dirname, `../packages/stopcock/src/${mod}/index.ts`)

export default defineConfig({
  resolve: {
    alias: {
      '@stopcock/fp': src('fp'),
      '@stopcock/la': src('la'),
      '@stopcock/signal': src('signal'),
      '@stopcock/img': src('img'),
      '@stopcock/compress': src('compress'),
      '@stopcock/hash': src('hash'),
      '@stopcock/search': src('search'),
      '@stopcock/date': src('date'),
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

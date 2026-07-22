import { defineConfig } from 'vite-plus'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const src = (mod: string) => path.resolve(__dirname, `../packages/${mod}/src/index.ts`)

export default defineConfig({
  resolve: {
    alias: {
      '@stopcock/fp': src('fp'),
      '@stopcock/autodiff/tape': path.resolve(__dirname, '../packages/autodiff/src/tape.ts'),
      '@stopcock/autodiff': src('autodiff'),
      '@stopcock/la/accel': path.resolve(__dirname, '../packages/la/src/accel.ts'),
      '@stopcock/la/fast': path.resolve(__dirname, '../packages/la/src/fast.ts'),
      '@stopcock/la/primitives': path.resolve(__dirname, '../packages/la/src/primitives.ts'),
      '@stopcock/la': src('la'),
      '@stopcock/img': src('img'),
      '@stopcock/date': src('date'),
      '@stopcock/color': src('color'),
      '@stopcock/signal': src('signal'),
      '@stopcock/synth': src('synth'),
      '@stopcock/diff': src('diff'),
      '@stopcock/state': src('state'),
    },
  },
  test: {
    benchmark: {
      include: ['src/**/*.bench.ts'],
    },
    setupFiles: ['./src/identity-setup.ts'],
    pool: 'forks',
    fileParallelism: true,
  },
})

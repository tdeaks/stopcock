import { defineConfig } from 'vite-plus'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const src = (mod: string) => path.resolve(__dirname, `../packages/${mod}/src/index.ts`)
const fpSrc = (subpath = 'index') => path.resolve(__dirname, `../packages/fp/src/${subpath}.ts`)

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@stopcock\/fp\/(.+)$/, replacement: fpSrc('$1') },
      { find: /^@stopcock\/fp$/, replacement: fpSrc() },
      {
        find: '@stopcock/autodiff/tape',
        replacement: path.resolve(__dirname, '../packages/autodiff/src/tape.ts'),
      },
      { find: '@stopcock/autodiff', replacement: src('autodiff') },
      {
        find: '@stopcock/la/accel',
        replacement: path.resolve(__dirname, '../packages/la/src/accel.ts'),
      },
      {
        find: '@stopcock/la/fast',
        replacement: path.resolve(__dirname, '../packages/la/src/fast.ts'),
      },
      {
        find: '@stopcock/la/primitives',
        replacement: path.resolve(__dirname, '../packages/la/src/primitives.ts'),
      },
      { find: '@stopcock/la', replacement: src('la') },
      { find: '@stopcock/img', replacement: src('img') },
      { find: '@stopcock/date', replacement: src('date') },
      { find: '@stopcock/color', replacement: src('color') },
      { find: '@stopcock/signal', replacement: src('signal') },
      { find: '@stopcock/synth', replacement: src('synth') },
      { find: '@stopcock/diff', replacement: src('diff') },
      { find: '@stopcock/state', replacement: src('state') },
    ],
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

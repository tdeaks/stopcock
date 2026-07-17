import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: [
      { find: '@stopcock/la/accel', replacement: path.resolve(__dirname, '../../packages/la/src/accel.ts') },
      { find: '@stopcock/la/fast', replacement: path.resolve(__dirname, '../../packages/la/src/fast.ts') },
      { find: '@stopcock/la/primitives', replacement: path.resolve(__dirname, '../../packages/la/src/primitives.ts') },
      { find: '@stopcock/fp/dual', replacement: path.resolve(__dirname, '../../packages/fp/src/dual-lite.ts') },
      { find: '@stopcock/fp/option', replacement: path.resolve(__dirname, '../../packages/fp/src/option.ts') },
      { find: '@stopcock/fp/result', replacement: path.resolve(__dirname, '../../packages/fp/src/result.ts') },
      { find: '@stopcock/svg/la', replacement: path.resolve(__dirname, '../../packages/svg/src/la/index.ts') },
      { find: '@stopcock/color', replacement: path.resolve(__dirname, '../../packages/color/src/index.ts') },
      { find: '@stopcock/autodiff/tape', replacement: path.resolve(__dirname, '../../packages/autodiff/src/tape.ts') },
      { find: '@stopcock/autodiff', replacement: path.resolve(__dirname, '../../packages/autodiff/src/index.ts') },
      { find: '@stopcock/la', replacement: path.resolve(__dirname, '../../packages/la/src/index.ts') },
      { find: '@stopcock/signal', replacement: path.resolve(__dirname, '../../packages/signal/src/index.ts') },
      { find: '@stopcock/synth', replacement: path.resolve(__dirname, '../../packages/synth/src/index.ts') },
      { find: '@stopcock/fp', replacement: path.resolve(__dirname, '../../packages/fp/src/index.ts') },
      { find: '@stopcock/svg', replacement: path.resolve(__dirname, '../../packages/svg/src/index.ts') },
    ],
  },
  test: {
    include: ['src/lib/**/*.test.ts'],
  },
})

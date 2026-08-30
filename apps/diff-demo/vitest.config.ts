import { defineConfig } from 'vite-plus'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@stopcock/state': path.resolve(__dirname, '../../packages/state/src/index.ts'),
      '@stopcock/diff': path.resolve(__dirname, '../../packages/diff/src/index.ts'),
      '@stopcock/fp/eq': path.resolve(__dirname, '../../packages/fp/src/eq.ts'),
      '@stopcock/fp/result': path.resolve(__dirname, '../../packages/fp/src/result.ts'),
      '@stopcock/fp/optic': path.resolve(__dirname, '../../packages/fp/src/optic.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

import { defineConfig, lazyPlugins } from 'vite-plus'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: lazyPlugins(() => [react()]),
  resolve: {
    alias: {
      '@stopcock/state/react': path.resolve(__dirname, '../../packages/state/src/react.ts'),
      '@stopcock/state': path.resolve(__dirname, '../../packages/state/src/index.ts'),
      '@stopcock/diff': path.resolve(__dirname, '../../packages/diff/src/index.ts'),
      '@stopcock/fp/eq': path.resolve(__dirname, '../../packages/fp/src/eq.ts'),
      '@stopcock/fp/result': path.resolve(__dirname, '../../packages/fp/src/result.ts'),
      '@stopcock/fp/optic': path.resolve(__dirname, '../../packages/fp/src/optic.ts'),
    },
  },
  run: {
    tasks: {
      build: ['tsc -b', 'vp build'],
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@stopcock/state/react': path.resolve(__dirname, '../../packages/state/src/react.ts'),
      '@stopcock/state': path.resolve(__dirname, '../../packages/state/src/index.ts'),
      '@stopcock/http': path.resolve(__dirname, '../../packages/http/src/index.ts'),
      '@stopcock/async': path.resolve(__dirname, '../../packages/async/src/index.ts'),
      '@stopcock/fp': path.resolve(__dirname, '../../packages/fp/src/index.ts'),
      '@stopcock/diff': path.resolve(__dirname, '../../packages/diff/src/index.ts'),
    },
  },
})

import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@stopcock/color': path.resolve(__dirname, '../../packages/color/src/index.ts'),
      '@stopcock/fp': path.resolve(__dirname, '../../packages/fp/src/index.ts'),
    },
  },
})

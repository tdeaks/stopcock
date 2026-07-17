import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import path from 'path'

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@stopcock/synth': path.resolve(__dirname, '../../packages/synth/src/index.ts'),
      '@stopcock/fp': path.resolve(__dirname, '../../packages/fp/src/index.ts'),
      '@stopcock/signal': path.resolve(__dirname, '../../packages/signal/src/index.ts'),
    },
  },
  server: {
    fs: {
      allow: ['../..'],
    },
  },
})

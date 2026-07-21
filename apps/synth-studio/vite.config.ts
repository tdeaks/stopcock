import { defineConfig, lazyPlugins } from 'vite-plus'
import solid from 'vite-plugin-solid'
import path from 'path'

export default defineConfig({
  plugins: lazyPlugins(() => [solid()]),
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
  run: {
    tasks: {
      build: ['vp build'],
    },
  },
})

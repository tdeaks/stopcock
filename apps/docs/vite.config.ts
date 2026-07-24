import { defineConfig } from 'vite-plus'

export default defineConfig({
  run: {
    tasks: {
      build: [
        'node scripts/check-fp-docs.mjs',
        'node scripts/generate-llms.mjs',
        'astro build',
      ],
    },
  },
})

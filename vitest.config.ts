import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/__tests__/**', '**/*.test.ts', '**/*.test-d.ts', '**/aot-compiled.ts'],
    },
  },
})

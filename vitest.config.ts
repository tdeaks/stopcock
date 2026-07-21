import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/__tests__/**/*.test.ts'],
    maxWorkers: 2,
    typecheck: {
      enabled: true,
      include: ['packages/*/src/**/__tests__/**/*.test-d.ts'],
    },
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/__tests__/**', '**/*.test.ts', '**/*.test-d.ts', '**/aot-compiled.ts'],
    },
  },
})

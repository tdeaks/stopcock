import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/__tests__/**/*.test-d.ts'],
    },
  },
})

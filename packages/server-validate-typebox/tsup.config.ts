import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  minify: true,
  external: ['@stopcock/server', '@stopcock/server-validate', '@sinclair/typebox'],
})

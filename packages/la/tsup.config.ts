import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['src/index.ts', 'src/primitives.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  minify: true,
})

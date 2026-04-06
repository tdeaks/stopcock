import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['src/index.ts', 'src/async.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  minify: true,
})

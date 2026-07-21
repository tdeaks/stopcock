import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/la/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  treeshake: true,
  minify: true,
})

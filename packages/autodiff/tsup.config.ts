import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/scalar.ts',
    'src/math.ts',
    'src/vec.ts',
    'src/mat.ts',
    'src/tape.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  minify: true,
})

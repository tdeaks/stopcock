import { defineConfig } from 'tsup'
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/lens.ts',
    'src/dual-lite.ts',
    'src/guard.ts',
    'src/result.ts',
    'src/option.ts',
    'src/stream.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  minify: true,
})

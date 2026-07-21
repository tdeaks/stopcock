import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['src/index.ts', 'src/async.ts', 'src/react.ts', 'src/svelte.ts', 'src/vue.ts', 'src/persist.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  treeshake: true,
  minify: true,
  external: ['react', 'vue'],
})

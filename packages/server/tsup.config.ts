import { defineConfig } from 'tsup'
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bearer: 'src/plugins/bearer/index.ts',
    cookie: 'src/plugins/cookie/index.ts',
    cors: 'src/plugins/cors/index.ts',
    openapi: 'src/plugins/openapi/index.ts',
    static: 'src/plugins/static/index.ts',
    timing: 'src/plugins/timing/index.ts',
    validate: 'src/plugins/validate/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  minify: true,
})

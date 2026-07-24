import { defineConfig } from 'vite-plus'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fpDist = (subpath = 'index') => path.resolve(__dirname, `../packages/fp/dist/${subpath}.js`)
const packageDist = (mod: string, subpath = 'index') =>
  path.resolve(__dirname, `../packages/${mod}/dist/${subpath}.js`)

export default defineConfig({
  resolve: {
    alias: [
      // Subpath aliases expect extensionless imports like @stopcock/fp/optic.
      { find: /^@stopcock\/fp\/(.+)$/, replacement: fpDist('$1') },
      { find: /^@stopcock\/fp$/, replacement: fpDist() },
      { find: '@stopcock/date', replacement: packageDist('date') },
    ],
  },
  test: {
    benchmark: {
      include: ['src/**/*.bench.ts'],
    },
    setupFiles: ['./src/identity-setup.ts'],
    pool: 'forks',
    fileParallelism: true,
  },
})

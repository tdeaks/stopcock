import { defineConfig } from 'vite-plus'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const src = (mod: string) => path.resolve(__dirname, `../packages/${mod}/src/index.ts`)
const fpSrc = (subpath = 'index') => path.resolve(__dirname, `../packages/fp/src/${subpath}.ts`)

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@stopcock\/fp\/(.+)$/, replacement: fpSrc('$1') },
      { find: /^@stopcock\/fp$/, replacement: fpSrc() },
      { find: '@stopcock/autodiff', replacement: src('autodiff') },
      { find: '@stopcock/la', replacement: src('la') },
    ],
  },
  test: {
    include: ['src/ensure-identical-output.ts', 'src/autodiff-validate.test.ts'],
  },
})

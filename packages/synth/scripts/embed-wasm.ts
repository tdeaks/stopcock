import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wasmPath = resolve(
  root,
  'wasm/target/wasm32-unknown-unknown/release/stopcock_synth_wasm.wasm',
)
const outPath = resolve(root, 'src/render/wasm-blob.ts')
const bytes = readFileSync(wasmPath)

writeFileSync(outPath, `export const SYNTH_WASM_BASE64 = '${bytes.toString('base64')}'\n`)

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fixDeclarationSpecifiers } from './fix-declaration-specifiers.mjs'

const runVp = (...args) => {
  const result = spawnSync('vp', args, {
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// Keep packing and declaration emission atomic: `vp pack` cleans dist before
// TypeScript repopulates it, so they must share one task-cache decision.
runVp('pack')
runVp('exec', 'tsc', '--emitDeclarationOnly')

const result = await fixDeclarationSpecifiers(resolve('dist'))
console.log(`Declaration specifiers fixed in ${result.changed}/${result.files} files`)

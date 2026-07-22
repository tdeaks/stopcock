import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack(
    {
      index: 'src/index.ts',
      lens: 'src/lens.ts',
      'dual-lite': 'src/dual-lite.ts',
      guard: 'src/guard.ts',
      result: 'src/result.ts',
      option: 'src/option.ts',
      stream: 'src/stream.ts',
      array: 'src/array.ts',
      object: 'src/object.ts',
      dict: 'src/dict.ts',
      string: 'src/string.ts',
      number: 'src/number.ts',
      math: 'src/math.ts',
      boolean: 'src/boolean.ts',
      logic: 'src/logic.ts',
      function: 'src/function.ts',
      'jit-chunk': 'src/jit-chunk.ts',
    },
  ),
  run: {
    tasks: {
      build: libraryBuildTask(),
    },
  },
})

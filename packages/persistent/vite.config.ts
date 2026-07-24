import { defineConfig } from 'vite-plus'
import { libraryBuildTask, libraryPack } from '../../tooling/pack.config'

export default defineConfig({
  pack: libraryPack({
    index: 'src/index.ts',
    hash: 'src/hash.ts',
    vector: 'src/vector.ts',
    'hash-map': 'src/hash-map.ts',
    'hash-set': 'src/hash-set.ts',
    'ordered-map': 'src/ordered-map.ts',
    'ordered-set': 'src/ordered-set.ts',
    queue: 'src/queue.ts',
    deque: 'src/deque.ts',
    stack: 'src/stack.ts',
  }),
  run: {
    tasks: {
      build: libraryBuildTask(),
    },
  },
})

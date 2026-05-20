import { defineModule } from '@stopcock/server'
import { makeDb } from './db'

/**
 * Infrastructure module providing the database instance. Any feature module
 * that needs `db` imports this. The framework memoises the resolution, so
 * `makeDb()` runs exactly once even if 20 modules import DbModule.
 */
export const DbModule = defineModule({
  name: 'db',
  provides: () => ({ db: makeDb() }),
})

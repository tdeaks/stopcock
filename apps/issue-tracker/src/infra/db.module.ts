import { defineModule } from '@stopcock/server'
import { db } from '../../db/client'

export const DbModule = defineModule({
  name: 'db',
  provides: () => ({ db }),
})

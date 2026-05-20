import { defineController } from '@stopcock/server'
import type { CyclesService } from './cycle.service'

export const makeCyclesController = defineController('cycles', ({ cycles }: { cycles: CyclesService }) => ({
  list:    (teamId: string) => cycles.list(teamId),
  current: (teamId: string) => cycles.current(teamId),
  find:    (teamId: string, number: number) => cycles.find(teamId, number),
}))

export type CyclesController = ReturnType<typeof makeCyclesController>

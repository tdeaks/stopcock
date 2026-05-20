import { defineService } from '@stopcock/server'
import type { CyclesRepo } from './cycle.repo'

export const makeCyclesService = defineService('cycles', ({ repo }: { repo: CyclesRepo }) => ({
  list:    (teamId: string) => repo.list(teamId),
  current: (teamId: string) => repo.current(teamId),
  find:    (teamId: string, number: number) => repo.byNumber(teamId, number),
}))

export type CyclesService = ReturnType<typeof makeCyclesService>

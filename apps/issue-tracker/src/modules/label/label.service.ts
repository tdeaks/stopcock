import { defineService } from '@stopcock/server'
import type { LabelsRepo } from './label.repo'
import type { CreateLabelInput } from './label.schema'

export const makeLabelsService = defineService('labels', ({ repo }: { repo: LabelsRepo }) => ({
  list:   (teamId: string) => repo.listByTeam(teamId),
  find:   (teamId: string, id: string) => repo.byId(teamId, id),
  create: (teamId: string, input: CreateLabelInput) => repo.create(teamId, input),
  remove: (teamId: string, id: string) => repo.remove(teamId, id),
}))

export type LabelsService = ReturnType<typeof makeLabelsService>

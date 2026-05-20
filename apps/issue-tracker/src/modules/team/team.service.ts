import { defineService } from '@stopcock/server'
import type { TeamsRepo } from './team.repo'
import type { CreateTeamInput } from './team.schema'

export const makeTeamsService = defineService('teams', ({ repo }: { repo: TeamsRepo }) => ({
  list: (workspaceId: string) => repo.listByWorkspace(workspaceId),
  find: (workspaceId: string, key: string) => repo.byKey(workspaceId, key),
  create: (workspaceId: string, input: CreateTeamInput) => repo.create(workspaceId, input),
  members: (teamId: string) => repo.members(teamId),
}))

export type TeamsService = ReturnType<typeof makeTeamsService>

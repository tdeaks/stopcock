import { defineController } from '@stopcock/server'
import type { TeamsService } from './team.service'
import type { WorkspacesService } from '../workspace/workspace.service'
import type { CreateTeamInput } from './team.schema'

export const makeTeamsController = defineController(
  'teams',
  ({ teams, workspaces }: { teams: TeamsService; workspaces: WorkspacesService }) => ({
    list: async (wsSlug: string) => {
      const w = await workspaces.find(wsSlug)
      return teams.list(w.id)
    },
    find: async (wsSlug: string, key: string) => {
      const w = await workspaces.find(wsSlug)
      return teams.find(w.id, key)
    },
    create: async (wsSlug: string, input: CreateTeamInput) => {
      const w = await workspaces.find(wsSlug)
      return teams.create(w.id, input)
    },
    members: async (wsSlug: string, key: string) => {
      const w = await workspaces.find(wsSlug)
      const t = await teams.find(w.id, key)
      return teams.members(t.id)
    },
  }),
)

export type TeamsController = ReturnType<typeof makeTeamsController>

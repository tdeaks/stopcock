import { defineController } from '@stopcock/server'
import type { LabelsService } from './label.service'
import type { WorkspacesService } from '../workspace/workspace.service'
import type { TeamsService } from '../team/team.service'
import type { CreateLabelInput } from './label.schema'

export const makeLabelsController = defineController(
  'labels',
  ({ labels, workspaces, teams }: { labels: LabelsService; workspaces: WorkspacesService; teams: TeamsService }) => {
    const resolveTeam = async (wsSlug: string, teamKey: string) => {
      const w = await workspaces.find(wsSlug)
      return teams.find(w.id, teamKey)
    }
    return {
      list: async (wsSlug: string, teamKey: string) => {
        const t = await resolveTeam(wsSlug, teamKey)
        return labels.list(t.id)
      },
      create: async (wsSlug: string, teamKey: string, input: CreateLabelInput) => {
        const t = await resolveTeam(wsSlug, teamKey)
        return labels.create(t.id, input)
      },
      remove: async (wsSlug: string, teamKey: string, id: string) => {
        const t = await resolveTeam(wsSlug, teamKey)
        await labels.remove(t.id, id)
        return { ok: true }
      },
    }
  },
)

export type LabelsController = ReturnType<typeof makeLabelsController>

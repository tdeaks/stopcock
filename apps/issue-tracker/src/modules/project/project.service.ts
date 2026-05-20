import { defineService } from '@stopcock/server'
import type { ProjectsRepo } from './project.repo'
import type { CreateProjectInput } from './project.schema'

export const makeProjectsService = defineService('projects', ({ repo }: { repo: ProjectsRepo }) => ({
  list:   (teamId: string) => repo.list(teamId),
  find:   (teamId: string, id: string) => repo.byId(teamId, id),
  create: (teamId: string, input: CreateProjectInput) => repo.create(teamId, input),
}))

export type ProjectsService = ReturnType<typeof makeProjectsService>

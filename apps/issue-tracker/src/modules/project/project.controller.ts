import { defineController } from '@stopcock/server'
import type { ProjectsService } from './project.service'
import type { CreateProjectInput } from './project.schema'

export const makeProjectsController = defineController('projects', ({ projects }: { projects: ProjectsService }) => ({
  list:   (teamId: string) => projects.list(teamId),
  find:   (teamId: string, id: string) => projects.find(teamId, id),
  create: (teamId: string, input: CreateProjectInput) => projects.create(teamId, input),
}))

export type ProjectsController = ReturnType<typeof makeProjectsController>

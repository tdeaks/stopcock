/**
 * Authorization middleware.
 *
 * Loads whichever parent resources the route's path params reference
 * (workspace, team, project, issue), then calls `canAccess` to decide. Returning
 * false from canAccess 403s. Throwing NotFound from the loader 404s.
 *
 * `canAccess` is where the policy lives.
 */
import { defineMiddleware } from '@stopcock/server'
import { and, eq } from 'drizzle-orm'
import { issues, projects, teamMembers, teams, workspaceMembers, workspaces } from '../../db/schema'
import type { Db } from '../../db/client'
import { Forbidden, NotFound } from '../errors/domain'

export type Action = 'read' | 'write'

export type ResourceContext = {
  workspace?: { id: string; slug: string }
  team?:      { id: string; key: string; workspaceId: string }
  project?:   { id: string; teamId: string }
  issue?:     { id: string; number: number; teamId: string; projectId: string }
  isWorkspaceMember: boolean
  isTeamMember:      boolean
}

export type AuthzDeps = { db: Db }

const loadFromParams = async (db: Db, userId: string, params: Record<string, string>): Promise<ResourceContext> => {
  const ctx: ResourceContext = { isWorkspaceMember: false, isTeamMember: false }

  if (params['ws']) {
    const [ws] = await db.select({ id: workspaces.id, slug: workspaces.slug })
      .from(workspaces).where(eq(workspaces.slug, params['ws'])).limit(1)
    if (!ws) throw new NotFound('workspace', params['ws'])
    ctx.workspace = ws

    const [member] = await db.select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, userId)))
      .limit(1)
    ctx.isWorkspaceMember = !!member
  }

  if (params['team'] && ctx.workspace) {
    const [team] = await db.select({ id: teams.id, key: teams.key, workspaceId: teams.workspaceId })
      .from(teams).where(and(eq(teams.workspaceId, ctx.workspace.id), eq(teams.key, params['team']))).limit(1)
    if (!team) throw new NotFound('team', params['team'])
    ctx.team = team

    const [tm] = await db.select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, userId)))
      .limit(1)
    ctx.isTeamMember = !!tm
  }

  if (params['project'] && ctx.team) {
    const [project] = await db.select({ id: projects.id, teamId: projects.teamId })
      .from(projects).where(and(eq(projects.teamId, ctx.team.id), eq(projects.id, params['project']))).limit(1)
    if (!project) throw new NotFound('project', params['project'])
    ctx.project = project
  }

  if (params['issue'] && ctx.team) {
    const issueNumber = Number(params['issue'])
    if (!Number.isFinite(issueNumber)) throw new NotFound('issue', params['issue'])
    const [issue] = await db.select({ id: issues.id, number: issues.number, teamId: issues.teamId, projectId: issues.projectId })
      .from(issues).where(and(eq(issues.teamId, ctx.team.id), eq(issues.number, issueNumber))).limit(1)
    if (!issue) throw new NotFound('issue', params['issue'])
    ctx.issue = issue
  }

  return ctx
}

/**
 * Reads need workspace membership. Writes need team membership when a team
 * is in scope, otherwise workspace membership is enough.
 */
export const canAccess = async (
  _userId: string,
  ctx: ResourceContext,
  action: Action,
): Promise<boolean> => {
  if (!ctx.isWorkspaceMember) return false
  if (action === 'read') return true
  return ctx.team ? ctx.isTeamMember : true
}

export const makeAuthz = (deps: AuthzDeps) => (action: Action) =>
  defineMiddleware<{ resource: ResourceContext }, Forbidden | NotFound>(async (ctx) => {
    const userId = (ctx as unknown as { userId: string }).userId
    const params = (ctx as unknown as { params: Record<string, string> }).params
    const resource = await loadFromParams(deps.db, userId, params)
    if (!(await canAccess(userId, resource, action))) throw new Forbidden('access denied')
    return { resource }
  })

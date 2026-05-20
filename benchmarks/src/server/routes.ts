/**
 * Route shapes for matcher-only microbenches.
 *
 * Mirrors what buildStopcockApp in frameworks.ts registers, but stripped of
 * handlers, middleware, schemas, and payloads. Routes-only so matcher libs
 * (stopcock compileMatcher, Hono RegExpRouter, find-my-way, @medley/router)
 * can be benched apples-to-apples.
 *
 * Keep in sync with frameworks.ts buildStopcockApp.
 */

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type RouteShape = { method: Method; path: string }

const FILLER_ROUTES = 96

const filler: RouteShape[] = Array.from({ length: FILLER_ROUTES }, (_, i) => ({
  method: 'GET' as const,
  path: `/api/v1/filler-${i}/:tenant/:id`,
}))

export const ROUTE_TABLE: RouteShape[] = [
  { method: 'GET',    path: '/health' },
  ...filler,
  { method: 'GET',    path: '/api/v1/users/:userId' },
  { method: 'GET',    path: '/api/v1/teams/:teamId/projects/:projectId/issues/:issueId' },
  { method: 'GET',    path: '/api/v1/search' },
  { method: 'POST',   path: '/api/v1/orders' },
  { method: 'PUT',    path: '/api/v1/things/:id' },
  { method: 'PATCH',  path: '/api/v1/things/:id' },
  { method: 'DELETE', path: '/api/v1/things/:id' },
  { method: 'GET',    path: '/api/v1/error-500' },
  { method: 'GET',    path: '/api/v1/tree' },
  { method: 'GET',    path: '/api/v1/query-echo' },
  { method: 'POST',   path: '/api/v1/echo' },
  { method: 'GET',    path: '/api/v1/redirect' },
]

/**
 * Lookups to bench against. Each pair (method, path) is dispatched once per
 * bench iteration. Mix of static, shallow param, deep param, head/middle/tail
 * filler, and misses. Designed so the matcher bench surfaces both happy-path
 * and cold-tail performance.
 */
export const MATCH_CORPUS: { method: Method; path: string; label: string }[] = [
  { method: 'GET',  path: '/health',                                                          label: 'static-hot' },
  { method: 'GET',  path: '/api/v1/users/42',                                                 label: 'param-shallow' },
  { method: 'GET',  path: '/api/v1/teams/team-7/projects/project-3/issues/issue-99',          label: 'param-deep' },
  { method: 'GET',  path: '/api/v1/search',                                                   label: 'static-deep' },
  { method: 'POST', path: '/api/v1/orders',                                                   label: 'post-static' },
  { method: 'GET',  path: '/api/v1/tree',                                                     label: 'static-deep-2' },
  { method: 'GET',  path: '/api/v1/filler-0/tenant-a/id-1',                                   label: 'filler-head' },
  { method: 'GET',  path: '/api/v1/filler-50/tenant-m/id-5',                                  label: 'filler-middle' },
  { method: 'GET',  path: '/api/v1/filler-95/tenant-z/id-9',                                  label: 'filler-tail' },
  { method: 'GET',  path: '/api/v1/does-not-exist',                                           label: 'miss-shallow' },
  { method: 'GET',  path: '/api/v1/teams/team-7/projects/project-3/missing/issue-99',         label: 'miss-deep' },
]

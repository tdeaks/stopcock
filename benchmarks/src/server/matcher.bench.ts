// @ts-nocheck
/**
 * Matcher-only microbench. Isolates the router dispatch cost from HTTP/socket
 * variance so changes to stopcock's compileMatcher have direct signal.
 *
 * Compares: stopcock compileMatcher, Hono RegExpRouter, find-my-way,
 * @medley/router. All four routers register the same shapes (see routes.ts);
 * each bench dispatches one path per iteration.
 */
import { bench, describe } from 'vitest'
import { RegExpRouter } from 'hono/router/reg-exp-router'
import FindMyWay from 'find-my-way'
import MedleyRouter from '@medley/router'
import { compileMatcher } from '../../../packages/server/src/router/compile'
import { ROUTE_TABLE, MATCH_CORPUS } from './routes'

const noop = () => {}

const buildStopcock = () => {
  const specs = ROUTE_TABLE.map((r) => {
    const paramNames = Array.from(r.path.matchAll(/:([A-Za-z_]\w*)/g)).map((m) => m[1])
    const source = r.path.replace(/\/:[A-Za-z_]\w*/g, '/([^/]+)')
    return {
      method: r.method,
      path: r.path,
      paramNames,
      pattern: new RegExp(`^${source}/?$`),
    }
  })
  const match = compileMatcher(specs)
  return (method: string, path: string) => match(method, path)
}

const buildHono = () => {
  const router = new RegExpRouter()
  for (const r of ROUTE_TABLE) router.add(r.method, r.path, noop)
  return (method: string, path: string) => router.match(method, path)
}

const buildFindMyWay = () => {
  const router = FindMyWay({ ignoreTrailingSlash: true })
  for (const r of ROUTE_TABLE) router.on(r.method as 'GET', r.path, noop)
  return (method: string, path: string) => router.find(method as 'GET', path)
}

const buildMedley = () => {
  const router = new MedleyRouter()
  for (const r of ROUTE_TABLE) {
    const store = router.register(r.path)
    store[r.method] = noop
  }
  return (method: string, path: string) => {
    const m = router.find(path)
    return m && m.store[method] ? m : null
  }
}

const stopcock = buildStopcock()
const hono = buildHono()
const findMyWay = buildFindMyWay()
const medley = buildMedley()

describe('matcher — mixed corpus (11 lookups per iteration)', () => {
  bench('stopcock', () => {
    for (const c of MATCH_CORPUS) stopcock(c.method, c.path)
  })
  bench('hono RegExpRouter', () => {
    for (const c of MATCH_CORPUS) hono(c.method, c.path)
  })
  bench('find-my-way', () => {
    for (const c of MATCH_CORPUS) findMyWay(c.method, c.path)
  })
  bench('@medley/router', () => {
    for (const c of MATCH_CORPUS) medley(c.method, c.path)
  })
})

describe('matcher — hot static (/health)', () => {
  bench('stopcock', () => { stopcock('GET', '/health') })
  bench('hono RegExpRouter', () => { hono('GET', '/health') })
  bench('find-my-way', () => { findMyWay('GET', '/health') })
  bench('@medley/router', () => { medley('GET', '/health') })
})

describe('matcher — hot param-deep (3 params)', () => {
  const path = '/api/v1/teams/team-7/projects/project-3/issues/issue-99'
  bench('stopcock', () => { stopcock('GET', path) })
  bench('hono RegExpRouter', () => { hono('GET', path) })
  bench('find-my-way', () => { findMyWay('GET', path) })
  bench('@medley/router', () => { medley('GET', path) })
})

describe('matcher — cold-tail (last filler route, route 96 of 109)', () => {
  const path = '/api/v1/filler-95/tenant-z/id-9'
  bench('stopcock', () => { stopcock('GET', path) })
  bench('hono RegExpRouter', () => { hono('GET', path) })
  bench('find-my-way', () => { findMyWay('GET', path) })
  bench('@medley/router', () => { medley('GET', path) })
})

describe('matcher — miss-deep (404)', () => {
  const path = '/api/v1/teams/team-7/projects/project-3/missing/issue-99'
  bench('stopcock', () => { stopcock('GET', path) })
  bench('hono RegExpRouter', () => { hono('GET', path) })
  bench('find-my-way', () => { findMyWay('GET', path) })
  bench('@medley/router', () => { medley('GET', path) })
})

// @ts-nocheck
/**
 * Serializer microbench. Compares stopcock compileJsonSerializer against
 * native JSON.stringify and fast-json-stringify (what fastify uses under the
 * hood). Same schemas and payloads on all three.
 *
 * Not included: typebox (validation library, no compiled JSON serializer),
 * ajv (validation library). They're sometimes paired with fast-json-stringify
 * but the actual serialization layer is fast-json-stringify in those setups.
 *
 * Shapes mirror frameworks.ts response payloads so the e2e bench numbers
 * translate one-to-one.
 */
import { bench, describe } from 'vitest'
import fjs from 'fast-json-stringify'
import { compileJsonSerializer, compileJsonSerializerWithBytes } from '../../../packages/server/src/compile-json'

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    active: { type: 'boolean' },
    include: { type: 'string' },
    roles: { type: 'array', items: { type: 'string' } },
    teams: { type: 'array', items: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
      required: ['id', 'name'],
    }},
  },
  required: ['id', 'name', 'active', 'roles'],
} as const

const issueSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    teamId: { type: 'string' },
    projectId: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'string' },
    priority: { type: 'number' },
    comments: { type: 'array', items: {
      type: 'object',
      properties: { id: { type: 'string' }, body: { type: 'string' } },
      required: ['id', 'body'],
    }},
  },
  required: ['id', 'teamId', 'projectId', 'title', 'status', 'priority'],
} as const

const searchRowSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'title', 'tags'],
} as const

const searchSchema = {
  type: 'object',
  properties: {
    q: { type: 'string' },
    page: { type: 'number' },
    limit: { type: 'number' },
    total: { type: 'number' },
    results: { type: 'array', items: searchRowSchema },
  },
  required: ['q', 'page', 'limit', 'total', 'results'],
} as const

const userPayload = {
  id: 'user-42',
  name: 'User 42',
  active: true,
  include: 'teams',
  roles: ['owner', 'reader'],
  teams: [
    { id: 'team-1', name: 'Core' },
    { id: 'team-2', name: 'Ops' },
  ],
}

const issuePayload = {
  id: 'issue-99',
  teamId: 'team-7',
  projectId: 'project-3',
  title: 'Issue 99',
  status: 'open',
  priority: 3,
  comments: [
    { id: 'comment-1', body: 'first diagnostic note' },
    { id: 'comment-2', body: 'follow-up with repro details' },
  ],
}

const searchPayload = (n: number) => ({
  q: 'fixture',
  page: 1,
  limit: n,
  total: n,
  results: Array.from({ length: n }, (_, i) => ({
    id: `post-${i}`,
    title: i % 3 === 0 ? `alpha release ${i}` : `fixture note ${i}`,
    tags: i % 2 === 0 ? ['alpha', 'routing'] : ['bench', 'json'],
  })),
})

const stopcockUser = compileJsonSerializer(userSchema as never)
const stopcockIssue = compileJsonSerializer(issueSchema as never)
const stopcockSearch = compileJsonSerializer(searchSchema as never)

const stopcockUserB = compileJsonSerializerWithBytes(userSchema as never)
const stopcockIssueB = compileJsonSerializerWithBytes(issueSchema as never)
const stopcockSearchB = compileJsonSerializerWithBytes(searchSchema as never)

const fjsUser = fjs(userSchema as never)
const fjsIssue = fjs(issueSchema as never)
const fjsSearch = fjs(searchSchema as never)

describe('serializer — user (8 fields, 1 nested array)', () => {
  bench('JSON.stringify',         () => { JSON.stringify(userPayload) })
  bench('fast-json-stringify',    () => { fjsUser(userPayload) })
  bench('stopcock compiled',      () => { stopcockUser(userPayload) })
  bench('stopcock WithBytes',     () => { stopcockUserB(userPayload) })
})

describe('serializer — issue (7 fields, comments array)', () => {
  bench('JSON.stringify',         () => { JSON.stringify(issuePayload) })
  bench('fast-json-stringify',    () => { fjsIssue(issuePayload) })
  bench('stopcock compiled',      () => { stopcockIssue(issuePayload) })
  bench('stopcock WithBytes',     () => { stopcockIssueB(issuePayload) })
})

describe.each([8, 64, 1024])('serializer — search results (n=%i rows)', (n) => {
  const payload = searchPayload(n)
  bench('JSON.stringify',         () => { JSON.stringify(payload) })
  bench('fast-json-stringify',    () => { fjsSearch(payload) })
  bench('stopcock compiled',      () => { stopcockSearch(payload) })
  bench('stopcock WithBytes',     () => { stopcockSearchB(payload) })
})

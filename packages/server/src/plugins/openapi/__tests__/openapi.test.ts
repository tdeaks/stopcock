import { describe, expect, it } from 'vitest'
import { defineApp, defineModule } from '../../../define/module'
import { route } from '../../../define/handler'
import { definePlugin, defineRoutePlugin } from '../../../plugin'
import type { RouteDef } from '../../../define/handler'
import { createValidators, type BoundAdapter, type JsonSchema } from '../../validate'
import { openapi, openapiMeta } from '../index'

const adapter: BoundAdapter<JsonSchema> = {
  parse: (_schema, input) => input,
  extractIssues: () => null,
  toJsonSchema: (schema) => schema,
}

const validate = createValidators(adapter)

const fetch = (app: ReturnType<typeof defineApp>, path: string, init?: RequestInit) =>
  app.fetch(new Request(`http://x${path}`, init))

const json = (schema: JsonSchema) => schema

describe('openapi plugin', () => {
  it('serves an OpenAPI 3.1 document from app routes, validation metadata, auth metadata, and route metadata', async () => {
    const withAuth = defineRoutePlugin({
      name: 'auth',
      meta: { 'stopcock.auth': { type: 'bearer', bearerFormat: 'JWT' } },
    })

    const app = defineApp({
      modules: [
        defineModule({
          name: 'posts',
          routes: () => [
            route.post('/posts/:id')
              .use(validate.params(json({
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
              })))
              .use(validate.query(json({
                type: 'object',
                properties: { draft: { type: 'boolean' } },
              })))
              .use(validate.body(json({
                type: 'object',
                properties: { title: { type: 'string' } },
                required: ['title'],
              })))
              .use(withAuth)
              .meta(openapiMeta({
                operationId: 'createPost',
                summary: 'Create post',
                tags: ['Posts'],
                responses: { 201: { description: 'Created' } },
              }))
              .handler(() => ({ ok: true })),
          ],
        }),
      ],
      plugins: [
        openapi({
          info: { title: 'Posts API', version: '1.2.3' },
          servers: [{ url: 'https://api.example.test' }],
        }),
      ],
    })

    const response = await fetch(app, '/openapi.json')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')

    const doc = await response.json() as any
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info).toEqual({ title: 'Posts API', version: '1.2.3' })
    expect(doc.servers).toEqual([{ url: 'https://api.example.test' }])

    const operation = doc.paths['/posts/{id}'].post
    expect(operation).toMatchObject({
      operationId: 'createPost',
      summary: 'Create post',
      tags: ['Posts'],
      security: [{ bearerAuth: [] }],
      responses: { 201: { description: 'Created' } },
    })
    expect(operation.parameters).toEqual([
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
      {
        name: 'draft',
        in: 'query',
        required: false,
        schema: { type: 'boolean' },
      },
    ])
    expect(operation.requestBody).toEqual({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { title: { type: 'string' } },
            required: ['title'],
          },
        },
      },
    })
    expect(doc.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
  })

  it('uses the configured JSON path and contributes a simple docs route', async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: 'health',
          routes: () => [route.get('/health').handler(() => ({ ok: true }))],
        }),
      ],
      plugins: [openapi({ path: '/schema.json', docsPath: '/docs' })],
    })

    expect((await fetch(app, '/openapi.json')).status).toBe(404)

    const schema = await fetch(app, '/schema.json')
    expect(schema.status).toBe(200)

    const docs = await fetch(app, '/docs')
    expect(docs.status).toBe(200)
    expect(docs.headers.get('content-type')).toContain('text/html')
    expect(await docs.text()).toContain('/schema.json')
  })

  it('excludes plugin-generated routes by default and includes them when requested', async () => {
    const contributed = definePlugin({
      name: 'plugin-route',
      setup: () => ({
        routes: [
          route.get('/plugin-health')
            .meta(openapiMeta({ summary: 'Plugin health' }))
            .handler(() => ({ ok: true })) as RouteDef,
        ],
      }),
    })

    const defaultApp = defineApp({
      modules: [
        defineModule({
          name: 'health',
          routes: () => [route.get('/health').handler(() => ({ ok: true }))],
        }),
      ],
      plugins: [openapi({ docsPath: '/docs' }), contributed],
    })

    const defaultDoc = await (await fetch(defaultApp, '/openapi.json')).json() as any
    expect(defaultDoc.paths['/health']).toBeDefined()
    expect(defaultDoc.paths['/plugin-health']).toBeUndefined()
    expect(defaultDoc.paths['/openapi.json']).toBeUndefined()
    expect(defaultDoc.paths['/docs']).toBeUndefined()

    const includedApp = defineApp({
      modules: [
        defineModule({
          name: 'health',
          routes: () => [route.get('/health').handler(() => ({ ok: true }))],
        }),
      ],
      plugins: [openapi({ docsPath: '/docs', includePluginRoutes: true }), contributed],
    })

    const includedDoc = await (await fetch(includedApp, '/openapi.json')).json() as any
    expect(includedDoc.paths['/plugin-health'].get.summary).toBe('Plugin health')
    expect(includedDoc.paths['/openapi.json'].get.summary).toBe('OpenAPI document')
    expect(includedDoc.paths['/docs'].get.summary).toBe('OpenAPI documentation')
  })

  it('excludes plugin-generated routes even when the contributing plugin is installed before openapi', async () => {
    const contributed = definePlugin({
      name: 'early-plugin-route',
      setup: () => ({
        routes: [
          route.get('/early-plugin-health')
            .meta(openapiMeta({ summary: 'Early plugin health' }))
            .handler(() => ({ ok: true })) as RouteDef,
        ],
      }),
    })

    const app = defineApp({
      modules: [
        defineModule({
          name: 'health',
          routes: () => [route.get('/health').handler(() => ({ ok: true }))],
        }),
      ],
      plugins: [contributed, openapi()],
    })

    const doc = await (await fetch(app, '/openapi.json')).json() as any
    expect(doc.paths['/health']).toBeDefined()
    expect(doc.paths['/early-plugin-health']).toBeUndefined()
    expect(doc.paths['/openapi.json']).toBeUndefined()
  })
})

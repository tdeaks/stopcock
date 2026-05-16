import {
  SERVER_PLUGIN_ROUTE_META_KEY,
  definePlugin,
  route,
  type RouteDef,
  type RouteMeta,
  type ServerPlugin,
} from '@stopcock/server'
import { VALIDATE_META_KEY, type JsonSchema, type ValidateMeta } from '@stopcock/server-validate'

export const OPENAPI_META_KEY = 'stopcock.openapi' as const
export const AUTH_META_KEY = 'stopcock.auth' as const

type JsonObject = Record<string, unknown>

export type OpenApiInfo = {
  readonly title?: string
  readonly version?: string
  readonly description?: string
  readonly termsOfService?: string
  readonly contact?: JsonObject
  readonly license?: JsonObject
}

export type OpenApiServer = {
  readonly url: string
  readonly description?: string
  readonly variables?: JsonObject
}

export type OpenApiOperationMeta = {
  readonly operationId?: string
  readonly summary?: string
  readonly description?: string
  readonly tags?: readonly string[]
  readonly deprecated?: boolean
  readonly parameters?: readonly JsonObject[]
  readonly requestBody?: JsonObject
  readonly responses?: JsonObject
  readonly security?: readonly JsonObject[]
  readonly externalDocs?: JsonObject
  readonly callbacks?: JsonObject
  readonly exclude?: boolean
  readonly [extension: `x-${string}`]: unknown
}

export type OpenApiConfig = {
  readonly path?: string
  readonly docsPath?: string
  readonly includePluginRoutes?: boolean
  readonly info?: OpenApiInfo
  readonly servers?: readonly OpenApiServer[]
}

type AuthMeta = {
  readonly type?: unknown
  readonly scheme?: unknown
  readonly bearerFormat?: unknown
  readonly name?: unknown
  readonly in?: unknown
  readonly securitySchemeName?: unknown
  readonly securityScheme?: unknown
  readonly scopes?: unknown
}

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

export const openapiMeta = (meta: OpenApiOperationMeta): RouteMeta => ({
  [OPENAPI_META_KEY]: meta,
})

const routeOpenApiMeta = (def: RouteDef): OpenApiOperationMeta | undefined => {
  const meta = def.meta?.[OPENAPI_META_KEY]
  return isRecord(meta) ? meta as OpenApiOperationMeta : undefined
}

const routeAuthMeta = (def: RouteDef): AuthMeta | undefined => {
  const meta = def.meta?.[AUTH_META_KEY]
  return isRecord(meta) ? meta as AuthMeta : undefined
}

const isPluginRoute = (def: RouteDef): boolean =>
  def.meta?.[SERVER_PLUGIN_ROUTE_META_KEY] !== undefined

const toOpenApiPath = (path: string): string =>
  path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}')

const pathParamNames = (path: string): string[] =>
  Array.from(path.matchAll(/\/:([A-Za-z_][A-Za-z0-9_]*)/g), (match) => match[1]!)

const schemaRequired = (schema: JsonSchema): Set<string> =>
  new Set(isStringArray(schema.required) ? schema.required : [])

const schemaProperties = (schema: JsonSchema): Record<string, JsonSchema> => {
  const properties = schema.properties
  if (!isRecord(properties)) return {}

  const out: Record<string, JsonSchema> = {}
  for (const [name, property] of Object.entries(properties)) {
    if (isRecord(property)) out[name] = property
  }
  return out
}

const parametersFromSchema = (
  schema: JsonSchema,
  source: 'query' | 'params',
): JsonObject[] => {
  const required = schemaRequired(schema)
  const location = source === 'params' ? 'path' : 'query'
  return Object.entries(schemaProperties(schema)).map(([name, property]) => ({
    name,
    in: location,
    required: source === 'params' || required.has(name),
    schema: property,
  }))
}

const validationMeta = (def: RouteDef): ValidateMeta[] =>
  def.middlewares.flatMap((middleware) => {
    const meta = middleware.meta?.[VALIDATE_META_KEY]
    return isRecord(meta) ? [meta as ValidateMeta] : []
  })

const ensurePathParameters = (
  routePath: string,
  parameters: JsonObject[],
): void => {
  const seen = new Set(parameters
    .filter((parameter) => parameter.in === 'path' && typeof parameter.name === 'string')
    .map((parameter) => parameter.name as string))

  for (const name of pathParamNames(routePath)) {
    if (seen.has(name)) continue
    parameters.push({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' },
    })
  }
}

const requestBodyFromSchema = (schema: JsonSchema): JsonObject => ({
  required: true,
  content: {
    'application/json': { schema },
  },
})

const securityScopes = (auth: AuthMeta): string[] => {
  if (isStringArray(auth.scopes)) return auth.scopes
  if (isRecord(auth.scopes)) return Object.keys(auth.scopes)
  return []
}

const securityFromAuth = (
  auth: AuthMeta,
  schemes: Record<string, JsonObject>,
): JsonObject | undefined => {
  if (typeof auth.securitySchemeName === 'string' && isRecord(auth.securityScheme)) {
    schemes[auth.securitySchemeName] = auth.securityScheme
    return { [auth.securitySchemeName]: securityScopes(auth) }
  }

  const type = typeof auth.type === 'string' ? auth.type : undefined
  const scheme = typeof auth.scheme === 'string' ? auth.scheme : undefined

  if (type === 'apiKey') {
    const name = typeof auth.name === 'string' ? auth.name : 'x-api-key'
    const location = auth.in === 'query' || auth.in === 'cookie' ? auth.in : 'header'
    const schemeName = typeof auth.securitySchemeName === 'string' ? auth.securitySchemeName : 'apiKeyAuth'
    schemes[schemeName] = { type: 'apiKey', name, in: location }
    return { [schemeName]: [] }
  }

  if (type === 'basic' || scheme === 'basic') {
    const schemeName = typeof auth.securitySchemeName === 'string' ? auth.securitySchemeName : 'basicAuth'
    schemes[schemeName] = { type: 'http', scheme: 'basic' }
    return { [schemeName]: [] }
  }

  if (type === 'bearer' || scheme === 'bearer') {
    const schemeName = typeof auth.securitySchemeName === 'string' ? auth.securitySchemeName : 'bearerAuth'
    const securityScheme: JsonObject = { type: 'http', scheme: 'bearer' }
    if (typeof auth.bearerFormat === 'string') securityScheme.bearerFormat = auth.bearerFormat
    schemes[schemeName] = securityScheme
    return { [schemeName]: [] }
  }

  return undefined
}

const buildOperation = (
  def: RouteDef,
  schemes: Record<string, JsonObject>,
): JsonObject | undefined => {
  const openapi = routeOpenApiMeta(def)
  if (openapi?.exclude) return undefined

  const parameters: JsonObject[] = []
  let requestBody: JsonObject | undefined

  for (const meta of validationMeta(def)) {
    const schema = meta.toJsonSchema?.()
    if (!schema) continue

    if (meta.source === 'body') {
      requestBody = requestBodyFromSchema(schema)
    } else {
      parameters.push(...parametersFromSchema(schema, meta.source))
    }
  }

  ensurePathParameters(def.path, parameters)

  const operation: JsonObject = {
    responses: { 200: { description: 'OK' } },
  }

  if (parameters.length > 0) operation.parameters = parameters
  if (requestBody) operation.requestBody = requestBody

  const auth = routeAuthMeta(def)
  if (auth) {
    const security = securityFromAuth(auth, schemes)
    if (security) operation.security = [security]
  }

  return { ...operation, ...openapi }
}

const buildDocument = (
  routes: readonly RouteDef[],
  config: OpenApiConfig,
): JsonObject => {
  const paths: Record<string, Record<string, JsonObject>> = {}
  const securitySchemes: Record<string, JsonObject> = {}

  for (const def of routes) {
    if (!config.includePluginRoutes && isPluginRoute(def)) continue

    const operation = buildOperation(def, securitySchemes)
    if (!operation) continue

    const path = toOpenApiPath(def.path)
    paths[path] ??= {}
    paths[path]![def.method.toLowerCase()] = operation
  }

  const doc: JsonObject = {
    openapi: '3.1.0',
    info: {
      title: 'Stopcock API',
      version: '0.0.0',
      ...config.info,
    },
    paths,
  }

  if (config.servers) doc.servers = config.servers
  if (Object.keys(securitySchemes).length > 0) {
    doc.components = { securitySchemes }
  }

  return doc
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const docsHtml = (openApiPath: string): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenAPI Docs</title>
</head>
<body>
  <main>
    <h1>OpenAPI Docs</h1>
    <p>Schema: <a href="${escapeHtml(openApiPath)}">${escapeHtml(openApiPath)}</a></p>
    <pre id="schema">Loading...</pre>
  </main>
  <script>
    fetch(${JSON.stringify(openApiPath)})
      .then((response) => response.json())
      .then((schema) => {
        document.getElementById('schema').textContent = JSON.stringify(schema, null, 2)
      })
      .catch((error) => {
        document.getElementById('schema').textContent = String(error)
      })
  </script>
</body>
</html>`

const jsonResponse = (body: unknown): Response =>
  Response.json(body, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

export const openapi = (config: OpenApiConfig = {}): ServerPlugin => definePlugin({
  name: 'openapi',
  setup: (ctx) => {
    const path = config.path ?? '/openapi.json'
    const routes = ctx.routes
    const contributed: RouteDef[] = [
      route.get(path)
        .meta(openapiMeta({
          summary: 'OpenAPI document',
          tags: ['OpenAPI'],
          responses: { 200: { description: 'OpenAPI document' } },
        }))
        .handler(() => jsonResponse(buildDocument(routes, config))),
    ]

    if (config.docsPath) {
      contributed.push(
        route.get(config.docsPath)
          .meta(openapiMeta({
            summary: 'OpenAPI documentation',
            tags: ['OpenAPI'],
            responses: { 200: { description: 'OpenAPI documentation' } },
          }))
          .handler(() => new Response(docsHtml(path), {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })),
      )
    }

    return { routes: contributed }
  },
})

/**
 * Tagged domain errors. Handlers throw these; renderers map them to HTTP
 * responses. The `_tag` discriminator gives TypeScript exhaustive matching.
 */
export class NotFound      { readonly _tag = 'NotFound' as const;      constructor(readonly resource: string, readonly id: string) {} }
export class Unauthorized  { readonly _tag = 'Unauthorized' as const }
export class Forbidden     { readonly _tag = 'Forbidden' as const }
export class BadInput      { readonly _tag = 'BadInput' as const;      constructor(readonly issues: ReadonlyArray<string>) {} }
export class Conflict      { readonly _tag = 'Conflict' as const;      constructor(readonly reason: string) {} }

export type DomainError = NotFound | Unauthorized | Forbidden | BadInput | Conflict

/** Default renderer covering every domain error tag. Add to a route via `.render(...)`. */
export const renderDomain = (e: DomainError): Response => {
  switch (e._tag) {
    case 'NotFound':     return Response.json({ error: 'not_found', resource: e.resource, id: e.id }, { status: 404 })
    case 'Unauthorized': return Response.json({ error: 'unauthorized' },                                { status: 401 })
    case 'Forbidden':    return Response.json({ error: 'forbidden' },                                   { status: 403 })
    case 'BadInput':     return Response.json({ error: 'bad_input', issues: e.issues },                 { status: 400 })
    case 'Conflict':     return Response.json({ error: 'conflict', reason: e.reason },                  { status: 409 })
  }
}

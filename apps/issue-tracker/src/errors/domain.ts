export class NotFound     { readonly _tag = 'NotFound' as const;     constructor(readonly resource: string, readonly id: string) {} }
export class Unauthorized { readonly _tag = 'Unauthorized' as const }
export class Forbidden    { readonly _tag = 'Forbidden' as const;    constructor(readonly reason?: string) {} }
export class BadInput     { readonly _tag = 'BadInput' as const;     constructor(readonly issues: ReadonlyArray<string>) {} }
export class Conflict     { readonly _tag = 'Conflict' as const;     constructor(readonly reason: string) {} }

export type DomainError = NotFound | Unauthorized | Forbidden | BadInput | Conflict

export const renderDomain = (e: DomainError): Response => {
  switch (e._tag) {
    case 'NotFound':     return Response.json({ error: 'not_found', resource: e.resource, id: e.id }, { status: 404 })
    case 'Unauthorized': return Response.json({ error: 'unauthorized' },                                { status: 401 })
    case 'Forbidden':    return Response.json({ error: 'forbidden', reason: e.reason ?? null },         { status: 403 })
    case 'BadInput':     return Response.json({ error: 'bad_input', issues: e.issues },                 { status: 400 })
    case 'Conflict':     return Response.json({ error: 'conflict', reason: e.reason },                  { status: 409 })
  }
}

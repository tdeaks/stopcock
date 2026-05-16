import type { IncomingMessage, ServerResponse } from 'node:http'
import type { App } from '../router/router'

const collectBody = (req: IncomingMessage): Promise<Uint8Array | null> => {
  const method = req.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
    req.on('error', reject)
  })
}

export const toNodeListener = (app: App) => async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const host = req.headers.host ?? 'localhost'
  const url = `http://${host}${req.url ?? '/'}`
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue
    if (Array.isArray(v)) for (const item of v) headers.append(k, item)
    else headers.set(k, v)
  }
  const body = await collectBody(req)
  const request = new Request(url, { method: req.method, headers, body: body as BodyInit | null })
  const response = await app.fetch(request)
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  if (response.body) {
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
  }
  res.end()
}

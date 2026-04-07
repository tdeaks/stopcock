import type { ResponseType } from './types.js'
import { HttpError } from './error.js'

export async function parseResponse<T>(
  response: Response,
  responseType: ResponseType | undefined,
  transform: ((data: unknown) => unknown) | undefined,
): Promise<T> {
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T
  }

  let data: unknown

  if (responseType) {
    data = await response[responseType]()
  } else {
    const ct = response.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      data = await response.json()
    } else if (ct.startsWith('text/')) {
      data = await response.text()
    } else {
      const text = await response.text()
      try { data = JSON.parse(text) } catch { data = text }
    }
  }

  if (transform) data = transform(data)
  return data as T
}

export async function parseErrorBody<E>(response: Response): Promise<E> {
  try {
    const text = await response.text()
    if (!text) return undefined as E
    try { return JSON.parse(text) as E } catch { return text as E }
  } catch {
    return undefined as E
  }
}

export async function throwIfNotOk<E>(
  response: Response,
  method: string,
  url: string,
): Promise<void> {
  if (response.ok) return
  const data = await parseErrorBody<E>(response)
  throw new HttpError<E>({
    status: response.status,
    statusText: response.statusText,
    data,
    method,
    url,
  })
}

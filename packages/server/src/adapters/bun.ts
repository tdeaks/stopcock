import type { App } from '../router/router'

/** Bun, Deno, Workers — already speak Web. One line. */
export const toBunFetch = (app: App) => (request: Request): Promise<Response> => app.fetch(request)

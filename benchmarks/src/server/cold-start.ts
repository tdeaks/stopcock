// @ts-nocheck
/**
 * Cold-start latency benchmark.
 *
 * Spawns each framework in a fresh subprocess so module-import cost is part
 * of the measurement (frameworks.ts imports everything at top-level, which
 * would conflate per-framework startup).
 *
 * Reports two times:
 *   - startup: spawn → server listening (import + framework init + bind)
 *   - first-response: listening → first 200 OK on /health
 *
 * Each subprocess uses an inline script (`bun -e ...`) so it only loads
 * what that framework strictly needs.
 *
 * Run from benchmarks/:
 *   bun run src/server/cold-start.ts
 *   bun run src/server/cold-start.ts --frameworks=stopcock,fastify
 *   bun run src/server/cold-start.ts --runs=5
 */
import { spawn } from 'node:child_process'

const HOST = '127.0.0.1'
const portBase = Number(process.env['COLD_START_PORT'] ?? 33100)

const workers = {
  native: (port: number) => `
    const http = await import('node:http')
    const srv = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end('{"ok":true}')
      } else {
        res.statusCode = 404
        res.end('not found')
      }
    })
    srv.listen(${port}, '${HOST}', () => {
      process.stdout.write('READY http://${HOST}:${port}\\n')
    })
  `,
  stopcock: (port: number) => `
    const http = await import('node:http')
    const { defineApp, defineModule, route, toNodeListener } = await import('${process.cwd()}/../packages/server/src/index')
    const m = defineModule({
      name: 'health',
      routes: () => [route.get('/health').handler(() => ({ ok: true }))],
    })
    const app = defineApp({ modules: [m] })
    const srv = http.createServer(toNodeListener(app))
    srv.listen(${port}, '${HOST}', () => {
      process.stdout.write('READY http://${HOST}:${port}\\n')
    })
  `,
  fastify: (port: number) => `
    const Fastify = (await import('fastify')).default
    const app = Fastify({ logger: false })
    app.get('/health', async () => ({ ok: true }))
    const url = await app.listen({ port: ${port}, host: '${HOST}' })
    process.stdout.write('READY ' + url + '\\n')
  `,
  hono: (port: number) => `
    const http = await import('node:http')
    const { Hono } = await import('hono')
    const { getRequestListener } = await import('@hono/node-server')
    const app = new Hono()
    app.get('/health', (c) => c.json({ ok: true }))
    const srv = http.createServer(getRequestListener(app.fetch, { overrideGlobalObjects: false }))
    srv.listen(${port}, '${HOST}', () => {
      process.stdout.write('READY http://${HOST}:${port}\\n')
    })
  `,
  express: (port: number) => `
    const express = (await import('express')).default
    const app = express()
    app.get('/health', (_req, res) => res.json({ ok: true }))
    app.listen(${port}, '${HOST}', () => {
      process.stdout.write('READY http://${HOST}:${port}\\n')
    })
  `,
}

const parseArgs = () => {
  const out = { frameworks: 'all', runs: 3 }
  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.split('=')
    if (key === '--frameworks' && value) out.frameworks = value
    else if (key === '--runs' && value) out.runs = Math.max(1, Number(value))
  }
  return out
}

const measure = (id: string, port: number): Promise<{ startupMs: number; firstResponseMs: number; totalMs: number } | null> =>
  new Promise((resolve) => {
    const script = workers[id]
    if (!script) { resolve(null); return }

    const t0 = performance.now()
    const child = spawn('bun', ['-e', script(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
    })

    let buf = ''
    let resolved = false
    const finish = (result: { startupMs: number; firstResponseMs: number; totalMs: number } | null) => {
      if (resolved) return
      resolved = true
      try { child.kill('SIGTERM') } catch { /* ignore */ }
      resolve(result)
    }

    const timeout = setTimeout(() => {
      finish(null)
    }, 15000)

    child.stdout.on('data', async (chunk) => {
      buf += chunk.toString()
      if (buf.includes('READY ')) {
        const tReady = performance.now()
        const url = buf.match(/READY (\S+)/)?.[1]
        if (!url) return finish(null)
        try {
          const res = await fetch(`${url}/health`)
          const tFirst = performance.now()
          if (!res.ok) return finish(null)
          await res.text()
          clearTimeout(timeout)
          finish({
            startupMs: tReady - t0,
            firstResponseMs: tFirst - tReady,
            totalMs: tFirst - t0,
          })
        } catch {
          finish(null)
        }
      }
    })

    child.stderr.on('data', (chunk) => {
      const s = chunk.toString()
      if (s.includes('Error') || s.includes('error')) {
        // print to help debug
        console.error(`${id}: ${s.trim()}`)
      }
    })

    child.on('exit', (code) => {
      clearTimeout(timeout)
      if (!resolved) finish(null)
    })
  })

const round = (n: number, d = 1) => Number(n.toFixed(d))

const main = async () => {
  const args = parseArgs()
  const wanted = args.frameworks === 'all'
    ? Object.keys(workers)
    : args.frameworks.split(',').map((s) => s.trim()).filter(Boolean)

  console.log(`cold-start benchmark: ${wanted.length} frameworks × ${args.runs} runs`)
  console.log('')

  const rows: { id: string; startupMs: number; firstResponseMs: number; totalMs: number }[] = []
  let port = portBase
  for (const id of wanted) {
    if (!workers[id]) {
      console.log(`${id}: unknown framework (skipping)`)
      continue
    }
    const samples: { startupMs: number; firstResponseMs: number; totalMs: number }[] = []
    for (let i = 0; i < args.runs; i++) {
      const result = await measure(id, port++)
      if (!result) continue
      samples.push(result)
    }
    if (samples.length === 0) {
      console.log(`${id}: all runs failed`)
      continue
    }
    const median = (key: 'startupMs' | 'firstResponseMs' | 'totalMs') => {
      const sorted = [...samples].sort((a, b) => a[key] - b[key])
      return sorted[Math.floor(sorted.length / 2)]![key]
    }
    const row = {
      id,
      startupMs: median('startupMs'),
      firstResponseMs: median('firstResponseMs'),
      totalMs: median('totalMs'),
    }
    rows.push(row)
    console.log(`${id}: startup ${round(row.startupMs)}ms, first-response ${round(row.firstResponseMs)}ms, total ${round(row.totalMs)}ms (median of ${samples.length})`)
  }

  rows.sort((a, b) => a.totalMs - b.totalMs)
  console.log('')
  const header = ['framework', 'startup (ms)', 'first-response (ms)', 'total (ms)']
  const data = rows.map((r) => [r.id, round(r.startupMs).toString(), round(r.firstResponseMs).toString(), round(r.totalMs).toString()])
  const all = [header, ...data]
  const widths = header.map((_, i) => Math.max(...all.map((row) => row[i]!.length)))
  for (const [i, row] of all.entries()) {
    console.log(row.map((c, ci) => c.padEnd(widths[ci]!)).join('  '))
    if (i === 0) console.log(widths.map((w) => '-'.repeat(w)).join('  '))
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

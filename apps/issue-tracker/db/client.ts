import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

const url = process.env['DATABASE_URL'] ?? 'postgres://tracker:tracker@localhost:5433/tracker'

export const pool = new pg.Pool({ connectionString: url, max: 10 })
export const db = drizzle(pool, { schema })

export type Db = typeof db

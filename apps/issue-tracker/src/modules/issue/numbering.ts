import { sql } from 'drizzle-orm'
import type { Db } from '../../../db/client'
import { teamCounters } from '../../../db/schema'

// Atomic single statement. Lazily inserts the counter row on first issue
// so teams created via the API (not just seeded ones) work without setup.
export async function allocateIssueNumber(db: Db, teamId: string): Promise<number> {
  const [row] = await db
    .insert(teamCounters)
    .values({ teamId, lastIssueNumber: 1 })
    .onConflictDoUpdate({
      target: teamCounters.teamId,
      set: { lastIssueNumber: sql`${teamCounters.lastIssueNumber} + 1` },
    })
    .returning({ n: teamCounters.lastIssueNumber })
  return row!.n
}

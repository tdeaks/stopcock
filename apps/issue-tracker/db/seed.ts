import { pool, db } from './client'
import {
  attachments, comments, cycles, issueLabels, issues, labels, projects,
  reactions, teamCounters, teamMembers, teams, users, workspaceMembers, workspaces,
} from './schema'

const NAMES = ['Alice', 'Bob', 'Carmen', 'Dimitri', 'Esther', 'Farouk', 'Gita', 'Hideo', 'Ines', 'Juno', 'Kenji', 'Lin']
const EMOJI = ['👍', '❤️', '🚀', '🎉', '🤔', '😅']
const COLOURS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899']

let seedN = 1
const rand = () => {
  seedN = (seedN * 1664525 + 1013904223) >>> 0
  return seedN / 0xffffffff
}
const pick = <T>(xs: ReadonlyArray<T>): T => xs[Math.floor(rand() * xs.length)]!
const pickN = <T>(xs: ReadonlyArray<T>, n: number): T[] => {
  const copy = [...xs]
  const out: T[] = []
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]!)
  return out
}

async function main(): Promise<void> {
  console.log('truncating…')
  await db.execute(`
    truncate table
      reactions, attachments, comments, issue_labels, issues, team_counters,
      labels, cycles, projects, team_members, teams, workspace_members,
      workspaces, users
    restart identity cascade
  `)

  console.log('users…')
  const userRows = await db.insert(users).values(
    NAMES.map((n) => ({ email: `${n.toLowerCase()}@example.com`, name: n })),
  ).returning()

  console.log('workspaces…')
  const wsRows = await db.insert(workspaces).values([
    { slug: 'acme',    name: 'Acme Corp' },
    { slug: 'globex',  name: 'Globex' },
  ]).returning()

  await db.insert(workspaceMembers).values(
    wsRows.flatMap((w, wi) =>
      userRows.map((u, ui) => ({
        workspaceId: w.id,
        userId: u.id,
        role: (ui === 0 ? 'owner' : ui < 3 ? 'admin' : 'member') as 'owner' | 'admin' | 'member',
      })).filter((_, ui) => wi === 0 || ui < 6),
    ),
  )

  console.log('teams…')
  const teamSpecs: Array<{ workspaceId: string; key: string; name: string }> = [
    { workspaceId: wsRows[0]!.id, key: 'ENG',    name: 'Engineering' },
    { workspaceId: wsRows[0]!.id, key: 'DESIGN', name: 'Design' },
    { workspaceId: wsRows[0]!.id, key: 'OPS',    name: 'Operations' },
    { workspaceId: wsRows[1]!.id, key: 'PROD',   name: 'Product' },
    { workspaceId: wsRows[1]!.id, key: 'GROWTH', name: 'Growth' },
  ]
  const teamRows = await db.insert(teams).values(teamSpecs).returning()
  await db.insert(teamCounters).values(teamRows.map((t) => ({ teamId: t.id, lastIssueNumber: 0 })))

  await db.insert(teamMembers).values(
    teamRows.flatMap((t, ti) =>
      pickN(userRows, 4 + (ti % 3)).map((u, idx) => ({
        teamId: t.id,
        userId: u.id,
        role: (idx === 0 ? 'lead' : 'member') as 'lead' | 'member',
      })),
    ),
  )

  console.log('labels…')
  const LABEL_NAMES = ['bug', 'feature', 'chore', 'docs', 'urgent', 'good-first-issue']
  const labelRows = await db.insert(labels).values(
    teamRows.flatMap((t) =>
      LABEL_NAMES.map((name, i) => ({ teamId: t.id, name, color: COLOURS[i % COLOURS.length]! })),
    ),
  ).returning()
  const labelsByTeam = new Map<string, typeof labelRows>()
  for (const l of labelRows) {
    const list = labelsByTeam.get(l.teamId) ?? []
    list.push(l)
    labelsByTeam.set(l.teamId, list)
  }

  console.log('cycles…')
  const cycleRows = await db.insert(cycles).values(
    teamRows.flatMap((t) => [
      { teamId: t.id, number: 1, name: 'Cycle 1', startsAt: new Date('2026-04-01'), endsAt: new Date('2026-04-14') },
      { teamId: t.id, number: 2, name: 'Cycle 2', startsAt: new Date('2026-04-15'), endsAt: new Date('2026-04-28') },
      { teamId: t.id, number: 3, name: 'Cycle 3', startsAt: new Date('2026-04-29'), endsAt: new Date('2026-05-12') },
    ]),
  ).returning()
  const cyclesByTeam = new Map<string, typeof cycleRows>()
  for (const c of cycleRows) {
    const list = cyclesByTeam.get(c.teamId) ?? []
    list.push(c)
    cyclesByTeam.set(c.teamId, list)
  }

  console.log('projects…')
  const PROJECT_NAMES = ['Onboarding revamp', 'Billing v2', 'Mobile app', 'Audit logs', 'Search overhaul']
  const projectRows = await db.insert(projects).values(
    teamRows.flatMap((t, ti) =>
      Array.from({ length: 2 + (ti % 2) }, (_, i) => ({
        teamId: t.id,
        name: PROJECT_NAMES[(ti + i) % PROJECT_NAMES.length]!,
        description: `Project owned by team ${t.key}`,
        status: (['planned', 'started', 'paused'] as const)[i % 3]!,
      })),
    ),
  ).returning()
  const projectsByTeam = new Map<string, typeof projectRows>()
  for (const p of projectRows) {
    const list = projectsByTeam.get(p.teamId) ?? []
    list.push(p)
    projectsByTeam.set(p.teamId, list)
  }

  console.log('issues…')
  type IssueInsert = typeof issues.$inferInsert
  const issueInserts: IssueInsert[] = []
  const counters = new Map<string, number>(teamRows.map((t) => [t.id, 0]))
  const ISSUE_TITLES = [
    'Fix layout shift on dashboard', 'Add SSO via SAML', 'Reduce TTFB on /api/feed',
    'Write migration runbook', 'Investigate flaky test', 'Improve empty states',
    'Add keyboard shortcuts', 'Audit accessibility', 'Rate-limit signup endpoint',
  ]
  for (const t of teamRows) {
    const tProjects = projectsByTeam.get(t.id) ?? []
    const tCycles = cyclesByTeam.get(t.id) ?? []
    const tUsers = pickN(userRows, 6)
    const count = 12 + Math.floor(rand() * 6)
    for (let i = 0; i < count; i++) {
      const n = (counters.get(t.id) ?? 0) + 1
      counters.set(t.id, n)
      issueInserts.push({
        projectId: pick(tProjects).id,
        teamId: t.id,
        cycleId: rand() < 0.7 ? pick(tCycles).id : null,
        number: n,
        title: pick(ISSUE_TITLES),
        description: 'Lorem ipsum dolor sit amet.',
        status: pick(['backlog', 'todo', 'in_progress', 'done'] as const),
        priority: Math.floor(rand() * 5),
        assigneeId: rand() < 0.8 ? pick(tUsers).id : null,
        creatorId: pick(tUsers).id,
      })
    }
  }
  const issueRows = await db.insert(issues).values(issueInserts).returning()
  for (const t of teamRows) {
    await db.update(teamCounters)
      .set({ lastIssueNumber: counters.get(t.id) ?? 0 })
      .where((await import('drizzle-orm')).eq(teamCounters.teamId, t.id))
  }

  console.log('sub-issues, labels, comments, reactions, attachments…')
  const subIssueInserts: IssueInsert[] = []
  for (const parent of issueRows.slice(0, 10)) {
    const n = (counters.get(parent.teamId) ?? 0) + 1
    counters.set(parent.teamId, n)
    subIssueInserts.push({
      projectId: parent.projectId,
      teamId: parent.teamId,
      parentIssueId: parent.id,
      number: n,
      title: `Sub-task of #${parent.number}`,
      status: 'todo',
      priority: 1,
      creatorId: parent.creatorId,
    })
  }
  await db.insert(issues).values(subIssueInserts)
  for (const t of teamRows) {
    await db.update(teamCounters)
      .set({ lastIssueNumber: counters.get(t.id) ?? 0 })
      .where((await import('drizzle-orm')).eq(teamCounters.teamId, t.id))
  }

  await db.insert(issueLabels).values(
    issueRows.flatMap((iss) => {
      const tLabels = labelsByTeam.get(iss.teamId) ?? []
      return pickN(tLabels, Math.floor(rand() * 3)).map((l) => ({ issueId: iss.id, labelId: l.id }))
    }),
  ).onConflictDoNothing()

  const commentInserts = issueRows.flatMap((iss) =>
    Array.from({ length: Math.floor(rand() * 4) }, () => ({
      issueId: iss.id,
      authorId: pick(userRows).id,
      body: pick(['Looks good to me.', 'Can you share a repro?', 'Bumping priority.', 'Will pick this up tomorrow.']),
    })),
  )
  const commentRows = commentInserts.length
    ? await db.insert(comments).values(commentInserts).returning()
    : []

  if (commentRows.length) {
    await db.insert(reactions).values(
      commentRows.flatMap((c) =>
        pickN(userRows, Math.floor(rand() * 3)).map((u) => ({
          commentId: c.id,
          userId: u.id,
          emoji: pick(EMOJI),
        })),
      ),
    ).onConflictDoNothing()
  }

  await db.insert(attachments).values(
    issueRows.filter(() => rand() < 0.2).map((iss) => ({
      issueId: iss.id,
      uploaderId: iss.creatorId,
      filename: 'screenshot.png',
      url: 'https://example.com/files/screenshot.png',
      size: 102400 + Math.floor(rand() * 500000),
    })),
  )

  console.log('done.')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => pool.end())

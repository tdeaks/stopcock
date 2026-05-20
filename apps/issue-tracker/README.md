# issue-tracker — stopcock/server demo

A Linear-style issue tracker built on `@stopcock/server` + Drizzle + Postgres.
Shows nested routes (6 levels deep), module-based DI, and a real relational
schema (13 tables).

## Quickstart

```bash
bun install
bun run db:up         # postgres on :5433
bun run db:generate   # generate migration from schema.ts
bun run db:migrate    # apply
bun run db:seed       # seed realistic data
bun run dev           # API on :3000
```

Visit:
- http://localhost:3000/docs        — OpenAPI UI
- http://localhost:3000/api/v1/workspaces

## Two TODOs left for you

These are deliberately stubbed so you make the design call. The framework
won't run end-to-end until you fill them in.

### 1. Per-team issue numbering — `src/modules/issue/numbering.ts`

`allocateIssueNumber(db, teamId)` must return distinct numbers under
concurrent calls. Three approaches sketched in the file:

| approach | atomic via | pros | cons |
|---|---|---|---|
| `pg sequence per team` | sequence | fastest, no row lock | dynamic DDL on team creation |
| `SELECT max+1 FOR UPDATE` | row lock | simple, no extra table | brief lock per insert |
| `UPDATE team_counters … RETURNING` | UPDATE | atomic, no explicit lock | needs the side table (already wired) |

The `team_counters` table is in `db/schema.ts` and the seed initialises
one row per team — approach (c) is wired up to "just work" if you pick it.

### 2. Authorization policy — `src/middleware/authz.ts`

`canAccess(userId, resource, action)` decides who can do what. The
middleware loads `workspace`, `team`, `project`, `issue` from path params
before calling you. Three options:

- **Workspace-membership = full access** (simplest)
- **Team membership for writes, workspace for reads** (more realistic)
- **Role matrix (owner/admin/member × read/write)** (most flexible)

## Architecture

```
HealthModule
ApiModule (/api/v1)
 ├─ UserModule       ─ users service
 ├─ WorkspaceModule  ─ /workspaces[/:ws][/members]
 ├─ TeamModule       ─ /workspaces/:ws/teams[/:team][/members]    needs Workspace
 ├─ LabelModule      ─ /workspaces/:ws/teams/:team/labels         needs Team
 ├─ CycleModule      ─ /workspaces/:ws/teams/:team/cycles         needs Team
 ├─ ProjectModule    ─ /workspaces/:ws/teams/:team/projects       needs Team
 ├─ IssueModule      ─ …/projects/:project/issues                 needs Project, Label, Cycle, User
 ├─ CommentModule    ─ …/issues/:issue/comments                   needs Issue
 ├─ ReactionModule   ─ …/comments/:comment/reactions              needs Comment
 └─ AttachmentModule ─ …/issues/:issue/attachments                needs Issue
```

Deepest route:
`POST /api/v1/workspaces/:ws/teams/:team/projects/:project/issues/:issue/comments/:comment/reactions`

## Routes (selected)

```
GET    /api/v1/workspaces
POST   /api/v1/workspaces
GET    /api/v1/workspaces/:ws
GET    /api/v1/workspaces/:ws/members
POST   /api/v1/workspaces/:ws/members

GET    /api/v1/workspaces/:ws/teams
POST   /api/v1/workspaces/:ws/teams
GET    /api/v1/workspaces/:ws/teams/:team
GET    /api/v1/workspaces/:ws/teams/:team/cycles
GET    /api/v1/workspaces/:ws/teams/:team/cycles/current
GET    /api/v1/workspaces/:ws/teams/:team/labels
POST   /api/v1/workspaces/:ws/teams/:team/labels
GET    /api/v1/workspaces/:ws/teams/:team/projects
POST   /api/v1/workspaces/:ws/teams/:team/projects

GET    /api/v1/workspaces/:ws/teams/:team/projects/:project/issues
POST   /api/v1/workspaces/:ws/teams/:team/projects/:project/issues
GET    /api/v1/workspaces/:ws/teams/:team/projects/:project/issues/:issue
PATCH  /api/v1/workspaces/:ws/teams/:team/projects/:project/issues/:issue
GET    /api/v1/workspaces/:ws/teams/:team/projects/:project/issues/:issue/children
GET    /api/v1/workspaces/:ws/teams/:team/projects/:project/issues/:issue/labels
POST   /api/v1/workspaces/:ws/teams/:team/projects/:project/issues/:issue/labels/:labelId
GET    /api/v1/workspaces/:ws/teams/:team/projects/:project/issues/:issue/attachments
POST   /api/v1/workspaces/:ws/teams/:team/projects/:project/issues/:issue/attachments
GET    /api/v1/workspaces/:ws/teams/:team/projects/:project/issues/:issue/comments
POST   /api/v1/workspaces/:ws/teams/:team/projects/:project/issues/:issue/comments
GET    …/comments/:comment/reactions
POST   …/comments/:comment/reactions
```

In the demo URLs the `:ws` is the workspace slug (e.g. `acme`), the `:team`
is the team key (e.g. `ENG`), and the `:issue` is the per-team number
(e.g. `42`). Internal lookups join on those.

## Stack

- `@stopcock/server` — the framework being demoed
- `drizzle-orm` — schema + typed nested queries via `relations()`
- `pg` — node-postgres pool
- Postgres 16 (docker)

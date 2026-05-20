import { relations, sql } from 'drizzle-orm'
import {
  integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
  bigint,
} from 'drizzle-orm/pg-core'

export const workspaceRole = pgEnum('workspace_role', ['owner', 'admin', 'member'])
export const teamRole      = pgEnum('team_role',      ['lead', 'member'])
export const issueStatus   = pgEnum('issue_status',   ['backlog', 'todo', 'in_progress', 'done', 'cancelled'])
export const projectStatus = pgEnum('project_status', ['planned', 'started', 'paused', 'completed', 'cancelled'])

export const users = pgTable('users', {
  id:        uuid('id').primaryKey().defaultRandom(),
  email:     text('email').notNull().unique(),
  name:      text('name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaces = pgTable('workspaces', {
  id:        uuid('id').primaryKey().defaultRandom(),
  slug:      text('slug').notNull().unique(),
  name:      text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:        workspaceRole('role').notNull().default('member'),
  joinedAt:    timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.workspaceId, t.userId] }) }))

export const teams = pgTable('teams', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  key:         text('key').notNull(),
  name:        text('name').notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ keyUnique: uniqueIndex('teams_workspace_key_unique').on(t.workspaceId, t.key) }))

export const teamMembers = pgTable('team_members', {
  teamId:   uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId:   uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:     teamRole('role').notNull().default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.teamId, t.userId] }) }))

export const projects = pgTable('projects', {
  id:          uuid('id').primaryKey().defaultRandom(),
  teamId:      uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  description: text('description'),
  status:      projectStatus('status').notNull().default('planned'),
  targetDate:  timestamp('target_date', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const cycles = pgTable('cycles', {
  id:        uuid('id').primaryKey().defaultRandom(),
  teamId:    uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  number:    integer('number').notNull(),
  name:      text('name').notNull(),
  startsAt:  timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt:    timestamp('ends_at',   { withTimezone: true }).notNull(),
}, (t) => ({ numUnique: uniqueIndex('cycles_team_number_unique').on(t.teamId, t.number) }))

export const labels = pgTable('labels', {
  id:     uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  name:   text('name').notNull(),
  color:  text('color').notNull(),
}, (t) => ({ nameUnique: uniqueIndex('labels_team_name_unique').on(t.teamId, t.name) }))

export const teamCounters = pgTable('team_counters', {
  teamId:   uuid('team_id').primaryKey().references(() => teams.id, { onDelete: 'cascade' }),
  lastIssueNumber: integer('last_issue_number').notNull().default(0),
})

export const issues = pgTable('issues', {
  id:            uuid('id').primaryKey().defaultRandom(),
  projectId:     uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  teamId:        uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  cycleId:       uuid('cycle_id').references(() => cycles.id, { onDelete: 'set null' }),
  parentIssueId: uuid('parent_issue_id').references((): any => issues.id, { onDelete: 'cascade' }),
  number:        integer('number').notNull(),
  title:         text('title').notNull(),
  description:   text('description'),
  status:        issueStatus('status').notNull().default('backlog'),
  priority:      integer('priority').notNull().default(0),
  assigneeId:    uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  creatorId:     uuid('creator_id').notNull().references(() => users.id),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ numUnique: uniqueIndex('issues_team_number_unique').on(t.teamId, t.number) }))

export const issueLabels = pgTable('issue_labels', {
  issueId: uuid('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  labelId: uuid('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.issueId, t.labelId] }) }))

export const comments = pgTable('comments', {
  id:              uuid('id').primaryKey().defaultRandom(),
  issueId:         uuid('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  authorId:        uuid('author_id').notNull().references(() => users.id),
  parentCommentId: uuid('parent_comment_id').references((): any => comments.id, { onDelete: 'cascade' }),
  body:            text('body').notNull(),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const reactions = pgTable('reactions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  commentId: uuid('comment_id').notNull().references(() => comments.id, { onDelete: 'cascade' }),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji:     text('emoji').notNull(),
}, (t) => ({ unique: uniqueIndex('reactions_comment_user_emoji_unique').on(t.commentId, t.userId, t.emoji) }))

export const attachments = pgTable('attachments', {
  id:         uuid('id').primaryKey().defaultRandom(),
  issueId:    uuid('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  uploaderId: uuid('uploader_id').notNull().references(() => users.id),
  filename:   text('filename').notNull(),
  url:        text('url').notNull(),
  size:       bigint('size', { mode: 'number' }).notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const usersRelations = relations(users, ({ many }) => ({
  workspaceMemberships: many(workspaceMembers),
  teamMemberships:      many(teamMembers),
  authoredIssues:       many(issues,   { relationName: 'creator' }),
  assignedIssues:       many(issues,   { relationName: 'assignee' }),
  comments:             many(comments),
  reactions:            many(reactions),
  uploads:              many(attachments),
}))

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  teams:   many(teams),
}))

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user:      one(users,      { fields: [workspaceMembers.userId],      references: [users.id] }),
}))

export const teamsRelations = relations(teams, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [teams.workspaceId], references: [workspaces.id] }),
  members:   many(teamMembers),
  projects:  many(projects),
  cycles:    many(cycles),
  labels:    many(labels),
  issues:    many(issues),
  counter:   one(teamCounters, { fields: [teams.id], references: [teamCounters.teamId] }),
}))

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  team:   one(teams, { fields: [projects.teamId], references: [teams.id] }),
  issues: many(issues),
}))

export const cyclesRelations = relations(cycles, ({ one, many }) => ({
  team:   one(teams, { fields: [cycles.teamId], references: [teams.id] }),
  issues: many(issues),
}))

export const labelsRelations = relations(labels, ({ one, many }) => ({
  team:        one(teams, { fields: [labels.teamId], references: [teams.id] }),
  issueLabels: many(issueLabels),
}))

export const issuesRelations = relations(issues, ({ one, many }) => ({
  project:  one(projects, { fields: [issues.projectId], references: [projects.id] }),
  team:     one(teams,    { fields: [issues.teamId],    references: [teams.id] }),
  cycle:    one(cycles,   { fields: [issues.cycleId],   references: [cycles.id] }),
  parent:   one(issues,   { fields: [issues.parentIssueId], references: [issues.id], relationName: 'parent' }),
  children: many(issues,                                                              { relationName: 'parent' }),
  creator:  one(users,    { fields: [issues.creatorId],  references: [users.id], relationName: 'creator' }),
  assignee: one(users,    { fields: [issues.assigneeId], references: [users.id], relationName: 'assignee' }),
  labels:   many(issueLabels),
  comments: many(comments),
  attachments: many(attachments),
}))

export const issueLabelsRelations = relations(issueLabels, ({ one }) => ({
  issue: one(issues, { fields: [issueLabels.issueId], references: [issues.id] }),
  label: one(labels, { fields: [issueLabels.labelId], references: [labels.id] }),
}))

export const commentsRelations = relations(comments, ({ one, many }) => ({
  issue:    one(issues,   { fields: [comments.issueId],         references: [issues.id] }),
  author:   one(users,    { fields: [comments.authorId],        references: [users.id] }),
  parent:   one(comments, { fields: [comments.parentCommentId], references: [comments.id], relationName: 'thread' }),
  replies:  many(comments,                                                                  { relationName: 'thread' }),
  reactions: many(reactions),
}))

export const reactionsRelations = relations(reactions, ({ one }) => ({
  comment: one(comments, { fields: [reactions.commentId], references: [comments.id] }),
  user:    one(users,    { fields: [reactions.userId],    references: [users.id] }),
}))

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  issue:    one(issues, { fields: [attachments.issueId],    references: [issues.id] }),
  uploader: one(users,  { fields: [attachments.uploaderId], references: [users.id] }),
}))

export const teamCountersRelations = relations(teamCounters, ({ one }) => ({
  team: one(teams, { fields: [teamCounters.teamId], references: [teams.id] }),
}))

export type DbSchema = {
  users: typeof users
  workspaces: typeof workspaces
  workspaceMembers: typeof workspaceMembers
  teams: typeof teams
  teamMembers: typeof teamMembers
  projects: typeof projects
  cycles: typeof cycles
  labels: typeof labels
  issues: typeof issues
  issueLabels: typeof issueLabels
  comments: typeof comments
  reactions: typeof reactions
  attachments: typeof attachments
  teamCounters: typeof teamCounters
}

export const _suppressUnused = sql

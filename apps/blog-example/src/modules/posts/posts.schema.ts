/**
 * Schemas for the Posts module. Plain TypeScript types + lightweight runtime
 * guards. Swap for Zod/Valibot/ArkType in real apps; the framework's body
 * parsing will accept any Standard Schema implementation.
 */
import { BadInput } from '../../errors/domain'

export type Post = {
  id: string
  title: string
  body: string
  authorId: string
  createdAt: number
}

export type CreatePostInput = {
  title: string
  body: string
}

export const parseCreatePost = (raw: unknown): CreatePostInput => {
  const issues: string[] = []
  if (typeof raw !== 'object' || raw === null) {
    throw new BadInput(['expected object'])
  }
  const r = raw as Record<string, unknown>
  if (typeof r['title'] !== 'string' || r['title'].length === 0) issues.push('title: required string')
  if (typeof r['body']  !== 'string' || r['body'].length === 0)  issues.push('body: required string')
  if (issues.length) throw new BadInput(issues)
  return { title: r['title'] as string, body: r['body'] as string }
}

import { defineRepository } from '@stopcock/server'
import type { Db } from '../../infra/db'
import type { Post, CreatePostInput } from './posts.schema'
import { NotFound } from '../../errors/domain'

export const makePostsRepo = defineRepository('posts', ({ db }: { db: Db }) => ({
  list: (): Post[] => Array.from(db.posts.values()).sort((a, b) => b.createdAt - a.createdAt),

  findById: (id: string): Post => {
    const post = db.posts.get(id)
    if (!post) throw new NotFound('post', id)
    return post
  },

  create: (authorId: string, input: CreatePostInput): Post => {
    const id = `p${db.posts.size + 1}`
    const post: Post = { id, ...input, authorId, createdAt: Date.now() }
    db.posts.set(id, post)
    return post
  },
}))

export type PostsRepo = ReturnType<typeof makePostsRepo>

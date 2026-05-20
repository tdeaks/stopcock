/**
 * In-memory storage. Real apps replace this with their DB driver of choice.
 * Repos depend on an interface, not this implementation directly — see
 * makePostsRepo in modules/posts/posts.repo.ts.
 */
export type Db = {
  posts: Map<string, { id: string; title: string; body: string; authorId: string; createdAt: number }>
  users: Map<string, { id: string; email: string; password: string }>
  tokens: Map<string, string> // token -> userId
}

export const makeDb = (): Db => {
  const db: Db = { posts: new Map(), users: new Map(), tokens: new Map() }
  // Seed.
  db.users.set('u1', { id: 'u1', email: 'alice@example.com', password: 'hunter2' })
  db.posts.set('p1', { id: 'p1', title: 'Hello', body: 'world', authorId: 'u1', createdAt: 1700000000000 })
  db.tokens.set('t-alice', 'u1')
  return db
}

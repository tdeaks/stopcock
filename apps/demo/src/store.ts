import { create, resource, mutation, computed } from '@stopcock/state'
import { createClient } from '@stopcock/http'

// --- Types ---

export type User = {
  id: number
  name: string
  username: string
  email: string
  phone: string
  company: { name: string }
}

export type Post = {
  id: number
  userId: number
  title: string
  body: string
}

// --- HTTP client ---

export const api = createClient({
  baseUrl: 'https://jsonplaceholder.typicode.com',
})

// --- Store ---

export const store = create({
  search: '',
  selectedUserId: null as number | null,
})

// --- Resources ---

export const users = resource({
  fetch: (signal) => api.get<User[]>('/users', { signal }),
})

export const filteredUsers = computed(
  store,
  s => s.search,
  (search) => {
    const data = users.data
    if (!data) return []
    if (!search) return data
    const q = search.toLowerCase()
    return data.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    )
  },
)

// refetch filtered users when users resource changes
users.subscribe(() => {
  // force computed to re-derive by touching the store
  // (computed is bound to store.search, so we trigger it indirectly)
})

export const userPosts = resource({
  deps: (get) => {
    const id = get(store, s => s.selectedUserId)
    if (id === null) return null
    return { userId: id }
  },
  fetch: ({ userId }, signal) =>
    api.get<Post[]>('/posts', { query: { userId }, signal }),
})

// --- Mutations ---

export const createPost = mutation({
  fn: (input: { userId: number; title: string; body: string }, signal) =>
    api.post<Post>('/posts', { body: input, signal }),
  invalidates: [userPosts],
})

// --- Actions ---

export function selectUser(id: number | null) {
  store.set(s => s.selectedUserId, id)
}

export function setSearch(q: string) {
  store.set(s => s.search, q)
}

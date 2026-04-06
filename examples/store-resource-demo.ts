/**
 * A small user management app showing how store, resource, and http work together.
 *
 * Store holds local UI state (search term, selected user).
 * Resources fetch data from the API and refetch when store state changes.
 * Mutations write to the API and invalidate resources to refresh the list.
 * HTTP client handles typing, retry, and auth.
 */

import { create, resource, mutation, computed } from '@stopcock/state'
import { createClient, type HttpError } from '@stopcock/http'

// --- Types ---

type User = { id: number; name: string; email: string; role: 'admin' | 'user' }
type ApiError = { code: string; message: string }

// --- HTTP client ---

const api = createClient({
  baseUrl: 'https://api.example.com/v1',
  headers: () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` }),
  timeout: 10_000,
  retry: { attempts: 2, backoff: 'exponential' },
})

// --- Store (local UI state) ---

const store = create({
  search: '',
  roleFilter: 'all' as 'all' | 'admin' | 'user',
  selectedUserId: null as number | null,
})

// --- Resources (server data) ---

// Users list. Refetches when search or role filter changes.
const users = resource({
  deps: (get) => ({
    q: get(store, s => s.search),
    role: get(store, s => s.roleFilter),
  }),
  fetch: ({ q, role }, signal) => {
    const query: Record<string, string> = {}
    if (q) query.q = q
    if (role !== 'all') query.role = role
    return api.get<User[]>('/users', { query, signal })
  },
})

// Selected user detail. Refetches when selectedUserId changes.
// Returns null (deps returns null) when no user is selected.
const selectedUser = resource({
  deps: (get) => {
    const id = get(store, s => s.selectedUserId)
    if (id === null) return null
    return { id }
  },
  fetch: ({ id }, signal) => api.get<User>(`/users/:id`, { params: { id }, signal }),
})

// User count. Depends on the users resource.
// Only fetches once users have loaded.
const userStats = resource({
  deps: (get) => {
    const data = get(users)
    if (!data) return null
    return { count: data.length }
  },
  fetch: ({ count }) => Promise.resolve({
    total: count,
    admins: 0, // in a real app this would be a separate API call
  }),
})

// --- Computed (derived sync state) ---

const hasSelection = computed(store, s => s.selectedUserId, id => id !== null)

// --- Mutations ---

const createUser = mutation({
  fn: (input: { name: string; email: string; role: 'admin' | 'user' }, signal) =>
    api.post<User, ApiError>('/users', { body: input, signal }),
  invalidates: [users],
  onSuccess: (user) => {
    console.log(`Created user: ${user.name}`)
  },
  onError: (error) => {
    // error is typed — we know it's HttpError<ApiError> from the api.post call
    console.error('Failed to create user:', error)
  },
})

const deleteUser = mutation({
  fn: (id: number, signal) =>
    api.delete<void>(`/users/:id`, { params: { id }, signal }),
  invalidates: [users],
  optimistic: (id) => {
    // immediately remove from list while server processes
    users.update(prev => (prev ?? []).filter(u => u.id !== id))
  },
})

const updateRole = mutation({
  fn: ({ id, role }: { id: number; role: 'admin' | 'user' }, signal) =>
    api.patch<User>(`/users/:id`, { params: { id }, body: { role }, signal }),
  invalidates: [users, selectedUser],
})

// --- Usage ---

async function demo() {
  // subscribe to user list changes
  users.subscribe((state) => {
    if (state.status === 'loading' && !state.data) {
      console.log('Loading users...')
    } else if (state.status === 'ok') {
      console.log(`Got ${state.data!.length} users`)
    } else if (state.status === 'error') {
      console.error('Failed to load users:', state.error)
    }
  })

  // subscribe to selected user
  selectedUser.subscribe((state) => {
    if (state.status === 'ok') {
      console.log(`Viewing: ${state.data!.name} (${state.data!.role})`)
    }
  })

  // --- User interactions ---

  // typing in search box → resource automatically refetches
  store.set(s => s.search, 'tom')

  // changing filter → resource automatically refetches
  store.set(s => s.roleFilter, 'admin')

  // both at once → resource coalesces into one fetch
  store.batch(() => {
    store.set(s => s.search, '')
    store.set(s => s.roleFilter, 'all')
  })

  // selecting a user → selectedUser resource fetches
  store.set(s => s.selectedUserId, 42)

  // deselecting → selectedUser deps returns null, no fetch
  store.set(s => s.selectedUserId, null)

  // creating a user → POST, then users list refetches
  try {
    const newUser = await createUser.run({ name: 'Alice', email: 'alice@test.com', role: 'user' })
    console.log(`Created: ${newUser.name} (id: ${newUser.id})`)
  } catch (e) {
    // typed error handling
    const err = e as HttpError<ApiError>
    if (err.status === 422) {
      console.error(`Validation: ${err.data.message}`)
    }
  }

  // deleting with optimistic update → removed from list immediately,
  // refetches on success (confirming), or refetches on error (reverting)
  await deleteUser.run(42)

  // promote to admin → PATCH, then both users list and selected user refetch
  await updateRole.run({ id: 7, role: 'admin' })

  // direct resource access
  console.log('Users loading?', users.isLoading)
  console.log('Users data:', users.data)
  console.log('Has selection?', hasSelection.get())

  // manual refetch (e.g. pull-to-refresh)
  users.refetch()

  // cleanup
  users.destroy()
  selectedUser.destroy()
  userStats.destroy()
  hasSelection.destroy()
}

demo()

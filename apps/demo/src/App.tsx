import { useStore, useResource } from '@stopcock/state/react'
import { store, users, userPosts, createPost, selectUser, setSearch, type User } from './store'
import { useState } from 'react'

function SearchBar() {
  const search = useStore(store, s => s.search)
  return (
    <input
      type="text"
      placeholder="Search users..."
      value={search}
      onChange={e => setSearch(e.target.value)}
      style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid #333', borderRadius: '6px', background: '#1a1a1a', color: '#eee', boxSizing: 'border-box' }}
    />
  )
}

function UserCard({ user }: { user: User }) {
  const selectedId = useStore(store, s => s.selectedUserId)
  const isSelected = selectedId === user.id
  return (
    <div
      onClick={() => selectUser(isSelected ? null : user.id)}
      style={{
        padding: '12px', borderRadius: '6px', cursor: 'pointer',
        background: isSelected ? '#2a4a7f' : '#1a1a1a',
        border: `1px solid ${isSelected ? '#4a7abf' : '#333'}`,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontWeight: 600 }}>{user.name}</div>
      <div style={{ fontSize: '13px', color: '#888' }}>{user.email}</div>
      <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{user.company.name}</div>
    </div>
  )
}

function UserList() {
  const { isLoading, data } = useResource(users)
  const search = useStore(store, s => s.search)

  if (isLoading && !data) return <div style={{ color: '#888', padding: '20px' }}>Loading users...</div>

  const filtered = data?.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  }) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {filtered.length === 0 && search && (
        <div style={{ color: '#888', padding: '12px' }}>No users match "{search}"</div>
      )}
      {filtered.map(user => <UserCard key={user.id} user={user} />)}
    </div>
  )
}

function NewPostForm({ userId }: { userId: number }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      await createPost.run({ userId, title, body })
      setTitle('')
      setBody('')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px', fontSize: '13px', background: '#1a1a1a', color: '#eee', border: '1px solid #333', borderRadius: '4px', boxSizing: 'border-box' }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
      <input placeholder="Post title" value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
      <textarea placeholder="Post body" value={body} onChange={e => setBody(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      <button
        type="submit"
        disabled={submitting || !title.trim()}
        style={{ padding: '8px 16px', background: '#2a4a7f', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
      >
        {submitting ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  )
}

function UserDetail() {
  const selectedId = useStore(store, s => s.selectedUserId)
  const { data: allUsers } = useResource(users)
  const { data: posts, isLoading, error } = useResource(userPosts)

  if (selectedId === null) {
    return <div style={{ color: '#666', padding: '40px', textAlign: 'center' }}>Select a user to see their posts</div>
  }

  const user = allUsers?.find(u => u.id === selectedId)

  return (
    <div>
      {user && (
        <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #333' }}>
          <h2 style={{ margin: '0 0 4px' }}>{user.name}</h2>
          <div style={{ fontSize: '14px', color: '#888' }}>@{user.username} &middot; {user.phone}</div>
        </div>
      )}

      <NewPostForm userId={selectedId} />

      <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Posts {posts && `(${posts.length})`}
      </h3>

      {isLoading && !posts && <div style={{ color: '#888' }}>Loading posts...</div>}
      {error ? <div style={{ color: '#f85149' }}>Failed to load posts</div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {posts?.map(post => (
          <div key={post.id} style={{ padding: '12px', background: '#1a1a1a', borderRadius: '6px', border: '1px solid #333' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>{post.title}</div>
            <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.5 }}>{post.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const { isLoading: usersLoading, data: usersData } = useResource(users)
  const { isLoading: postsLoading } = useResource(userPosts)
  const loading = usersLoading || postsLoading

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '16px', fontFamily: 'system-ui', color: '#eee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', fontSize: '12px', color: '#666', borderBottom: '1px solid #222', marginBottom: '16px' }}>
        <span>stopcock/state + stopcock/http</span>
        <span>
          {loading && 'fetching... '}
          {usersData && `${usersData.length} users`}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px', alignItems: 'start' }}>
        <div>
          <SearchBar />
          <div style={{ marginTop: '12px' }}><UserList /></div>
        </div>
        <UserDetail />
      </div>
    </div>
  )
}

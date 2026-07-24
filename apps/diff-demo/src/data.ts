export type Status = 'on-track' | 'at-risk' | 'blocked'

export type Task = {
  id: string
  title: string
  done: boolean
  estimate: number
  meta: {
    priority: 'high' | 'medium' | 'low'
    blockedBy: string | null
  }
}

export type Project = {
  id: string
  name: string
  status: Status
  progress: number
  owner: {
    name: string
    initials: string
    team: string
  }
  tags: string[]
  tasks: Task[]
  metrics: {
    budget: number
    spent: number
  }
}

export type WorkspaceState = {
  projects: Project[]
  preferences: {
    compactMode: boolean
    sort: 'priority' | 'name'
  }
}

export const makeInitialState = (): WorkspaceState => ({
  projects: [
    {
      id: 'atlas',
      name: 'Atlas billing',
      status: 'on-track',
      progress: 62,
      owner: { name: 'Mara Voss', initials: 'MV', team: 'Platform' },
      tags: ['payments', 'api'],
      tasks: [
        {
          id: 'atlas-1',
          title: 'Map legacy invoices',
          done: true,
          estimate: 5,
          meta: { priority: 'high', blockedBy: null },
        },
        {
          id: 'atlas-2',
          title: 'Verify retry policy',
          done: false,
          estimate: 3,
          meta: { priority: 'medium', blockedBy: null },
        },
      ],
      metrics: { budget: 48000, spent: 29140 },
    },
    {
      id: 'kepler',
      name: 'Kepler access',
      status: 'at-risk',
      progress: 48,
      owner: { name: 'Ivo Chen', initials: 'IC', team: 'Identity' },
      tags: ['auth', 'security'],
      tasks: [
        {
          id: 'kepler-1',
          title: 'Rotate signing keys',
          done: true,
          estimate: 2,
          meta: { priority: 'high', blockedBy: null },
        },
        {
          id: 'kepler-2',
          title: 'Complete security review',
          done: false,
          estimate: 8,
          meta: { priority: 'high', blockedBy: 'SEC-218' },
        },
        {
          id: 'kepler-3',
          title: 'Publish migration guide',
          done: false,
          estimate: 3,
          meta: { priority: 'low', blockedBy: null },
        },
      ],
      metrics: { budget: 36000, spent: 25280 },
    },
    {
      id: 'lumen',
      name: 'Lumen mobile',
      status: 'on-track',
      progress: 81,
      owner: { name: 'Noor Okafor', initials: 'NO', team: 'Product' },
      tags: ['mobile', 'offline'],
      tasks: [
        {
          id: 'lumen-1',
          title: 'Tune offline queue',
          done: true,
          estimate: 5,
          meta: { priority: 'medium', blockedBy: null },
        },
        {
          id: 'lumen-2',
          title: 'Audit reduced motion',
          done: false,
          estimate: 2,
          meta: { priority: 'medium', blockedBy: null },
        },
      ],
      metrics: { budget: 52000, spent: 43880 },
    },
    {
      id: 'northstar',
      name: 'Northstar ops',
      status: 'blocked',
      progress: 34,
      owner: { name: 'Leena Saar', initials: 'LS', team: 'Operations' },
      tags: ['internal', 'workflow'],
      tasks: [
        {
          id: 'northstar-1',
          title: 'Reconcile supplier feed',
          done: false,
          estimate: 8,
          meta: { priority: 'high', blockedBy: 'DATA-91' },
        },
        {
          id: 'northstar-2',
          title: 'Draft incident runbook',
          done: true,
          estimate: 3,
          meta: { priority: 'medium', blockedBy: null },
        },
      ],
      metrics: { budget: 28000, spent: 17920 },
    },
  ],
  preferences: {
    compactMode: false,
    sort: 'priority',
  },
})

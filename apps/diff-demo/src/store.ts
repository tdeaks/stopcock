import { applyUnsafe, diff, invert, type Patch } from '@stopcock/diff'
import { create, history, type Middleware } from '@stopcock/state'
import { makeInitialState, type WorkspaceState } from './data.ts'

export type ActionKey = 'task' | 'owner' | 'nested-array' | 'batch' | 'undo' | 'redo' | 'reset'

type ActionDescription = {
  label: string
  detail: string
  code: string
}

export type TelemetryState = {
  commit: number
  action: ActionDescription | null
  recordedPatch: Patch | null
  comparedPatch: Patch | null
  retainedProjects: boolean[]
  subscriberHits: string[]
  roundTripVerified: boolean
  inversionVerified: boolean
}

const actionDescriptions: Record<ActionKey, ActionDescription> = {
  task: {
    label: 'Toggle one nested task',
    detail: 'One leaf changes inside projects[1].tasks[1].',
    code: `store.update((draft) => {
  const task = draft.projects[1].tasks[1]
  task.done = !task.done
})`,
  },
  owner: {
    label: 'Reassign one owner',
    detail: 'Two sibling fields change, the rest of the project is retained.',
    code: `store.update((draft) => {
  const owner = draft.projects[2].owner
  Object.assign(owner, nextOwner)
})`,
  },
  'nested-array': {
    label: 'Add or remove a task',
    detail: 'A nested array changes without replacing the other projects.',
    code: `store.update((draft) => {
  draft.projects[3].tasks.push(newTask)
})`,
  },
  batch: {
    label: 'Batch a release update',
    detail: 'Two writes compose into one commit and one notification pass.',
    code: `store.batch(() => {
  store.over((s) => s.projects[0].progress, advance)
  store.set((s) => s.projects[0].status, nextStatus)
})`,
  },
  undo: {
    label: 'Invert the last patch',
    detail: 'History applies the inverse patch as a new surgical commit.',
    code: `history.undo(store)`,
  },
  redo: {
    label: 'Replay the patch',
    detail: 'History reapplies the recorded patch.',
    code: `history.redo(store)`,
  },
  reset: {
    label: 'Reset the workspace',
    detail: 'A structural diff restores only values that changed.',
    code: `store.replace(makeInitialState())`,
  },
}

const initialTelemetry: TelemetryState = {
  commit: 0,
  action: null,
  recordedPatch: null,
  comparedPatch: null,
  retainedProjects: [true, true, true, true],
  subscriberHits: [],
  roundTripVerified: true,
  inversionVerified: true,
}

export const telemetryStore = create(initialTelemetry)
export const patchHistory = history<WorkspaceState>({ maxDepth: 24 })

let pendingAction: ActionDescription | null = null
const subscriberHits = new Set<string>()

const preservePatch: Middleware<WorkspaceState> = (patch) => patch

export const workspaceStore = create(makeInitialState(), {
  middleware: [patchHistory.middleware, preservePatch],
  onCommit: (recordedPatch, prev, next) => {
    const comparedPatch = diff(prev, next)
    const applied = applyUnsafe(prev, comparedPatch)
    const restored = applyUnsafe(next, invert(recordedPatch))

    telemetryStore.replace({
      commit: telemetryStore.get((state) => state.commit) + 1,
      action: pendingAction,
      recordedPatch,
      comparedPatch,
      retainedProjects: prev.projects.map((project, index) => project === next.projects[index]),
      subscriberHits: [...subscriberHits],
      roundTripVerified: JSON.stringify(applied) === JSON.stringify(next),
      inversionVerified: JSON.stringify(restored) === JSON.stringify(prev),
    })
  },
})

for (let index = 0; index < makeInitialState().projects.length; index++) {
  const projectId = makeInitialState().projects[index].id
  workspaceStore.subscribe(
    (state) => state.projects[index],
    () => subscriberHits.add(projectId),
  )
}

function run(action: ActionKey, update: () => void) {
  pendingAction = actionDescriptions[action]
  subscriberHits.clear()
  update()
}

export function runAction(action: ActionKey) {
  switch (action) {
    case 'task':
      run(action, () => {
        workspaceStore.update((draft) => {
          const task = draft.projects[1].tasks[1]
          task.done = !task.done
        })
      })
      break
    case 'owner':
      run(action, () => {
        workspaceStore.update((draft) => {
          const owner = draft.projects[2].owner
          const isNoor = owner.name === 'Noor Okafor'
          owner.name = isNoor ? 'Anika Bell' : 'Noor Okafor'
          owner.initials = isNoor ? 'AB' : 'NO'
        })
      })
      break
    case 'nested-array':
      run(action, () => {
        workspaceStore.update((draft) => {
          const tasks = draft.projects[3].tasks
          const generatedIndex = tasks.findIndex((task) => task.id === 'northstar-3')
          if (generatedIndex >= 0) {
            tasks.splice(generatedIndex, 1)
          } else {
            tasks.push({
              id: 'northstar-3',
              title: 'Validate recovery drill',
              done: false,
              estimate: 5,
              meta: { priority: 'high', blockedBy: null },
            })
          }
        })
      })
      break
    case 'batch':
      run(action, () => {
        workspaceStore.batch(() => {
          workspaceStore.over(
            (state) => state.projects[0].progress,
            (progress) => (progress >= 86 ? 62 : progress + 8),
          )
          workspaceStore.set(
            (state) => state.projects[0].status,
            workspaceStore.get((state) => state.projects[0].status) === 'on-track'
              ? 'at-risk'
              : 'on-track',
          )
        })
      })
      break
    case 'undo':
      run(action, () => patchHistory.undo(workspaceStore))
      break
    case 'redo':
      run(action, () => patchHistory.redo(workspaceStore))
      break
    case 'reset':
      run(action, () => workspaceStore.replace(makeInitialState()))
      break
  }
}

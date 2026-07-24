import { describe, expect, it } from 'vite-plus/test'
import { runAction, telemetryStore, workspaceStore } from './store.ts'

describe('diff + state demo', () => {
  it('proves surgical updates across the complete interaction story', () => {
    const initial = workspaceStore.get()

    runAction('task')

    const taskTelemetry = telemetryStore.get()
    expect(workspaceStore.get((state) => state.projects[1].tasks[1].done)).toBe(true)
    expect(taskTelemetry.recordedPatch?.ops).toEqual([
      {
        op: 'replace',
        path: ['projects', 1, 'tasks', 1, 'done'],
        oldValue: false,
        newValue: true,
      },
    ])
    expect(taskTelemetry.subscriberHits).toEqual(['kepler'])
    expect(taskTelemetry.retainedProjects).toEqual([true, false, true, true])
    expect(taskTelemetry.roundTripVerified).toBe(true)
    expect(taskTelemetry.inversionVerified).toBe(true)

    runAction('owner')

    const ownerTelemetry = telemetryStore.get()
    expect(ownerTelemetry.recordedPatch?.ops).toHaveLength(2)
    expect(ownerTelemetry.subscriberHits).toEqual(['lumen'])
    expect(ownerTelemetry.retainedProjects).toEqual([true, true, false, true])
    expect(workspaceStore.get((state) => state.projects[2].owner.name)).toBe('Anika Bell')

    const taskCount = workspaceStore.get((state) => state.projects[3].tasks.length)
    runAction('nested-array')

    const arrayTelemetry = telemetryStore.get()
    expect(workspaceStore.get((state) => state.projects[3].tasks)).toHaveLength(taskCount + 1)
    expect(
      arrayTelemetry.recordedPatch?.ops.every(
        (operation) =>
          operation.path[0] === 'projects' &&
          operation.path[1] === 3 &&
          operation.path[2] === 'tasks',
      ),
    ).toBe(true)
    expect(arrayTelemetry.subscriberHits).toEqual(['northstar'])
    expect(arrayTelemetry.retainedProjects).toEqual([true, true, true, false])
    expect(arrayTelemetry.roundTripVerified).toBe(true)
    expect(arrayTelemetry.inversionVerified).toBe(true)

    const beforeBatch = workspaceStore.get()
    runAction('batch')

    const batchTelemetry = telemetryStore.get()
    expect(batchTelemetry.recordedPatch?.ops).toHaveLength(2)
    expect(batchTelemetry.subscriberHits).toEqual(['atlas'])
    expect(batchTelemetry.retainedProjects).toEqual([false, true, true, true])

    runAction('undo')
    expect(workspaceStore.get()).toEqual(beforeBatch)

    runAction('redo')
    expect(workspaceStore.get()).not.toEqual(beforeBatch)

    expect(initial.projects[0]).not.toBe(workspaceStore.get().projects[0])
    expect(initial.projects[1]).not.toBe(workspaceStore.get().projects[1])
  })
})

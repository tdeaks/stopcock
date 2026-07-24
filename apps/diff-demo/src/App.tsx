import { memo, useEffect, useRef, useState } from 'react'
import type { Operation, Patch, Path } from '@stopcock/diff'
import { useStore } from '@stopcock/state/react'
import type { Status } from './data.ts'
import {
  patchHistory,
  runAction,
  telemetryStore,
  workspaceStore,
  type ActionKey,
} from './store.ts'

const projectIndexes = [0, 1, 2, 3] as const

function formatPath(path: Path) {
  return path.reduce<string>(
    (result, segment) =>
      typeof segment === 'number' ? `${result}[${segment}]` : result ? `${result}.${segment}` : segment,
    '',
  )
}

function formatValue(value: unknown) {
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value)
  }
  const serialized = JSON.stringify(value)
  const text = serialized === undefined ? 'undefined' : serialized
  return text.length > 64 ? `${text.slice(0, 61)}...` : text
}

type DiffLine = {
  kind: 'added' | 'removed' | 'context'
  prefix: '+' | '-' | ' '
  value: string
}

function operationLines(operation: Operation): DiffLine[] {
  switch (operation.op) {
    case 'replace':
      return [
        { kind: 'removed', prefix: '-', value: formatValue(operation.oldValue) },
        { kind: 'added', prefix: '+', value: formatValue(operation.newValue) },
      ]
    case 'add':
      return [{ kind: 'added', prefix: '+', value: formatValue(operation.value) }]
    case 'remove':
      return [{ kind: 'removed', prefix: '-', value: formatValue(operation.oldValue) }]
    case 'move':
      return [
        { kind: 'removed', prefix: '-', value: formatPath(operation.from) },
        { kind: 'added', prefix: '+', value: formatPath(operation.path) },
      ]
    case 'rename':
      return [
        {
          kind: 'removed',
          prefix: '-',
          value: formatPath([...operation.path, operation.oldKey]),
        },
        {
          kind: 'added',
          prefix: '+',
          value: formatPath([...operation.path, operation.newKey]),
        },
      ]
    case 'test':
      return [{ kind: 'context', prefix: ' ', value: `expect ${formatValue(operation.value)}` }]
  }
}

function ProgressiveDiff({ patch }: { patch: Patch | null }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    setStep(0)
  }, [patch])

  if (!patch || patch.ops.length === 0) {
    return (
      <div className="empty-patch">
        <span className="empty-patch-mark" aria-hidden="true">
          {'{ }'}
        </span>
        <strong>No patch yet</strong>
        <p>Run a mutation to inspect the exact paths that changed.</p>
      </div>
    )
  }

  const lastStep = patch.ops.length - 1
  const activeStep = Math.min(step, lastStep)

  return (
    <div className="progressive-diff" aria-live="polite">
      <div className="diff-progress">
        <div>
          <strong>
            Change {activeStep + 1} of {patch.ops.length}
          </strong>
          <span>Reveal the patch in application order</span>
        </div>
        <progress aria-label="Patch reveal progress" max={patch.ops.length} value={activeStep + 1} />
      </div>

      <ol className="diff-hunks">
        {patch.ops.map((operation, index) => {
          const revealed = index <= activeStep
          const path = formatPath(operation.path)

          return (
            <li
              className={`diff-hunk ${revealed ? 'is-revealed' : 'is-pending'} ${
                index === activeStep ? 'is-active' : ''
              }`}
              key={`${operation.op}-${path}-${index}`}
            >
              {revealed ? (
                <>
                  <div className="diff-hunk-heading">
                    <code>@@ {path} @@</code>
                    <span>{operation.op}</span>
                  </div>
                  <div className="diff-lines">
                    {operationLines(operation).map((line, lineIndex) => (
                      <div className={`diff-line diff-line-${line.kind}`} key={lineIndex}>
                        <code>
                          <span className="diff-prefix" aria-hidden="true">
                            {line.prefix}
                          </span>
                          <span>{line.value}</span>
                        </code>
                        <span className="diff-line-label">{line.kind}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <button onClick={() => setStep(index)} type="button">
                  <span>
                    <code>@@ {path} @@</code>
                    <small>{operation.op}</small>
                  </span>
                  <span>Reveal change</span>
                </button>
              )}
            </li>
          )
        })}
      </ol>

      <div className="diff-controls">
        <button disabled={activeStep === 0} onClick={() => setStep(activeStep - 1)} type="button">
          Previous
        </button>
        {activeStep < lastStep ? (
          <>
            <button className="show-all" onClick={() => setStep(lastStep)} type="button">
              Show all
            </button>
            <button onClick={() => setStep(activeStep + 1)} type="button">
              Next change
            </button>
          </>
        ) : (
          <span className="diff-complete">
            <span aria-hidden="true">✓</span>
            Patch complete
          </span>
        )}
      </div>
    </div>
  )
}

function StatusLabel({ status }: { status: Status }) {
  return (
    <span className={`status status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {status.replace('-', ' ')}
    </span>
  )
}

const ProjectCard = memo(function ProjectCard({ index }: { index: number }) {
  const project = useStore(workspaceStore, (state) => state.projects[index])
  const renderCount = useRef(0)
  renderCount.current += 1

  return (
    <article className="project" data-project={project.id}>
      <header className="project-header">
        <div>
          <div className="project-title-row">
            <h3>{project.name}</h3>
            <StatusLabel status={project.status} />
          </div>
          <p>
            {project.owner.team} <span aria-hidden="true">/</span> {project.tags.join(', ')}
          </p>
        </div>
        <span className="render-count" title="Actual React component render count">
          render {renderCount.current}
        </span>
      </header>

      <div className="project-meta">
        <div className="owner">
          <span className="avatar" aria-hidden="true">
            {project.owner.initials}
          </span>
          <span>
            <small>Owner</small>
            <strong>{project.owner.name}</strong>
          </span>
        </div>
        <div className="progress">
          <small>Progress</small>
          <strong>{project.progress}%</strong>
        </div>
      </div>

      <div className="progress-segments" aria-label={`${project.progress}% complete`}>
        {Array.from({ length: 10 }, (_, segment) => (
          <span
            className={segment < Math.round(project.progress / 10) ? 'is-filled' : ''}
            key={segment}
          />
        ))}
      </div>

      <ul className="task-list">
        {project.tasks.map((task) => (
          <li key={task.id}>
            <span className={`task-check ${task.done ? 'is-done' : ''}`} aria-hidden="true">
              {task.done ? '✓' : ''}
            </span>
            <span className={task.done ? 'task-title is-done' : 'task-title'}>{task.title}</span>
            <span className={`priority priority-${task.meta.priority}`}>{task.meta.priority}</span>
          </li>
        ))}
      </ul>
    </article>
  )
})

const actions: { key: ActionKey; label: string; shortcut: string }[] = [
  { key: 'task', label: 'Toggle nested task', shortcut: 'leaf' },
  { key: 'owner', label: 'Reassign owner', shortcut: 'object' },
  { key: 'nested-array', label: 'Change task array', shortcut: 'array' },
  { key: 'batch', label: 'Batch release', shortcut: 'batch' },
]

function ActionBar() {
  const commit = useStore(telemetryStore, (state) => state.commit)

  return (
    <section className="action-bar" aria-label="Demo mutations">
      <div className="action-intro">
        <strong>Choose a mutation</strong>
        <span>Every control changes real store state.</span>
      </div>
      <div className="action-buttons">
        {actions.map((action) => (
          <button key={action.key} type="button" onClick={() => runAction(action.key)}>
            <span>{action.label}</span>
            <code>{action.shortcut}</code>
          </button>
        ))}
      </div>
      <div className="history-buttons">
        <button
          aria-label="Undo the last patch"
          disabled={!patchHistory.canUndo}
          onClick={() => runAction('undo')}
          type="button"
        >
          Undo
        </button>
        <button
          aria-label="Redo the last patch"
          disabled={!patchHistory.canRedo}
          onClick={() => runAction('redo')}
          type="button"
        >
          Redo
        </button>
        <button disabled={commit === 0} onClick={() => runAction('reset')} type="button">
          Reset
        </button>
      </div>
    </section>
  )
}

function ProofStrip() {
  const telemetry = useStore(telemetryStore)
  const retained = telemetry.retainedProjects.filter(Boolean).length
  const patchSize = telemetry.recordedPatch?.ops.length ?? 0

  return (
    <section className="proof-strip" aria-live="polite">
      <div>
        <span className="proof-value">{telemetry.commit || '--'}</span>
        <span className="proof-label">commits observed</span>
      </div>
      <div>
        <span className="proof-value">{telemetry.recordedPatch ? patchSize : '--'}</span>
        <span className="proof-label">operations recorded</span>
      </div>
      <div>
        <span className="proof-value">
          {telemetry.recordedPatch ? `${retained}/4` : '--'}
        </span>
        <span className="proof-label">project references retained</span>
      </div>
      <div>
        <span className="proof-value">
          {telemetry.recordedPatch ? telemetry.subscriberHits.length : '--'}
        </span>
        <span className="proof-label">project selectors notified</span>
      </div>
    </section>
  )
}

function PatchInspector() {
  const telemetry = useStore(telemetryStore)
  const [view, setView] = useState<'recorded' | 'compared'>('recorded')
  const patch = view === 'recorded' ? telemetry.recordedPatch : telemetry.comparedPatch

  return (
    <aside className="inspector">
      <div className="inspector-top">
        <div>
          <span className="section-label">Patch inspector</span>
          <h2>{telemetry.action?.label ?? 'Waiting for a change'}</h2>
          <p>
            {telemetry.action?.detail ??
              'The next state update will leave a precise, invertible trace here.'}
          </p>
        </div>
        {patch ? <span className="patch-count">{patch.ops.length} ops</span> : null}
      </div>

      <div className="tabs" role="tablist" aria-label="Patch source">
        <button
          aria-selected={view === 'recorded'}
          onClick={() => setView('recorded')}
          role="tab"
          type="button"
        >
          Recorded
        </button>
        <button
          aria-selected={view === 'compared'}
          onClick={() => setView('compared')}
          role="tab"
          type="button"
        >
          Snapshot diff
        </button>
      </div>

      <div className="patch-scroll" role="tabpanel">
        <ProgressiveDiff patch={patch} />
      </div>

      <div className="verification">
        <div>
          <span className={telemetry.roundTripVerified ? 'verify-mark' : 'verify-mark failed'}>
            {telemetry.roundTripVerified ? '✓' : '!'}
          </span>
          <span>
            <strong>Apply verified</strong>
            <small>apply(prev, diff) equals next</small>
          </span>
        </div>
        <div>
          <span className={telemetry.inversionVerified ? 'verify-mark' : 'verify-mark failed'}>
            {telemetry.inversionVerified ? '✓' : '!'}
          </span>
          <span>
            <strong>Inverse verified</strong>
            <small>apply(next, invert) equals prev</small>
          </span>
        </div>
      </div>
    </aside>
  )
}

function ExplanationPanel() {
  const telemetry = useStore(telemetryStore)
  const retained = telemetry.retainedProjects

  return (
    <section className="explanation">
      <div className="code-panel">
        <div className="code-heading">
          <span>Mutation source</span>
          <code>TypeScript</code>
        </div>
        <pre>
          <code>
            {telemetry.action?.code ??
              `store.update((draft) => {\n  // choose a mutation above\n})`}
          </code>
        </pre>
      </div>

      <div className="reference-map">
        <span className="section-label">Structural sharing proof</span>
        <h2>Untouched branches stay identical.</h2>
        <p>
          Reference equality is checked inside <code>onCommit</code>, using the actual previous and
          next snapshots.
        </p>
        <div className="reference-rows">
          {projectIndexes.map((index) => {
            const project = workspaceStore.get((state) => state.projects[index])
            const isRetained = retained[index]
            return (
              <div key={project.id}>
                <span>{project.name}</span>
                <code>
                  prev.projects[{index}] {isRetained ? '===' : '!=='} next.projects[{index}]
                </code>
                <strong className={isRetained ? 'retained' : 'changed'}>
                  {telemetry.recordedPatch ? (isRetained ? 'retained' : 'changed') : 'ready'}
                </strong>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function CurrentSnapshot() {
  const projects = useStore(workspaceStore, (state) => state.projects)

  return (
    <details className="snapshot">
      <summary>
        <span>
          Inspect the current nested array
          <small>{projects.length} projects, {projects.reduce((sum, project) => sum + project.tasks.length, 0)} tasks</small>
        </span>
        <span aria-hidden="true">Open JSON</span>
      </summary>
      <pre>
        <code>{JSON.stringify(projects, null, 2)}</code>
      </pre>
    </details>
  )
}

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#main">
          <span className="brand-mark" aria-hidden="true">
            s/
          </span>
          <span>stopcock</span>
        </a>
        <span className="product-name">diff + state lab</span>
        <a className="source-link" href="https://github.com/tdeaks/stopcock" rel="noreferrer">
          View source
        </a>
      </header>

      <main id="main">
        <section className="intro">
          <div>
            <span className="section-label">Surgical state updates</span>
            <h1>Change less.<br />Render less.</h1>
          </div>
          <p>
            Mutate one leaf inside a complex object array. Stopcock records the patch, preserves
            untouched references, and wakes only the selectors whose paths overlap.
          </p>
        </section>

        <ActionBar />
        <ProofStrip />

        <div className="lab-layout">
          <section className="workspace" aria-labelledby="workspace-heading">
            <div className="workspace-heading">
              <div>
                <span className="section-label">Live workspace</span>
                <h2 id="workspace-heading">Four independent subscribers</h2>
              </div>
              <code>state.projects[]</code>
            </div>
            <div className="project-grid">
              {projectIndexes.map((index) => (
                <ProjectCard index={index} key={index} />
              ))}
            </div>
          </section>
          <PatchInspector />
        </div>

        <ExplanationPanel />
        <CurrentSnapshot />
      </main>

      <footer>
        <span>@stopcock/diff</span>
        <p>Structural diffs, invertible patches, fine-grained subscriptions.</p>
        <span>@stopcock/state</span>
      </footer>
    </div>
  )
}

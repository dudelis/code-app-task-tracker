import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { Csa_customersService } from './generated/services/Csa_customersService'
import { Csa_projectsService } from './generated/services/Csa_projectsService'
import { Csa_tasksService } from './generated/services/Csa_tasksService'
import { fetchActiveCustomers, type Customer } from './data/customers'
import { fetchActiveProjects, type Project } from './data/projects'
import { fetchAllTasks, updateTaskStatus, type Task } from './data/tasks'
import { buildOverviewTree } from './data/overview'
import { BACKLOG_STATUS, buildCustomerBoard, statusOnDrop } from './data/board'

interface OverviewData {
  customers: Customer[]
  projects: Project[]
  tasks: Task[]
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: OverviewData }

type View = { kind: 'overview' } | { kind: 'board'; customerId: string }

function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [view, setView] = useState<View>({ kind: 'overview' })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchActiveCustomers((options) => Csa_customersService.getAll(options)),
      fetchActiveProjects((options) => Csa_projectsService.getAll(options)),
      fetchAllTasks((options) => Csa_tasksService.getAll(options)),
    ])
      .then(([customers, projects, tasks]) => {
        if (!cancelled) {
          setState({ status: 'ready', data: { customers, projects, tasks } })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load the overview.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  function applyTaskStatus(taskId: string, status: number) {
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            data: {
              ...prev.data,
              tasks: prev.data.tasks.map((task) =>
                task.id === taskId ? { ...task, status } : task,
              ),
            },
          }
        : prev,
    )
  }

  return (
    <main className="app">
      <h1>Task Tracker</h1>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">Could not load data: {state.message}</p>}
      {state.status === 'ready' && view.kind === 'overview' && (
        <Overview
          data={state.data}
          onOpenBoard={(customerId) => setView({ kind: 'board', customerId })}
        />
      )}
      {state.status === 'ready' && view.kind === 'board' && (
        <Board
          data={state.data}
          customerId={view.customerId}
          onBack={() => setView({ kind: 'overview' })}
          onTaskStatusChanged={applyTaskStatus}
        />
      )}
    </main>
  )
}

function Overview({
  data,
  onOpenBoard,
}: {
  data: OverviewData
  onOpenBoard: (customerId: string) => void
}) {
  const tree = useMemo(
    () => buildOverviewTree(data.customers, data.projects, data.tasks),
    [data],
  )

  return (
    <section>
      <h2>Overview</h2>
      {tree.length === 0 ? (
        <p>No active customers yet.</p>
      ) : (
        <ul className="overview-tree">
          {tree.map((node) => (
            <li key={node.customer.id} className="customer-node">
              <details open>
                <summary className="customer-name">
                  {node.customer.name}
                  <button
                    type="button"
                    className="open-board"
                    onClick={(event) => {
                      event.preventDefault()
                      onOpenBoard(node.customer.id)
                    }}
                  >
                    Open board
                  </button>
                </summary>
                {node.projects.length === 0 ? (
                  <p className="no-projects">No active projects.</p>
                ) : (
                  <ul className="project-list">
                    {node.projects.map((projectNode) => (
                      <li key={projectNode.project.id} className="project-node">
                        <details open>
                          <summary className="project-name">{projectNode.project.name}</summary>
                          {projectNode.tasks.length === 0 ? (
                            <p className="no-tasks">No open tasks.</p>
                          ) : (
                            <ul className="task-list">
                              {projectNode.tasks.map((task) => (
                                <li key={task.id} className="task-name">
                                  {task.name}
                                  {task.statusLabel && (
                                    <span className="task-status"> — {task.statusLabel}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Board({
  data,
  customerId,
  onBack,
  onTaskStatusChanged,
}: {
  data: OverviewData
  customerId: string
  onBack: () => void
  onTaskStatusChanged: (taskId: string, status: number) => void
}) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const customer = data.customers.find((c) => c.id === customerId)
  const board = useMemo(
    () => (customer ? buildCustomerBoard(customer, data.projects, data.tasks) : null),
    [customer, data.projects, data.tasks],
  )

  if (!customer || !board) {
    return (
      <section>
        <button type="button" onClick={onBack}>
          ← Back to overview
        </button>
        <p role="alert">That customer is no longer available.</p>
      </section>
    )
  }

  async function handleDrop(targetStatus: number) {
    const taskId = draggingTaskId
    setDraggingTaskId(null)
    if (!taskId) return
    const task = data.tasks.find((t) => t.id === taskId)
    if (!task) return

    const transition = statusOnDrop(task, targetStatus)
    if (!transition.changed) return

    const previousStatus = task.status ?? BACKLOG_STATUS
    setError(null)
    // Optimistic update; revert if the write fails.
    onTaskStatusChanged(taskId, transition.status)
    try {
      await updateTaskStatus(
        (id, changedFields) => Csa_tasksService.update(id, changedFields),
        taskId,
        transition.status,
      )
    } catch (e: unknown) {
      onTaskStatusChanged(taskId, previousStatus)
      setError(e instanceof Error ? e.message : 'Could not move the task.')
    }
  }

  return (
    <section className="board">
      <header className="board-header">
        <button type="button" onClick={onBack}>
          ← Back to overview
        </button>
        <h2>{customer.name} — Board</h2>
      </header>
      {error && <p role="alert">{error}</p>}
      {board.lanes.length === 0 ? (
        <p>No active projects for this customer.</p>
      ) : (
        <div className="board-grid" role="grid">
          <div className="board-row board-head" role="row">
            <div className="board-corner" role="columnheader" />
            {board.columns.map((column) => (
              <div key={column.status} className="board-col-head" role="columnheader">
                {column.label}
              </div>
            ))}
          </div>
          {board.lanes.map((lane) => (
            <div key={lane.project.id} className="board-row" role="row">
              <div className="board-lane-head" role="rowheader">
                {lane.project.name}
              </div>
              {lane.columns.map((cell) => (
                <div
                  key={cell.status}
                  className="board-cell"
                  role="gridcell"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(cell.status)}
                >
                  {cell.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="board-card"
                      draggable
                      onDragStart={() => setDraggingTaskId(task.id)}
                      onDragEnd={() => setDraggingTaskId(null)}
                    >
                      {task.name}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default App

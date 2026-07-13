import { useEffect, useState } from 'react'
import './App.css'
import { Csa_customersService } from './generated/services/Csa_customersService'
import { Csa_projectsService } from './generated/services/Csa_projectsService'
import { Csa_tasksService } from './generated/services/Csa_tasksService'
import { fetchActiveCustomers } from './data/customers'
import { fetchActiveProjects } from './data/projects'
import { fetchNotDoneTasks } from './data/tasks'
import { buildOverviewTree, type CustomerTreeNode } from './data/overview'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tree: CustomerTreeNode[] }

function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchActiveCustomers((options) => Csa_customersService.getAll(options)),
      fetchActiveProjects((options) => Csa_projectsService.getAll(options)),
      fetchNotDoneTasks((options) => Csa_tasksService.getAll(options)),
    ])
      .then(([customers, projects, tasks]) => {
        if (!cancelled) {
          setState({ status: 'ready', tree: buildOverviewTree(customers, projects, tasks) })
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

  return (
    <main className="app">
      <h1>Task Tracker</h1>
      <section>
        <h2>Overview</h2>
        {state.status === 'loading' && <p>Loading overview…</p>}
        {state.status === 'error' && <p role="alert">Could not load overview: {state.message}</p>}
        {state.status === 'ready' && state.tree.length === 0 && <p>No active customers yet.</p>}
        {state.status === 'ready' && state.tree.length > 0 && (
          <ul className="overview-tree">
            {state.tree.map((node) => (
              <li key={node.customer.id} className="customer-node">
                <details open>
                  <summary className="customer-name">{node.customer.name}</summary>
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
    </main>
  )
}

export default App

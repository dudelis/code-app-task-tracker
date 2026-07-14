import { useCallback, useEffect, useState } from 'react'
import { Csa_customersService } from '../generated/services/Csa_customersService'
import { Csa_projectsService } from '../generated/services/Csa_projectsService'
import { Csa_tasksService } from '../generated/services/Csa_tasksService'
import { Csa_labelsService } from '../generated/services/Csa_labelsService'
import { fetchAllCustomers, type Customer } from '../data/customers'
import { fetchAllProjects, type Project } from '../data/projects'
import { fetchAllTasks, type Task } from '../data/tasks'
import { fetchAllLabels, type Label } from '../data/labels'
import { loadTaskLabels } from '../data/cascades'
import type { LoadState } from '../types'

/**
 * The set of local-state mutations returned by {@link useOverview}. Each one
 * applies an optimistic change to the in-memory overview after a successful (or
 * pending) write, so views update without a full reload. They are no-ops until
 * the initial load succeeds. Every callback is referentially stable.
 */
export interface OverviewActions {
  applyTaskStatus: (taskId: string, status: number) => void
  applyTaskUpsert: (task: Task) => void
  applyTaskLabels: (taskId: string, labels: Label[]) => void
  applyTaskRemove: (taskId: string) => void
  applyCustomerUpsert: (customer: Customer) => void
  applyProjectUpsert: (project: Project) => void
  applyProjectRemove: (projectId: string) => void
  applyCustomerRemove: (customerId: string) => void
  applyLabelUpsert: (label: Label) => void
  applyLabelRemove: (labelId: string) => void
}

/**
 * Owns the top-level overview dataset: performs the initial parallel load of
 * customers, projects, tasks, labels, and each task's labels, and exposes the
 * async {@link LoadState} plus a stable set of optimistic {@link OverviewActions}
 * for keeping local state in sync after writes. All Dataverse reads go through
 * the injectable `data/` seams; the component tree only sees `state` and the
 * `apply*` callbacks.
 */
export function useOverview(): { state: LoadState } & OverviewActions {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchAllCustomers((options) => Csa_customersService.getAll(options)),
      fetchAllProjects((options) => Csa_projectsService.getAll(options)),
      fetchAllTasks((options) => Csa_tasksService.getAll(options)),
      fetchAllLabels((options) => Csa_labelsService.getAll(options)),
    ])
      .then(async ([customers, projects, tasks, labels]) => {
        const taskLabels = await loadTaskLabels(tasks)
        if (!cancelled) {
          setState({
            status: 'ready',
            data: { customers, projects, tasks, labels, taskLabels },
          })
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

  const applyTaskStatus = useCallback((taskId: string, status: number) => {
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
  }, [])

  const applyTaskUpsert = useCallback((task: Task) => {
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            data: {
              ...prev.data,
              tasks: prev.data.tasks.some((t) => t.id === task.id)
                ? prev.data.tasks.map((t) => (t.id === task.id ? task : t))
                : [...prev.data.tasks, task],
            },
          }
        : prev,
    )
  }, [])

  const applyTaskLabels = useCallback((taskId: string, labels: Label[]) => {
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            data: {
              ...prev.data,
              taskLabels: { ...prev.data.taskLabels, [taskId]: labels },
            },
          }
        : prev,
    )
  }, [])

  const applyTaskRemove = useCallback((taskId: string) => {
    setState((prev) => {
      if (prev.status !== 'ready') return prev
      const taskLabels = { ...prev.data.taskLabels }
      delete taskLabels[taskId]
      return {
        status: 'ready',
        data: {
          ...prev.data,
          tasks: prev.data.tasks.filter((task) => task.id !== taskId),
          taskLabels,
        },
      }
    })
  }, [])

  const applyCustomerUpsert = useCallback((customer: Customer) => {
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            data: {
              ...prev.data,
              customers: prev.data.customers.some((c) => c.id === customer.id)
                ? prev.data.customers.map((c) => (c.id === customer.id ? customer : c))
                : [...prev.data.customers, customer],
            },
          }
        : prev,
    )
  }, [])

  const applyProjectUpsert = useCallback((project: Project) => {
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            data: {
              ...prev.data,
              projects: prev.data.projects.some((p) => p.id === project.id)
                ? prev.data.projects.map((p) => (p.id === project.id ? project : p))
                : [...prev.data.projects, project],
            },
          }
        : prev,
    )
  }, [])

  /**
   * Remove a deleted project and its whole subtree from local state after a
   * hard delete: drop the project, its tasks, and those tasks' label maps.
   */
  const applyProjectRemove = useCallback((projectId: string) => {
    setState((prev) => {
      if (prev.status !== 'ready') return prev
      const removedTaskIds = new Set(
        prev.data.tasks.filter((task) => task.projectId === projectId).map((task) => task.id),
      )
      const taskLabels = { ...prev.data.taskLabels }
      for (const id of removedTaskIds) delete taskLabels[id]
      return {
        status: 'ready',
        data: {
          ...prev.data,
          projects: prev.data.projects.filter((p) => p.id !== projectId),
          tasks: prev.data.tasks.filter((task) => !removedTaskIds.has(task.id)),
          taskLabels,
        },
      }
    })
  }, [])

  /**
   * Remove a deleted customer and its whole subtree from local state after a
   * hard delete: drop the customer, its projects, their tasks, and label maps.
   */
  const applyCustomerRemove = useCallback((customerId: string) => {
    setState((prev) => {
      if (prev.status !== 'ready') return prev
      const removedProjectIds = new Set(
        prev.data.projects
          .filter((project) => project.customerId === customerId)
          .map((project) => project.id),
      )
      const removedTaskIds = new Set(
        prev.data.tasks
          .filter((task) => removedProjectIds.has(task.projectId))
          .map((task) => task.id),
      )
      const taskLabels = { ...prev.data.taskLabels }
      for (const id of removedTaskIds) delete taskLabels[id]
      return {
        status: 'ready',
        data: {
          ...prev.data,
          customers: prev.data.customers.filter((c) => c.id !== customerId),
          projects: prev.data.projects.filter((p) => !removedProjectIds.has(p.id)),
          tasks: prev.data.tasks.filter((task) => !removedTaskIds.has(task.id)),
          taskLabels,
        },
      }
    })
  }, [])

  const applyLabelUpsert = useCallback((label: Label) => {
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            data: {
              ...prev.data,
              labels: prev.data.labels.some((l) => l.id === label.id)
                ? prev.data.labels
                    .map((l) => (l.id === label.id ? label : l))
                    .sort((a, b) => a.name.localeCompare(b.name))
                : [...prev.data.labels, label].sort((a, b) => a.name.localeCompare(b.name)),
            },
          }
        : prev,
    )
  }, [])

  const applyLabelRemove = useCallback((labelId: string) => {
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            data: {
              ...prev.data,
              labels: prev.data.labels.filter((l) => l.id !== labelId),
              taskLabels: Object.fromEntries(
                Object.entries(prev.data.taskLabels).map(([taskId, labels]) => [
                  taskId,
                  labels.filter((l) => l.id !== labelId),
                ]),
              ),
            },
          }
        : prev,
    )
  }, [])

  return {
    state,
    applyTaskStatus,
    applyTaskUpsert,
    applyTaskLabels,
    applyTaskRemove,
    applyCustomerUpsert,
    applyProjectUpsert,
    applyProjectRemove,
    applyCustomerRemove,
    applyLabelUpsert,
    applyLabelRemove,
  }
}

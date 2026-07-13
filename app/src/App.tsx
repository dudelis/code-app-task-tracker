import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { getClient } from '@microsoft/power-apps/data'
import type { DataClient, IOperationOptions } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../.power/schemas/appschemas/dataSourcesInfo'
import { Csa_customersService } from './generated/services/Csa_customersService'
import { Csa_projectsService } from './generated/services/Csa_projectsService'
import { Csa_tasksService } from './generated/services/Csa_tasksService'
import { Csa_labelsService } from './generated/services/Csa_labelsService'
import { Csa_notesService } from './generated/services/Csa_notesService'
import type { Csa_tasks } from './generated/models/Csa_tasksModel'
import type { Csa_labels } from './generated/models/Csa_labelsModel'
import {
  createCustomer,
  customerToForm,
  deleteCustomer,
  deleteCustomerCascade,
  fetchAllCustomers,
  fetchCustomerProjectIds,
  newCustomerForm,
  updateCustomer,
  updateCustomerActive,
  validateCustomerForm,
  type Customer,
  type CustomerFormValues,
} from './data/customers'
import {
  createProject,
  deleteProject,
  deleteProjectCascade,
  fetchAllProjects,
  fetchProjectTaskIds,
  newProjectForm,
  projectToForm,
  updateProject,
  updateProjectActive,
  validateProjectForm,
  type Project,
  type ProjectFormValues,
} from './data/projects'
import {
  createTask,
  deleteTask,
  deleteTaskCascade,
  fetchAllTasks,
  newTaskForm,
  taskToForm,
  updateTask,
  updateTaskStatus,
  validateTaskForm,
  DONE_STATUS,
  RESPONSIBLE_CHOICES,
  type Task,
  type TaskFormValues,
} from './data/tasks'
import {
  TASK_LABEL_NAV,
  LABEL_COLOR_CHOICES,
  createLabel,
  deleteLabel,
  detachAllTaskLabels,
  fetchAllLabels,
  fetchTaskLabels,
  findLabelByName,
  labelToForm,
  newLabelForm,
  saveTaskLabels,
  updateLabel,
  validateLabelForm,
  type Label,
  type LabelFormValues,
} from './data/labels'
import {
  createNote,
  deleteNote,
  deleteTaskNotes,
  fetchTaskNotes,
  type Note,
} from './data/notes'
import { buildOverviewTree } from './data/overview'
import { toggleActive } from './data/visibility'
import { isDeleteConfirmed } from './data/deletion'
import { filterTasksByResponsible, type ResponsibleFilter } from './data/responsible'
import {
  BACKLOG_STATUS,
  STATUS_COLUMNS,
  buildCustomerBoard,
  buildProjectBoard,
  completeChange,
  statusChange,
  statusOnDrop,
} from './data/board'

// Shared Dataverse client used only for the task↔label many-to-many association,
// which the generated services do not model. All uncertain live mechanics live
// here behind the labels.ts seams; the deterministic parts are unit-tested.
const labelClient: DataClient = getClient(dataSourcesInfo)

/**
 * Replace a task's attached-label collection with `desiredLabelIds` in one
 * PATCH via `@odata.bind`. UNVERIFIED against live Dataverse — the typed Code
 * App DataClient exposes no dedicated associate/disassociate, so this is a
 * best-effort implementation that still needs manual live validation (#10).
 */
async function writeTaskLabels(taskId: string, desiredLabelIds: string[]): Promise<void> {
  await labelClient.updateRecordAsync<Record<string, string[]>, Csa_tasks>('csa_tasks', taskId, {
    [`${TASK_LABEL_NAV}@odata.bind`]: desiredLabelIds.map((id) => `/csa_labels(${id})`),
  })
}

/**
 * Read a task's attached labels by expanding the M:N navigation property. The
 * typed options do not model `$expand`, so the request is built and cast.
 * UNVERIFIED against live Dataverse — needs manual live validation (#10).
 */
async function readTaskLabels(taskId: string): Promise<Csa_labels[]> {
  const result = await labelClient.retrieveRecordAsync<Record<string, unknown>>(
    'csa_tasks',
    taskId,
    { select: ['csa_taskid'], expand: [{ attributeName: TASK_LABEL_NAV }] } as unknown as IOperationOptions,
  )
  return (result.data?.[TASK_LABEL_NAV] as Csa_labels[] | undefined) ?? []
}

/**
 * Hard-delete a task and its subtree (ADR-0002) through the composed data seams:
 * delete the task's notes, detach its label links, then delete the task. Reused
 * by the Task pane's own delete and by the Project/Customer cascades below, so
 * every deletion of a task follows the same child-before-parent order.
 */
function runTaskCascade(taskId: string): Promise<void> {
  return deleteTaskCascade(
    {
      deleteNotes: (id) =>
        deleteTaskNotes(
          (options) => Csa_notesService.getAll(options),
          (noteId) => Csa_notesService.delete(noteId),
          id,
        ).then(() => undefined),
      detachLabels: (id) => detachAllTaskLabels(writeTaskLabels, id),
      deleteTask: (id) => deleteTask((tid) => Csa_tasksService.delete(tid), id),
    },
    taskId,
  )
}

/**
 * Hard-delete a project and its subtree (ADR-0002): enumerate the project's
 * tasks, run the reusable Task cascade for each, then delete the project.
 */
function runProjectCascade(projectId: string): Promise<void> {
  return deleteProjectCascade(
    {
      listTaskIds: (id) => fetchProjectTaskIds((options) => Csa_tasksService.getAll(options), id),
      deleteTaskCascade: runTaskCascade,
      deleteProject: (id) => deleteProject((pid) => Csa_projectsService.delete(pid), id),
    },
    projectId,
  )
}

/**
 * Hard-delete a customer and its subtree (ADR-0002): enumerate the customer's
 * projects, run the Project cascade for each, then delete the customer.
 */
function runCustomerCascade(customerId: string): Promise<void> {
  return deleteCustomerCascade(
    {
      listProjectIds: (id) =>
        fetchCustomerProjectIds((options) => Csa_projectsService.getAll(options), id),
      deleteProjectCascade: runProjectCascade,
      deleteCustomer: (id) => deleteCustomer((cid) => Csa_customersService.delete(cid), id),
    },
    customerId,
  )
}

/**
 * Best-effort read of every task's attached labels for board display. Per-task
 * failures degrade to an empty label set rather than failing the whole load,
 * since the live M:N read is not yet verified.
 */
async function loadTaskLabels(tasks: Task[]): Promise<Record<string, Label[]>> {
  const entries = await Promise.all(
    tasks.map(async (task) => {
      try {
        return [task.id, await fetchTaskLabels(readTaskLabels, task.id)] as const
      } catch {
        return [task.id, [] as Label[]] as const
      }
    }),
  )
  return Object.fromEntries(entries)
}

interface OverviewData {
  customers: Customer[]
  projects: Project[]
  tasks: Task[]
  labels: Label[]
  taskLabels: Record<string, Label[]>
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: OverviewData }

type View =
  | { kind: 'overview' }
  | { kind: 'board'; customerId: string }
  | { kind: 'projectBoard'; customerId: string }
  | { kind: 'labels' }

type CustomerPane =
  | { mode: 'create' }
  | { mode: 'edit'; customer: Customer }

type ProjectPane =
  | { mode: 'create'; customerId: string }
  | { mode: 'edit'; project: Project }

type TaskPane =
  | { mode: 'create'; projectId: string; status: number }
  | { mode: 'edit'; task: Task }

function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [view, setView] = useState<View>({ kind: 'overview' })
  const [responsibleFilter, setResponsibleFilter] = useState<ResponsibleFilter>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [customerPane, setCustomerPane] = useState<CustomerPane | null>(null)
  const [projectPane, setProjectPane] = useState<ProjectPane | null>(null)
  const [taskPane, setTaskPane] = useState<TaskPane | null>(null)

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

  function applyTaskUpsert(task: Task) {
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
  }

  function applyTaskLabels(taskId: string, labels: Label[]) {
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
  }

  function applyTaskRemove(taskId: string) {
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
  }

  function applyCustomerActive(customerId: string, active: boolean) {
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            data: {
              ...prev.data,
              customers: prev.data.customers.map((customer) =>
                customer.id === customerId ? { ...customer, active } : customer,
              ),
            },
          }
        : prev,
    )
  }

  function applyProjectActive(projectId: string, active: boolean) {
    setState((prev) =>
      prev.status === 'ready'
        ? {
            status: 'ready',
            data: {
              ...prev.data,
              projects: prev.data.projects.map((project) =>
                project.id === projectId ? { ...project, active } : project,
              ),
            },
          }
        : prev,
    )
  }

  function applyCustomerUpsert(customer: Customer) {
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
  }

  function applyProjectUpsert(project: Project) {
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
  }

  /**
   * Remove a deleted project and its whole subtree from local state after a
   * hard delete: drop the project, its tasks, and those tasks' label maps.
   */
  function applyProjectRemove(projectId: string) {
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
  }

  /**
   * Remove a deleted customer and its whole subtree from local state after a
   * hard delete: drop the customer, its projects, their tasks, and label maps.
   */
  function applyCustomerRemove(customerId: string) {
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
  }

  function applyLabelUpsert(label: Label) {
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
  }

  function applyLabelRemove(labelId: string) {
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
  }

  function openCustomerPane(pane: CustomerPane) {
    setProjectPane(null)
    setTaskPane(null)
    setCustomerPane(pane)
  }

  function openProjectPane(pane: ProjectPane) {
    setCustomerPane(null)
    setTaskPane(null)
    setProjectPane(pane)
  }

  function openTaskPane(pane: TaskPane) {
    setCustomerPane(null)
    setProjectPane(null)
    setTaskPane(pane)
  }

  return (
    <main className="app">
      <h1>Task Tracker</h1>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">Could not load data: {state.message}</p>}
      {state.status === 'ready' && (
        <div className="view-controls">
          <ResponsibleFilterControl value={responsibleFilter} onChange={setResponsibleFilter} />
          {view.kind === 'overview' && (
            <ShowInactiveControl value={showInactive} onChange={setShowInactive} />
          )}
        </div>
      )}
      {state.status === 'ready' && view.kind === 'overview' && (
        <div className="top-bar">
          <button
            type="button"
            className="new-customer"
            onClick={() => openCustomerPane({ mode: 'create' })}
          >
            New Customer
          </button>
          <button
            type="button"
            className="new-project"
            onClick={() => openProjectPane({ mode: 'create', customerId: '' })}
          >
            New Project
          </button>
          <button
            type="button"
            className="new-task"
            onClick={() => openTaskPane({ mode: 'create', projectId: '', status: BACKLOG_STATUS })}
          >
            New Task
          </button>
          <button
            type="button"
            className="manage-labels"
            onClick={() => {
              setTaskPane(null)
              setCustomerPane(null)
              setProjectPane(null)
              setView({ kind: 'labels' })
            }}
          >
            Manage Labels
          </button>
        </div>
      )}
      {state.status === 'ready' && view.kind === 'overview' && (
        <div className="overview-layout">
          <Overview
            data={state.data}
            responsibleFilter={responsibleFilter}
            showInactive={showInactive}
            onOpenBoard={(customerId) => setView({ kind: 'board', customerId })}
            onOpenProjectBoard={(customerId) => setView({ kind: 'projectBoard', customerId })}
            onCustomerActiveChanged={applyCustomerActive}
            onProjectActiveChanged={applyProjectActive}
            onEditCustomer={(customer) => openCustomerPane({ mode: 'edit', customer })}
            onAddProject={(customerId) => openProjectPane({ mode: 'create', customerId })}
            onEditProject={(project) => openProjectPane({ mode: 'edit', project })}
            onAddTask={(projectId) =>
              openTaskPane({ mode: 'create', projectId, status: BACKLOG_STATUS })
            }
          />
          {customerPane && (
            <CustomerDetailPane
              key={customerPane.mode === 'edit' ? customerPane.customer.id : 'new-customer'}
              pane={customerPane}
              onClose={() => setCustomerPane(null)}
              onSaved={(customer) => {
                applyCustomerUpsert(customer)
                setCustomerPane(null)
              }}
              onDeleted={(customerId) => {
                applyCustomerRemove(customerId)
                setCustomerPane(null)
              }}
            />
          )}
          {projectPane && (
            <ProjectDetailPane
              key={projectPane.mode === 'edit' ? projectPane.project.id : 'new-project'}
              pane={projectPane}
              customers={state.data.customers}
              onClose={() => setProjectPane(null)}
              onSaved={(project) => {
                applyProjectUpsert(project)
                setProjectPane(null)
              }}
              onDeleted={(projectId) => {
                applyProjectRemove(projectId)
                setProjectPane(null)
              }}
            />
          )}
          {taskPane && (
            <TaskDetailPane
              key={taskPane.mode === 'edit' ? taskPane.task.id : 'new-task'}
              pane={taskPane}
              projects={state.data.projects}
              customers={state.data.customers}
              allLabels={state.data.labels}
              attachedLabelIds={
                taskPane.mode === 'edit'
                  ? (state.data.taskLabels[taskPane.task.id] ?? []).map((l) => l.id)
                  : []
              }
              onClose={() => setTaskPane(null)}
              onSaved={(task) => {
                applyTaskUpsert(task)
                setTaskPane({ mode: 'edit', task })
              }}
              onLabelsSaved={applyTaskLabels}
              onLabelCreated={applyLabelUpsert}
              onDeleted={(taskId) => {
                applyTaskRemove(taskId)
                setTaskPane(null)
              }}
            />
          )}
        </div>
      )}
      {state.status === 'ready' && view.kind === 'board' && (
        <div className="board-layout">
          <Board
            data={state.data}
            customerId={view.customerId}
            responsibleFilter={responsibleFilter}
            onBack={() => {
              setView({ kind: 'overview' })
              setTaskPane(null)
            }}
            onTaskStatusChanged={applyTaskStatus}
            onSelectTask={(task) => openTaskPane({ mode: 'edit', task })}
            onAddTask={(projectId, status) => openTaskPane({ mode: 'create', projectId, status })}
          />
          {taskPane && (
            <TaskDetailPane
              key={taskPane.mode === 'edit' ? taskPane.task.id : 'new-task'}
              pane={taskPane}
              projects={state.data.projects}
              customers={state.data.customers}
              allLabels={state.data.labels}
              attachedLabelIds={
                taskPane.mode === 'edit'
                  ? (state.data.taskLabels[taskPane.task.id] ?? []).map((l) => l.id)
                  : []
              }
              onClose={() => setTaskPane(null)}
              onSaved={(task) => {
                applyTaskUpsert(task)
                setTaskPane({ mode: 'edit', task })
              }}
              onLabelsSaved={applyTaskLabels}
              onLabelCreated={applyLabelUpsert}
              onDeleted={(taskId) => {
                applyTaskRemove(taskId)
                setTaskPane(null)
              }}
            />
          )}
        </div>
      )}
      {state.status === 'ready' && view.kind === 'projectBoard' && (
        <div className="board-layout">
          <ProjectBoard
            data={state.data}
            customerId={view.customerId}
            responsibleFilter={responsibleFilter}
            onBack={() => {
              setView({ kind: 'overview' })
              setTaskPane(null)
            }}
            onTaskStatusChanged={applyTaskStatus}
            onSelectTask={(task) => openTaskPane({ mode: 'edit', task })}
            onAddTask={(projectId) =>
              openTaskPane({ mode: 'create', projectId, status: BACKLOG_STATUS })
            }
          />
          {taskPane && (
            <TaskDetailPane
              key={taskPane.mode === 'edit' ? taskPane.task.id : 'new-task'}
              pane={taskPane}
              projects={state.data.projects}
              customers={state.data.customers}
              allLabels={state.data.labels}
              attachedLabelIds={
                taskPane.mode === 'edit'
                  ? (state.data.taskLabels[taskPane.task.id] ?? []).map((l) => l.id)
                  : []
              }
              onClose={() => setTaskPane(null)}
              onSaved={(task) => {
                applyTaskUpsert(task)
                setTaskPane({ mode: 'edit', task })
              }}
              onLabelsSaved={applyTaskLabels}
              onLabelCreated={applyLabelUpsert}
              onDeleted={(taskId) => {
                applyTaskRemove(taskId)
                setTaskPane(null)
              }}
            />
          )}
        </div>
      )}
      {state.status === 'ready' && view.kind === 'labels' && (
        <LabelsView
          labels={state.data.labels}
          onBack={() => setView({ kind: 'overview' })}
          onLabelUpserted={applyLabelUpsert}
          onLabelRemoved={applyLabelRemove}
        />
      )}
    </main>
  )
}

const RESPONSIBLE_OPTIONS: { value: ResponsibleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'me', label: 'Me' },
  { value: 'customer', label: 'Customer' },
]

function ResponsibleFilterControl({
  value,
  onChange,
}: {
  value: ResponsibleFilter
  onChange: (value: ResponsibleFilter) => void
}) {
  return (
    <label className="responsible-filter">
      <span>Responsible</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ResponsibleFilter)}
      >
        {RESPONSIBLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ShowInactiveControl({
  value,
  onChange,
}: {
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="show-inactive">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>Show inactive</span>
    </label>
  )
}

function LabelChips({ labels }: { labels: Label[] | undefined }) {
  if (!labels || labels.length === 0) return null
  return (
    <span className="label-chips">
      {labels.map((label) => (
        <span
          key={label.id}
          className={`label-chip label-color-${label.colorLabel.toLowerCase() || 'none'}`}
        >
          {label.name}
        </span>
      ))}
    </span>
  )
}

function Overview({
  data,
  responsibleFilter,
  showInactive,
  onOpenBoard,
  onOpenProjectBoard,
  onCustomerActiveChanged,
  onProjectActiveChanged,
  onEditCustomer,
  onAddProject,
  onEditProject,
  onAddTask,
}: {
  data: OverviewData
  responsibleFilter: ResponsibleFilter
  showInactive: boolean
  onOpenBoard: (customerId: string) => void
  onOpenProjectBoard: (customerId: string) => void
  onCustomerActiveChanged: (customerId: string, active: boolean) => void
  onProjectActiveChanged: (projectId: string, active: boolean) => void
  onEditCustomer: (customer: Customer) => void
  onAddProject: (customerId: string) => void
  onEditProject: (project: Project) => void
  onAddTask: (projectId: string) => void
}) {
  const [error, setError] = useState<string | null>(null)

  const tree = useMemo(
    () =>
      buildOverviewTree(
        data.customers,
        data.projects,
        filterTasksByResponsible(data.tasks, responsibleFilter),
        showInactive,
      ),
    [data, responsibleFilter, showInactive],
  )

  async function toggleCustomer(customer: Customer) {
    const next = toggleActive(customer.active)
    setError(null)
    // Optimistic update; revert if the write fails.
    onCustomerActiveChanged(customer.id, next)
    try {
      await updateCustomerActive(
        (id, changedFields) => Csa_customersService.update(id, changedFields),
        customer.id,
        next,
      )
    } catch (e: unknown) {
      onCustomerActiveChanged(customer.id, customer.active)
      setError(e instanceof Error ? e.message : 'Could not change the customer state.')
    }
  }

  async function toggleProject(project: Project) {
    const next = toggleActive(project.active)
    setError(null)
    // Optimistic update; revert if the write fails.
    onProjectActiveChanged(project.id, next)
    try {
      await updateProjectActive(
        (id, changedFields) => Csa_projectsService.update(id, changedFields),
        project.id,
        next,
      )
    } catch (e: unknown) {
      onProjectActiveChanged(project.id, project.active)
      setError(e instanceof Error ? e.message : 'Could not change the project state.')
    }
  }

  return (
    <section>
      <h2>Overview</h2>
      {error && <p role="alert">{error}</p>}
      {tree.length === 0 ? (
        <p>{showInactive ? 'No customers yet.' : 'No active customers yet.'}</p>
      ) : (
        <ul className="overview-tree">
          {tree.map((node) => (
            <li key={node.customer.id} className="customer-node">
              <details open>
                <summary className="customer-name">
                  {node.customer.name}
                  {!node.customer.active && <span className="inactive-badge">Inactive</span>}
                  <button
                    type="button"
                    className="edit-customer"
                    aria-label={`Edit ${node.customer.name}`}
                    onClick={(event) => {
                      event.preventDefault()
                      onEditCustomer(node.customer)
                    }}
                  >
                    ✎ Edit
                  </button>
                  <button
                    type="button"
                    className="toggle-active"
                    onClick={(event) => {
                      event.preventDefault()
                      void toggleCustomer(node.customer)
                    }}
                  >
                    {node.customer.active ? 'Deactivate' : 'Activate'}
                  </button>
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
                  <button
                    type="button"
                    className="open-board"
                    onClick={(event) => {
                      event.preventDefault()
                      onOpenProjectBoard(node.customer.id)
                    }}
                  >
                    Open project board
                  </button>
                  <button
                    type="button"
                    className="add-project"
                    onClick={(event) => {
                      event.preventDefault()
                      onAddProject(node.customer.id)
                    }}
                  >
                    + Project
                  </button>
                </summary>
                {node.projects.length === 0 ? (
                  <p className="no-projects">
                    {showInactive ? 'No projects.' : 'No active projects.'}
                  </p>
                ) : (
                  <ul className="project-list">
                    {node.projects.map((projectNode) => (
                      <li key={projectNode.project.id} className="project-node">
                        <details open>
                          <summary className="project-name">
                            {projectNode.project.name}
                            {!projectNode.project.active && (
                              <span className="inactive-badge">Inactive</span>
                            )}
                            <button
                              type="button"
                              className="edit-project"
                              aria-label={`Edit ${projectNode.project.name}`}
                              onClick={(event) => {
                                event.preventDefault()
                                onEditProject(projectNode.project)
                              }}
                            >
                              ✎ Edit
                            </button>
                            <button
                              type="button"
                              className="toggle-active"
                              onClick={(event) => {
                                event.preventDefault()
                                void toggleProject(projectNode.project)
                              }}
                            >
                              {projectNode.project.active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              className="add-task"
                              onClick={(event) => {
                                event.preventDefault()
                                onAddTask(projectNode.project.id)
                              }}
                            >
                              + Task
                            </button>
                          </summary>
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
                                  <LabelChips labels={data.taskLabels[task.id]} />
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
  responsibleFilter,
  onBack,
  onTaskStatusChanged,
  onSelectTask,
  onAddTask,
}: {
  data: OverviewData
  customerId: string
  responsibleFilter: ResponsibleFilter
  onBack: () => void
  onTaskStatusChanged: (taskId: string, status: number) => void
  onSelectTask: (task: Task) => void
  onAddTask: (projectId: string, status: number) => void
}) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const customer = data.customers.find((c) => c.id === customerId)
  const board = useMemo(
    () =>
      customer
        ? buildCustomerBoard(
            customer,
            data.projects,
            filterTasksByResponsible(data.tasks, responsibleFilter),
          )
        : null,
    [customer, data.projects, data.tasks, responsibleFilter],
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

  async function handleComplete(task: Task) {
    const transition = completeChange(task)
    if (!transition.changed) return

    const previousStatus = task.status ?? BACKLOG_STATUS
    setError(null)
    // Optimistic update; revert if the write fails.
    onTaskStatusChanged(task.id, transition.status)
    try {
      await updateTaskStatus(
        (id, changedFields) => Csa_tasksService.update(id, changedFields),
        task.id,
        transition.status,
      )
    } catch (e: unknown) {
      onTaskStatusChanged(task.id, previousStatus)
      setError(e instanceof Error ? e.message : 'Could not complete the task.')
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
                      className="board-card task-card"
                      draggable
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectTask(task)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onSelectTask(task)
                        }
                      }}
                      onDragStart={() => setDraggingTaskId(task.id)}
                      onDragEnd={() => setDraggingTaskId(null)}
                    >
                      <span className="task-card-name">{task.name}</span>
                      <LabelChips labels={data.taskLabels[task.id]} />
                      {task.status !== DONE_STATUS && (
                        <button
                          type="button"
                          className="task-complete"
                          aria-label={`Complete ${task.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleComplete(task)
                          }}
                        >
                          ✓
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="add-task board-add-task"
                    aria-label={`Add task to ${lane.project.name} in ${cell.label}`}
                    onClick={() => onAddTask(lane.project.id, cell.status)}
                  >
                    + Task
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ProjectBoard({
  data,
  customerId,
  responsibleFilter,
  onBack,
  onTaskStatusChanged,
  onSelectTask,
  onAddTask,
}: {
  data: OverviewData
  customerId: string
  responsibleFilter: ResponsibleFilter
  onBack: () => void
  onTaskStatusChanged: (taskId: string, status: number) => void
  onSelectTask: (task: Task) => void
  onAddTask: (projectId: string) => void
}) {
  const [error, setError] = useState<string | null>(null)

  const customer = data.customers.find((c) => c.id === customerId)
  const board = useMemo(
    () =>
      customer
        ? buildProjectBoard(
            customer,
            data.projects,
            filterTasksByResponsible(data.tasks, responsibleFilter),
          )
        : null,
    [customer, data.projects, data.tasks, responsibleFilter],
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

  async function handleStatusSelect(taskId: string, nextStatus: number) {
    const task = data.tasks.find((t) => t.id === taskId)
    if (!task) return

    const transition = statusChange(task, nextStatus)
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
      setError(e instanceof Error ? e.message : 'Could not change the task status.')
    }
  }

  async function handleComplete(task: Task) {
    const transition = completeChange(task)
    if (!transition.changed) return

    const previousStatus = task.status ?? BACKLOG_STATUS
    setError(null)
    // Optimistic update; revert if the write fails.
    onTaskStatusChanged(task.id, transition.status)
    try {
      await updateTaskStatus(
        (id, changedFields) => Csa_tasksService.update(id, changedFields),
        task.id,
        transition.status,
      )
    } catch (e: unknown) {
      onTaskStatusChanged(task.id, previousStatus)
      setError(e instanceof Error ? e.message : 'Could not complete the task.')
    }
  }

  return (
    <section className="board">
      <header className="board-header">
        <button type="button" onClick={onBack}>
          ← Back to overview
        </button>
        <h2>{customer.name} — Projects</h2>
      </header>
      {error && <p role="alert">{error}</p>}
      {board.columns.length === 0 ? (
        <p>No active projects for this customer.</p>
      ) : (
        <div className="project-board">
          {board.columns.map((column) => (
            <div key={column.project.id} className="project-column">
              <h3 className="project-column-head">
                {column.project.name}
                <button
                  type="button"
                  className="add-task"
                  onClick={() => onAddTask(column.project.id)}
                >
                  + Task
                </button>
              </h3>
              {column.tasks.length === 0 ? (
                <p className="no-tasks">No tasks.</p>
              ) : (
                <ul className="project-task-list">
                  {column.tasks.map((task) => (
                    <li key={task.id} className="board-card project-task">
                      <button
                        type="button"
                        className="project-task-name project-task-open"
                        onClick={() => onSelectTask(task)}
                      >
                        {task.name}
                      </button>
                      <LabelChips labels={data.taskLabels[task.id]} />
                      <label className="project-task-status">
                        <span className="visually-hidden">Status for {task.name}</span>
                        <select
                          value={task.status ?? BACKLOG_STATUS}
                          onChange={(event) =>
                            handleStatusSelect(task.id, Number(event.target.value))
                          }
                        >
                          {STATUS_COLUMNS.map((statusColumn) => (
                            <option key={statusColumn.status} value={statusColumn.status}>
                              {statusColumn.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {task.status !== DONE_STATUS && (
                        <button
                          type="button"
                          className="task-complete"
                          aria-label={`Complete ${task.name}`}
                          onClick={() => void handleComplete(task)}
                        >
                          ✓
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ProjectDetailPane({
  pane,
  customers,
  onClose,
  onSaved,
  onDeleted,
}: {
  pane: ProjectPane
  customers: Customer[]
  onClose: () => void
  onSaved: (project: Project) => void
  onDeleted: (projectId: string) => void
}) {
  const isEdit = pane.mode === 'edit'
  const [values, setValues] = useState<ProjectFormValues>(() =>
    pane.mode === 'edit' ? projectToForm(pane.project) : newProjectForm(pane.customerId),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteName, setDeleteName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const errors = validateProjectForm(values)
  const canSave = Object.keys(errors).length === 0
  const confirmed = pane.mode === 'edit' && isDeleteConfirmed(deleteName, pane.project.name)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const saved =
        pane.mode === 'edit'
          ? await updateProject(
              (id, changedFields) => Csa_projectsService.update(id, changedFields),
              pane.project.id,
              values,
            )
          : await createProject((record) => Csa_projectsService.create(record), values)
      onSaved(saved)
    } catch (e: unknown) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Could not save the project.')
    }
  }

  /**
   * Hard-delete this project and its subtree (ADR-0002), guarded by typed-name
   * confirmation: the cascade deletes the project's tasks (and their notes and
   * label links) before the project itself, so no orphaned children remain.
   */
  async function handleDelete() {
    if (pane.mode !== 'edit' || saving || deleting || !confirmed) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await runProjectCascade(pane.project.id)
      onDeleted(pane.project.id)
    } catch (e: unknown) {
      setDeleting(false)
      setDeleteError(e instanceof Error ? e.message : 'Could not delete the project.')
    }
  }

  return (
    <aside className="detail-pane" aria-label={isEdit ? 'Edit project' : 'New project'}>
      <header className="detail-pane-header">
        <h2>{isEdit ? 'Edit Project' : 'New Project'}</h2>
        <button type="button" className="detail-pane-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <form className="detail-form" onSubmit={handleSubmit}>
        {error && <p role="alert">{error}</p>}
        <label className="detail-field">
          <span>Name</span>
          <input
            type="text"
            value={values.name}
            autoFocus
            aria-invalid={errors.name ? true : undefined}
            onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
          />
          {errors.name && <span className="detail-error">{errors.name}</span>}
        </label>
        <label className="detail-field">
          <span>Customer</span>
          <select
            value={values.customerId}
            aria-invalid={errors.customerId ? true : undefined}
            onChange={(event) => setValues((v) => ({ ...v, customerId: event.target.value }))}
          >
            <option value="">Select a customer…</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {!customer.active ? ' (Inactive)' : ''}
              </option>
            ))}
          </select>
          {errors.customerId && <span className="detail-error">{errors.customerId}</span>}
        </label>
        <label className="detail-field detail-toggle">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(event) => setValues((v) => ({ ...v, active: event.target.checked }))}
          />
          <span>Active</span>
        </label>
        <div className="detail-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="detail-save" disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
      {pane.mode === 'edit' && (
        <div className="detail-danger">
          <p className="detail-danger-hint">
            Type <strong>{pane.project.name}</strong> to permanently delete this project and
            everything under it (its tasks, their notes and label links). This cannot be undone.
          </p>
          <input
            type="text"
            className="detail-delete-confirm"
            value={deleteName}
            placeholder="Project name"
            aria-label="Type the project name to confirm deletion"
            onChange={(event) => setDeleteName(event.target.value)}
          />
          {deleteError && <p role="alert">{deleteError}</p>}
          <button
            type="button"
            className="detail-delete"
            disabled={!confirmed || saving || deleting}
            onClick={handleDelete}
          >
            {deleting ? 'Deleting…' : 'Delete Project'}
          </button>
        </div>
      )}
    </aside>
  )
}

function CustomerDetailPane({
  pane,
  onClose,
  onSaved,
  onDeleted,
}: {
  pane: CustomerPane
  onClose: () => void
  onSaved: (customer: Customer) => void
  onDeleted: (customerId: string) => void
}) {
  const isEdit = pane.mode === 'edit'
  const [values, setValues] = useState<CustomerFormValues>(() =>
    pane.mode === 'edit' ? customerToForm(pane.customer) : newCustomerForm(),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteName, setDeleteName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const errors = validateCustomerForm(values)
  const canSave = Object.keys(errors).length === 0
  const confirmed = pane.mode === 'edit' && isDeleteConfirmed(deleteName, pane.customer.name)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const saved =
        pane.mode === 'edit'
          ? await updateCustomer(
              (id, changedFields) => Csa_customersService.update(id, changedFields),
              pane.customer.id,
              values,
            )
          : await createCustomer((record) => Csa_customersService.create(record), values)
      onSaved(saved)
    } catch (e: unknown) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Could not save the customer.')
    }
  }

  /**
   * Hard-delete this customer and its subtree (ADR-0002), guarded by typed-name
   * confirmation: the cascade removes the customer's projects, their tasks, and
   * those tasks' notes and label links before the customer itself, so no
   * orphaned children remain.
   */
  async function handleDelete() {
    if (pane.mode !== 'edit' || saving || deleting || !confirmed) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await runCustomerCascade(pane.customer.id)
      onDeleted(pane.customer.id)
    } catch (e: unknown) {
      setDeleting(false)
      setDeleteError(e instanceof Error ? e.message : 'Could not delete the customer.')
    }
  }

  return (
    <aside className="detail-pane" aria-label={isEdit ? 'Edit customer' : 'New customer'}>
      <header className="detail-pane-header">
        <h2>{isEdit ? 'Edit Customer' : 'New Customer'}</h2>
        <button type="button" className="detail-pane-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <form className="detail-form" onSubmit={handleSubmit}>
        {error && <p role="alert">{error}</p>}
        <label className="detail-field">
          <span>Name</span>
          <input
            type="text"
            value={values.name}
            autoFocus
            aria-invalid={errors.name ? true : undefined}
            onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
          />
          {errors.name && <span className="detail-error">{errors.name}</span>}
        </label>
        <label className="detail-field detail-toggle">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(event) => setValues((v) => ({ ...v, active: event.target.checked }))}
          />
          <span>Active</span>
        </label>
        <div className="detail-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="detail-save" disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
      {pane.mode === 'edit' && (
        <div className="detail-danger">
          <p className="detail-danger-hint">
            Type <strong>{pane.customer.name}</strong> to permanently delete this customer and
            everything under it (its projects, their tasks, and those tasks' notes and label
            links). This cannot be undone.
          </p>
          <input
            type="text"
            className="detail-delete-confirm"
            value={deleteName}
            placeholder="Customer name"
            aria-label="Type the customer name to confirm deletion"
            onChange={(event) => setDeleteName(event.target.value)}
          />
          {deleteError && <p role="alert">{deleteError}</p>}
          <button
            type="button"
            className="detail-delete"
            disabled={!confirmed || saving || deleting}
            onClick={handleDelete}
          >
            {deleting ? 'Deleting…' : 'Delete Customer'}
          </button>
        </div>
      )}
    </aside>
  )
}

function TaskDetailPane({
  pane,
  projects,
  customers,
  allLabels,
  attachedLabelIds,
  onClose,
  onSaved,
  onLabelsSaved,
  onLabelCreated,
  onDeleted,
}: {
  pane: TaskPane
  projects: Project[]
  customers: Customer[]
  allLabels: Label[]
  attachedLabelIds: string[]
  onClose: () => void
  onSaved: (task: Task) => void
  onLabelsSaved: (taskId: string, labels: Label[]) => void
  onLabelCreated: (label: Label) => void
  onDeleted: (taskId: string) => void
}) {
  const isEdit = pane.mode === 'edit'
  const [values, setValues] = useState<TaskFormValues>(() =>
    pane.mode === 'edit' ? taskToForm(pane.task) : newTaskForm(pane.projectId, pane.status),
  )
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>(() => attachedLabelIds)
  const [labelDraft, setLabelDraft] = useState('')
  const [labelBusy, setLabelBusy] = useState(false)
  const [labelError, setLabelError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = validateTaskForm(values)
  const canSave = Object.keys(errors).length === 0

  // Active projects grouped by customer for the create-mode Project selector.
  const projectGroups = customers
    .map((customer) => ({
      customer,
      projects: projects.filter((p) => p.active && p.customerId === customer.id),
    }))
    .filter((group) => group.projects.length > 0)

  function toggleLabel(id: string) {
    setSelectedLabelIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    )
  }

  /**
   * Inline label creation from the picker: a name matching an existing label
   * (case-insensitive) attaches that label; otherwise a new colourless label is
   * created via the data seam, added to the shared set, and attached.
   */
  async function handleAddLabel() {
    const name = labelDraft.trim()
    if (name === '' || labelBusy) return
    setLabelBusy(true)
    setLabelError(null)
    try {
      const existing = findLabelByName(allLabels, name)
      if (existing) {
        setSelectedLabelIds((ids) =>
          ids.includes(existing.id) ? ids : [...ids, existing.id],
        )
      } else {
        const created = await createLabel(
          (record) => Csa_labelsService.create(record),
          { name, color: null },
        )
        onLabelCreated(created)
        setSelectedLabelIds((ids) => [...ids, created.id])
      }
      setLabelDraft('')
    } catch (e: unknown) {
      setLabelError(e instanceof Error ? e.message : 'Could not add the label.')
    } finally {
      setLabelBusy(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const saved =
        pane.mode === 'edit'
          ? await updateTask(
              (id, changedFields) => Csa_tasksService.update(id, changedFields),
              pane.task,
              values,
            )
          : await createTask((record) => Csa_tasksService.create(record), values)
      const savedIds = await saveTaskLabels(writeTaskLabels, saved.id, selectedLabelIds)
      const savedLabels = allLabels.filter((label) => savedIds.includes(label.id))
      setSaving(false)
      onLabelsSaved(saved.id, savedLabels)
      onSaved(saved)
    } catch (e: unknown) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Could not save the task.')
    }
  }

  /**
   * Hard-delete this task and its subtree (ADR-0002) behind a plain confirm: the
   * cascade deletes the task's notes and detaches its label links before
   * deleting the task itself, so no orphaned children remain.
   */
  async function handleDelete() {
    if (pane.mode !== 'edit' || saving || deleting) return
    if (
      !window.confirm(
        `Delete the task “${pane.task.name}”? This also deletes its notes and label links.`,
      )
    ) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      await deleteTaskCascade(
        {
          deleteNotes: (id) =>
            deleteTaskNotes(
              (options) => Csa_notesService.getAll(options),
              (noteId) => Csa_notesService.delete(noteId),
              id,
            ).then(() => undefined),
          detachLabels: (id) => detachAllTaskLabels(writeTaskLabels, id),
          deleteTask: (id) => deleteTask((taskId) => Csa_tasksService.delete(taskId), id),
        },
        pane.task.id,
      )
      onDeleted(pane.task.id)
    } catch (e: unknown) {
      setDeleting(false)
      setError(e instanceof Error ? e.message : 'Could not delete the task.')
    }
  }

  return (
    <aside className="detail-pane" aria-label={isEdit ? 'Edit task' : 'New task'}>
      <header className="detail-pane-header">
        <h2>{isEdit ? 'Edit Task' : 'New Task'}</h2>
        <button type="button" className="detail-pane-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <form className="detail-form" onSubmit={handleSubmit}>
        {error && <p role="alert">{error}</p>}
        <label className="detail-field">
          <span>Name</span>
          <input
            type="text"
            value={values.name}
            autoFocus
            aria-invalid={errors.name ? true : undefined}
            onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
          />
          {errors.name && <span className="detail-error">{errors.name}</span>}
        </label>
        {!isEdit && (
          <label className="detail-field">
            <span>Project</span>
            <select
              value={values.projectId}
              aria-invalid={errors.projectId ? true : undefined}
              onChange={(event) => setValues((v) => ({ ...v, projectId: event.target.value }))}
            >
              <option value="">Select a project…</option>
              {projectGroups.map((group) => (
                <optgroup key={group.customer.id} label={group.customer.name}>
                  {group.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {errors.projectId && <span className="detail-error">{errors.projectId}</span>}
          </label>
        )}
        <label className="detail-field">
          <span>Status</span>
          <select
            value={values.status}
            onChange={(event) => setValues((v) => ({ ...v, status: Number(event.target.value) }))}
          >
            {STATUS_COLUMNS.map((statusColumn) => (
              <option key={statusColumn.status} value={statusColumn.status}>
                {statusColumn.label}
              </option>
            ))}
          </select>
        </label>
        <label className="detail-field">
          <span>Responsible</span>
          <select
            value={values.responsible ?? ''}
            onChange={(event) =>
              setValues((v) => ({
                ...v,
                responsible: event.target.value === '' ? null : Number(event.target.value),
              }))
            }
          >
            <option value="">Unassigned</option>
            {RESPONSIBLE_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <label className="detail-field">
          <span>Due date</span>
          <input
            type="date"
            value={values.duedate}
            onChange={(event) => setValues((v) => ({ ...v, duedate: event.target.value }))}
          />
        </label>
        <label className="detail-field">
          <span>Description</span>
          <textarea
            className="detail-textarea"
            rows={4}
            value={values.description}
            onChange={(event) => setValues((v) => ({ ...v, description: event.target.value }))}
          />
        </label>
        <fieldset className="detail-field detail-labels">
          <legend>Labels</legend>
          {allLabels.length === 0 ? (
            <p className="detail-labels-empty">No labels available.</p>
          ) : (
            <div className="detail-labels-list">
              {allLabels.map((label) => {
                const checked = selectedLabelIds.includes(label.id)
                return (
                  <label
                    key={label.id}
                    className={checked ? 'label-chip label-chip-on' : 'label-chip'}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleLabel(label.id)}
                    />
                    <span>{label.name}</span>
                  </label>
                )
              })}
            </div>
          )}
          <div className="detail-label-add">
            <input
              type="text"
              className="detail-label-add-input"
              placeholder="Add or create a label…"
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleAddLabel()
                }
              }}
            />
            <button
              type="button"
              className="detail-label-add-button"
              disabled={labelDraft.trim() === '' || labelBusy}
              onClick={() => void handleAddLabel()}
            >
              {labelBusy ? 'Adding…' : 'Add'}
            </button>
          </div>
          {labelError && <span className="detail-error">{labelError}</span>}
        </fieldset>
        <div className="detail-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="detail-save" disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
      {isEdit && (
        <div className="detail-danger">
          <button
            type="button"
            className="detail-delete"
            disabled={saving || deleting}
            onClick={handleDelete}
          >
            {deleting ? 'Deleting…' : 'Delete Task'}
          </button>
        </div>
      )}
      {isEdit && <TaskNotes taskId={pane.task.id} />}
    </aside>
  )
}

/** Format a note's ISO timestamp for display, falling back to the raw string. */
function formatNoteTime(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/**
 * The dated note timeline for a task: a composer to add a new note and the
 * accumulated notes shown newest-first as one chronological timeline. Notes are
 * task-scoped; loading and creating both go through the notes data-access seam.
 */
function TaskNotes({ taskId }: { taskId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTaskNotes((options) => Csa_notesService.getAll(options), taskId)
      .then((loaded) => {
        if (!cancelled) {
          setNotes(loaded)
          setLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load notes.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [taskId])

  const canAdd = draft.trim() !== '' && !adding

  async function handleAdd() {
    if (!canAdd) return
    setAdding(true)
    setError(null)
    try {
      await createNote((record) => Csa_notesService.create(record), taskId, draft)
      const refreshed = await fetchTaskNotes(
        (options) => Csa_notesService.getAll(options),
        taskId,
      )
      setNotes(refreshed)
      setDraft('')
      setAdding(false)
    } catch (e: unknown) {
      setAdding(false)
      setError(e instanceof Error ? e.message : 'Could not add the note.')
    }
  }

  /** Delete a single note behind a plain confirm without affecting the others. */
  async function handleDeleteNote(id: string) {
    if (deletingId) return
    if (!window.confirm('Delete this note?')) return
    setDeletingId(id)
    setError(null)
    try {
      await deleteNote((noteId) => Csa_notesService.delete(noteId), id)
      setNotes((prev) => prev.filter((note) => note.id !== id))
      setDeletingId(null)
    } catch (e: unknown) {
      setDeletingId(null)
      setError(e instanceof Error ? e.message : 'Could not delete the note.')
    }
  }

  return (
    <section className="detail-notes" aria-label="Notes">
      <h3>Notes</h3>
      <div className="detail-note-composer">
        <textarea
          className="detail-textarea"
          rows={3}
          placeholder="Add a note…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="button"
          className="detail-add-note"
          disabled={!canAdd}
          onClick={handleAdd}
        >
          {adding ? 'Adding…' : 'Add Note'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p className="detail-notes-empty">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="detail-notes-empty">No notes yet.</p>
      ) : (
        <ol className="detail-notes-timeline">
          {notes.map((note) => (
            <li key={note.id} className="detail-note">
              <time className="detail-note-time">{formatNoteTime(note.createdOn)}</time>
              <p className="detail-note-text">{note.text}</p>
              <button
                type="button"
                className="detail-note-delete"
                aria-label="Delete note"
                disabled={deletingId === note.id}
                onClick={() => void handleDeleteNote(note.id)}
              >
                {deletingId === note.id ? 'Deleting…' : 'Delete'}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** The Labels management view: create, rename, recolour, and delete labels. */
function LabelsView({
  labels,
  onBack,
  onLabelUpserted,
  onLabelRemoved,
}: {
  labels: Label[]
  onBack: () => void
  onLabelUpserted: (label: Label) => void
  onLabelRemoved: (labelId: string) => void
}) {
  return (
    <section className="labels-view" aria-label="Labels">
      <header className="labels-view-header">
        <button type="button" className="labels-back" onClick={onBack}>
          ← Back
        </button>
        <h2>Labels</h2>
      </header>
      <LabelCreateForm onCreated={onLabelUpserted} />
      {labels.length === 0 ? (
        <p className="labels-empty">No labels yet. Create one above.</p>
      ) : (
        <ul className="labels-list">
          {labels.map((label) => (
            <LabelRow
              key={label.id}
              label={label}
              onSaved={onLabelUpserted}
              onDeleted={onLabelRemoved}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** The create-a-label form at the top of the Labels management view. */
function LabelCreateForm({ onCreated }: { onCreated: (label: Label) => void }) {
  const [values, setValues] = useState<LabelFormValues>(() => newLabelForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = validateLabelForm(values)
  const canSave = Object.keys(errors).length === 0

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const created = await createLabel((record) => Csa_labelsService.create(record), values)
      onCreated(created)
      setValues(newLabelForm())
      setSaving(false)
    } catch (e: unknown) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Could not create the label.')
    }
  }

  return (
    <form className="label-create-form" onSubmit={handleSubmit}>
      {error && <p role="alert">{error}</p>}
      <input
        type="text"
        aria-label="New label name"
        placeholder="New label name"
        value={values.name}
        aria-invalid={errors.name ? true : undefined}
        onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
      />
      <LabelColorSelect
        value={values.color}
        onChange={(color) => setValues((v) => ({ ...v, color }))}
      />
      <button type="submit" className="label-create-button" disabled={!canSave || saving}>
        {saving ? 'Adding…' : 'Add Label'}
      </button>
    </form>
  )
}

/** A single row in the Labels list: rename, recolour, and delete a label. */
function LabelRow({
  label,
  onSaved,
  onDeleted,
}: {
  label: Label
  onSaved: (label: Label) => void
  onDeleted: (labelId: string) => void
}) {
  const [values, setValues] = useState<LabelFormValues>(() => labelToForm(label))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = validateLabelForm(values)
  const dirty =
    values.name.trim() !== label.name || values.color !== (label.color ?? null)
  const canSave = Object.keys(errors).length === 0 && dirty

  async function handleSave() {
    if (!canSave || saving || deleting) return
    setSaving(true)
    setError(null)
    try {
      const saved = await updateLabel(
        (id, changedFields) => Csa_labelsService.update(id, changedFields),
        label.id,
        values,
      )
      onSaved(saved)
      setSaving(false)
    } catch (e: unknown) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Could not save the label.')
    }
  }

  async function handleDelete() {
    if (saving || deleting) return
    if (!window.confirm(`Delete the label “${label.name}”? This removes it from every task.`)) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      await deleteLabel((id) => Csa_labelsService.delete(id), label.id)
      onDeleted(label.id)
    } catch (e: unknown) {
      setDeleting(false)
      setError(e instanceof Error ? e.message : 'Could not delete the label.')
    }
  }

  return (
    <li className="label-row">
      <input
        type="text"
        aria-label="Label name"
        value={values.name}
        aria-invalid={errors.name ? true : undefined}
        onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
      />
      <LabelColorSelect
        value={values.color}
        onChange={(color) => setValues((v) => ({ ...v, color }))}
      />
      <button
        type="button"
        className="label-row-save"
        disabled={!canSave || saving || deleting}
        onClick={handleSave}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        className="label-row-delete"
        disabled={saving || deleting}
        onClick={handleDelete}
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
      {error && <span className="detail-error">{error}</span>}
    </li>
  )
}

/** Colour picker shared by the Labels create form and each label row. */
function LabelColorSelect({
  value,
  onChange,
}: {
  value: number | null
  onChange: (color: number | null) => void
}) {
  return (
    <select
      aria-label="Label colour"
      value={value === null ? '' : String(value)}
      onChange={(event) =>
        onChange(event.target.value === '' ? null : Number(event.target.value))
      }
    >
      <option value="">No colour</option>
      {LABEL_COLOR_CHOICES.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  )
}

export default App

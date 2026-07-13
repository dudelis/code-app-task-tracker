import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import Alert from '@mui/material/Alert'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import EventIcon from '@mui/icons-material/Event'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PersonIcon from '@mui/icons-material/Person'
import AddIcon from '@mui/icons-material/Add'
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
  quickAddTaskForm,
  taskToForm,
  updateTask,
  updateTaskStatus,
  validateTaskForm,
  DONE_STATUS,
  RESPONSIBLE_CHOICES,
  isOverdue,
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
import { isDeleteConfirmed } from './data/deletion'
import { toggleActive } from './data/visibility'
import { filterTasksByResponsible, type ResponsibleFilter } from './data/responsible'
import {
  BACKLOG_STATUS,
  STATUS_COLUMNS,
  buildCustomerBoard,
  completeChange,
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

type CustomerPane =
  | { mode: 'create' }
  | { mode: 'edit'; customer: Customer }

type ProjectPane =
  | { mode: 'create'; customerId: string }
  | { mode: 'edit'; project: Project }

// The Task drawer is now edit-only: inline per-bucket quick-add is the primary
// create path, so the drawer is opened solely to edit an existing task.
type TaskPane = { mode: 'edit'; task: Task }

function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // The rail selects a Customer whose swimlane board fills the main area; the
  // Labels management view is the one alternate screen still reachable.
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [showLabels, setShowLabels] = useState(false)
  const [responsibleFilter, setResponsibleFilter] = useState<ResponsibleFilter>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [customerPane, setCustomerPane] = useState<CustomerPane | null>(null)
  const [projectPane, setProjectPane] = useState<ProjectPane | null>(null)
  const [taskPane, setTaskPane] = useState<TaskPane | null>(null)
  // Delete targets drive the typed-name confirmation dialogs (ADR-0002); the
  // action error surfaces optimistic Activate/Deactivate failures in a Snackbar.
  const [customerDelete, setCustomerDelete] = useState<Customer | null>(null)
  const [projectDelete, setProjectDelete] = useState<Project | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

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

  /**
   * One-click Activate/Deactivate for a Customer from its ⋯ menu: optimistically
   * flip the local record, then persist through the existing active-only write
   * seam. Revert and surface the error in the Snackbar if the write fails.
   */
  async function handleToggleCustomerActive(customer: Customer) {
    const next = toggleActive(customer.active)
    applyCustomerUpsert({ ...customer, active: next })
    try {
      await updateCustomerActive(
        (id, changedFields) => Csa_customersService.update(id, changedFields),
        customer.id,
        next,
      )
    } catch (e: unknown) {
      applyCustomerUpsert(customer)
      setActionError(e instanceof Error ? e.message : 'Could not update the customer.')
    }
  }

  /**
   * One-click Activate/Deactivate for a Project from its ⋯ menu: optimistically
   * flip the local record, then persist through the existing active-only write
   * seam. Revert and surface the error in the Snackbar if the write fails.
   */
  async function handleToggleProjectActive(project: Project) {
    const next = toggleActive(project.active)
    applyProjectUpsert({ ...project, active: next })
    try {
      await updateProjectActive(
        (id, changedFields) => Csa_projectsService.update(id, changedFields),
        project.id,
        next,
      )
    } catch (e: unknown) {
      applyProjectUpsert(project)
      setActionError(e instanceof Error ? e.message : 'Could not update the project.')
    }
  }

  const data = state.status === 'ready' ? state.data : null
  // The rail lists active Customers (Microsoft Planner's "plans"); Show inactive
  // widens it to include inactive Customers without changing the board itself.
  const railCustomers = data
    ? showInactive
      ? data.customers
      : data.customers.filter((customer) => customer.active)
    : []
  // Keep a valid selection: fall back to the first listed Customer when nothing
  // is selected yet or the selected one is filtered out (e.g. after Show inactive
  // is turned off), so the main area always has a board to show when possible.
  const effectiveCustomerId =
    selectedCustomerId && railCustomers.some((customer) => customer.id === selectedCustomerId)
      ? selectedCustomerId
      : (railCustomers[0]?.id ?? null)

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Task Tracker
          </Typography>
          {state.status === 'ready' && (
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={responsibleFilter}
                onChange={(_event, next: ResponsibleFilter | null) => {
                  if (next) setResponsibleFilter(next)
                }}
                aria-label="Responsible filter"
                className="responsible-filter"
                sx={{
                  '& .MuiToggleButton-root': {
                    color: 'inherit',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    px: 1.5,
                  },
                  '& .Mui-selected': {
                    bgcolor: 'rgba(255, 255, 255, 0.16)',
                  },
                }}
              >
                {RESPONSIBLE_OPTIONS.map((option) => (
                  <ToggleButton
                    key={option.value}
                    value={option.value}
                    aria-label={`Responsible: ${option.label}`}
                  >
                    {option.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <FormControlLabel
                className="show-inactive"
                control={
                  <Switch
                    color="default"
                    checked={showInactive}
                    onChange={(event) => setShowInactive(event.target.checked)}
                  />
                }
                label="Show inactive"
              />
              <Button
                color="inherit"
                className="new-project"
                onClick={() =>
                  openProjectPane({ mode: 'create', customerId: effectiveCustomerId ?? '' })
                }
              >
                New Project
              </Button>
              <Button
                color="inherit"
                className="manage-labels"
                onClick={() => {
                  setTaskPane(null)
                  setCustomerPane(null)
                  setProjectPane(null)
                  setShowLabels(true)
                }}
              >
                Manage Labels
              </Button>
            </Stack>
          )}
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: RAIL_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          {state.status === 'ready' && (
            <>
              <Box sx={{ p: 1 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  className="new-customer"
                  onClick={() => openCustomerPane({ mode: 'create' })}
                >
                  New Customer
                </Button>
              </Box>
              {railCustomers.length === 0 ? (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  {showInactive ? 'No customers yet.' : 'No active customers yet.'}
                </Typography>
              ) : (
                <List>
                  {railCustomers.map((customer) => (
                    <ListItem
                      key={customer.id}
                      disablePadding
                      secondaryAction={
                        <RowMenu
                          label={customer.name}
                          active={customer.active}
                          onEdit={() => openCustomerPane({ mode: 'edit', customer })}
                          onToggleActive={() => void handleToggleCustomerActive(customer)}
                          onDelete={() => setCustomerDelete(customer)}
                        />
                      }
                    >
                      <ListItemButton
                        selected={!showLabels && customer.id === effectiveCustomerId}
                        onClick={() => {
                          setShowLabels(false)
                          setSelectedCustomerId(customer.id)
                          setTaskPane(null)
                        }}
                      >
                        <ListItemText
                          primary={customer.name}
                          secondary={!customer.active ? 'Inactive' : undefined}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}
            </>
          )}
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: 3 }}>
        <Toolbar />
        {state.status === 'loading' && <Typography>Loading…</Typography>}
        {state.status === 'error' && (
          <Alert severity="error">Could not load data: {state.message}</Alert>
        )}
        {state.status === 'ready' && (
          <>
            <div className="board-layout">
              {showLabels ? (
                <LabelsView
                  labels={state.data.labels}
                  onBack={() => setShowLabels(false)}
                  onLabelUpserted={applyLabelUpsert}
                  onLabelRemoved={applyLabelRemove}
                />
              ) : effectiveCustomerId ? (
                <Board
                  data={state.data}
                  customerId={effectiveCustomerId}
                  responsibleFilter={responsibleFilter}
                  showInactive={showInactive}
                  onTaskStatusChanged={applyTaskStatus}
                  onSelectTask={(task) => openTaskPane({ mode: 'edit', task })}
                  onTaskCreated={applyTaskUpsert}
                  onEditProject={(project) => openProjectPane({ mode: 'edit', project })}
                  onToggleProjectActive={(project) => void handleToggleProjectActive(project)}
                  onDeleteProject={(project) => setProjectDelete(project)}
                />
              ) : (
                <Typography color="text.secondary">
                  {railCustomers.length === 0
                    ? 'No customers to show. Use New Customer to add one.'
                    : 'Select a customer to see its board.'}
                </Typography>
              )}
              {customerPane && (
                <CustomerDetailPane
                  key={customerPane.mode === 'edit' ? customerPane.customer.id : 'new-customer'}
                  pane={customerPane}
                  onClose={() => setCustomerPane(null)}
                  onSaved={(customer) => {
                    applyCustomerUpsert(customer)
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
                />
              )}
              {taskPane && !showLabels && (
                <TaskDetailPane
                  key={taskPane.task.id}
                  pane={taskPane}
                  projects={state.data.projects}
                  customers={state.data.customers}
                  allLabels={state.data.labels}
                  attachedLabelIds={(state.data.taskLabels[taskPane.task.id] ?? []).map(
                    (l) => l.id,
                  )}
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
          </>
        )}
      </Box>
      {customerDelete && (
        <HardDeleteDialog
          entity="Customer"
          name={customerDelete.name}
          description="its projects, their tasks, and those tasks' notes and label links"
          onCancel={() => setCustomerDelete(null)}
          onConfirm={async () => {
            await runCustomerCascade(customerDelete.id)
            applyCustomerRemove(customerDelete.id)
            setCustomerDelete(null)
          }}
        />
      )}
      {projectDelete && (
        <HardDeleteDialog
          entity="Project"
          name={projectDelete.name}
          description="its tasks, their notes and label links"
          onCancel={() => setProjectDelete(null)}
          onConfirm={async () => {
            await runProjectCascade(projectDelete.id)
            applyProjectRemove(projectDelete.id)
            setProjectDelete(null)
          }}
        />
      )}
      <Snackbar
        open={Boolean(actionError)}
        autoHideDuration={6000}
        onClose={() => setActionError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ width: '100%' }}>
          {actionError}
        </Alert>
      </Snackbar>
    </Box>
  )
}

/** Width of the persistent left rail that lists Customers. */
const RAIL_WIDTH = 260

/** Width of the right-anchored Customer/Project/Task detail drawers. */
const DRAWER_WIDTH = 360

/** Wider width for the Task drawer, which also hosts the Notes timeline. */
const TASK_DRAWER_WIDTH = 440

/**
 * The per-row "⋯" overflow menu shared by Customer rail rows and Project
 * swimlane headers: Edit, Activate/Deactivate (label follows `active`), and
 * Delete. Owns only its own anchor state; every action is a caller-supplied
 * callback so the menu carries no create/edit/delete logic itself. The trigger
 * stops click propagation so opening the menu never also selects the row.
 */
function RowMenu({
  label,
  active,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  label: string
  active: boolean
  onEdit: () => void
  onToggleActive: () => void
  onDelete: () => void
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const close = () => setAnchorEl(null)
  return (
    <>
      <IconButton
        edge="end"
        size="small"
        aria-label={`Manage ${label}`}
        aria-haspopup="true"
        onClick={(event) => {
          event.stopPropagation()
          setAnchorEl(event.currentTarget)
        }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        <MenuItem
          onClick={() => {
            close()
            onEdit()
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            close()
            onToggleActive()
          }}
        >
          {active ? 'Deactivate' : 'Activate'}
        </MenuItem>
        <MenuItem
          onClick={() => {
            close()
            onDelete()
          }}
        >
          Delete
        </MenuItem>
      </Menu>
    </>
  )
}

/**
 * The typed-name hard-delete confirmation (ADR-0002) re-skinned as an MUI
 * Dialog: the Delete button stays disabled until the user types the record's
 * exact name (`isDeleteConfirmed`). On confirm it runs the caller's cascade
 * (`onConfirm`), which deletes the whole subtree before the record itself;
 * errors keep the dialog open so the destructive action is never lost silently.
 */
function HardDeleteDialog({
  entity,
  name,
  description,
  onCancel,
  onConfirm,
}: {
  entity: string
  name: string
  description: string
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lower = entity.toLowerCase()
  const confirmed = isDeleteConfirmed(typed, name)

  async function handleConfirm() {
    if (!confirmed || deleting) return
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
    } catch (e: unknown) {
      setDeleting(false)
      setError(e instanceof Error ? e.message : `Could not delete the ${lower}.`)
    }
  }

  return (
    <Dialog open onClose={deleting ? undefined : onCancel} aria-labelledby="hard-delete-title">
      <DialogTitle id="hard-delete-title">Delete {entity}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Type <strong>{name}</strong> to permanently delete this {lower} and everything under it
          ({description}). This cannot be undone.
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label={`${entity} name`}
          value={typed}
          aria-label={`Type the ${lower} name to confirm deletion`}
          onChange={(event) => setTyped(event.target.value)}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={deleting}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          disabled={!confirmed || deleting}
          onClick={handleConfirm}
        >
          {deleting ? 'Deleting…' : `Delete ${entity}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}


const RESPONSIBLE_OPTIONS: { value: ResponsibleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'me', label: 'Me' },
  { value: 'customer', label: 'Customer' },
]

/**
 * Fill/text colours for a Label chip, keyed by the label's Dataverse colour
 * name. Presentation-only (mirrors the palette the CSS label chips used) so the
 * board's MUI chips read the same across every customer/project.
 */
const LABEL_COLOR_HEX: Record<string, { bg: string; fg: string }> = {
  Red: { bg: '#e01b24', fg: '#ffffff' },
  Orange: { bg: '#ff7800', fg: '#1a1a1a' },
  Yellow: { bg: '#f6d32d', fg: '#1a1a1a' },
  Green: { bg: '#2ec27e', fg: '#1a1a1a' },
  Blue: { bg: '#3584e4', fg: '#ffffff' },
  Purple: { bg: '#9141ac', fg: '#ffffff' },
  Gray: { bg: '#9a9996', fg: '#1a1a1a' },
}

/** Resolve a task's responsible choice value to its label (Me/Customer), or null when unset. */
function responsibleLabel(value: number | undefined): string | null {
  if (value === undefined) return null
  return RESPONSIBLE_CHOICES.find((choice) => choice.value === value)?.label ?? null
}

/**
 * A single Planner-style task card on the swimlane board: the Task name, its
 * Label chips (coloured per label), a due-date chip highlighted in error when
 * overdue, and a Responsible badge when set. The card is natively draggable
 * (horizontal Status change only) and clickable/keyboard-activatable to open the
 * detail pane; the complete ✓ marks it Done. Status is deliberately omitted —
 * it is implied by the column the card sits in.
 */
function TaskCard({
  task,
  labels,
  overdue,
  onSelect,
  onComplete,
  onDragStart,
  onDragEnd,
}: {
  task: Task
  labels: Label[] | undefined
  overdue: boolean
  onSelect: () => void
  onComplete: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const responsible = responsibleLabel(task.responsible)
  const due = task.duedate?.slice(0, 10)
  const hasMeta = Boolean((labels && labels.length > 0) || due || responsible)
  return (
    <Card
      variant="outlined"
      draggable
      role="button"
      tabIndex={0}
      aria-label={task.name}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}
    >
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>
            {task.name}
          </Typography>
          {task.status !== DONE_STATUS && (
            <Tooltip title={`Complete ${task.name}`}>
              <IconButton
                size="small"
                aria-label={`Complete ${task.name}`}
                sx={{ color: 'success.main', flexShrink: 0 }}
                onClick={(event) => {
                  event.stopPropagation()
                  onComplete()
                }}
              >
                <CheckIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {hasMeta && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
            {labels?.map((label) => {
              const color = LABEL_COLOR_HEX[label.colorLabel]
              return (
                <Chip
                  key={label.id}
                  size="small"
                  label={label.name}
                  sx={color ? { bgcolor: color.bg, color: color.fg } : undefined}
                />
              )
            })}
            {due && (
              <Chip
                size="small"
                icon={<EventIcon fontSize="small" />}
                label={due}
                color={overdue ? 'error' : 'default'}
                variant={overdue ? 'filled' : 'outlined'}
                aria-label={overdue ? `Due ${due} (overdue)` : `Due ${due}`}
              />
            )}
            {responsible && (
              <Tooltip title={`Responsible: ${responsible}`}>
                <Chip
                  size="small"
                  variant="outlined"
                  avatar={
                    <Avatar>
                      <PersonIcon fontSize="small" />
                    </Avatar>
                  }
                  label={responsible}
                />
              </Tooltip>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

function Board({
  data,
  customerId,
  responsibleFilter,
  showInactive,
  onTaskStatusChanged,
  onSelectTask,
  onTaskCreated,
  onEditProject,
  onToggleProjectActive,
  onDeleteProject,
}: {
  data: OverviewData
  customerId: string
  responsibleFilter: ResponsibleFilter
  showInactive: boolean
  onTaskStatusChanged: (taskId: string, status: number) => void
  onSelectTask: (task: Task) => void
  onTaskCreated: (task: Task) => void
  onEditProject: (project: Project) => void
  onToggleProjectActive: (project: Project) => void
  onDeleteProject: (project: Project) => void
}) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Local calendar date (YYYY-MM-DD) used to decide whether a card's due date is
  // overdue; computed once per render since the board is not open across midnight.
  const today = useMemo(() => {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${now.getFullYear()}-${month}-${day}`
  }, [])

  const customer = data.customers.find((c) => c.id === customerId)
  const board = useMemo(
    () =>
      customer
        ? buildCustomerBoard(
            customer,
            data.projects,
            filterTasksByResponsible(data.tasks, responsibleFilter),
            showInactive,
          )
        : null,
    [customer, data.projects, data.tasks, responsibleFilter, showInactive],
  )

  if (!customer || !board) {
    return (
      <section>
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
        <h2>{customer.name} — Board</h2>
      </header>
      {error && <p role="alert">{error}</p>}
      {board.lanes.length === 0 ? (
        <p>{showInactive ? 'No projects for this customer.' : 'No active projects for this customer.'}</p>
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
              <Box
                className="board-lane-head"
                role="rowheader"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 0.5,
                }}
              >
                <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lane.project.name}
                </Box>
                <RowMenu
                  label={lane.project.name}
                  active={lane.project.active}
                  onEdit={() => onEditProject(lane.project)}
                  onToggleActive={() => onToggleProjectActive(lane.project)}
                  onDelete={() => onDeleteProject(lane.project)}
                />
              </Box>
              {lane.columns.map((cell) => (
                <div
                  key={cell.status}
                  className="board-cell"
                  role="gridcell"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(cell.status)}
                >
                  {cell.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      labels={data.taskLabels[task.id]}
                      overdue={isOverdue(task, today)}
                      onSelect={() => onSelectTask(task)}
                      onComplete={() => void handleComplete(task)}
                      onDragStart={() => setDraggingTaskId(task.id)}
                      onDragEnd={() => setDraggingTaskId(null)}
                    />
                  ))}
                  <QuickAddTask
                    projectId={lane.project.id}
                    status={cell.status}
                    projectName={lane.project.name}
                    statusLabel={cell.label}
                    onCreated={onTaskCreated}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * The Planner/Trello-style inline quick-add inside one board bucket (Project row
 * × Status column). Collapsed to a "+ Add task" button by default; clicking it
 * expands a small form in place — a required Name (autofocused) plus an optional
 * Due date and Responsible — that is the primary way tasks are created. The new
 * task defaults its Project from the swimlane and its Status from the bucket via
 * {@link quickAddTaskForm}; Enter adds and Escape cancels. On success the created
 * Task is handed to `onCreated` (optimistic upsert) so it appears in this bucket,
 * and the composer stays open with the Name refocused for rapid entry.
 */
function QuickAddTask({
  projectId,
  status,
  projectName,
  statusLabel,
  onCreated,
}: {
  projectId: string
  status: number
  projectName: string
  statusLabel: string
  onCreated: (task: Task) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [duedate, setDuedate] = useState('')
  const [responsible, setResponsible] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  function reset() {
    setName('')
    setDuedate('')
    setResponsible(null)
    setError(null)
  }

  function cancel() {
    reset()
    setOpen(false)
  }

  const values = quickAddTaskForm(projectId, status, { name, duedate, responsible })
  const errors = validateTaskForm(values)
  const canAdd = Object.keys(errors).length === 0 && !saving

  async function handleAdd() {
    if (!canAdd) return
    setSaving(true)
    setError(null)
    try {
      const created = await createTask((record) => Csa_tasksService.create(record), values)
      onCreated(created)
      reset()
      setSaving(false)
      // Keep the composer open and refocus the name for rapid successive adds.
      nameRef.current?.focus()
    } catch (e: unknown) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Could not add the task.')
    }
  }

  if (!open) {
    return (
      <Button
        size="small"
        className="board-add-task"
        startIcon={<AddIcon fontSize="small" />}
        aria-label={`Add task to ${projectName} in ${statusLabel}`}
        onClick={() => setOpen(true)}
        fullWidth
        sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
      >
        Add task
      </Button>
    )
  }

  return (
    <Box
      className="board-quick-add"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          cancel()
        }
      }}
      sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}
    >
      {error && (
        <Alert severity="error" sx={{ py: 0 }}>
          {error}
        </Alert>
      )}
      <TextField
        inputRef={nameRef}
        size="small"
        autoFocus
        required
        placeholder="Task name"
        aria-label={`New task name for ${projectName} in ${statusLabel}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void handleAdd()
          }
        }}
      />
      <TextField
        type="date"
        size="small"
        aria-label={`Due date for new task in ${statusLabel}`}
        value={duedate}
        slotProps={{ inputLabel: { shrink: true } }}
        onChange={(event) => setDuedate(event.target.value)}
      />
      <TextField
        select
        size="small"
        aria-label={`Responsible for new task in ${statusLabel}`}
        value={responsible ?? ''}
        onChange={(event) =>
          setResponsible(event.target.value === '' ? null : Number(event.target.value))
        }
      >
        <MenuItem value="">Unassigned</MenuItem>
        {RESPONSIBLE_CHOICES.map((choice) => (
          <MenuItem key={choice.value} value={choice.value}>
            {choice.label}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="contained"
          disabled={!canAdd}
          onClick={() => void handleAdd()}
        >
          {saving ? 'Adding…' : 'Add task'}
        </Button>
        <Button size="small" type="button" onClick={cancel} disabled={saving}>
          Cancel
        </Button>
      </Stack>
    </Box>
  )
}

function ProjectDetailPane({
  pane,
  customers,
  onClose,
  onSaved,
}: {
  pane: ProjectPane
  customers: Customer[]
  onClose: () => void
  onSaved: (project: Project) => void
}) {
  const isEdit = pane.mode === 'edit'
  const [values, setValues] = useState<ProjectFormValues>(() =>
    pane.mode === 'edit' ? projectToForm(pane.project) : newProjectForm(pane.customerId),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = validateProjectForm(values)
  const canSave = Object.keys(errors).length === 0

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

  return (
    <Drawer anchor="right" open onClose={onClose}>
      <Box
        component="form"
        onSubmit={handleSubmit}
        aria-label={isEdit ? 'Edit project' : 'New project'}
        sx={{
          width: DRAWER_WIDTH,
          maxWidth: '100vw',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" component="h2">
            {isEdit ? 'Edit Project' : 'New Project'}
          </Typography>
          <IconButton aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Name"
          value={values.name}
          autoFocus
          required
          error={Boolean(errors.name)}
          helperText={errors.name}
          onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
        />
        <TextField
          select
          label="Customer"
          value={values.customerId}
          required
          error={Boolean(errors.customerId)}
          helperText={errors.customerId}
          onChange={(event) => setValues((v) => ({ ...v, customerId: event.target.value }))}
        >
          {customers.map((customer) => (
            <MenuItem key={customer.id} value={customer.id}>
              {customer.name}
              {!customer.active ? ' (Inactive)' : ''}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Switch
              checked={values.active}
              onChange={(event) => setValues((v) => ({ ...v, active: event.target.checked }))}
            />
          }
          label="Active"
        />
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  )
}

function CustomerDetailPane({
  pane,
  onClose,
  onSaved,
}: {
  pane: CustomerPane
  onClose: () => void
  onSaved: (customer: Customer) => void
}) {
  const isEdit = pane.mode === 'edit'
  const [values, setValues] = useState<CustomerFormValues>(() =>
    pane.mode === 'edit' ? customerToForm(pane.customer) : newCustomerForm(),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = validateCustomerForm(values)
  const canSave = Object.keys(errors).length === 0

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

  return (
    <Drawer anchor="right" open onClose={onClose}>
      <Box
        component="form"
        onSubmit={handleSubmit}
        aria-label={isEdit ? 'Edit customer' : 'New customer'}
        sx={{
          width: DRAWER_WIDTH,
          maxWidth: '100vw',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" component="h2">
            {isEdit ? 'Edit Customer' : 'New Customer'}
          </Typography>
          <IconButton aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Name"
          value={values.name}
          autoFocus
          required
          error={Boolean(errors.name)}
          helperText={errors.name}
          onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
        />
        <FormControlLabel
          control={
            <Switch
              checked={values.active}
              onChange={(event) => setValues((v) => ({ ...v, active: event.target.checked }))}
            />
          }
          label="Active"
        />
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </Stack>
      </Box>
    </Drawer>
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
  const [values, setValues] = useState<TaskFormValues>(() => taskToForm(pane.task))
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>(() => attachedLabelIds)
  const [labelDraft, setLabelDraft] = useState('')
  const [labelBusy, setLabelBusy] = useState(false)
  const [labelError, setLabelError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = validateTaskForm(values)
  const canSave = Object.keys(errors).length === 0

  // Selectable projects for the Project reassign dropdown, flattened as
  // "Customer — Project" and restricted to active projects. The task's current
  // project is always included (even if inactive) so the Select value has a
  // matching option.
  const projectOptions = useMemo(() => {
    const customerName = (cid: string) =>
      customers.find((c) => c.id === cid)?.name ?? 'Unknown'
    const options = projects
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, label: `${customerName(p.customerId)} — ${p.name}` }))
    const currentId = pane.task.projectId
    if (currentId && !options.some((o) => o.id === currentId)) {
      const current = projects.find((p) => p.id === currentId)
      if (current) {
        options.push({
          id: current.id,
          label: `${customerName(current.customerId)} — ${current.name} (Inactive)`,
        })
      }
    }
    options.sort((a, b) => a.label.localeCompare(b.label))
    return options
  }, [projects, customers, pane])

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
      const saved = await updateTask(
        (id, changedFields) => Csa_tasksService.update(id, changedFields),
        pane.task,
        values,
      )
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
    if (saving || deleting) return
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
    <Drawer anchor="right" open onClose={onClose}>
      <Box
        sx={{
          width: { xs: '100vw', sm: TASK_DRAWER_WIDTH },
          maxWidth: '100vw',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" component="h2">
            Edit Task
          </Typography>
          <IconButton aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
        <Box
          component="form"
          onSubmit={handleSubmit}
          aria-label="Edit task"
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Name"
            value={values.name}
            autoFocus
            required
            error={Boolean(errors.name)}
            helperText={errors.name}
            onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
          />
          <TextField
            select
            label="Project"
            value={values.projectId}
            required
            error={Boolean(errors.projectId)}
            helperText={errors.projectId ?? 'Move this task to another project.'}
            onChange={(event) => setValues((v) => ({ ...v, projectId: event.target.value }))}
          >
            {projectOptions.length === 0 && (
              <MenuItem value="" disabled>
                No active projects
              </MenuItem>
            )}
            {projectOptions.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Status"
            value={values.status}
            onChange={(event) => setValues((v) => ({ ...v, status: Number(event.target.value) }))}
          >
            {STATUS_COLUMNS.map((statusColumn) => (
              <MenuItem key={statusColumn.status} value={statusColumn.status}>
                {statusColumn.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Responsible"
            value={values.responsible ?? ''}
            onChange={(event) =>
              setValues((v) => ({
                ...v,
                responsible: event.target.value === '' ? null : Number(event.target.value),
              }))
            }
          >
            <MenuItem value="">Unassigned</MenuItem>
            {RESPONSIBLE_CHOICES.map((choice) => (
              <MenuItem key={choice.value} value={choice.value}>
                {choice.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="date"
            label="Due date"
            value={values.duedate}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => setValues((v) => ({ ...v, duedate: event.target.value }))}
          />
          <TextField
            label="Description"
            value={values.description}
            multiline
            minRows={4}
            onChange={(event) => setValues((v) => ({ ...v, description: event.target.value }))}
          />
          <Box>
            <Typography variant="subtitle2" component="span">
              Labels
            </Typography>
            {allLabels.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                No labels available.
              </Typography>
            ) : (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                {allLabels.map((label) => {
                  const checked = selectedLabelIds.includes(label.id)
                  return (
                    <Chip
                      key={label.id}
                      label={label.name}
                      size="small"
                      color={checked ? 'primary' : 'default'}
                      variant={checked ? 'filled' : 'outlined'}
                      onClick={() => toggleLabel(label.id)}
                    />
                  )
                })}
              </Stack>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'flex-start' }}>
              <TextField
                size="small"
                fullWidth
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
              <Button
                type="button"
                onClick={() => void handleAddLabel()}
                disabled={labelDraft.trim() === '' || labelBusy}
              >
                {labelBusy ? 'Adding…' : 'Add'}
              </Button>
            </Stack>
            {labelError && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                {labelError}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={!canSave || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </Stack>
        </Box>
        <Button
          type="button"
          color="error"
          variant="outlined"
          disabled={saving || deleting}
          onClick={handleDelete}
          sx={{ alignSelf: 'flex-start' }}
        >
          {deleting ? 'Deleting…' : 'Delete Task'}
        </Button>
        <Divider />
        <TaskNotes taskId={pane.task.id} />
      </Box>
    </Drawer>
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
    <Box component="section" aria-label="Notes" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="subtitle1" component="h3">
        Notes
      </Typography>
      <TextField
        multiline
        minRows={3}
        placeholder="Add a note…"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button
        type="button"
        variant="outlined"
        onClick={handleAdd}
        disabled={!canAdd}
        sx={{ alignSelf: 'flex-start' }}
      >
        {adding ? 'Adding…' : 'Add Note'}
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading notes…
        </Typography>
      ) : notes.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No notes yet.
        </Typography>
      ) : (
        <Stack component="ol" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {notes.map((note) => (
            <Box component="li" key={note.id}>
              <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {formatNoteTime(note.createdOn)}
                </Typography>
                <Button
                  type="button"
                  size="small"
                  color="error"
                  aria-label="Delete note"
                  disabled={deletingId === note.id}
                  onClick={() => void handleDeleteNote(note.id)}
                >
                  {deletingId === note.id ? 'Deleting…' : 'Delete'}
                </Button>
              </Stack>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {note.text}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
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

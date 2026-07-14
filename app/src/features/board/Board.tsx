import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import { RowMenu } from '../../components/RowMenu'
import { TaskCard } from './TaskCard'
import { QuickAddTask } from '../task/QuickAddTask'
import type { OverviewData } from '../../types'
import type { Project } from '../../data/projects'
import { updateTaskStatus, isOverdue, type Task } from '../../data/tasks'
import { filterTasksByResponsible, type ResponsibleFilter } from '../../data/responsible'
import {
  BACKLOG_STATUS,
  buildCustomerBoard,
  completeChange,
  reopenChange,
  statusOnDrop,
} from '../../data/board'
import { Csa_tasksService } from '../../generated/services/Csa_tasksService'

/**
 * The per-customer swimlane Board tab: one lane per project, one column per
 * Status, with draggable task cards and inline quick-add per bucket. Reuses the
 * pure {@link buildCustomerBoard} layout; every status write is optimistic and
 * reverts on failure.
 */
export function Board({
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

  async function handleReopen(task: Task) {
    const transition = reopenChange(task)
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
      setError(e instanceof Error ? e.message : 'Could not reopen the task.')
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
                      onReopen={() => void handleReopen(task)}
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

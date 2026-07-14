import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import { GridHeaderRow, TaskRow } from './GridRow'
import { GridProjectSection, InactiveSection } from './GridSections'
import type { OverviewData } from '../../types'
import { updateTaskStatus, isOverdue, type Task } from '../../data/tasks'
import { filterTasksByResponsible, type ResponsibleFilter } from '../../data/responsible'
import { BACKLOG_STATUS, completeChange, reopenChange } from '../../data/board'
import { buildCustomerGrid } from '../../data/overview'
import { Csa_tasksService } from '../../generated/services/Csa_tasksService'

/**
 * The per-customer Grid tab: the selected customer's tasks as a table grouped by
 * Project (one collapsible level). Active projects list their open tasks (each
 * with the shared row and inline quick-add) plus a collapsed Completed line;
 * inactive projects gather in one collapsed Inactive section at the bottom.
 * Reuses the pure {@link buildCustomerGrid} partition and mirrors the board's
 * complete/reopen writes so the completion circle behaves identically.
 */
export function Grid({
  data,
  customerId,
  responsibleFilter,
  onTaskStatusChanged,
  onSelectTask,
  onTaskCreated,
}: {
  data: OverviewData
  customerId: string
  responsibleFilter: ResponsibleFilter
  onTaskStatusChanged: (taskId: string, status: number) => void
  onSelectTask: (task: Task) => void
  onTaskCreated: (task: Task) => void
}) {
  const [error, setError] = useState<string | null>(null)

  const today = useMemo(() => {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${now.getFullYear()}-${month}-${day}`
  }, [])

  const customer = data.customers.find((c) => c.id === customerId)
  const grid = useMemo(
    () =>
      customer
        ? buildCustomerGrid(
            customer,
            data.projects,
            filterTasksByResponsible(data.tasks, responsibleFilter),
          )
        : null,
    [customer, data.projects, data.tasks, responsibleFilter],
  )

  if (!customer || !grid) {
    return (
      <section>
        <p role="alert">That customer is no longer available.</p>
      </section>
    )
  }

  async function writeStatus(task: Task, nextStatus: number, failMessage: string) {
    const previousStatus = task.status ?? BACKLOG_STATUS
    setError(null)
    // Optimistic update; revert if the write fails.
    onTaskStatusChanged(task.id, nextStatus)
    try {
      await updateTaskStatus(
        (id, changedFields) => Csa_tasksService.update(id, changedFields),
        task.id,
        nextStatus,
      )
    } catch (e: unknown) {
      onTaskStatusChanged(task.id, previousStatus)
      setError(e instanceof Error ? e.message : failMessage)
    }
  }

  function handleComplete(task: Task) {
    const transition = completeChange(task)
    if (!transition.changed) return
    void writeStatus(task, transition.status, 'Could not complete the task.')
  }

  function handleReopen(task: Task) {
    const transition = reopenChange(task)
    if (!transition.changed) return
    void writeStatus(task, transition.status, 'Could not reopen the task.')
  }

  const renderRow = (task: Task): ReactNode => (
    <TaskRow
      key={task.id}
      task={task}
      labels={data.taskLabels[task.id]}
      overdue={isOverdue(task, today)}
      onSelect={() => onSelectTask(task)}
      onComplete={() => handleComplete(task)}
      onReopen={() => handleReopen(task)}
    />
  )

  const isEmpty = grid.activeProjects.length === 0 && grid.inactiveProjects.length === 0

  return (
    <section className="grid-view">
      <header className="board-header">
        <h2>{customer.name} — Grid</h2>
      </header>
      {error && <p role="alert">{error}</p>}
      {isEmpty ? (
        <p>No projects for this customer.</p>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Box sx={{ minWidth: 760, display: 'flex', flexDirection: 'column' }}>
            <GridHeaderRow />
            {grid.activeProjects.map((group) => (
              <GridProjectSection
                key={group.project.id}
                group={group}
                renderRow={renderRow}
                onTaskCreated={onTaskCreated}
              />
            ))}
            {grid.inactiveProjects.length > 0 && (
              <InactiveSection groups={grid.inactiveProjects} renderRow={renderRow} />
            )}
          </Box>
        </Box>
      )}
    </section>
  )
}

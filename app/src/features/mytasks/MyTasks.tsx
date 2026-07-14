import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import { GridHeaderRow, TaskRow } from '../grid/GridRow'
import { CollapsibleHeader, GridProjectSection, InactiveSection } from '../grid/GridSections'
import type { CompanyGrid } from '../../data/overview'
import type { OverviewData } from '../../types'
import { updateTaskStatus, isOverdue, type Task } from '../../data/tasks'
import { filterTasksByResponsible, type ResponsibleFilter } from '../../data/responsible'
import { BACKLOG_STATUS, completeChange, reopenChange } from '../../data/board'
import { buildGlobalGrid } from '../../data/overview'
import { Csa_tasksService } from '../../generated/services/Csa_tasksService'

/**
 * One company block in the global My Tasks view: a collapsible company header
 * (open by default) over that customer's per-customer Grid partition — its
 * active project sections (each with rows, quick-add, and a collapsed Completed
 * line) and, when present, the bottom Inactive section. Company is the outer
 * collapsible level; Project is the inner one.
 */
function CompanySection({
  company,
  renderRow,
  onTaskCreated,
}: {
  company: CompanyGrid
  renderRow: (task: Task) => ReactNode
  onTaskCreated: (task: Task) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <Box className="mytasks-company">
      <CollapsibleHeader
        open={open}
        banner
        label={company.customer.name}
        ariaLabel={`${company.customer.name} company`}
        onToggle={() => setOpen((prev) => !prev)}
      />
      <Collapse in={open} unmountOnExit>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {company.activeProjects.map((group) => (
            <GridProjectSection
              key={group.project.id}
              group={group}
              renderRow={renderRow}
              onTaskCreated={onTaskCreated}
            />
          ))}
          {company.inactiveProjects.length > 0 && (
            <InactiveSection groups={company.inactiveProjects} renderRow={renderRow} />
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

/**
 * The global My Tasks view: every customer's tasks grouped Company → Project
 * across all customers, reusing the shared task row and Grid sections. Companies
 * and projects are alphabetical; below the company level each company behaves
 * exactly like the per-customer Grid (open tasks, collapsed Completed, bottom
 * Inactive). Mirrors {@link Grid}'s complete/reopen writes so the completion
 * circle behaves identically.
 */
export function MyTasks({
  data,
  responsibleFilter,
  onTaskStatusChanged,
  onSelectTask,
  onTaskCreated,
}: {
  data: OverviewData
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

  const companies = useMemo(
    () =>
      buildGlobalGrid(
        data.customers,
        data.projects,
        filterTasksByResponsible(data.tasks, responsibleFilter),
      ),
    [data.customers, data.projects, data.tasks, responsibleFilter],
  )

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

  return (
    <section className="mytasks-view">
      <header className="board-header">
        <h2>My Tasks</h2>
      </header>
      {error && <p role="alert">{error}</p>}
      {companies.length === 0 ? (
        <p>No tasks yet.</p>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Box sx={{ minWidth: 760, display: 'flex', flexDirection: 'column' }}>
            <GridHeaderRow />
            {companies.map((company) => (
              <CompanySection
                key={company.customer.id}
                company={company}
                renderRow={renderRow}
                onTaskCreated={onTaskCreated}
              />
            ))}
          </Box>
        </Box>
      )}
    </section>
  )
}

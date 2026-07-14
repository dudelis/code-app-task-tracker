import { useState } from 'react'
import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import { QuickAddTask } from '../task/QuickAddTask'
import { BACKLOG_STATUS } from '../../data/board'
import type { Task } from '../../data/tasks'
import type { GridProjectGroup } from '../../data/overview'

/**
 * A clickable/keyboard-activatable collapse header with a chevron, shared by the
 * Grid's project groups, per-project Completed lines, and the bottom Inactive
 * section. `muted` renders the softer secondary style used for the Completed and
 * Inactive headers.
 */
export function CollapsibleHeader({
  open,
  label,
  ariaLabel,
  onToggle,
  muted = false,
  banner = false,
}: {
  open: boolean
  label: string
  ariaLabel: string
  onToggle: () => void
  muted?: boolean
  banner?: boolean
}) {
  return (
    <Box
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={ariaLabel}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.5,
        cursor: 'pointer',
        fontWeight: muted ? 400 : 600,
        color: muted ? 'text.secondary' : 'text.primary',
        ...(banner
          ? { bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }
          : {}),
      }}
    >
      {open ? <ExpandMoreIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
      <Box component="span">{label}</Box>
    </Box>
  )
}

/**
 * One active project in the Grid: a collapsible header (open by default) over
 * the project's open task rows, the inline quick-add composer, and — when the
 * project has Done tasks — a collapsed "Completed" line holding those rows.
 */
export function GridProjectSection({
  group,
  renderRow,
  onTaskCreated,
}: {
  group: GridProjectGroup
  renderRow: (task: Task) => ReactNode
  onTaskCreated: (task: Task) => void
}) {
  const [open, setOpen] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)
  return (
    <Box className="grid-project">
      <CollapsibleHeader
        open={open}
        banner
        label={group.project.name}
        ariaLabel={`${group.project.name} project`}
        onToggle={() => setOpen((prev) => !prev)}
      />
      <Collapse in={open} unmountOnExit>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {group.openTasks.map(renderRow)}
          <Box sx={{ px: 1, py: 0.25 }}>
            <QuickAddTask
              projectId={group.project.id}
              status={BACKLOG_STATUS}
              projectName={group.project.name}
              statusLabel="Backlog"
              onCreated={onTaskCreated}
            />
          </Box>
          {group.completedTasks.length > 0 && (
            <>
              <CollapsibleHeader
                open={showCompleted}
                muted
                label={`Completed (${group.completedTasks.length})`}
                ariaLabel={`Completed tasks for ${group.project.name}`}
                onToggle={() => setShowCompleted((prev) => !prev)}
              />
              <Collapse in={showCompleted} unmountOnExit>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  {group.completedTasks.map(renderRow)}
                </Box>
              </Collapse>
            </>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

/**
 * The single collapsed Inactive section at the bottom of a table view: each
 * inactive project listed with its tasks (open then completed). Collapsed by
 * default so live work stays on top.
 */
export function InactiveSection({
  groups,
  renderRow,
}: {
  groups: GridProjectGroup[]
  renderRow: (task: Task) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Box className="grid-inactive">
      <CollapsibleHeader
        open={open}
        muted
        banner
        label={`Inactive (${groups.length})`}
        ariaLabel="Inactive projects"
        onToggle={() => setOpen((prev) => !prev)}
      />
      <Collapse in={open} unmountOnExit>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {groups.map((group) => (
            <Box key={group.project.id}>
              <Typography
                variant="caption"
                sx={{ display: 'block', px: 1, py: 0.5, fontWeight: 600, color: 'text.secondary' }}
              >
                {group.project.name}
              </Typography>
              {group.openTasks.map(renderRow)}
              {group.completedTasks.map(renderRow)}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  )
}

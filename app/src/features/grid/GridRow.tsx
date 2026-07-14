import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import { DONE_STATUS, type Task } from '../../data/tasks'
import type { Label } from '../../data/labels'
import { responsibleLabel } from '../../shared/responsible'
import { LABEL_COLOR_HEX } from '../../shared/labelColors'

/**
 * Shared column template for the Grid table so the header row and every task
 * row align: completion circle, Task name (flexes), Status, Due, Responsible,
 * and Labels (flexes).
 */
export const GRID_TEMPLATE = '40px minmax(180px, 3fr) 130px 116px 150px minmax(160px, 2fr)'

/**
 * The Grid table's column header row, aligned to {@link GRID_TEMPLATE}. The
 * first (completion-circle) column has no heading.
 */
export function GridHeaderRow() {
  const headings = ['Task name', 'Status', 'Due', 'Responsible', 'Labels']
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        alignItems: 'center',
        columnGap: 1,
        px: 1,
        py: 0.75,
        borderBottom: '2px solid',
        borderColor: 'divider',
      }}
    >
      <span />
      {headings.map((heading) => (
        <Typography
          key={heading}
          variant="caption"
          noWrap
          sx={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'text.secondary' }}
        >
          {heading}
        </Typography>
      ))}
    </Box>
  )
}

/**
 * One row of the Grid table, laid out on {@link GRID_TEMPLATE} so its cells line
 * up under the header: a left completion circle, the Task name (struck through
 * when Done), then Status, Due date, Responsible, and Label chips. Clicking the
 * row (but not the circle) opens the detail pane; the circle completes an open
 * task or reopens a Done one, exactly as on the board.
 */
export function TaskRow({
  task,
  labels,
  overdue,
  onSelect,
  onComplete,
  onReopen,
}: {
  task: Task
  labels: Label[] | undefined
  overdue: boolean
  onSelect: () => void
  onComplete: () => void
  onReopen: () => void
}) {
  const responsible = responsibleLabel(task.responsible)
  const due = task.duedate?.slice(0, 10)
  const isDone = task.status === DONE_STATUS
  return (
    <Box
      className="grid-row"
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
      sx={{
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        alignItems: 'center',
        columnGap: 1,
        px: 1,
        minHeight: 40,
        borderBottom: '1px solid',
        borderColor: 'divider',
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Tooltip title={isDone ? `Reopen ${task.name}` : `Complete ${task.name}`}>
          <IconButton
            size="small"
            aria-label={isDone ? `Reopen ${task.name}` : `Complete ${task.name}`}
            sx={{ p: 0.25, color: isDone ? 'success.main' : 'text.secondary' }}
            onClick={(event) => {
              event.stopPropagation()
              if (isDone) {
                onReopen()
              } else {
                onComplete()
              }
            }}
          >
            {isDone ? <CheckCircleIcon fontSize="small" /> : <RadioButtonUncheckedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      <Typography
        variant="body2"
        noWrap
        sx={{
          minWidth: 0,
          fontWeight: 500,
          textDecoration: isDone ? 'line-through' : 'none',
          color: isDone ? 'text.secondary' : 'text.primary',
        }}
      >
        {task.name}
      </Typography>
      <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>
        {task.statusLabel || '\u2014'}
      </Typography>
      <Typography
        variant="body2"
        noWrap
        aria-label={due ? (overdue ? `Due ${due} (overdue)` : `Due ${due}`) : undefined}
        sx={{ color: overdue ? 'error.main' : 'text.secondary' }}
      >
        {due ?? '\u2014'}
      </Typography>
      <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>
        {responsible ?? '\u2014'}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, minWidth: 0, overflow: 'hidden' }}>
        {labels?.map((label) => {
          const color = LABEL_COLOR_HEX[label.colorLabel]
          return (
            <Chip
              key={label.id}
              size="small"
              label={label.name}
              sx={{ ...(color ? { bgcolor: color.bg, color: color.fg } : {}) }}
            />
          )
        })}
      </Box>
    </Box>
  )
}

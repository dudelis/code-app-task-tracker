import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import EventIcon from '@mui/icons-material/Event'
import PersonIcon from '@mui/icons-material/Person'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import { DONE_STATUS, type Task } from '../../data/tasks'
import type { Label } from '../../data/labels'
import { responsibleLabel } from '../../shared/responsible'
import { LABEL_COLOR_HEX } from '../../shared/labelColors'

/**
 * A single Planner-style task card on the swimlane board: a left-aligned
 * completion circle, the Task name, its Label chips (coloured per label), a
 * due-date chip highlighted in error when overdue, and a Responsible badge when
 * set. The card is a raised tile that stands off the darker board, natively
 * draggable (horizontal Status change only) and clickable/keyboard-activatable
 * to open the detail pane. The completion circle is empty while the task is
 * open and a filled check (with the name struck through) once Done; clicking it
 * completes an open task or reopens a Done one to To Do. Status is otherwise
 * omitted — it is implied by the column the card sits in.
 */
export function TaskCard({
  task,
  labels,
  overdue,
  onSelect,
  onComplete,
  onReopen,
  onDragStart,
  onDragEnd,
}: {
  task: Task
  labels: Label[] | undefined
  overdue: boolean
  onSelect: () => void
  onComplete: () => void
  onReopen: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const responsible = responsibleLabel(task.responsible)
  const due = task.duedate?.slice(0, 10)
  const hasMeta = Boolean((labels && labels.length > 0) || due || responsible)
  const isDone = task.status === DONE_STATUS
  return (
    <Card
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
      sx={{
        bgcolor: '#2a2a30',
        boxShadow: 3,
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
      }}
    >
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Tooltip title={isDone ? `Reopen ${task.name}` : `Complete ${task.name}`}>
            <IconButton
              size="small"
              aria-label={isDone ? `Reopen ${task.name}` : `Complete ${task.name}`}
              sx={{ p: 0.25, mt: '-2px', color: isDone ? 'success.main' : 'text.secondary', flexShrink: 0 }}
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
          <Typography
            variant="body2"
            sx={{
              flex: 1,
              minWidth: 0,
              fontWeight: 500,
              textDecoration: isDone ? 'line-through' : 'none',
              color: isDone ? 'text.secondary' : 'text.primary',
            }}
          >
            {task.name}
          </Typography>
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

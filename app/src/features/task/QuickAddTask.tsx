import { useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import AddIcon from '@mui/icons-material/Add'
import {
  createTask,
  quickAddTaskForm,
  validateTaskForm,
  RESPONSIBLE_CHOICES,
  type Task,
} from '../../data/tasks'
import { Csa_tasksService } from '../../generated/services/Csa_tasksService'

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
export function QuickAddTask({
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

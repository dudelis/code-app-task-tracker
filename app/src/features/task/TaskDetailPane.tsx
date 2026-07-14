import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import {
  RESPONSIBLE_CHOICES,
  taskToForm,
  updateTask,
  validateTaskForm,
  type Task,
  type TaskFormValues,
} from '../../data/tasks'
import { STATUS_COLUMNS } from '../../data/board'
import { createLabel, findLabelByName, saveTaskLabels, type Label } from '../../data/labels'
import { runTaskCascade, writeTaskLabels } from '../../data/cascades'
import type { Project } from '../../data/projects'
import type { Customer } from '../../data/customers'
import type { TaskPane } from '../../types'
import { TASK_DRAWER_WIDTH } from '../../shared/layout'
import { TaskNotes } from './TaskNotes'
import { Csa_tasksService } from '../../generated/services/Csa_tasksService'
import { Csa_labelsService } from '../../generated/services/Csa_labelsService'

/**
 * The right-anchored, edit-only Task drawer: task fields, a label picker with
 * inline create, a hard-delete action (ADR-0002 cascade), and the Notes
 * timeline. Saving persists the task and its label set together.
 */
export function TaskDetailPane({
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
   * shared cascade deletes the task's notes and detaches its label links before
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
      await runTaskCascade(pane.task.id)
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

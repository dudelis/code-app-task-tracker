import { useState } from 'react'
import type { FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import { ProjectContacts } from './ProjectContacts'
import { ProjectNotes } from './ProjectNotes'
import {
  createProject,
  newProjectForm,
  PRIORITY_OPTIONS,
  projectToForm,
  updateProject,
  validateProjectForm,
  type Project,
  type ProjectFormValues,
} from '../../data/projects'
import type { Customer } from '../../data/customers'
import type { ProjectPane } from '../../types'
import { DRAWER_WIDTH } from '../../shared/layout'
import { Csa_projectsService } from '../../generated/services/Csa_projectsService'

/** The right-anchored Create/Edit Project form drawer. */
export function ProjectDetailPane({
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
        <Box
          component="form"
          onSubmit={handleSubmit}
          aria-label={isEdit ? 'Edit project' : 'New project'}
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
        <TextField
          label="Description"
          value={values.description}
          multiline
          minRows={3}
          onChange={(event) => setValues((v) => ({ ...v, description: event.target.value }))}
        />
        <TextField
          select
          label="Priority"
          value={values.priority ?? ''}
          onChange={(event) =>
            setValues((v) => ({
              ...v,
              priority: event.target.value === '' ? null : Number(event.target.value),
            }))
          }
        >
          <MenuItem value="">None</MenuItem>
          {PRIORITY_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          type="date"
          label="Due date"
          value={values.dueDate}
          slotProps={{ inputLabel: { shrink: true } }}
          onChange={(event) => setValues((v) => ({ ...v, dueDate: event.target.value }))}
        />
        <TextField
          label="Materials URL"
          value={values.materialsUrl}
          onChange={(event) => setValues((v) => ({ ...v, materialsUrl: event.target.value }))}
        />
        <TextField
          label="Notes Summary"
          value={values.notesSummary}
          multiline
          minRows={3}
          helperText="Maintained automatically by the status workflow — your edits may be overwritten."
          onChange={(event) => setValues((v) => ({ ...v, notesSummary: event.target.value }))}
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
        {pane.mode === 'edit' && (
          <>
            <Divider />
            <ProjectContacts projectId={pane.project.id} customerId={pane.project.customerId} />
            <Divider />
            <ProjectNotes projectId={pane.project.id} />
          </>
        )}
      </Box>
    </Drawer>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
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
import { isFormDirty } from '../../shared/formDirty'
import { DetailDialog } from '../../components/DetailDialog'
import { Csa_projectsService } from '../../generated/services/Csa_projectsService'

const PROJECT_FORM_ID = 'project-detail-form'

/**
 * A flat, comparable snapshot of the project form for the unsaved-edits
 * close-guard. Built as an explicit `Record` so the pure {@link isFormDirty}
 * predicate can diff current vs the originals captured on open.
 */
function dirtySnapshot(values: ProjectFormValues): Record<string, unknown> {
  return {
    name: values.name,
    customerId: values.customerId,
    description: values.description,
    priority: values.priority,
    dueDate: values.dueDate,
    materialsUrl: values.materialsUrl,
    notesSummary: values.notesSummary,
    active: values.active,
  }
}

/**
 * The Create/Edit Project detail as a centered modal (ADR-0006): project fields
 * in the left column with the Contacts section below them (edit mode only, so
 * they scroll together), the chat-style Notes panel in the right column (edit
 * mode only), and a pinned footer with Save / Cancel (no delete). Saving persists
 * the project and, in edit mode, keeps the dialog open with a brief confirmation;
 * backdrop/Esc are blocked while field edits are unsaved. In create mode there is
 * no entity id yet, so contacts and notes are omitted until the first save.
 */
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
  // Snapshot of the pristine form captured when the dialog opened. Reset after a
  // successful save so the close-guard clears once edits are persisted.
  const [original, setOriginal] = useState<Record<string, unknown>>(() =>
    dirtySnapshot(
      pane.mode === 'edit' ? projectToForm(pane.project) : newProjectForm(pane.customerId),
    ),
  )
  const [saving, setSaving] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = validateProjectForm(values)
  const canSave = Object.keys(errors).length === 0

  const dirty = isFormDirty(dirtySnapshot(values), original)

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
      // Re-baseline the dirty snapshot so the close-guard clears now that the
      // fields are persisted; the dialog stays open (edit mode shows a brief
      // confirmation, create mode transitions to edit via the parent).
      setOriginal(dirtySnapshot(projectToForm(saved)))
      setSaving(false)
      if (pane.mode === 'edit') {
        setSavedOpen(true)
      }
      onSaved(saved)
    } catch (e: unknown) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Could not save the project.')
    }
  }

  const footer = (
    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
      <Button type="button" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button
        type="submit"
        form={PROJECT_FORM_ID}
        variant="contained"
        disabled={!canSave || saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </Stack>
  )

  return (
    <>
      <DetailDialog
        title={isEdit ? 'Edit Project' : 'New Project'}
        onClose={onClose}
        canClose={!dirty}
        footer={footer}
        notes={pane.mode === 'edit' ? <ProjectNotes projectId={pane.project.id} /> : undefined}
      >
        <Box
          component="form"
          id={PROJECT_FORM_ID}
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
        </Box>
        {pane.mode === 'edit' && (
          <>
            <Divider sx={{ my: 2 }} />
            <ProjectContacts projectId={pane.project.id} customerId={pane.project.customerId} />
          </>
        )}
      </DetailDialog>
      <Snackbar
        open={savedOpen}
        autoHideDuration={2500}
        onClose={() => setSavedOpen(false)}
        message="Saved"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  )
}

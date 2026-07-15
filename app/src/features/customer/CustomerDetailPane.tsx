import { useState } from 'react'
import type { FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import {
  createCustomer,
  customerToForm,
  newCustomerForm,
  updateCustomer,
  validateCustomerForm,
  type Customer,
  type CustomerFormValues,
} from '../../data/customers'
import type { CustomerPane } from '../../types'
import { isFormDirty } from '../../shared/formDirty'
import { DetailDialog } from '../../components/DetailDialog'
import { CustomerContacts } from './CustomerContacts'
import { Csa_customersService } from '../../generated/services/Csa_customersService'

const CUSTOMER_FORM_ID = 'customer-detail-form'

/**
 * A flat, comparable snapshot of the customer form for the unsaved-edits
 * close-guard. Built as an explicit `Record` so the pure {@link isFormDirty}
 * predicate can diff current vs the originals captured on open.
 */
function dirtySnapshot(values: CustomerFormValues): Record<string, unknown> {
  return {
    name: values.name,
    active: values.active,
    description: values.description,
    industry: values.industry,
    portfolioSummary: values.portfolioSummary,
  }
}

/**
 * The Create/Edit Customer detail as a centered single-column modal (ADR-0006):
 * customer fields with the Contacts section below them (edit mode only, so they
 * scroll together) and a pinned footer with Save / Cancel (no delete). Customer
 * has no notes concept, so the dialog omits the right-hand notes column. Saving
 * persists the customer and, in edit mode, keeps the dialog open with a brief
 * confirmation; backdrop/Esc are blocked while field edits are unsaved. In create
 * mode there is no entity id yet, so contacts are omitted until the first save.
 */
export function CustomerDetailPane({
  pane,
  onClose,
  onSaved,
}: {
  pane: CustomerPane
  onClose: () => void
  onSaved: (customer: Customer) => void
}) {
  const isEdit = pane.mode === 'edit'
  const [values, setValues] = useState<CustomerFormValues>(() =>
    pane.mode === 'edit' ? customerToForm(pane.customer) : newCustomerForm(),
  )
  // Snapshot of the pristine form captured when the dialog opened. Reset after a
  // successful save so the close-guard clears once edits are persisted.
  const [original, setOriginal] = useState<Record<string, unknown>>(() =>
    dirtySnapshot(pane.mode === 'edit' ? customerToForm(pane.customer) : newCustomerForm()),
  )
  const [saving, setSaving] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = validateCustomerForm(values)
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
          ? await updateCustomer(
              (id, changedFields) => Csa_customersService.update(id, changedFields),
              pane.customer.id,
              values,
            )
          : await createCustomer((record) => Csa_customersService.create(record), values)
      // Re-baseline the dirty snapshot so the close-guard clears now that the
      // fields are persisted; the dialog stays open (edit mode shows a brief
      // confirmation, create mode transitions to edit via the parent).
      setOriginal(dirtySnapshot(customerToForm(saved)))
      setSaving(false)
      if (pane.mode === 'edit') {
        setSavedOpen(true)
      }
      onSaved(saved)
    } catch (e: unknown) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Could not save the customer.')
    }
  }

  const footer = (
    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
      <Button type="button" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button
        type="submit"
        form={CUSTOMER_FORM_ID}
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
        title={isEdit ? 'Edit Customer' : 'New Customer'}
        onClose={onClose}
        canClose={!dirty}
        footer={footer}
      >
        <Box
          component="form"
          id={CUSTOMER_FORM_ID}
          onSubmit={handleSubmit}
          aria-label={isEdit ? 'Edit customer' : 'New customer'}
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
            label="Description"
            value={values.description}
            multiline
            minRows={3}
            onChange={(event) => setValues((v) => ({ ...v, description: event.target.value }))}
          />
          <TextField
            label="Industry"
            value={values.industry}
            onChange={(event) => setValues((v) => ({ ...v, industry: event.target.value }))}
          />
          <TextField
            label="Portfolio Summary"
            value={values.portfolioSummary}
            multiline
            minRows={3}
            helperText="Maintained automatically — your edits may be overwritten."
            onChange={(event) => setValues((v) => ({ ...v, portfolioSummary: event.target.value }))}
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
            <CustomerContacts customerId={pane.customer.id} />
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

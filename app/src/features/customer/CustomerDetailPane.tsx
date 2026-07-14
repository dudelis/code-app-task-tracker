import { useState } from 'react'
import type { FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
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
import { DRAWER_WIDTH } from '../../shared/layout'
import { Csa_customersService } from '../../generated/services/Csa_customersService'

/** The right-anchored Create/Edit Customer form drawer. */
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = validateCustomerForm(values)
  const canSave = Object.keys(errors).length === 0

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
      onSaved(saved)
    } catch (e: unknown) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Could not save the customer.')
    }
  }

  return (
    <Drawer anchor="right" open onClose={onClose}>
      <Box
        component="form"
        onSubmit={handleSubmit}
        aria-label={isEdit ? 'Edit customer' : 'New customer'}
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
            {isEdit ? 'Edit Customer' : 'New Customer'}
          </Typography>
          <IconButton aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
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
    </Drawer>
  )
}

import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DeleteIcon from '@mui/icons-material/Delete'
import {
  createContact,
  fetchCustomerContacts,
  newContactForm,
  updateContact,
  validateContactForm,
  type Contact,
  type ContactFormValues,
} from '../../data/contacts'
import { runContactCascade } from '../../data/cascades'
import { ContactsTable } from '../../components/ContactsTable'
import { Csa_contactsService } from '../../generated/services/Csa_contactsService'

/** Insert a contact into a name-sorted list, keeping the list ordered by name. */
function withContact(contacts: Contact[], contact: Contact): Contact[] {
  return [...contacts, contact].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The Customer pane's contacts section (edit mode only): an add form above a
 * shared {@link ContactsTable} listing the customer's contacts with every field.
 * Adding persists a contact under the customer; inline edits write through to
 * the shared record; the per-row delete runs the contact cascade (detaching the
 * contact's project links first) behind a plain confirm.
 */
export function CustomerContacts({ customerId }: { customerId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<ContactFormValues>(() => newContactForm())
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCustomerContacts((options) => Csa_contactsService.getAll(options), customerId)
      .then((loaded) => {
        if (!cancelled) {
          setContacts(loaded)
          setLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load contacts.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [customerId])

  const addErrors = validateContactForm(draft)
  const canAdd = Object.keys(addErrors).length === 0 && !adding

  async function handleAdd() {
    if (!canAdd) return
    setAdding(true)
    setError(null)
    try {
      const created = await createContact(
        (record) => Csa_contactsService.create(record),
        customerId,
        draft,
      )
      setContacts((prev) => withContact(prev, created))
      setDraft(newContactForm())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not add the contact.')
    } finally {
      setAdding(false)
    }
  }

  /** Inline-edit save: persist the changed fields to the shared contact record. */
  async function handleSaveEdit(contactId: string, values: ContactFormValues) {
    const next = {
      name: values.name.trim(),
      role: values.role.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
    }
    await updateContact((id, changedFields) => Csa_contactsService.update(id, changedFields), contactId, {
      csa_name: next.name,
      csa_role: next.role,
      csa_email: next.email,
      csa_phone: next.phone,
    })
    setContacts((prev) =>
      prev
        .map((c) => (c.id === contactId ? { ...c, ...next } : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
  }

  /** Delete a contact (and its project links) behind a plain confirm. */
  async function handleDelete(contact: Contact) {
    if (busyId) return
    if (
      !window.confirm(
        `Delete the contact “${contact.name}”? Its project links are also removed.`,
      )
    ) {
      return
    }
    setBusyId(contact.id)
    setError(null)
    try {
      await runContactCascade(contact.id)
      setContacts((prev) => prev.filter((c) => c.id !== contact.id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not delete the contact.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Box
      component="section"
      aria-label="Contacts"
      sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      <Typography variant="subtitle1" component="h3">
        Contacts
      </Typography>
      <Stack spacing={1} sx={{ mb: 1 }}>
        <TextField
          size="small"
          label="Name"
          value={draft.name}
          required
          error={Boolean(addErrors.name)}
          helperText={addErrors.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            label="Role"
            value={draft.role}
            onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
          />
          <TextField
            size="small"
            label="Email"
            value={draft.email}
            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
          />
          <TextField
            size="small"
            label="Phone"
            value={draft.phone}
            onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
          />
        </Stack>
        <Button
          type="button"
          variant="outlined"
          onClick={() => void handleAdd()}
          disabled={!canAdd}
          sx={{ alignSelf: 'flex-start' }}
        >
          {adding ? 'Adding…' : 'Add Contact'}
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading contacts…
        </Typography>
      ) : (
        <ContactsTable
          contacts={contacts}
          onSaveEdit={handleSaveEdit}
          onRemove={(contact) => void handleDelete(contact)}
          removeLabel="Delete"
          removeIcon={<DeleteIcon fontSize="small" />}
          busyId={busyId}
        />
      )}
    </Box>
  )
}

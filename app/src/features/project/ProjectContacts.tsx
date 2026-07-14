import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import {
  createContact,
  fetchCustomerContacts,
  fetchProjectContacts,
  newContactForm,
  saveProjectContacts,
  updateContact,
  validateContactForm,
  type Contact,
  type ContactFormValues,
} from '../../data/contacts'
import { readProjectContacts, writeProjectContacts } from '../../data/cascades'
import { ContactsTable } from '../../components/ContactsTable'
import { Csa_contactsService } from '../../generated/services/Csa_contactsService'

/** Comparator that keeps a contact list ordered by name. */
function byName(a: Contact, b: Contact): number {
  return a.name.localeCompare(b.name)
}

/**
 * The Project pane's linked-contacts section (edit mode only): the contacts
 * linked to the project via the Contact↔Project many-to-many, shown in the
 * shared {@link ContactsTable} with every field. Two add paths sit above the
 * table — link an existing contact of the project's customer, or create a new
 * contact that is parented to the customer and auto-linked in one action. Inline
 * edits write through to the shared contact; the per-row Unlink detaches the
 * association only (the contact keeps living under its customer). Every
 * link/create/unlink persists immediately (optimistic, revert on error) rather
 * than batching on Save — see ADR-0005.
 */
export function ProjectContacts({
  projectId,
  customerId,
}: {
  projectId: string
  customerId: string
}) {
  const [linked, setLinked] = useState<Contact[]>([])
  const [customerContacts, setCustomerContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [linking, setLinking] = useState(false)
  const [draft, setDraft] = useState<ContactFormValues>(() => newContactForm())
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchProjectContacts(readProjectContacts, projectId),
      fetchCustomerContacts((options) => Csa_contactsService.getAll(options), customerId),
    ])
      .then(([linkedContacts, all]) => {
        if (!cancelled) {
          setLinked(linkedContacts)
          setCustomerContacts(all)
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
  }, [projectId, customerId])

  const linkedIds = new Set(linked.map((c) => c.id))
  const linkable = customerContacts.filter((c) => !linkedIds.has(c.id))
  const addErrors = validateContactForm(draft)
  const canCreate = Object.keys(addErrors).length === 0 && !creating

  /** Link an already-existing customer contact; persists immediately. */
  async function handleLink() {
    if (selectedId === '' || linking) return
    const contact = customerContacts.find((c) => c.id === selectedId)
    if (!contact) return
    const previous = linked
    const desired = [...linked.map((c) => c.id), contact.id]
    setLinking(true)
    setError(null)
    setLinked([...linked, contact].sort(byName))
    setSelectedId('')
    try {
      await saveProjectContacts(writeProjectContacts, projectId, desired)
    } catch (e: unknown) {
      setLinked(previous)
      setError(e instanceof Error ? e.message : 'Could not link the contact.')
    } finally {
      setLinking(false)
    }
  }

  /** Create a new contact under the customer and link it in one action. */
  async function handleCreate() {
    if (!canCreate) return
    setCreating(true)
    setError(null)
    try {
      const created = await createContact(
        (record) => Csa_contactsService.create(record),
        customerId,
        draft,
      )
      setCustomerContacts((prev) => [...prev, created].sort(byName))
      setDraft(newContactForm())
      const previous = linked
      const desired = [...linked.map((c) => c.id), created.id]
      setLinked((prev) => [...prev, created].sort(byName))
      try {
        await saveProjectContacts(writeProjectContacts, projectId, desired)
      } catch (e: unknown) {
        setLinked(previous)
        setError(
          e instanceof Error
            ? `Contact created but could not be linked: ${e.message}`
            : 'Contact created but could not be linked.',
        )
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not create the contact.')
    } finally {
      setCreating(false)
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
    const apply = (list: Contact[]) =>
      list.map((c) => (c.id === contactId ? { ...c, ...next } : c)).sort(byName)
    setLinked(apply)
    setCustomerContacts(apply)
  }

  /** Unlink (detach) a contact from the project; persists immediately. */
  async function handleUnlink(contact: Contact) {
    if (busyId) return
    const previous = linked
    const desired = linked.filter((c) => c.id !== contact.id).map((c) => c.id)
    setBusyId(contact.id)
    setError(null)
    setLinked(linked.filter((c) => c.id !== contact.id))
    try {
      await saveProjectContacts(writeProjectContacts, projectId, desired)
    } catch (e: unknown) {
      setLinked(previous)
      setError(e instanceof Error ? e.message : 'Could not unlink the contact.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Box
      component="section"
      aria-label="Project contacts"
      sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      <Typography variant="subtitle1" component="h3">
        Contacts
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <TextField
          select
          size="small"
          label="Link existing contact"
          value={selectedId}
          sx={{ minWidth: 220 }}
          disabled={linkable.length === 0}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {linkable.length === 0 ? (
            <MenuItem value="" disabled>
              No contacts to link
            </MenuItem>
          ) : (
            linkable.map((contact) => (
              <MenuItem key={contact.id} value={contact.id}>
                {contact.name}
              </MenuItem>
            ))
          )}
        </TextField>
        <Button
          type="button"
          variant="outlined"
          onClick={() => void handleLink()}
          disabled={selectedId === '' || linking}
          sx={{ mt: 0.5 }}
        >
          {linking ? 'Linking…' : 'Link'}
        </Button>
      </Stack>
      <Stack spacing={1} sx={{ mb: 1 }}>
        <TextField
          size="small"
          label="New contact name"
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
          onClick={() => void handleCreate()}
          disabled={!canCreate}
          sx={{ alignSelf: 'flex-start' }}
        >
          {creating ? 'Creating…' : 'Create & Link Contact'}
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading contacts…
        </Typography>
      ) : (
        <ContactsTable
          contacts={linked}
          onSaveEdit={handleSaveEdit}
          onRemove={(contact) => void handleUnlink(contact)}
          removeLabel="Unlink"
          removeIcon={<LinkOffIcon fontSize="small" />}
          busyId={busyId}
        />
      )}
    </Box>
  )
}

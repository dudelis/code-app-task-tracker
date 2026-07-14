import { useState } from 'react'
import type { ReactNode } from 'react'
import IconButton from '@mui/material/IconButton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/Edit'
import {
  contactToForm,
  newContactForm,
  validateContactForm,
  type Contact,
  type ContactFormValues,
} from '../data/contacts'

/**
 * Shared presentational table of contacts, reused by the Customer pane
 * (delete rows) and the Project pane (unlink rows). Renders one row per contact
 * with every field (name, role, email, phone), a per-row inline edit that
 * writes through `onSaveEdit`, and a per-row destructive action whose verb and
 * icon are supplied by the container (`removeLabel`/`removeIcon`, e.g. Delete or
 * Unlink) so the two containers differ only in that action (see ADR-0005). The
 * container owns confirmation and the actual write behind `onRemove`.
 */
export function ContactsTable({
  contacts,
  onSaveEdit,
  onRemove,
  removeLabel,
  removeIcon,
  busyId = null,
}: {
  contacts: Contact[]
  onSaveEdit: (contactId: string, values: ContactFormValues) => Promise<void>
  onRemove: (contact: Contact) => void
  removeLabel: string
  removeIcon: ReactNode
  busyId?: string | null
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ContactFormValues>(() => newContactForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = validateContactForm(draft)
  const canSave = Object.keys(errors).length === 0

  function startEdit(contact: Contact) {
    setEditingId(contact.id)
    setDraft(contactToForm(contact))
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setError(null)
  }

  async function handleSave(id: string) {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSaveEdit(id, draft)
      setEditingId(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save the contact.')
    } finally {
      setSaving(false)
    }
  }

  if (contacts.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No contacts yet.
      </Typography>
    )
  }

  return (
    <>
      <Table size="small" aria-label="Contacts">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Phone</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {contacts.map((contact) => {
            const editing = editingId === contact.id
            const busy = busyId === contact.id
            return (
              <TableRow key={contact.id} hover>
                {editing ? (
                  <>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        value={draft.name}
                        required
                        error={Boolean(errors.name)}
                        aria-label="Contact name"
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        value={draft.role}
                        aria-label="Contact role"
                        onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        value={draft.email}
                        aria-label="Contact email"
                        onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        value={draft.phone}
                        aria-label="Contact phone"
                        onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Save">
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Save ${contact.name}`}
                            disabled={!canSave || saving}
                            onClick={() => void handleSave(contact.id)}
                          >
                            <CheckIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Cancel">
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Cancel editing ${contact.name}`}
                            disabled={saving}
                            onClick={cancelEdit}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>{contact.name}</TableCell>
                    <TableCell>{contact.role || '\u2014'}</TableCell>
                    <TableCell>{contact.email || '\u2014'}</TableCell>
                    <TableCell>{contact.phone || '\u2014'}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Edit ${contact.name}`}
                            disabled={editingId !== null || busy}
                            onClick={() => startEdit(contact)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={removeLabel}>
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`${removeLabel} ${contact.name}`}
                            disabled={editingId !== null || busy}
                            onClick={() => onRemove(contact)}
                          >
                            {removeIcon}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {error && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </>
  )
}

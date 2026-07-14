import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { isDeleteConfirmed } from '../data/deletion'

/**
 * The typed-name hard-delete confirmation (ADR-0002) re-skinned as an MUI
 * Dialog: the Delete button stays disabled until the user types the record's
 * exact name (`isDeleteConfirmed`). On confirm it runs the caller's cascade
 * (`onConfirm`), which deletes the whole subtree before the record itself;
 * errors keep the dialog open so the destructive action is never lost silently.
 */
export function HardDeleteDialog({
  entity,
  name,
  description,
  onCancel,
  onConfirm,
}: {
  entity: string
  name: string
  description: string
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lower = entity.toLowerCase()
  const confirmed = isDeleteConfirmed(typed, name)

  async function handleConfirm() {
    if (!confirmed || deleting) return
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
    } catch (e: unknown) {
      setDeleting(false)
      setError(e instanceof Error ? e.message : `Could not delete the ${lower}.`)
    }
  }

  return (
    <Dialog open onClose={deleting ? undefined : onCancel} aria-labelledby="hard-delete-title">
      <DialogTitle id="hard-delete-title">Delete {entity}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Type <strong>{name}</strong> to permanently delete this {lower} and everything under it
          ({description}). This cannot be undone.
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label={`${entity} name`}
          value={typed}
          aria-label={`Type the ${lower} name to confirm deletion`}
          onChange={(event) => setTyped(event.target.value)}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={deleting}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          disabled={!confirmed || deleting}
          onClick={handleConfirm}
        >
          {deleting ? 'Deleting…' : `Delete ${entity}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

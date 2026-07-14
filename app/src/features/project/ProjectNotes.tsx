import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  createProjectNote,
  deleteProjectNote,
  fetchProjectNotes,
  type ProjectNote,
} from '../../data/projectNotes'
import { Csa_projectnotesService } from '../../generated/services/Csa_projectnotesService'

/** Format a note's ISO timestamp for display, falling back to the raw string. */
function formatNoteTime(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/**
 * The dated note timeline for a project: a composer to add a new note and the
 * accumulated notes shown newest-first as one chronological timeline. Project
 * notes are recorded directly against the project (separate from task Notes);
 * loading, creating, and deleting all go through the project-notes data-access
 * seam. Mirrors {@link TaskNotes} for the task timeline.
 */
export function ProjectNotes({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<ProjectNote[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchProjectNotes((options) => Csa_projectnotesService.getAll(options), projectId)
      .then((loaded) => {
        if (!cancelled) {
          setNotes(loaded)
          setLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load notes.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const canAdd = draft.trim() !== '' && !adding

  async function handleAdd() {
    if (!canAdd) return
    setAdding(true)
    setError(null)
    try {
      await createProjectNote(
        (record) => Csa_projectnotesService.create(record),
        projectId,
        draft,
      )
      const refreshed = await fetchProjectNotes(
        (options) => Csa_projectnotesService.getAll(options),
        projectId,
      )
      setNotes(refreshed)
      setDraft('')
      setAdding(false)
    } catch (e: unknown) {
      setAdding(false)
      setError(e instanceof Error ? e.message : 'Could not add the note.')
    }
  }

  /** Delete a single note behind a plain confirm without affecting the others. */
  async function handleDeleteNote(id: string) {
    if (deletingId) return
    if (!window.confirm('Delete this note?')) return
    setDeletingId(id)
    setError(null)
    try {
      await deleteProjectNote((noteId) => Csa_projectnotesService.delete(noteId), id)
      setNotes((prev) => prev.filter((note) => note.id !== id))
      setDeletingId(null)
    } catch (e: unknown) {
      setDeletingId(null)
      setError(e instanceof Error ? e.message : 'Could not delete the note.')
    }
  }

  return (
    <Box
      component="section"
      aria-label="Project notes"
      sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      <Typography variant="subtitle1" component="h3">
        Notes
      </Typography>
      <TextField
        multiline
        minRows={3}
        placeholder="Add a note…"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button
        type="button"
        variant="outlined"
        onClick={handleAdd}
        disabled={!canAdd}
        sx={{ alignSelf: 'flex-start' }}
      >
        {adding ? 'Adding…' : 'Add Note'}
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading notes…
        </Typography>
      ) : notes.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No notes yet.
        </Typography>
      ) : (
        <Stack component="ol" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {notes.map((note) => (
            <Box component="li" key={note.id}>
              <Stack
                direction="row"
                sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}
              >
                <Typography variant="caption" color="text.secondary">
                  {formatNoteTime(note.createdOn)}
                </Typography>
                <Button
                  type="button"
                  size="small"
                  color="error"
                  aria-label="Delete note"
                  disabled={deletingId === note.id}
                  onClick={() => void handleDeleteNote(note.id)}
                >
                  {deletingId === note.id ? 'Deleting…' : 'Delete'}
                </Button>
              </Stack>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {note.text}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  )
}

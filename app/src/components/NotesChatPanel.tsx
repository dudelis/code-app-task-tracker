import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DeleteIcon from '@mui/icons-material/Delete'
import SendIcon from '@mui/icons-material/Send'
import type { Note } from '../data/notes'

/** Format a note's ISO timestamp for display, falling back to the raw string. */
function formatNoteTime(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export interface NotesChatPanelProps {
  /** Notes to render, already ordered oldest-first (newest last / at the bottom). */
  notes: ReadonlyArray<Note>
  /** True while the initial notes load is in flight. */
  loading: boolean
  /** A load/mutation error to surface, or null. */
  error: string | null
  /**
   * Persist a new note. Receives the trimmed text; the panel clears its composer
   * only after this resolves. Empty/whitespace input is ignored before this runs.
   */
  onSend: (text: string) => void | Promise<void>
  /** Delete a single note by id. */
  onDelete: (id: string) => void | Promise<void>
  /** True while a send is in flight (disables the composer). */
  sending?: boolean
  /** Id of the note currently being deleted, or null. */
  deletingId?: string | null
}

/**
 * Reusable chat-style notes panel (presentational). Renders an oldest-first note
 * list — newest at the bottom — in an independently scrollable region that
 * auto-scrolls to the newest note on mount and whenever the list grows, above a
 * pinned composer with an icon send button. Enter inserts a newline and never
 * sends (send is the explicit icon button only); empty/whitespace input is
 * ignored. Per-note delete is exposed via an icon button.
 *
 * Data-agnostic: both the Task container (`Csa_notesService`) and the Project
 * container (`Csa_projectnotesService`) supply their own notes and
 * onSend/onDelete seam.
 */
export function NotesChatPanel({
  notes,
  loading,
  error,
  onSend,
  onDelete,
  sending = false,
  deletingId = null,
}: NotesChatPanelProps) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-scroll the list to the bottom on mount and whenever a note is added or
  // removed, so the newest note is always in view in this bottom-anchored chat.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [notes.length])

  const canSend = draft.trim() !== '' && !sending

  async function handleSend() {
    if (draft.trim() === '' || sending) return
    await onSend(draft)
    setDraft('')
  }

  return (
    <Box
      component="section"
      aria-label="Notes"
      sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}
    >
      <Typography
        variant="subtitle1"
        component="h3"
        sx={{ px: 2, py: 1.5, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}
      >
        Notes
      </Typography>
      <Box ref={listRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
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
                  <IconButton
                    size="small"
                    color="error"
                    aria-label="Delete note"
                    disabled={deletingId === note.id}
                    onClick={() => void onDelete(note.id)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {note.text}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
      {error && (
        <Alert severity="error" sx={{ mx: 2, flexShrink: 0 }}>
          {error}
        </Alert>
      )}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'flex-end',
          p: 2,
          flexShrink: 0,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <TextField
          fullWidth
          multiline
          maxRows={6}
          size="small"
          placeholder="Write a note…"
          value={draft}
          disabled={sending}
          onChange={(event) => setDraft(event.target.value)}
        />
        <IconButton
          color="primary"
          aria-label="Send note"
          disabled={!canSend}
          onClick={() => void handleSend()}
        >
          <SendIcon />
        </IconButton>
      </Stack>
    </Box>
  )
}

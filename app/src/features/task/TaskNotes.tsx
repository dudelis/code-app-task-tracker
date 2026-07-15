import { useEffect, useState } from 'react'
import {
  createNote,
  deleteNote,
  fetchTaskNotesOldestFirst,
  type Note,
} from '../../data/notes'
import { Csa_notesService } from '../../generated/services/Csa_notesService'
import { NotesChatPanel } from '../../components/NotesChatPanel'

/**
 * Task notes container: loads a task's notes oldest-first (chat order) through
 * the notes data-access seam and renders them in the reusable
 * {@link NotesChatPanel}. Sending persists immediately (notes are never at risk
 * on dialog close); per-note delete removes a single entry behind a confirm.
 */
export function TaskNotes({ taskId }: { taskId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTaskNotesOldestFirst((options) => Csa_notesService.getAll(options), taskId)
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
  }, [taskId])

  async function handleSend(text: string) {
    if (text.trim() === '' || sending) return
    setSending(true)
    setError(null)
    try {
      await createNote((record) => Csa_notesService.create(record), taskId, text)
      const refreshed = await fetchTaskNotesOldestFirst(
        (options) => Csa_notesService.getAll(options),
        taskId,
      )
      setNotes(refreshed)
      setSending(false)
    } catch (e: unknown) {
      setSending(false)
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
      await deleteNote((noteId) => Csa_notesService.delete(noteId), id)
      setNotes((prev) => prev.filter((note) => note.id !== id))
      setDeletingId(null)
    } catch (e: unknown) {
      setDeletingId(null)
      setError(e instanceof Error ? e.message : 'Could not delete the note.')
    }
  }

  return (
    <NotesChatPanel
      notes={notes}
      loading={loading}
      error={error}
      sending={sending}
      deletingId={deletingId}
      onSend={handleSend}
      onDelete={handleDeleteNote}
    />
  )
}

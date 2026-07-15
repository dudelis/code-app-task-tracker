import { useEffect, useState } from 'react'
import {
  createProjectNote,
  deleteProjectNote,
  fetchProjectNotesOldestFirst,
  type ProjectNote,
} from '../../data/projectNotes'
import { Csa_projectnotesService } from '../../generated/services/Csa_projectnotesService'
import { NotesChatPanel } from '../../components/NotesChatPanel'

/**
 * Project notes container: loads a project's notes oldest-first (chat order)
 * through the project-notes data-access seam and renders them in the reusable
 * {@link NotesChatPanel}. Sending persists immediately (notes are never at risk
 * on dialog close); per-note delete removes a single entry behind a confirm.
 * Mirrors {@link TaskNotes} for the task timeline.
 */
export function ProjectNotes({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<ProjectNote[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchProjectNotesOldestFirst(
      (options) => Csa_projectnotesService.getAll(options),
      projectId,
    )
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

  async function handleSend(text: string) {
    if (text.trim() === '' || sending) return
    setSending(true)
    setError(null)
    try {
      await createProjectNote(
        (record) => Csa_projectnotesService.create(record),
        projectId,
        text,
      )
      const refreshed = await fetchProjectNotesOldestFirst(
        (options) => Csa_projectnotesService.getAll(options),
        projectId,
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
      await deleteProjectNote((noteId) => Csa_projectnotesService.delete(noteId), id)
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

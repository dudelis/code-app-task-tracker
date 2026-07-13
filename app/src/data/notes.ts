import type { Csa_notes, Csa_notesBase } from '../generated/models/Csa_notesModel';
import type { IGetAllOptions } from '../generated/models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';

/**
 * A Note as consumed by the UI — a thin, stable projection of the generated
 * Dataverse model so components never depend on raw `csa_*` field names. A note
 * is a single dated entry recorded against a task; notes accumulate as separate
 * timestamped records but are shown together as one chronological timeline.
 */
export interface Note {
  id: string;
  /** The note body (`csa_text`). */
  text: string;
  /** Creation timestamp (`createdon`, ISO 8601), or '' when unset. */
  createdOn: string;
}

/** OData filter that returns the notes recorded against a single task. */
export function taskNotesFilter(taskId: string): string {
  return `_csa_taskid_value eq ${taskId}`;
}

/**
 * Order clause for the task notes read. Newest-first mirrors the Dynamics
 * timeline convention; the same order is re-applied client-side (see
 * `selectNotesNewestFirst`) as defense in depth.
 */
export const NOTES_ORDER_BY = ['createdon desc'];

/** Map a raw Dataverse record to the UI-facing Note shape. */
export function mapNote(record: Csa_notes): Note {
  return {
    id: record.csa_noteid,
    text: record.csa_text ?? '',
    createdOn: record.createdon ?? '',
  };
}

/**
 * Project records to the UI shape and order them newest-first by creation time.
 * ISO 8601 timestamps sort lexicographically in chronological order, so a string
 * comparison is sufficient; records with no timestamp sort last.
 */
export function selectNotesNewestFirst(records: Csa_notes[]): Note[] {
  return records
    .map(mapNote)
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn));
}

/**
 * Signature of the generated `Csa_notesService.getAll`. Injected so the
 * data-access seam can be exercised without importing the Power Apps runtime.
 */
export type NotesFetcher = (
  options?: IGetAllOptions,
) => Promise<IOperationResult<Csa_notes[]>>;

/**
 * Read a task's notes through the data-access seam as one newest-first timeline.
 * Requests the ordered set from Dataverse and re-sorts client-side so the UI
 * order is deterministic regardless of the source order.
 */
export async function fetchTaskNotes(
  fetch: NotesFetcher,
  taskId: string,
): Promise<Note[]> {
  const result = await fetch({
    filter: taskNotesFilter(taskId),
    orderBy: NOTES_ORDER_BY,
  });
  return selectNotesNewestFirst(result.data ?? []);
}

/**
 * Signature of the generated `Csa_notesService.create`. Injected so the write
 * seam can be exercised without importing the Power Apps runtime.
 */
export type NoteCreator = (
  record: Omit<Csa_notesBase, 'csa_noteid'>,
) => Promise<IOperationResult<Csa_notes>>;

/** Build the `@odata.bind` reference that parents a new note to its task. */
export function taskBind(taskId: string): string {
  return `/csa_tasks(${taskId})`;
}

/**
 * Add a note to a task through the write seam and return the UI projection. The
 * text is trimmed; the note is parented to the task via `@odata.bind`. The
 * server-assigned id and timestamp come back on the created record; the trimmed
 * text is used as a fallback when the server does not echo it.
 */
export async function createNote(
  create: NoteCreator,
  taskId: string,
  text: string,
): Promise<Note> {
  const trimmed = text.trim();
  const result = await create({
    csa_text: trimmed,
    'csa_TaskId@odata.bind': taskBind(taskId),
  } as Omit<Csa_notesBase, 'csa_noteid'>);
  return {
    id: result.data?.csa_noteid ?? '',
    text: result.data?.csa_text ?? trimmed,
    createdOn: result.data?.createdon ?? '',
  };
}

/**
 * Signature of the generated `Csa_notesService.delete`. Injected so the delete
 * seam can be exercised without importing the Power Apps runtime.
 */
export type NoteDeleter = (id: string) => Promise<void>;

/**
 * Permanently delete a single note through the seam (hard delete per ADR-0002).
 * Used by the task timeline to remove one entry without touching the others.
 */
export async function deleteNote(remove: NoteDeleter, id: string): Promise<void> {
  await remove(id);
}

/**
 * Delete every note belonging to a task: read the task's notes through the fetch
 * seam, then delete each through the delete seam. Returns the deleted note ids.
 *
 * Reusable Task-subtree cleanup — the Task cascade (and, later, the Customer and
 * Project cascades) compose this to remove a task's note children before the
 * task itself, so no orphaned notes remain.
 */
export async function deleteTaskNotes(
  fetch: NotesFetcher,
  remove: NoteDeleter,
  taskId: string,
): Promise<string[]> {
  const notes = await fetchTaskNotes(fetch, taskId);
  for (const note of notes) {
    await remove(note.id);
  }
  return notes.map((note) => note.id);
}

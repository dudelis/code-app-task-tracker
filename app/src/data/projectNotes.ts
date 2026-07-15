import type {
  Csa_projectnotes,
  Csa_projectnotesBase,
} from '../generated/models/Csa_projectnotesModel';
import type { IGetAllOptions } from '../generated/models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';

/**
 * A Project Note as consumed by the UI — a thin, stable projection of the
 * generated Dataverse model so components never depend on raw `csa_*` field
 * names. A Project Note is a single dated entry recorded directly against a
 * Project (its own table, separate from task-scoped Notes); entries accumulate
 * as timestamped records shown together as one chronological timeline.
 */
export interface ProjectNote {
  id: string;
  /** The note body (`csa_text`). */
  text: string;
  /** Creation timestamp (`createdon`, ISO 8601), or '' when unset. */
  createdOn: string;
}

/** OData filter that returns the notes recorded against a single project. */
export function projectNotesFilter(projectId: string): string {
  return `_csa_projectid_value eq ${projectId}`;
}

/**
 * Order clause for the project notes read. Newest-first mirrors the Dynamics
 * timeline convention; the same order is re-applied client-side (see
 * `selectProjectNotesNewestFirst`) as defense in depth.
 */
export const PROJECT_NOTES_ORDER_BY = ['createdon desc'];

/**
 * Order clause for reading a project's notes oldest-first (chat order). Paired
 * with `selectProjectNotesOldestFirst`, which re-applies the same order
 * client-side.
 */
export const PROJECT_NOTES_ORDER_BY_OLDEST = ['createdon asc'];

/** Map a raw Dataverse record to the UI-facing ProjectNote shape. */
export function mapProjectNote(record: Csa_projectnotes): ProjectNote {
  return {
    id: record.csa_projectnoteid,
    text: record.csa_text ?? '',
    createdOn: record.createdon ?? '',
  };
}

/**
 * Project records to the UI shape and order them newest-first by creation time.
 * ISO 8601 timestamps sort lexicographically in chronological order, so a string
 * comparison is sufficient; records with no timestamp sort last.
 */
export function selectProjectNotesNewestFirst(records: Csa_projectnotes[]): ProjectNote[] {
  return records
    .map(mapProjectNote)
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn));
}

/**
 * Project records to the UI shape and order them oldest-first by creation time —
 * the chat convention, with the newest note last so it lands at the bottom of a
 * bottom-anchored, auto-scrolling notes panel. ISO 8601 timestamps sort
 * lexicographically in chronological order, so a string comparison suffices;
 * records with no timestamp sort first (they read as the earliest entries).
 */
export function selectProjectNotesOldestFirst(records: Csa_projectnotes[]): ProjectNote[] {
  return records
    .map(mapProjectNote)
    .sort((a, b) => a.createdOn.localeCompare(b.createdOn));
}

/**
 * Signature of the generated `Csa_projectnotesService.getAll`. Injected so the
 * data-access seam can be exercised without importing the Power Apps runtime.
 */
export type ProjectNotesFetcher = (
  options?: IGetAllOptions,
) => Promise<IOperationResult<Csa_projectnotes[]>>;

/**
 * Read a project's notes through the data-access seam as one newest-first
 * timeline. Requests the ordered set from Dataverse and re-sorts client-side so
 * the UI order is deterministic regardless of the source order.
 */
export async function fetchProjectNotes(
  fetch: ProjectNotesFetcher,
  projectId: string,
): Promise<ProjectNote[]> {
  const result = await fetch({
    filter: projectNotesFilter(projectId),
    orderBy: PROJECT_NOTES_ORDER_BY,
  });
  return selectProjectNotesNewestFirst(result.data ?? []);
}

/**
 * Read a project's notes through the data-access seam as one oldest-first (chat)
 * timeline: newest note last. Requests the ascending set from Dataverse and
 * re-sorts client-side so the UI order is deterministic regardless of source
 * order. Used by the chat-style notes panel, which anchors to the bottom.
 */
export async function fetchProjectNotesOldestFirst(
  fetch: ProjectNotesFetcher,
  projectId: string,
): Promise<ProjectNote[]> {
  const result = await fetch({
    filter: projectNotesFilter(projectId),
    orderBy: PROJECT_NOTES_ORDER_BY_OLDEST,
  });
  return selectProjectNotesOldestFirst(result.data ?? []);
}

/**
 * Signature of the generated `Csa_projectnotesService.create`. Injected so the
 * write seam can be exercised without importing the Power Apps runtime.
 */
export type ProjectNoteCreator = (
  record: Omit<Csa_projectnotesBase, 'csa_projectnoteid'>,
) => Promise<IOperationResult<Csa_projectnotes>>;

/** Build the `@odata.bind` reference that parents a new project note to its project. */
export function projectBind(projectId: string): string {
  return `/csa_projects(${projectId})`;
}

/**
 * Add a note to a project through the write seam and return the UI projection.
 * The text is trimmed; the note is parented to the project via `@odata.bind`.
 * The server-assigned id and timestamp come back on the created record; the
 * trimmed text is used as a fallback when the server does not echo it.
 */
export async function createProjectNote(
  create: ProjectNoteCreator,
  projectId: string,
  text: string,
): Promise<ProjectNote> {
  const trimmed = text.trim();
  const result = await create({
    csa_text: trimmed,
    'csa_ProjectId@odata.bind': projectBind(projectId),
  } as Omit<Csa_projectnotesBase, 'csa_projectnoteid'>);
  return {
    id: result.data?.csa_projectnoteid ?? '',
    text: result.data?.csa_text ?? trimmed,
    createdOn: result.data?.createdon ?? '',
  };
}

/**
 * Signature of the generated `Csa_projectnotesService.delete`. Injected so the
 * delete seam can be exercised without importing the Power Apps runtime.
 */
export type ProjectNoteDeleter = (id: string) => Promise<void>;

/**
 * Permanently delete a single project note through the seam (hard delete per
 * ADR-0002). Used by the project timeline to remove one entry.
 */
export async function deleteProjectNote(
  remove: ProjectNoteDeleter,
  id: string,
): Promise<void> {
  await remove(id);
}

/**
 * Delete every note belonging to a project: read the project's notes through the
 * fetch seam, then delete each through the delete seam. Returns the deleted ids.
 *
 * Reusable Project-subtree cleanup — the Project cascade composes this to remove
 * the project's note children before the project itself, so no orphaned project
 * notes remain.
 */
export async function deleteProjectNotes(
  fetch: ProjectNotesFetcher,
  remove: ProjectNoteDeleter,
  projectId: string,
): Promise<string[]> {
  const notes = await fetchProjectNotes(fetch, projectId);
  for (const note of notes) {
    await remove(note.id);
  }
  return notes.map((note) => note.id);
}

import { describe, expect, it, vi } from 'vitest';
import type { Csa_notes } from '../generated/models/Csa_notesModel';
import type { IOperationResult } from '@microsoft/power-apps/data';
import {
  NOTES_ORDER_BY,
  createNote,
  deleteNote,
  deleteTaskNotes,
  fetchTaskNotes,
  mapNote,
  selectNotesNewestFirst,
  taskBind,
  taskNotesFilter,
  type NoteCreator,
  type NoteDeleter,
  type NotesFetcher,
} from './notes';

function record(partial: Partial<Csa_notes>): Csa_notes {
  return { csa_noteid: 'id', statecode: 0, ...partial } as Csa_notes;
}

function okList(data: Csa_notes[]): IOperationResult<Csa_notes[]> {
  return { data } as IOperationResult<Csa_notes[]>;
}

function okOne(data: Csa_notes): IOperationResult<Csa_notes> {
  return { data } as IOperationResult<Csa_notes>;
}

describe('mapNote', () => {
  it('projects a record to the UI shape', () => {
    expect(
      mapNote(
        record({ csa_noteid: 'a', csa_text: 'Hello', createdon: '2026-07-13T10:00:00Z' }),
      ),
    ).toEqual({ id: 'a', text: 'Hello', createdOn: '2026-07-13T10:00:00Z' });
  });

  it('treats a missing text and timestamp as empty', () => {
    expect(mapNote(record({ csa_noteid: 'x' }))).toEqual({
      id: 'x',
      text: '',
      createdOn: '',
    });
  });
});

describe('selectNotesNewestFirst', () => {
  it('orders notes newest-first by creation time', () => {
    const records = [
      record({ csa_noteid: 'old', csa_text: 'first', createdon: '2026-07-10T09:00:00Z' }),
      record({ csa_noteid: 'new', csa_text: 'third', createdon: '2026-07-12T09:00:00Z' }),
      record({ csa_noteid: 'mid', csa_text: 'second', createdon: '2026-07-11T09:00:00Z' }),
    ];

    expect(selectNotesNewestFirst(records).map((n) => n.id)).toEqual(['new', 'mid', 'old']);
  });

  it('sorts records with no timestamp last', () => {
    const records = [
      record({ csa_noteid: 'none', csa_text: 'undated' }),
      record({ csa_noteid: 'dated', csa_text: 'dated', createdon: '2026-07-11T09:00:00Z' }),
    ];

    expect(selectNotesNewestFirst(records).map((n) => n.id)).toEqual(['dated', 'none']);
  });
});

describe('taskNotesFilter', () => {
  it('filters notes to a single parent task', () => {
    expect(taskNotesFilter('t-1')).toBe('_csa_taskid_value eq t-1');
  });
});

describe('taskBind', () => {
  it('builds the parent-task odata bind reference', () => {
    expect(taskBind('t-1')).toBe('/csa_tasks(t-1)');
  });
});

describe('fetchTaskNotes', () => {
  it('reads a task timeline through the seam, ordered newest-first', async () => {
    const fetch: NotesFetcher = vi.fn(async () =>
      okList([
        record({ csa_noteid: 'old', createdon: '2026-07-10T09:00:00Z' }),
        record({ csa_noteid: 'new', createdon: '2026-07-12T09:00:00Z' }),
      ]),
    );

    const notes = await fetchTaskNotes(fetch, 't-1');

    expect(fetch).toHaveBeenCalledWith({
      filter: taskNotesFilter('t-1'),
      orderBy: NOTES_ORDER_BY,
    });
    expect(notes.map((n) => n.id)).toEqual(['new', 'old']);
  });

  it('returns an empty timeline when the data source returns no data', async () => {
    const fetch: NotesFetcher = vi.fn(async () => ({}) as IOperationResult<Csa_notes[]>);
    expect(await fetchTaskNotes(fetch, 't-1')).toEqual([]);
  });
});

describe('createNote', () => {
  it('creates a note through the seam, trimmed and parented to the task', async () => {
    const create: NoteCreator = vi.fn(async () =>
      okOne(
        record({
          csa_noteid: 'n-1',
          csa_text: 'Called the customer',
          createdon: '2026-07-13T10:00:00Z',
        }),
      ),
    );

    const note = await createNote(create, 't-1', '  Called the customer  ');

    expect(create).toHaveBeenCalledWith({
      csa_text: 'Called the customer',
      'csa_TaskId@odata.bind': '/csa_tasks(t-1)',
    });
    expect(note).toEqual({
      id: 'n-1',
      text: 'Called the customer',
      createdOn: '2026-07-13T10:00:00Z',
    });
  });

  it('falls back to the submitted text when the server does not echo it', async () => {
    const create: NoteCreator = vi.fn(async () => okOne(record({ csa_noteid: 'n-2' })));

    const note = await createNote(create, 't-1', 'Draft note');

    expect(note).toEqual({ id: 'n-2', text: 'Draft note', createdOn: '' });
  });
});

describe('deleteNote', () => {
  it('deletes a single note through the seam', async () => {
    const remove: NoteDeleter = vi.fn(async () => undefined);

    await deleteNote(remove, 'n-1');

    expect(remove).toHaveBeenCalledWith('n-1');
  });
});

describe('deleteTaskNotes', () => {
  it('reads a task\'s notes then deletes each, returning the deleted ids', async () => {
    const fetch: NotesFetcher = vi.fn(async () =>
      okList([
        record({ csa_noteid: 'old', createdon: '2026-07-10T09:00:00Z' }),
        record({ csa_noteid: 'new', createdon: '2026-07-12T09:00:00Z' }),
      ]),
    );
    const remove: NoteDeleter = vi.fn(async () => undefined);

    const deleted = await deleteTaskNotes(fetch, remove, 't-1');

    expect(fetch).toHaveBeenCalledWith({
      filter: taskNotesFilter('t-1'),
      orderBy: NOTES_ORDER_BY,
    });
    // Every child note is deleted (newest-first order from the read).
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenNthCalledWith(1, 'new');
    expect(remove).toHaveBeenNthCalledWith(2, 'old');
    expect(deleted).toEqual(['new', 'old']);
  });

  it('is a no-op when the task has no notes', async () => {
    const fetch: NotesFetcher = vi.fn(async () => okList([]));
    const remove: NoteDeleter = vi.fn(async () => undefined);

    const deleted = await deleteTaskNotes(fetch, remove, 't-1');

    expect(remove).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { Csa_projectnotes } from '../generated/models/Csa_projectnotesModel';
import type { IOperationResult } from '@microsoft/power-apps/data';
import {
  PROJECT_NOTES_ORDER_BY,
  PROJECT_NOTES_ORDER_BY_OLDEST,
  createProjectNote,
  deleteProjectNote,
  deleteProjectNotes,
  fetchProjectNotes,
  fetchProjectNotesOldestFirst,
  mapProjectNote,
  projectBind,
  projectNotesFilter,
  selectProjectNotesNewestFirst,
  selectProjectNotesOldestFirst,
  type ProjectNoteCreator,
  type ProjectNoteDeleter,
  type ProjectNotesFetcher,
} from './projectNotes';

function record(partial: Partial<Csa_projectnotes>): Csa_projectnotes {
  return { csa_projectnoteid: 'pn', ...partial } as Csa_projectnotes;
}

function okList(data: Csa_projectnotes[]): IOperationResult<Csa_projectnotes[]> {
  return { data } as IOperationResult<Csa_projectnotes[]>;
}

function okOne(data: Csa_projectnotes): IOperationResult<Csa_projectnotes> {
  return { data } as IOperationResult<Csa_projectnotes>;
}

describe('mapProjectNote', () => {
  it('projects the id, text, and creation timestamp', () => {
    expect(
      mapProjectNote(
        record({ csa_projectnoteid: 'pn-1', csa_text: 'Kickoff', createdon: '2026-07-13T10:00:00Z' }),
      ),
    ).toEqual({ id: 'pn-1', text: 'Kickoff', createdOn: '2026-07-13T10:00:00Z' });
  });

  it('defaults text and timestamp to empty strings when absent', () => {
    expect(mapProjectNote(record({ csa_projectnoteid: 'pn-2' }))).toEqual({
      id: 'pn-2',
      text: '',
      createdOn: '',
    });
  });
});

describe('projectNotesFilter', () => {
  it('filters project notes to a single parent project', () => {
    expect(projectNotesFilter('p-1')).toBe('_csa_projectid_value eq p-1');
  });
});

describe('projectBind', () => {
  it('builds the parent-project odata bind reference', () => {
    expect(projectBind('p-1')).toBe('/csa_projects(p-1)');
  });
});

describe('selectProjectNotesNewestFirst', () => {
  it('orders notes newest-first by creation timestamp', () => {
    const notes = selectProjectNotesNewestFirst([
      record({ csa_projectnoteid: 'old', createdon: '2026-07-10T09:00:00Z' }),
      record({ csa_projectnoteid: 'new', createdon: '2026-07-12T09:00:00Z' }),
    ]);
    expect(notes.map((n) => n.id)).toEqual(['new', 'old']);
  });
});

describe('selectProjectNotesOldestFirst', () => {
  it('orders notes oldest-first with the newest last', () => {
    const notes = selectProjectNotesOldestFirst([
      record({ csa_projectnoteid: 'new', createdon: '2026-07-12T09:00:00Z' }),
      record({ csa_projectnoteid: 'old', createdon: '2026-07-10T09:00:00Z' }),
      record({ csa_projectnoteid: 'mid', createdon: '2026-07-11T09:00:00Z' }),
    ]);
    expect(notes.map((n) => n.id)).toEqual(['old', 'mid', 'new']);
  });

  it('is deterministic regardless of the source order', () => {
    const ascending = [
      record({ csa_projectnoteid: 'old', createdon: '2026-07-10T09:00:00Z' }),
      record({ csa_projectnoteid: 'mid', createdon: '2026-07-11T09:00:00Z' }),
      record({ csa_projectnoteid: 'new', createdon: '2026-07-12T09:00:00Z' }),
    ];
    const descending = [...ascending].reverse();

    expect(selectProjectNotesOldestFirst(ascending).map((n) => n.id)).toEqual(
      selectProjectNotesOldestFirst(descending).map((n) => n.id),
    );
    expect(selectProjectNotesOldestFirst(descending).map((n) => n.id)).toEqual([
      'old',
      'mid',
      'new',
    ]);
  });

  it('sorts records with no timestamp first', () => {
    const notes = selectProjectNotesOldestFirst([
      record({ csa_projectnoteid: 'dated', createdon: '2026-07-11T09:00:00Z' }),
      record({ csa_projectnoteid: 'none' }),
    ]);
    expect(notes.map((n) => n.id)).toEqual(['none', 'dated']);
  });
});

describe('fetchProjectNotes', () => {
  it('reads a project timeline through the seam, filtered by project and newest-first', async () => {
    const fetch: ProjectNotesFetcher = vi.fn(async () =>
      okList([
        record({ csa_projectnoteid: 'old', createdon: '2026-07-10T09:00:00Z' }),
        record({ csa_projectnoteid: 'new', createdon: '2026-07-12T09:00:00Z' }),
      ]),
    );

    const notes = await fetchProjectNotes(fetch, 'p-1');

    expect(fetch).toHaveBeenCalledWith({
      filter: projectNotesFilter('p-1'),
      orderBy: PROJECT_NOTES_ORDER_BY,
    });
    expect(notes.map((n) => n.id)).toEqual(['new', 'old']);
  });

  it('returns an empty timeline when the data source returns no data', async () => {
    const fetch: ProjectNotesFetcher = vi.fn(
      async () => ({}) as IOperationResult<Csa_projectnotes[]>,
    );
    expect(await fetchProjectNotes(fetch, 'p-1')).toEqual([]);
  });
});

describe('fetchProjectNotesOldestFirst', () => {
  it('reads a project timeline through the seam, filtered by project and oldest-first', async () => {
    const fetch: ProjectNotesFetcher = vi.fn(async () =>
      okList([
        record({ csa_projectnoteid: 'new', createdon: '2026-07-12T09:00:00Z' }),
        record({ csa_projectnoteid: 'old', createdon: '2026-07-10T09:00:00Z' }),
      ]),
    );

    const notes = await fetchProjectNotesOldestFirst(fetch, 'p-1');

    expect(fetch).toHaveBeenCalledWith({
      filter: projectNotesFilter('p-1'),
      orderBy: PROJECT_NOTES_ORDER_BY_OLDEST,
    });
    expect(notes.map((n) => n.id)).toEqual(['old', 'new']);
  });

  it('returns an empty timeline when the data source returns no data', async () => {
    const fetch: ProjectNotesFetcher = vi.fn(
      async () => ({}) as IOperationResult<Csa_projectnotes[]>,
    );
    expect(await fetchProjectNotesOldestFirst(fetch, 'p-1')).toEqual([]);
  });
});

describe('createProjectNote', () => {
  it('creates a note through the seam, trimmed and parented to the project', async () => {
    const create: ProjectNoteCreator = vi.fn(async () =>
      okOne(
        record({
          csa_projectnoteid: 'pn-1',
          csa_text: 'Kicked off the project',
          createdon: '2026-07-13T10:00:00Z',
        }),
      ),
    );

    const note = await createProjectNote(create, 'p-1', '  Kicked off the project  ');

    expect(create).toHaveBeenCalledWith({
      csa_text: 'Kicked off the project',
      'csa_ProjectId@odata.bind': '/csa_projects(p-1)',
    });
    expect(note).toEqual({
      id: 'pn-1',
      text: 'Kicked off the project',
      createdOn: '2026-07-13T10:00:00Z',
    });
  });

  it('falls back to the submitted text when the server does not echo it', async () => {
    const create: ProjectNoteCreator = vi.fn(async () =>
      okOne(record({ csa_projectnoteid: 'pn-2' })),
    );

    const note = await createProjectNote(create, 'p-1', 'Draft note');

    expect(note).toEqual({ id: 'pn-2', text: 'Draft note', createdOn: '' });
  });
});

describe('deleteProjectNote', () => {
  it('deletes a single project note through the seam', async () => {
    const remove: ProjectNoteDeleter = vi.fn(async () => undefined);

    await deleteProjectNote(remove, 'pn-1');

    expect(remove).toHaveBeenCalledWith('pn-1');
  });
});

describe('deleteProjectNotes', () => {
  it('reads a project\'s notes then deletes each, returning the deleted ids', async () => {
    const fetch: ProjectNotesFetcher = vi.fn(async () =>
      okList([
        record({ csa_projectnoteid: 'old', createdon: '2026-07-10T09:00:00Z' }),
        record({ csa_projectnoteid: 'new', createdon: '2026-07-12T09:00:00Z' }),
      ]),
    );
    const remove: ProjectNoteDeleter = vi.fn(async () => undefined);

    const deleted = await deleteProjectNotes(fetch, remove, 'p-1');

    expect(fetch).toHaveBeenCalledWith({
      filter: projectNotesFilter('p-1'),
      orderBy: PROJECT_NOTES_ORDER_BY,
    });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenNthCalledWith(1, 'new');
    expect(remove).toHaveBeenNthCalledWith(2, 'old');
    expect(deleted).toEqual(['new', 'old']);
  });

  it('is a no-op when the project has no notes', async () => {
    const fetch: ProjectNotesFetcher = vi.fn(async () => okList([]));
    const remove: ProjectNoteDeleter = vi.fn(async () => undefined);

    const deleted = await deleteProjectNotes(fetch, remove, 'p-1');

    expect(remove).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
  });
});

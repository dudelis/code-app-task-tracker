import { describe, expect, it, vi } from 'vitest';
import type { Csa_tasks } from '../generated/models/Csa_tasksModel';
import type { IOperationResult } from '@microsoft/power-apps/data';
import {
  DONE_STATUS,
  NOT_DONE_TASKS_FILTER,
  fetchNotDoneTasks,
  isNotDone,
  mapTask,
  selectNotDoneTasks,
  type Task,
  type TasksFetcher,
} from './tasks';

function record(partial: Partial<Csa_tasks>): Csa_tasks {
  return { csa_taskid: 'id', statecode: 0, ...partial } as Csa_tasks;
}

function ok(data: Csa_tasks[]): IOperationResult<Csa_tasks[]> {
  return { data } as IOperationResult<Csa_tasks[]>;
}

describe('mapTask', () => {
  it('projects a record to the UI shape with a status label', () => {
    expect(
      mapTask(
        record({
          csa_taskid: 't1',
          csa_name: 'Draft proposal',
          csa_status: 100000002,
          _csa_projectid_value: 'p1',
          csa_sortorder: 3,
        }),
      ),
    ).toEqual({
      id: 't1',
      name: 'Draft proposal',
      status: 100000002,
      statusLabel: 'InProgress',
      projectId: 'p1',
      sortOrder: 3,
    });
  });

  it('defaults missing name, project, sort order, and status label', () => {
    expect(mapTask(record({ csa_taskid: 't2' }))).toEqual({
      id: 't2',
      name: '',
      status: undefined,
      statusLabel: '',
      projectId: '',
      sortOrder: 0,
    });
  });
});

describe('isNotDone', () => {
  function task(partial: Partial<Task>): Task {
    return { id: 't', name: '', statusLabel: '', projectId: '', sortOrder: 0, ...partial };
  }

  it('is false only for the Done status', () => {
    expect(isNotDone(task({ status: DONE_STATUS }))).toBe(false);
  });

  it('is true for every other status', () => {
    expect(isNotDone(task({ status: 100000000 }))).toBe(true);
    expect(isNotDone(task({ status: 100000003 }))).toBe(true);
  });

  it('keeps tasks with no status set', () => {
    expect(isNotDone(task({ status: undefined }))).toBe(true);
  });
});

describe('selectNotDoneTasks', () => {
  it('maps records and drops Done tasks', () => {
    const records = [
      record({ csa_taskid: 't1', csa_name: 'Backlog item', csa_status: 100000000, _csa_projectid_value: 'p1' }),
      record({ csa_taskid: 't2', csa_name: 'Finished', csa_status: DONE_STATUS, _csa_projectid_value: 'p1' }),
      record({ csa_taskid: 't3', csa_name: 'Waiting', csa_status: 100000003, _csa_projectid_value: 'p2' }),
    ];

    expect(selectNotDoneTasks(records)).toEqual([
      { id: 't1', name: 'Backlog item', status: 100000000, statusLabel: 'Backlog', projectId: 'p1', sortOrder: 0 },
      { id: 't3', name: 'Waiting', status: 100000003, statusLabel: 'Waiting', projectId: 'p2', sortOrder: 0 },
    ]);
  });
});

describe('fetchNotDoneTasks', () => {
  it('reads tasks through the seam requesting not-done, ordered by sort then name', async () => {
    const fetch: TasksFetcher = vi.fn(async () =>
      ok([
        record({ csa_taskid: 't1', csa_name: 'A', csa_status: 100000000, _csa_projectid_value: 'p1', csa_sortorder: 1 }),
        record({ csa_taskid: 't3', csa_name: 'B', csa_status: 100000003, _csa_projectid_value: 'p2', csa_sortorder: 2 }),
      ]),
    );

    const tasks = await fetchNotDoneTasks(fetch);

    expect(fetch).toHaveBeenCalledWith({
      filter: NOT_DONE_TASKS_FILTER,
      orderBy: ['csa_sortorder asc', 'csa_name asc'],
    });
    expect(tasks).toEqual([
      { id: 't1', name: 'A', status: 100000000, statusLabel: 'Backlog', projectId: 'p1', sortOrder: 1 },
      { id: 't3', name: 'B', status: 100000003, statusLabel: 'Waiting', projectId: 'p2', sortOrder: 2 },
    ]);
  });

  it('filters out any Done task the data source still returns', async () => {
    const fetch: TasksFetcher = vi.fn(async () =>
      ok([
        record({ csa_taskid: 't1', csa_name: 'Open', csa_status: 100000001, _csa_projectid_value: 'p1' }),
        record({ csa_taskid: 't2', csa_name: 'Done', csa_status: DONE_STATUS, _csa_projectid_value: 'p1' }),
      ]),
    );

    expect(await fetchNotDoneTasks(fetch)).toEqual([
      { id: 't1', name: 'Open', status: 100000001, statusLabel: 'ToDo', projectId: 'p1', sortOrder: 0 },
    ]);
  });

  it('returns an empty list when the data source yields no data', async () => {
    const fetch: TasksFetcher = vi.fn(async () => ({}) as IOperationResult<Csa_tasks[]>);
    expect(await fetchNotDoneTasks(fetch)).toEqual([]);
  });
});

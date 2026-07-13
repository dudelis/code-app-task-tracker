import { describe, expect, it, vi } from 'vitest';
import type { Csa_tasks } from '../generated/models/Csa_tasksModel';
import type { IOperationResult } from '@microsoft/power-apps/data';
import {
  BACKLOG_STATUS,
  DONE_STATUS,
  NOT_DONE_TASKS_FILTER,
  createTask,
  deleteTask,
  deleteTaskCascade,
  fetchNotDoneTasks,
  fetchAllTasks,
  isNotDone,
  mapTask,
  newTaskForm,
  projectBind,
  selectNotDoneTasks,
  taskToForm,
  updateTask,
  updateTaskStatus,
  validateTaskForm,
  type Task,
  type TaskCascadeDeps,
  type TaskCreator,
  type TaskDeleter,
  type TaskFormValues,
  type TaskUpdater,
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
          csa_responsible: 100000000,
          csa_duedate: '2026-08-01',
          csa_description: 'Write it up',
        }),
      ),
    ).toEqual({
      id: 't1',
      name: 'Draft proposal',
      status: 100000002,
      statusLabel: 'InProgress',
      projectId: 'p1',
      sortOrder: 3,
      responsible: 100000000,
      duedate: '2026-08-01',
      description: 'Write it up',
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
      responsible: undefined,
      duedate: undefined,
      description: undefined,
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
      { id: 't1', name: 'Backlog item', status: 100000000, statusLabel: 'Backlog', projectId: 'p1', sortOrder: 0, responsible: undefined, duedate: undefined, description: undefined },
      { id: 't3', name: 'Waiting', status: 100000003, statusLabel: 'Waiting', projectId: 'p2', sortOrder: 0, responsible: undefined, duedate: undefined, description: undefined },
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
      { id: 't1', name: 'A', status: 100000000, statusLabel: 'Backlog', projectId: 'p1', sortOrder: 1, responsible: undefined, duedate: undefined, description: undefined },
      { id: 't3', name: 'B', status: 100000003, statusLabel: 'Waiting', projectId: 'p2', sortOrder: 2, responsible: undefined, duedate: undefined, description: undefined },
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
      { id: 't1', name: 'Open', status: 100000001, statusLabel: 'ToDo', projectId: 'p1', sortOrder: 0, responsible: undefined, duedate: undefined, description: undefined },
    ]);
  });

  it('returns an empty list when the data source yields no data', async () => {
    const fetch: TasksFetcher = vi.fn(async () => ({}) as IOperationResult<Csa_tasks[]>);
    expect(await fetchNotDoneTasks(fetch)).toEqual([]);
  });
});

describe('fetchAllTasks', () => {
  it('reads every status, ordered by sort then name, without a filter', async () => {
    const fetch: TasksFetcher = vi.fn(async () =>
      ok([
        record({ csa_taskid: 't1', csa_name: 'A', csa_status: 100000001, _csa_projectid_value: 'p1', csa_sortorder: 1 }),
        record({ csa_taskid: 't2', csa_name: 'Done', csa_status: DONE_STATUS, _csa_projectid_value: 'p1', csa_sortorder: 2 }),
      ]),
    );

    const tasks = await fetchAllTasks(fetch);

    expect(fetch).toHaveBeenCalledWith({ orderBy: ['csa_sortorder asc', 'csa_name asc'] });
    expect(tasks).toEqual([
      { id: 't1', name: 'A', status: 100000001, statusLabel: 'ToDo', projectId: 'p1', sortOrder: 1, responsible: undefined, duedate: undefined, description: undefined },
      { id: 't2', name: 'Done', status: DONE_STATUS, statusLabel: 'Done', projectId: 'p1', sortOrder: 2, responsible: undefined, duedate: undefined, description: undefined },
    ]);
  });

  it('returns an empty list when the data source yields no data', async () => {
    const fetch: TasksFetcher = vi.fn(async () => ({}) as IOperationResult<Csa_tasks[]>);
    expect(await fetchAllTasks(fetch)).toEqual([]);
  });
});

describe('updateTaskStatus', () => {
  it('persists the new status choice through the write seam', async () => {
    const update: TaskUpdater = vi.fn(async () => ({}) as IOperationResult<Csa_tasks>);

    await updateTaskStatus(update, 't1', DONE_STATUS);

    expect(update).toHaveBeenCalledWith('t1', { csa_status: DONE_STATUS });
  });
});

describe('taskToForm', () => {
  function task(partial: Partial<Task>): Task {
    return { id: 't', name: '', statusLabel: '', projectId: 'p', sortOrder: 0, ...partial };
  }

  it('projects an existing task into editable form values', () => {
    expect(
      taskToForm(
        task({
          name: 'Ship it',
          status: 100000002,
          responsible: 100000001,
          duedate: '2026-09-10',
          description: 'Details',
          projectId: 'p7',
        }),
      ),
    ).toEqual({
      name: 'Ship it',
      status: 100000002,
      responsible: 100000001,
      duedate: '2026-09-10',
      description: 'Details',
      projectId: 'p7',
    });
  });

  it('defaults an unset status to Backlog and unset fields to null/empty', () => {
    expect(taskToForm(task({ name: 'X', status: undefined }))).toEqual({
      name: 'X',
      status: BACKLOG_STATUS,
      responsible: null,
      duedate: '',
      description: '',
      projectId: 'p',
    });
  });
});

describe('newTaskForm', () => {
  it('defaults to a blank form with Backlog status and no project', () => {
    expect(newTaskForm()).toEqual({
      name: '',
      status: BACKLOG_STATUS,
      responsible: null,
      duedate: '',
      description: '',
      projectId: '',
    });
  });

  it('pre-fills the project and defaults the status for a contextual create', () => {
    expect(newTaskForm('p3', 100000002)).toEqual({
      name: '',
      status: 100000002,
      responsible: null,
      duedate: '',
      description: '',
      projectId: 'p3',
    });
  });
});

describe('projectBind', () => {
  it('builds the OData bind path for a project lookup', () => {
    expect(projectBind('p1')).toBe('/csa_projects(p1)');
  });
});

describe('validateTaskForm', () => {
  const base: TaskFormValues = {
    name: 'Task',
    status: BACKLOG_STATUS,
    responsible: null,
    duedate: '',
    description: '',
    projectId: 'p1',
  };

  it('passes when the name and project are present', () => {
    expect(validateTaskForm(base)).toEqual({});
  });

  it('requires a non-blank name', () => {
    expect(validateTaskForm({ ...base, name: '   ' })).toEqual({ name: 'Name is required.' });
  });

  it('requires a project', () => {
    expect(validateTaskForm({ ...base, projectId: '' })).toEqual({
      projectId: 'Project is required.',
    });
  });

  it('reports both errors when name and project are missing', () => {
    expect(validateTaskForm({ ...base, name: '', projectId: '  ' })).toEqual({
      name: 'Name is required.',
      projectId: 'Project is required.',
    });
  });
});

describe('createTask', () => {
  it('binds the project, sets sort order to 0, and returns the projection', async () => {
    const create: TaskCreator = vi.fn(async () =>
      ({ data: { csa_taskid: 'new1' } }) as IOperationResult<Csa_tasks>,
    );

    const saved = await createTask(create, {
      name: '  Fresh task  ',
      status: 100000002,
      responsible: 100000000,
      duedate: '2026-11-01',
      description: 'Do the thing',
      projectId: 'p5',
    });

    expect(create).toHaveBeenCalledWith({
      csa_name: 'Fresh task',
      csa_status: 100000002,
      csa_responsible: 100000000,
      csa_duedate: '2026-11-01',
      csa_description: 'Do the thing',
      csa_sortorder: 0,
      'csa_ProjectId@odata.bind': '/csa_projects(p5)',
    });
    expect(saved).toEqual({
      id: 'new1',
      name: 'Fresh task',
      status: 100000002,
      statusLabel: 'InProgress',
      projectId: 'p5',
      sortOrder: 0,
      responsible: 100000000,
      duedate: '2026-11-01',
      description: 'Do the thing',
    });
  });

  it('sends null for an unassigned responsible and a blank due date', async () => {
    const create: TaskCreator = vi.fn(async () =>
      ({ data: { csa_taskid: 'new2' } }) as IOperationResult<Csa_tasks>,
    );

    const saved = await createTask(create, {
      name: 'Minimal',
      status: BACKLOG_STATUS,
      responsible: null,
      duedate: '   ',
      description: '',
      projectId: 'p9',
    });

    expect(create).toHaveBeenCalledWith({
      csa_name: 'Minimal',
      csa_status: BACKLOG_STATUS,
      csa_responsible: null,
      csa_duedate: null,
      csa_description: '',
      csa_sortorder: 0,
      'csa_ProjectId@odata.bind': '/csa_projects(p9)',
    });
    expect(saved.responsible).toBeUndefined();
    expect(saved.duedate).toBeUndefined();
    expect(saved.statusLabel).toBe('Backlog');
  });
});

describe('updateTask', () => {
  function task(partial: Partial<Task>): Task {
    return { id: 't1', name: 'Old', statusLabel: '', projectId: 'p9', sortOrder: 4, ...partial };
  }

  it('persists trimmed edits through the write seam and merges the projection', async () => {
    const update: TaskUpdater = vi.fn(async () => ({}) as IOperationResult<Csa_tasks>);
    const original = task({ status: 100000000, responsible: 100000000, sortOrder: 4 });

    const saved = await updateTask(update, original, {
      name: '  New name  ',
      status: 100000002,
      responsible: 100000001,
      duedate: '2026-10-01',
      description: 'Notes',
      projectId: 'p9',
    });

    expect(update).toHaveBeenCalledWith('t1', {
      csa_name: 'New name',
      csa_status: 100000002,
      csa_responsible: 100000001,
      csa_duedate: '2026-10-01',
      csa_description: 'Notes',
    });
    expect(saved).toEqual({
      id: 't1',
      name: 'New name',
      status: 100000002,
      statusLabel: 'InProgress',
      projectId: 'p9',
      sortOrder: 4,
      responsible: 100000001,
      duedate: '2026-10-01',
      description: 'Notes',
    });
  });

  it('clears responsible and due date with null when unassigned/blank', async () => {
    const update: TaskUpdater = vi.fn(async () => ({}) as IOperationResult<Csa_tasks>);
    const original = task({ status: 100000001, responsible: 100000000, duedate: '2026-01-01' });

    const saved = await updateTask(update, original, {
      name: 'Keep',
      status: 100000001,
      responsible: null,
      duedate: '   ',
      description: '',
      projectId: 'p9',
    });

    expect(update).toHaveBeenCalledWith('t1', {
      csa_name: 'Keep',
      csa_status: 100000001,
      csa_responsible: null,
      csa_duedate: null,
      csa_description: '',
    });
    expect(saved.responsible).toBeUndefined();
    expect(saved.duedate).toBeUndefined();
    expect(saved.description).toBe('');
  });
});

describe('deleteTask', () => {
  it('deletes a task record through the seam', async () => {
    const remove: TaskDeleter = vi.fn(async () => undefined);

    await deleteTask(remove, 't1');

    expect(remove).toHaveBeenCalledWith('t1');
  });
});

describe('deleteTaskCascade', () => {
  it('deletes child notes and detaches labels before deleting the task', async () => {
    const order: string[] = [];
    const deps: TaskCascadeDeps = {
      deleteNotes: vi.fn(async () => {
        order.push('notes');
      }),
      detachLabels: vi.fn(async () => {
        order.push('labels');
      }),
      deleteTask: vi.fn(async () => {
        order.push('task');
      }),
    };

    await deleteTaskCascade(deps, 't-1');

    // Children (notes, label links) are removed before the parent task, so no
    // orphaned children remain.
    expect(order).toEqual(['notes', 'labels', 'task']);
    expect(deps.deleteNotes).toHaveBeenCalledWith('t-1');
    expect(deps.detachLabels).toHaveBeenCalledWith('t-1');
    expect(deps.deleteTask).toHaveBeenCalledWith('t-1');
  });

  it('does not delete the task when a child delete fails', async () => {
    const deps: TaskCascadeDeps = {
      deleteNotes: vi.fn(async () => {
        throw new Error('note delete failed');
      }),
      detachLabels: vi.fn(async () => undefined),
      deleteTask: vi.fn(async () => undefined),
    };

    await expect(deleteTaskCascade(deps, 't-1')).rejects.toThrow('note delete failed');
    expect(deps.detachLabels).not.toHaveBeenCalled();
    expect(deps.deleteTask).not.toHaveBeenCalled();
  });
});


import { describe, expect, it, vi } from 'vitest';
import type { Csa_projects } from '../generated/models/Csa_projectsModel';
import type { Csa_tasks } from '../generated/models/Csa_tasksModel';
import type { IOperationResult } from '@microsoft/power-apps/data';
import {
  ACTIVE_PROJECTS_FILTER,
  createProject,
  customerBind,
  deleteProject,
  deleteProjectCascade,
  fetchActiveProjects,
  fetchAllProjects,
  fetchProjectTaskIds,
  newProjectForm,
  PRIORITY_OPTIONS,
  priorityLabel,
  projectTasksFilter,
  projectToForm,
  selectActiveProjects,
  selectProjects,
  updateProject,
  updateProjectActive,
  validateProjectForm,
  type ProjectCascadeDeps,
  type ProjectCreator,
  type ProjectDeleter,
  type ProjectsFetcher,
  type ProjectUpdater,
} from './projects';
import type { TasksFetcher } from './tasks';

function record(partial: Partial<Csa_projects>): Csa_projects {
  return { csa_projectid: 'id', statecode: 0, ...partial } as Csa_projects;
}

function ok(data: Csa_projects[]): IOperationResult<Csa_projects[]> {
  return { data } as IOperationResult<Csa_projects[]>;
}

function okRecord(rec: Csa_projects): IOperationResult<Csa_projects> {
  return { data: rec } as IOperationResult<Csa_projects>;
}

describe('selectActiveProjects', () => {
  it('keeps only active projects and projects to the UI shape', () => {
    const records = [
      record({
        csa_projectid: 'p1',
        csa_name: 'Website',
        csa_active: true,
        _csa_customerid_value: 'c1',
      }),
      record({
        csa_projectid: 'p2',
        csa_name: 'Migration',
        csa_active: false,
        _csa_customerid_value: 'c1',
      }),
      record({
        csa_projectid: 'p3',
        csa_name: 'Support',
        csa_active: true,
        _csa_customerid_value: 'c2',
      }),
    ];

    expect(selectActiveProjects(records)).toEqual([
      { id: 'p1', name: 'Website', active: true, customerId: 'c1', description: '', materialsUrl: '', dueDate: '', notesSummary: '' },
      { id: 'p3', name: 'Support', active: true, customerId: 'c2', description: '', materialsUrl: '', dueDate: '', notesSummary: '' },
    ]);
  });

  it('treats a missing active flag as inactive', () => {
    expect(
      selectActiveProjects([record({ csa_projectid: 'x', csa_name: 'No flag' })]),
    ).toEqual([]);
  });

  it('maps a missing customer lookup to an empty owner id', () => {
    expect(
      selectActiveProjects([
        record({ csa_projectid: 'p', csa_name: 'Orphan', csa_active: true }),
      ]),
    ).toEqual([{ id: 'p', name: 'Orphan', active: true, customerId: '', description: '', materialsUrl: '', dueDate: '', notesSummary: '' }]);
  });
});

describe('fetchActiveProjects', () => {
  it('reads projects through the seam requesting active-only, sorted by name', async () => {
    const fetch: ProjectsFetcher = vi.fn(async () =>
      ok([
        record({
          csa_projectid: 'p1',
          csa_name: 'Website',
          csa_active: true,
          _csa_customerid_value: 'c1',
        }),
        record({
          csa_projectid: 'p3',
          csa_name: 'Support',
          csa_active: true,
          _csa_customerid_value: 'c2',
        }),
      ]),
    );

    const projects = await fetchActiveProjects(fetch);

    expect(fetch).toHaveBeenCalledWith({
      filter: ACTIVE_PROJECTS_FILTER,
      orderBy: ['csa_name asc'],
    });
    expect(projects).toEqual([
      { id: 'p1', name: 'Website', active: true, customerId: 'c1', description: '', materialsUrl: '', dueDate: '', notesSummary: '' },
      { id: 'p3', name: 'Support', active: true, customerId: 'c2', description: '', materialsUrl: '', dueDate: '', notesSummary: '' },
    ]);
  });

  it('filters out any inactive record the data source still returns', async () => {
    const fetch: ProjectsFetcher = vi.fn(async () =>
      ok([
        record({
          csa_projectid: 'p1',
          csa_name: 'Website',
          csa_active: true,
          _csa_customerid_value: 'c1',
        }),
        record({
          csa_projectid: 'p2',
          csa_name: 'Migration',
          csa_active: false,
          _csa_customerid_value: 'c1',
        }),
      ]),
    );

    expect(await fetchActiveProjects(fetch)).toEqual([
      { id: 'p1', name: 'Website', active: true, customerId: 'c1', description: '', materialsUrl: '', dueDate: '', notesSummary: '' },
    ]);
  });

  it('returns an empty list when the data source yields no data', async () => {
    const fetch: ProjectsFetcher = vi.fn(async () => ({}) as IOperationResult<Csa_projects[]>);
    expect(await fetchActiveProjects(fetch)).toEqual([]);
  });
});

describe('selectProjects', () => {
  it('maps active and inactive projects alike', () => {
    const records = [
      record({
        csa_projectid: 'p1',
        csa_name: 'Website',
        csa_active: true,
        _csa_customerid_value: 'c1',
      }),
      record({
        csa_projectid: 'p2',
        csa_name: 'Migration',
        csa_active: false,
        _csa_customerid_value: 'c1',
      }),
    ];

    expect(selectProjects(records)).toEqual([
      { id: 'p1', name: 'Website', active: true, customerId: 'c1', description: '', materialsUrl: '', dueDate: '', notesSummary: '' },
      { id: 'p2', name: 'Migration', active: false, customerId: 'c1', description: '', materialsUrl: '', dueDate: '', notesSummary: '' },
    ]);
  });
});

describe('fetchAllProjects', () => {
  it('reads every project through the seam without an active filter, sorted by name', async () => {
    const fetch: ProjectsFetcher = vi.fn(async () =>
      ok([
        record({
          csa_projectid: 'p1',
          csa_name: 'Website',
          csa_active: true,
          _csa_customerid_value: 'c1',
        }),
        record({
          csa_projectid: 'p2',
          csa_name: 'Migration',
          csa_active: false,
          _csa_customerid_value: 'c1',
        }),
      ]),
    );

    const projects = await fetchAllProjects(fetch);

    expect(fetch).toHaveBeenCalledWith({ orderBy: ['csa_name asc'] });
    expect(projects).toEqual([
      { id: 'p1', name: 'Website', active: true, customerId: 'c1', description: '', materialsUrl: '', dueDate: '', notesSummary: '' },
      { id: 'p2', name: 'Migration', active: false, customerId: 'c1', description: '', materialsUrl: '', dueDate: '', notesSummary: '' },
    ]);
  });

  it('returns an empty list when the data source yields no data', async () => {
    const fetch: ProjectsFetcher = vi.fn(async () => ({}) as IOperationResult<Csa_projects[]>);
    expect(await fetchAllProjects(fetch)).toEqual([]);
  });
});

describe('updateProjectActive', () => {
  it('writes the new active state through the update seam', async () => {
    const update: ProjectUpdater = vi.fn(async () => ({}) as IOperationResult<Csa_projects>);

    await updateProjectActive(update, 'p1', false);

    expect(update).toHaveBeenCalledWith('p1', { csa_active: false });
  });

  it('can reactivate a project', async () => {
    const update: ProjectUpdater = vi.fn(async () => ({}) as IOperationResult<Csa_projects>);

    await updateProjectActive(update, 'p1', true);

    expect(update).toHaveBeenCalledWith('p1', { csa_active: true });
  });
});

describe('customerBind', () => {
  it('formats a customer lookup bind value', () => {
    expect(customerBind('c1')).toBe('/csa_customers(c1)');
  });
});

describe('priorityLabel', () => {
  it('resolves each priority choice value to its label', () => {
    expect(priorityLabel(100000000)).toBe('High');
    expect(priorityLabel(100000001)).toBe('Normal');
    expect(priorityLabel(100000002)).toBe('Low');
  });

  it('returns an empty label when the priority is unset', () => {
    expect(priorityLabel(undefined)).toBe('');
  });
});

describe('PRIORITY_OPTIONS', () => {
  it('lists the selectable priority choices in Dataverse order', () => {
    expect(PRIORITY_OPTIONS).toEqual([
      { value: 100000000, label: 'High' },
      { value: 100000001, label: 'Normal' },
      { value: 100000002, label: 'Low' },
    ]);
  });
});

describe('mapProject context fields', () => {
  it('surfaces description, materialsUrl, dueDate, priority, and notesSummary when present', () => {
    expect(
      selectProjects([
        record({
          csa_projectid: 'p1',
          csa_name: 'Website',
          csa_active: true,
          _csa_customerid_value: 'c1',
          csa_description: 'A redesign',
          csa_materialsurl: 'https://example.com/assets',
          csa_duedate: '2026-01-31',
          csa_priority: 100000000,
          csa_notessummary: 'Two open notes',
        }),
      ]),
    ).toEqual([
      {
        id: 'p1',
        name: 'Website',
        active: true,
        customerId: 'c1',
        description: 'A redesign',
        materialsUrl: 'https://example.com/assets',
        dueDate: '2026-01-31',
        priority: 100000000,
        notesSummary: 'Two open notes',
      },
    ]);
  });

  it('defaults text fields and notesSummary to empty strings and leaves priority undefined when absent', () => {
    expect(
      selectProjects([
        record({
          csa_projectid: 'p2',
          csa_name: 'Bare',
          csa_active: true,
          _csa_customerid_value: 'c1',
        }),
      ]),
    ).toEqual([
      {
        id: 'p2',
        name: 'Bare',
        active: true,
        customerId: 'c1',
        description: '',
        materialsUrl: '',
        dueDate: '',
        priority: undefined,
        notesSummary: '',
      },
    ]);
  });
});

describe('newProjectForm', () => {
  it('starts empty with Active defaulting to Yes and no customer', () => {
    expect(newProjectForm()).toEqual({
      name: '',
      customerId: '',
      active: true,
      description: '',
      materialsUrl: '',
      dueDate: '',
      priority: null,
      notesSummary: '',
    });
  });

  it('pre-fills the parent customer when one is supplied', () => {
    expect(newProjectForm('c1')).toEqual({
      name: '',
      customerId: 'c1',
      active: true,
      description: '',
      materialsUrl: '',
      dueDate: '',
      priority: null,
      notesSummary: '',
    });
  });
});

describe('projectToForm', () => {
  it('projects an existing project into editable form values', () => {
    expect(
      projectToForm({ id: 'p1', name: 'Website', active: false, customerId: 'c1', description: '', materialsUrl: '', dueDate: '', notesSummary: '' }),
    ).toEqual({
      name: 'Website',
      customerId: 'c1',
      active: false,
      description: '',
      materialsUrl: '',
      dueDate: '',
      priority: null,
      notesSummary: '',
    });
  });

  it('carries the project context fields through, including an unset priority', () => {
    expect(
      projectToForm({
        id: 'p1',
        name: 'Website',
        active: true,
        customerId: 'c1',
        description: 'A redesign',
        materialsUrl: 'https://example.com/assets',
        dueDate: '2026-01-31',
        priority: 100000000,
        notesSummary: 'Two open notes',
      }),
    ).toEqual({
      name: 'Website',
      customerId: 'c1',
      active: true,
      description: 'A redesign',
      materialsUrl: 'https://example.com/assets',
      dueDate: '2026-01-31',
      priority: 100000000,
      notesSummary: 'Two open notes',
    });
  });
});

describe('validateProjectForm', () => {
  it('reports no errors when name and customer are present', () => {
    expect(validateProjectForm({ name: 'Website', customerId: 'c1', active: true, description: '', materialsUrl: '', dueDate: '', priority: null, notesSummary: '' })).toEqual({});
  });

  it('requires a name', () => {
    expect(validateProjectForm({ name: '', customerId: 'c1', active: true, description: '', materialsUrl: '', dueDate: '', priority: null, notesSummary: '' })).toEqual({
      name: 'Name is required.',
    });
  });

  it('treats a whitespace-only name as missing', () => {
    expect(validateProjectForm({ name: '   ', customerId: 'c1', active: true, description: '', materialsUrl: '', dueDate: '', priority: null, notesSummary: '' })).toEqual({
      name: 'Name is required.',
    });
  });

  it('requires a customer', () => {
    expect(validateProjectForm({ name: 'Website', customerId: '', active: true, description: '', materialsUrl: '', dueDate: '', priority: null, notesSummary: '' })).toEqual({
      customerId: 'Customer is required.',
    });
  });

  it('reports both errors when name and customer are missing', () => {
    expect(validateProjectForm({ name: '', customerId: '', active: true, description: '', materialsUrl: '', dueDate: '', priority: null, notesSummary: '' })).toEqual({
      name: 'Name is required.',
      customerId: 'Customer is required.',
    });
  });
});

describe('createProject', () => {
  it('creates through the seam with a trimmed name and customer bind, returning the projection', async () => {
    const create: ProjectCreator = vi.fn(async () =>
      okRecord(
        record({
          csa_projectid: 'new-id',
          csa_name: 'Website',
          csa_active: true,
          _csa_customerid_value: 'c1',
        }),
      ),
    );

    const created = await createProject(create, {
      name: '  Website  ',
      customerId: 'c1',
      active: true,
      description: '',
      materialsUrl: '',
      dueDate: '',
      priority: null,
      notesSummary: '',
    });

    expect(create).toHaveBeenCalledWith({
      csa_name: 'Website',
      csa_active: true,
      csa_description: '',
      csa_materialsurl: '',
      csa_notessummary: '',
      'csa_CustomerId@odata.bind': '/csa_customers(c1)',
    });
    expect(created).toEqual({
      id: 'new-id',
      name: 'Website',
      active: true,
      customerId: 'c1',
      description: '',
      materialsUrl: '',
      dueDate: '',
      notesSummary: '',
    });
  });

  it('carries the chosen Active state through', async () => {
    const create: ProjectCreator = vi.fn(async () =>
      okRecord(record({ csa_projectid: 'new-id' })),
    );

    await createProject(create, { name: 'Migration', customerId: 'c2', active: false, description: '', materialsUrl: '', dueDate: '', priority: null, notesSummary: '' });

    expect(create).toHaveBeenCalledWith({
      csa_name: 'Migration',
      csa_active: false,
      csa_description: '',
      csa_materialsurl: '',
      csa_notessummary: '',
      'csa_CustomerId@odata.bind': '/csa_customers(c2)',
    });
  });
});

describe('updateProject', () => {
  it('updates name, customer, and active through the seam and returns the projection', async () => {
    const update: ProjectUpdater = vi.fn(async () => ({}) as IOperationResult<Csa_projects>);

    const updated = await updateProject(update, 'p1', {
      name: '  Renamed  ',
      customerId: 'c2',
      active: false,
      description: '',
      materialsUrl: '',
      dueDate: '',
      priority: null,
      notesSummary: '',
    });

    expect(update).toHaveBeenCalledWith('p1', {
      csa_name: 'Renamed',
      csa_active: false,
      csa_description: '',
      csa_materialsurl: '',
      csa_notessummary: '',
      csa_duedate: null,
      csa_priority: null,
      'csa_CustomerId@odata.bind': '/csa_customers(c2)',
    });
    expect(updated).toEqual({
      id: 'p1',
      name: 'Renamed',
      active: false,
      customerId: 'c2',
      description: '',
      materialsUrl: '',
      dueDate: '',
      notesSummary: '',
    });
  });
});

describe('deleteProject', () => {
  it('deletes a project record through the seam', async () => {
    const remove: ProjectDeleter = vi.fn(async () => undefined);

    await deleteProject(remove, 'p1');

    expect(remove).toHaveBeenCalledWith('p1');
  });
});

describe('projectTasksFilter', () => {
  it('builds an OData filter for tasks owned by the project', () => {
    expect(projectTasksFilter('p1')).toBe('_csa_projectid_value eq p1');
  });
});

describe('fetchProjectTaskIds', () => {
  it('reads the project\'s tasks through the seam and returns their ids', async () => {
    const okTasks = (data: Csa_tasks[]): IOperationResult<Csa_tasks[]> =>
      ({ data }) as IOperationResult<Csa_tasks[]>;
    const fetch: TasksFetcher = vi.fn(async () =>
      okTasks([
        { csa_taskid: 't1' } as Csa_tasks,
        { csa_taskid: 't2' } as Csa_tasks,
      ]),
    );

    const ids = await fetchProjectTaskIds(fetch, 'p1');

    expect(fetch).toHaveBeenCalledWith({ filter: projectTasksFilter('p1') });
    expect(ids).toEqual(['t1', 't2']);
  });

  it('returns an empty list when the project has no tasks', async () => {
    const fetch: TasksFetcher = vi.fn(
      async () => ({ data: [] as Csa_tasks[] }) as IOperationResult<Csa_tasks[]>,
    );

    expect(await fetchProjectTaskIds(fetch, 'p1')).toEqual([]);
  });
});

describe('deleteProjectCascade', () => {
  it('cascade-deletes every task, then the project\'s own notes, then detaches its contacts, before the project, leaving no orphans', async () => {
    const order: string[] = [];
    const deps: ProjectCascadeDeps = {
      listTaskIds: vi.fn(async () => ['t1', 't2']),
      deleteTaskCascade: vi.fn(async (taskId: string) => {
        order.push(`task:${taskId}`);
      }),
      deleteProjectNotes: vi.fn(async (projectId: string) => {
        order.push(`notes:${projectId}`);
      }),
      detachContacts: vi.fn(async (projectId: string) => {
        order.push(`contacts:${projectId}`);
      }),
      deleteProject: vi.fn(async (projectId: string) => {
        order.push(`project:${projectId}`);
      }),
    };

    await deleteProjectCascade(deps, 'p1');

    // Both tasks (with their notes and label links) are cascade-deleted, then the
    // project's own directly-attached notes, then its contact links are detached,
    // then the project itself — children and M:N links always removed before the
    // parent, so no orphaned descendants or dangling associations remain.
    expect(order).toEqual(['task:t1', 'task:t2', 'notes:p1', 'contacts:p1', 'project:p1']);
    expect(deps.listTaskIds).toHaveBeenCalledWith('p1');
    expect(deps.deleteTaskCascade).toHaveBeenCalledTimes(2);
    expect(deps.deleteProjectNotes).toHaveBeenCalledWith('p1');
    expect(deps.detachContacts).toHaveBeenCalledWith('p1');
    expect(deps.deleteProject).toHaveBeenCalledWith('p1');
  });

  it('deletes the project\'s own notes then detaches contacts then the project when it has no tasks', async () => {
    const order: string[] = [];
    const deps: ProjectCascadeDeps = {
      listTaskIds: vi.fn(async () => []),
      deleteTaskCascade: vi.fn(async () => undefined),
      deleteProjectNotes: vi.fn(async (projectId: string) => {
        order.push(`notes:${projectId}`);
      }),
      detachContacts: vi.fn(async (projectId: string) => {
        order.push(`contacts:${projectId}`);
      }),
      deleteProject: vi.fn(async (projectId: string) => {
        order.push(`project:${projectId}`);
      }),
    };

    await deleteProjectCascade(deps, 'p9');

    expect(deps.deleteTaskCascade).not.toHaveBeenCalled();
    // The project's own notes and contact links are still removed before the project itself.
    expect(order).toEqual(['notes:p9', 'contacts:p9', 'project:p9']);
    expect(deps.deleteProjectNotes).toHaveBeenCalledWith('p9');
    expect(deps.detachContacts).toHaveBeenCalledWith('p9');
    expect(deps.deleteProject).toHaveBeenCalledWith('p9');
  });

  it('does not delete the project when a task cascade fails', async () => {
    const deps: ProjectCascadeDeps = {
      listTaskIds: vi.fn(async () => ['t1']),
      deleteTaskCascade: vi.fn(async () => {
        throw new Error('task cascade failed');
      }),
      deleteProjectNotes: vi.fn(async () => undefined),
      detachContacts: vi.fn(async () => undefined),
      deleteProject: vi.fn(async () => undefined),
    };

    await expect(deleteProjectCascade(deps, 'p1')).rejects.toThrow('task cascade failed');
    expect(deps.deleteProjectNotes).not.toHaveBeenCalled();
    expect(deps.detachContacts).not.toHaveBeenCalled();
    expect(deps.deleteProject).not.toHaveBeenCalled();
  });
});

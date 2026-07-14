import { describe, expect, it } from 'vitest';
import type { Customer } from './customers';
import type { Project } from './projects';
import type { Task } from './tasks';
import { DONE_STATUS } from './tasks';
import { buildCustomerGrid, buildOverviewTree } from './overview';

function customer(partial: Partial<Customer> & Pick<Customer, 'id'>): Customer {
  return { name: partial.id, active: true, ...partial };
}

function project(
  partial: Partial<Project> & Pick<Project, 'id' | 'customerId'>,
): Project {
  return { name: partial.id, active: true, ...partial };
}

function task(partial: Partial<Task> & Pick<Task, 'id' | 'projectId'>): Task {
  return { name: partial.id, statusLabel: '', status: 100000000, sortOrder: 0, ...partial };
}

describe('buildOverviewTree', () => {
  it('nests active projects under their owning active customer', () => {
    const customers = [
      customer({ id: 'c1', name: 'Acme' }),
      customer({ id: 'c2', name: 'Beta' }),
    ];
    const projects = [
      project({ id: 'p1', name: 'Website', customerId: 'c1' }),
      project({ id: 'p2', name: 'Support', customerId: 'c1' }),
      project({ id: 'p3', name: 'Migration', customerId: 'c2' }),
    ];

    expect(buildOverviewTree(customers, projects, [])).toEqual([
      {
        customer: customers[0],
        projects: [
          { project: projects[0], tasks: [] },
          { project: projects[1], tasks: [] },
        ],
      },
      {
        customer: customers[1],
        projects: [{ project: projects[2], tasks: [] }],
      },
    ]);
  });

  it('nests not-done tasks under their owning project', () => {
    const customers = [customer({ id: 'c1' })];
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [
      task({ id: 't1', projectId: 'p1', statusLabel: 'Backlog' }),
      task({ id: 't2', projectId: 'p1', statusLabel: 'Waiting', status: 100000003 }),
    ];

    expect(buildOverviewTree(customers, projects, tasks)[0].projects).toEqual([
      { project: projects[0], tasks: [tasks[0], tasks[1]] },
    ]);
  });

  it('hides Done tasks from the tree', () => {
    const customers = [customer({ id: 'c1' })];
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [
      task({ id: 't1', projectId: 'p1', status: 100000000 }),
      task({ id: 't2', projectId: 'p1', status: DONE_STATUS }),
    ];

    expect(buildOverviewTree(customers, projects, tasks)[0].projects[0].tasks).toEqual([
      tasks[0],
    ]);
  });

  it('drops tasks whose project is absent or inactive', () => {
    const customers = [customer({ id: 'c1' })];
    const projects = [
      project({ id: 'p1', customerId: 'c1', active: true }),
      project({ id: 'p2', customerId: 'c1', active: false }),
    ];
    const tasks = [
      task({ id: 't1', projectId: 'p1' }),
      task({ id: 't2', projectId: 'p2' }),
      task({ id: 't3', projectId: 'missing' }),
    ];

    const tree = buildOverviewTree(customers, projects, tasks);

    expect(tree[0].projects).toEqual([{ project: projects[0], tasks: [tasks[0]] }]);
  });

  it('excludes inactive customers entirely', () => {
    const customers = [
      customer({ id: 'c1', name: 'Acme', active: true }),
      customer({ id: 'c2', name: 'Beta', active: false }),
    ];
    const projects = [
      project({ id: 'p1', customerId: 'c1' }),
      project({ id: 'p2', customerId: 'c2' }),
    ];

    const tree = buildOverviewTree(customers, projects, []);

    expect(tree).toHaveLength(1);
    expect(tree[0].customer.id).toBe('c1');
  });

  it('excludes inactive projects from an active customer', () => {
    const customers = [customer({ id: 'c1' })];
    const projects = [
      project({ id: 'p1', customerId: 'c1', active: true }),
      project({ id: 'p2', customerId: 'c1', active: false }),
    ];

    expect(buildOverviewTree(customers, projects, [])[0].projects).toEqual([
      { project: projects[0], tasks: [] },
    ]);
  });

  it('gives an active customer with no projects an empty project list', () => {
    const tree = buildOverviewTree([customer({ id: 'c1' })], [], []);
    expect(tree).toEqual([{ customer: { id: 'c1', name: 'c1', active: true }, projects: [] }]);
  });

  it('drops projects whose customer is absent or inactive', () => {
    const customers = [customer({ id: 'c1' })];
    const projects = [
      project({ id: 'p1', customerId: 'c1' }),
      project({ id: 'p2', customerId: 'missing' }),
    ];

    const tree = buildOverviewTree(customers, projects, []);

    expect(tree).toHaveLength(1);
    expect(tree[0].projects).toEqual([{ project: projects[0], tasks: [] }]);
  });

  it('reveals inactive customers when showInactive is set', () => {
    const customers = [
      customer({ id: 'c1', name: 'Acme', active: true }),
      customer({ id: 'c2', name: 'Beta', active: false }),
    ];
    const projects = [project({ id: 'p1', customerId: 'c2' })];

    const tree = buildOverviewTree(customers, projects, [], true);

    expect(tree.map((node) => node.customer.id)).toEqual(['c1', 'c2']);
  });

  it('reveals inactive projects under a customer when showInactive is set', () => {
    const customers = [customer({ id: 'c1' })];
    const projects = [
      project({ id: 'p1', customerId: 'c1', active: true }),
      project({ id: 'p2', customerId: 'c1', active: false }),
    ];

    expect(buildOverviewTree(customers, projects, [], true)[0].projects).toEqual([
      { project: projects[0], tasks: [] },
      { project: projects[1], tasks: [] },
    ]);
  });
});

describe('buildCustomerGrid', () => {
  it('groups active projects alphabetically by name', () => {
    const c = customer({ id: 'c1' });
    const projects = [
      project({ id: 'p1', name: 'Website', customerId: 'c1' }),
      project({ id: 'p2', name: 'Api', customerId: 'c1' }),
      project({ id: 'p3', name: 'Migration', customerId: 'c1' }),
    ];

    const grid = buildCustomerGrid(c, projects, []);

    expect(grid.activeProjects.map((g) => g.project.name)).toEqual([
      'Api',
      'Migration',
      'Website',
    ]);
    expect(grid.inactiveProjects).toEqual([]);
  });

  it('ignores projects owned by another customer', () => {
    const c = customer({ id: 'c1' });
    const projects = [
      project({ id: 'p1', customerId: 'c1' }),
      project({ id: 'p2', customerId: 'c2' }),
    ];

    const grid = buildCustomerGrid(c, projects, []);

    expect(grid.activeProjects.map((g) => g.project.id)).toEqual(['p1']);
  });

  it('splits each active project into open tasks and a Completed (Done) list', () => {
    const c = customer({ id: 'c1' });
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [
      task({ id: 't1', projectId: 'p1', status: 100000000 }),
      task({ id: 't2', projectId: 'p1', status: DONE_STATUS }),
      task({ id: 't3', projectId: 'p1', status: 100000002 }),
    ];

    const [group] = buildCustomerGrid(c, projects, tasks).activeProjects;

    expect(group.openTasks.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(group.completedTasks.map((t) => t.id)).toEqual(['t2']);
  });

  it('orders open and completed tasks by sort order then name', () => {
    const c = customer({ id: 'c1' });
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [
      task({ id: 't1', projectId: 'p1', name: 'Zed', status: 100000000, sortOrder: 2 }),
      task({ id: 't2', projectId: 'p1', name: 'Beta', status: 100000000, sortOrder: 1 }),
      task({ id: 't3', projectId: 'p1', name: 'Alpha', status: 100000000, sortOrder: 1 }),
      task({ id: 'd1', projectId: 'p1', name: 'Yak', status: DONE_STATUS, sortOrder: 5 }),
      task({ id: 'd2', projectId: 'p1', name: 'Ant', status: DONE_STATUS, sortOrder: 4 }),
    ];

    const [group] = buildCustomerGrid(c, projects, tasks).activeProjects;

    expect(group.openTasks.map((t) => t.id)).toEqual(['t3', 't2', 't1']);
    expect(group.completedTasks.map((t) => t.id)).toEqual(['d2', 'd1']);
  });

  it('routes inactive projects (with their tasks) into the Inactive bucket, alphabetically', () => {
    const c = customer({ id: 'c1' });
    const projects = [
      project({ id: 'p1', name: 'Active', customerId: 'c1', active: true }),
      project({ id: 'p2', name: 'Zeta', customerId: 'c1', active: false }),
      project({ id: 'p3', name: 'Alpha', customerId: 'c1', active: false }),
    ];
    const tasks = [
      task({ id: 't1', projectId: 'p2', status: 100000000 }),
      task({ id: 't2', projectId: 'p2', status: DONE_STATUS }),
    ];

    const grid = buildCustomerGrid(c, projects, tasks);

    expect(grid.activeProjects.map((g) => g.project.id)).toEqual(['p1']);
    expect(grid.inactiveProjects.map((g) => g.project.name)).toEqual(['Alpha', 'Zeta']);
    const zeta = grid.inactiveProjects.find((g) => g.project.id === 'p2')!;
    expect(zeta.openTasks.map((t) => t.id)).toEqual(['t1']);
    expect(zeta.completedTasks.map((t) => t.id)).toEqual(['t2']);
  });

  it('treats a task with unset status as open (Backlog)', () => {
    const c = customer({ id: 'c1' });
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [task({ id: 't1', projectId: 'p1', status: undefined })];

    const [group] = buildCustomerGrid(c, projects, tasks).activeProjects;

    expect(group.openTasks.map((t) => t.id)).toEqual(['t1']);
    expect(group.completedTasks).toEqual([]);
  });
});

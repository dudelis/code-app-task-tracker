import { describe, expect, it } from 'vitest';
import type { Customer } from './customers';
import type { Project } from './projects';
import type { Task } from './tasks';
import { DONE_STATUS } from './tasks';
import { buildOverviewTree } from './overview';

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

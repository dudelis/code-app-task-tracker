import { describe, expect, it } from 'vitest';
import type { Customer } from './customers';
import type { Project } from './projects';
import type { Task } from './tasks';
import { DONE_STATUS } from './tasks';
import {
  BACKLOG_STATUS,
  STATUS_COLUMNS,
  buildCustomerBoard,
  buildProjectBoard,
  completeChange,
  statusChange,
  statusOnDrop,
} from './board';

function customer(partial: Partial<Customer> & Pick<Customer, 'id'>): Customer {
  return { name: partial.id, active: true, ...partial };
}

function project(
  partial: Partial<Project> & Pick<Project, 'id' | 'customerId'>,
): Project {
  return { name: partial.id, active: true, ...partial };
}

function task(partial: Partial<Task> & Pick<Task, 'id' | 'projectId'>): Task {
  return { name: partial.id, statusLabel: '', status: BACKLOG_STATUS, sortOrder: 0, ...partial };
}

describe('statusChange', () => {
  it('changes status when set to a different value', () => {
    expect(statusChange(task({ id: 't', projectId: 'p', status: BACKLOG_STATUS }), DONE_STATUS)).toEqual({
      changed: true,
      status: DONE_STATUS,
    });
  });

  it('is a no-op when set to the current value', () => {
    expect(statusChange(task({ id: 't', projectId: 'p', status: 100000002 }), 100000002)).toEqual({
      changed: false,
      status: 100000002,
    });
  });

  it('treats an unset status as Backlog', () => {
    expect(statusChange(task({ id: 't', projectId: 'p', status: undefined }), BACKLOG_STATUS)).toEqual({
      changed: false,
      status: BACKLOG_STATUS,
    });
    expect(statusChange(task({ id: 't', projectId: 'p', status: undefined }), 100000001)).toEqual({
      changed: true,
      status: 100000001,
    });
  });

  it('is the shared rule the swimlane drag board delegates to', () => {
    const t = task({ id: 't', projectId: 'p', status: 100000001 });
    expect(statusOnDrop(t, DONE_STATUS)).toEqual(statusChange(t, DONE_STATUS));
    expect(statusOnDrop(t, 100000001)).toEqual(statusChange(t, 100000001));
  });
});

describe('statusOnDrop', () => {
  it('changes status when dropped on a different column', () => {
    expect(statusOnDrop(task({ id: 't', projectId: 'p', status: BACKLOG_STATUS }), DONE_STATUS)).toEqual({
      changed: true,
      status: DONE_STATUS,
    });
  });

  it('is a no-op when dropped on the current column', () => {
    expect(statusOnDrop(task({ id: 't', projectId: 'p', status: 100000002 }), 100000002)).toEqual({
      changed: false,
      status: 100000002,
    });
  });

  it('treats an unset status as Backlog', () => {
    expect(statusOnDrop(task({ id: 't', projectId: 'p', status: undefined }), BACKLOG_STATUS)).toEqual({
      changed: false,
      status: BACKLOG_STATUS,
    });
    expect(statusOnDrop(task({ id: 't', projectId: 'p', status: undefined }), 100000001)).toEqual({
      changed: true,
      status: 100000001,
    });
  });
});

describe('completeChange', () => {
  it('marks a not-done task complete by setting it to Done', () => {
    expect(completeChange(task({ id: 't', projectId: 'p', status: 100000002 }))).toEqual({
      changed: true,
      status: DONE_STATUS,
    });
  });

  it('treats an unset status as not done and completes it', () => {
    expect(completeChange(task({ id: 't', projectId: 'p', status: undefined }))).toEqual({
      changed: true,
      status: DONE_STATUS,
    });
  });

  it('is a no-op when the task is already Done', () => {
    expect(completeChange(task({ id: 't', projectId: 'p', status: DONE_STATUS }))).toEqual({
      changed: false,
      status: DONE_STATUS,
    });
  });

  it('delegates to the shared statusChange rule', () => {
    const t = task({ id: 't', projectId: 'p', status: 100000001 });
    expect(completeChange(t)).toEqual(statusChange(t, DONE_STATUS));
  });
});

describe('buildCustomerBoard', () => {
  it('creates one lane per active project owned by the customer, with all status columns', () => {
    const c = customer({ id: 'c1' });
    const projects = [
      project({ id: 'p1', customerId: 'c1' }),
      project({ id: 'p2', customerId: 'c1' }),
      project({ id: 'p3', customerId: 'c2' }),
      project({ id: 'p4', customerId: 'c1', active: false }),
    ];

    const board = buildCustomerBoard(c, projects, []);

    expect(board.lanes.map((lane) => lane.project.id)).toEqual(['p1', 'p2']);
    expect(board.columns).toEqual(STATUS_COLUMNS);
    expect(board.lanes[0].columns.map((col) => col.status)).toEqual(
      STATUS_COLUMNS.map((col) => col.status),
    );
  });

  it('excludes inactive projects by default (includeInactive omitted)', () => {
    const c = customer({ id: 'c1' });
    const projects = [
      project({ id: 'p1', customerId: 'c1' }),
      project({ id: 'p2', customerId: 'c1', active: false }),
    ];

    const board = buildCustomerBoard(c, projects, []);

    expect(board.lanes.map((lane) => lane.project.id)).toEqual(['p1']);
  });

  it('includes inactive project lanes only when includeInactive is true', () => {
    const c = customer({ id: 'c1' });
    const projects = [
      project({ id: 'p1', customerId: 'c1' }),
      project({ id: 'p2', customerId: 'c1', active: false }),
      project({ id: 'p3', customerId: 'c2', active: false }),
    ];

    const board = buildCustomerBoard(c, projects, [], true);

    expect(board.lanes.map((lane) => lane.project.id)).toEqual(['p1', 'p2']);
  });

  it('places each task in the column matching its status', () => {
    const c = customer({ id: 'c1' });
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [
      task({ id: 't1', projectId: 'p1', status: BACKLOG_STATUS }),
      task({ id: 't2', projectId: 'p1', status: 100000002 }),
      task({ id: 't3', projectId: 'p1', status: DONE_STATUS }),
    ];

    const [lane] = buildCustomerBoard(c, projects, tasks).lanes;
    const byLabel = Object.fromEntries(lane.columns.map((col) => [col.label, col.tasks.map((t) => t.id)]));

    expect(byLabel).toEqual({
      Backlog: ['t1'],
      ToDo: [],
      InProgress: ['t2'],
      Waiting: [],
      Done: ['t3'],
    });
  });

  it('places tasks with no status in the Backlog column', () => {
    const c = customer({ id: 'c1' });
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [task({ id: 't1', projectId: 'p1', status: undefined })];

    const backlog = buildCustomerBoard(c, projects, tasks).lanes[0].columns[0];

    expect(backlog.status).toBe(BACKLOG_STATUS);
    expect(backlog.tasks.map((t) => t.id)).toEqual(['t1']);
  });

  it('orders tasks within a column by sort order then name', () => {
    const c = customer({ id: 'c1' });
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [
      task({ id: 't1', projectId: 'p1', name: 'Zed', status: BACKLOG_STATUS, sortOrder: 2 }),
      task({ id: 't2', projectId: 'p1', name: 'Beta', status: BACKLOG_STATUS, sortOrder: 1 }),
      task({ id: 't3', projectId: 'p1', name: 'Alpha', status: BACKLOG_STATUS, sortOrder: 1 }),
    ];

    const backlog = buildCustomerBoard(c, projects, tasks).lanes[0].columns[0];

    expect(backlog.tasks.map((t) => t.id)).toEqual(['t3', 't2', 't1']);
  });

  it('ignores tasks belonging to other projects', () => {
    const c = customer({ id: 'c1' });
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [
      task({ id: 't1', projectId: 'p1' }),
      task({ id: 't2', projectId: 'other' }),
    ];

    const backlog = buildCustomerBoard(c, projects, tasks).lanes[0].columns[0];

    expect(backlog.tasks.map((t) => t.id)).toEqual(['t1']);
  });

  it('does not mutate the input tasks array order', () => {
    const c = customer({ id: 'c1' });
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [
      task({ id: 't1', projectId: 'p1', status: BACKLOG_STATUS, sortOrder: 2 }),
      task({ id: 't2', projectId: 'p1', status: BACKLOG_STATUS, sortOrder: 1 }),
    ];

    buildCustomerBoard(c, projects, tasks);

    expect(tasks.map((t) => t.id)).toEqual(['t1', 't2']);
  });
});

describe('buildProjectBoard', () => {
  it('creates one column per active project owned by the customer', () => {
    const c = customer({ id: 'c1' });
    const projects = [
      project({ id: 'p1', customerId: 'c1' }),
      project({ id: 'p2', customerId: 'c1' }),
      project({ id: 'p3', customerId: 'c2' }),
      project({ id: 'p4', customerId: 'c1', active: false }),
    ];

    const board = buildProjectBoard(c, projects, []);

    expect(board.customer).toBe(c);
    expect(board.columns.map((col) => col.project.id)).toEqual(['p1', 'p2']);
  });

  it('lists a project column with all its tasks regardless of status', () => {
    const c = customer({ id: 'c1' });
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [
      task({ id: 't1', projectId: 'p1', status: BACKLOG_STATUS }),
      task({ id: 't2', projectId: 'p1', status: 100000002 }),
      task({ id: 't3', projectId: 'p1', status: DONE_STATUS }),
    ];

    const [column] = buildProjectBoard(c, projects, tasks).columns;

    expect(column.tasks.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('orders tasks within a column by sort order then name', () => {
    const c = customer({ id: 'c1' });
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [
      task({ id: 't1', projectId: 'p1', name: 'Zed', sortOrder: 2 }),
      task({ id: 't2', projectId: 'p1', name: 'Beta', sortOrder: 1 }),
      task({ id: 't3', projectId: 'p1', name: 'Alpha', sortOrder: 1 }),
    ];

    const [column] = buildProjectBoard(c, projects, tasks).columns;

    expect(column.tasks.map((t) => t.id)).toEqual(['t3', 't2', 't1']);
  });

  it('ignores tasks belonging to other projects', () => {
    const c = customer({ id: 'c1' });
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [
      task({ id: 't1', projectId: 'p1' }),
      task({ id: 't2', projectId: 'other' }),
    ];

    const [column] = buildProjectBoard(c, projects, tasks).columns;

    expect(column.tasks.map((t) => t.id)).toEqual(['t1']);
  });

  it('does not mutate the input tasks array order', () => {
    const c = customer({ id: 'c1' });
    const projects = [project({ id: 'p1', customerId: 'c1' })];
    const tasks = [
      task({ id: 't1', projectId: 'p1', sortOrder: 2 }),
      task({ id: 't2', projectId: 'p1', sortOrder: 1 }),
    ];

    buildProjectBoard(c, projects, tasks);

    expect(tasks.map((t) => t.id)).toEqual(['t1', 't2']);
  });
});

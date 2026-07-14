import type { Customer } from './customers';
import type { Project } from './projects';
import { BACKLOG_STATUS, DONE_STATUS, type Task } from './tasks';
import { Csa_taskscsa_status } from '../generated/models/Csa_tasksModel';

/** A single status column on the board. */
export interface StatusColumn {
  /** Raw Dataverse status choice value (`csa_status`). */
  status: number;
  /** Human-readable column heading. */
  label: string;
}

/** Re-exported so board consumers can reference the Backlog/unset default. */
export { BACKLOG_STATUS };

/** Status choice values in workflow order, left to right on the board. */
const STATUS_ORDER = [100000000, 100000001, 100000002, 100000003, 100000004] as const;

/** The board's status columns, in workflow order, labelled from the Dataverse choice. */
export const STATUS_COLUMNS: StatusColumn[] = STATUS_ORDER.map((status) => ({
  status,
  label: Csa_taskscsa_status[status],
}));

/** The result of dropping a task onto a status column. */
export interface StatusTransition {
  /** True only when the drop actually changes the task's status. */
  changed: boolean;
  /** The status the task should have after the drop. */
  status: number;
}

/**
 * Pure status-change rule shared by every board: setting a task to a new status
 * (treating an unset status as Backlog) reports `changed: false` when it already
 * has that status, so callers can skip a redundant write. Used by the swimlane
 * board's drag-and-drop and the project-columns board's status dropdown alike.
 */
export function statusChange(task: Task, newStatus: number): StatusTransition {
  const current = task.status ?? BACKLOG_STATUS;
  return { changed: current !== newStatus, status: newStatus };
}

/**
 * Pure status-transition-on-drag rule: dropping a task on a column sets the
 * task's status to that column. Dropping on the task's current column (treating
 * an unset status as Backlog) is a no-op, so no write is issued. Delegates to
 * {@link statusChange} so drag and dropdown share one transition rule.
 */
export function statusOnDrop(task: Task, targetStatus: number): StatusTransition {
  return statusChange(task, targetStatus);
}

/**
 * Pure complete-from-any-view rule: marking a task complete sets its status to
 * Done. Reports `changed: false` when the task is already Done, so a redundant
 * write is skipped. Shared by every board's "complete" action, so the same
 * transition logic is exercised from the swimlane board and the project board.
 */
export function completeChange(task: Task): StatusTransition {
  return statusChange(task, DONE_STATUS);
}

/**
 * Pure reopen rule: reopening a Done task returns it to Backlog. Reports
 * `changed: false` for any task that is not Done (an unset status counts as
 * Backlog, so it is not Done), leaving its status untouched — reopen only ever
 * acts on a completed task. The mirror of {@link completeChange}, so the
 * completion circle can toggle a card between Done and Backlog.
 */
export function reopenChange(task: Task): StatusTransition {
  const current = task.status ?? BACKLOG_STATUS;
  if (current !== DONE_STATUS) {
    return { changed: false, status: current };
  }
  return { changed: true, status: BACKLOG_STATUS };
}

/** Tasks for one project in one status column, sorted for display. */
export interface BoardCell extends StatusColumn {
  tasks: Task[];
}

/** One project lane across every status column. */
export interface BoardLane {
  project: Project;
  columns: BoardCell[];
}

/** A customer's swimlane board: project lanes × status columns. */
export interface CustomerBoard {
  customer: Customer;
  columns: StatusColumn[];
  lanes: BoardLane[];
}

/** Order tasks within a column by sort order, then by name for stability. */
function compareTasks(a: Task, b: Task): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name);
}

/**
 * Build a customer's swimlane board: one lane per project owned by the customer,
 * each split into the fixed status columns. Inactive projects are excluded by
 * default (live work only); pass `includeInactive` to also show inactive project
 * lanes (the board's Show-inactive toggle). Tasks are placed in the column
 * matching their status (an unset status counts as Backlog) and ordered within a
 * column by sort order then name. Pure, so placement and ordering can be tested
 * without data access.
 */
export function buildCustomerBoard(
  customer: Customer,
  projects: Project[],
  tasks: Task[],
  includeInactive = false,
): CustomerBoard {
  const tasksByProject = new Map<string, Task[]>();
  for (const task of tasks) {
    const siblings = tasksByProject.get(task.projectId);
    if (siblings) {
      siblings.push(task);
    } else {
      tasksByProject.set(task.projectId, [task]);
    }
  }

  const lanes = projects
    .filter(
      (project) =>
        project.customerId === customer.id && (includeInactive || project.active),
    )
    .map((project) => {
      const projectTasks = tasksByProject.get(project.id) ?? [];
      const columns = STATUS_COLUMNS.map((column) => ({
        status: column.status,
        label: column.label,
        tasks: projectTasks
          .filter((task) => (task.status ?? BACKLOG_STATUS) === column.status)
          .sort(compareTasks),
      }));
      return { project, columns };
    });

  return { customer, columns: STATUS_COLUMNS, lanes };
}

/** One project column on the project-columns board: a project and its tasks. */
export interface ProjectColumn {
  project: Project;
  tasks: Task[];
}

/** A customer's project-columns board: one column per active project. */
export interface ProjectBoard {
  customer: Customer;
  columns: ProjectColumn[];
}

/**
 * Build a customer's project-columns board: one column per active project owned
 * by the customer, each listing that project's tasks ordered by sort order then
 * name. Unlike the swimlane board, tasks are not split by status — the caller
 * shows each task's status inline (e.g. a dropdown). Pure, so column membership
 * and ordering can be tested without data access.
 */
export function buildProjectBoard(
  customer: Customer,
  projects: Project[],
  tasks: Task[],
): ProjectBoard {
  const tasksByProject = new Map<string, Task[]>();
  for (const task of tasks) {
    const siblings = tasksByProject.get(task.projectId);
    if (siblings) {
      siblings.push(task);
    } else {
      tasksByProject.set(task.projectId, [task]);
    }
  }

  const columns = projects
    .filter((project) => project.active && project.customerId === customer.id)
    .map((project) => ({
      project,
      tasks: [...(tasksByProject.get(project.id) ?? [])].sort(compareTasks),
    }));

  return { customer, columns };
}

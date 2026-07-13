import type { Customer } from './customers';
import type { Project } from './projects';
import type { Task } from './tasks';
import { Csa_taskscsa_status } from '../generated/models/Csa_tasksModel';

/** A single status column on the board. */
export interface StatusColumn {
  /** Raw Dataverse status choice value (`csa_status`). */
  status: number;
  /** Human-readable column heading. */
  label: string;
}

/** The `Backlog` status; also the column a task with no status falls into. */
export const BACKLOG_STATUS = 100000000;

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
 * Pure status-transition-on-drag rule: dropping a task on a column sets the
 * task's status to that column. Dropping on the task's current column (treating
 * an unset status as Backlog) is a no-op, so no write is issued.
 */
export function statusOnDrop(task: Task, targetStatus: number): StatusTransition {
  const current = task.status ?? BACKLOG_STATUS;
  return { changed: current !== targetStatus, status: targetStatus };
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

/** A customer's swimlane board: active project lanes × status columns. */
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
 * Build a customer's swimlane board: one lane per active project owned by the
 * customer, each split into the fixed status columns. Tasks are placed in the
 * column matching their status (an unset status counts as Backlog) and ordered
 * within a column by sort order then name. Pure, so placement and ordering can
 * be tested without data access.
 */
export function buildCustomerBoard(
  customer: Customer,
  projects: Project[],
  tasks: Task[],
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
    .filter((project) => project.active && project.customerId === customer.id)
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

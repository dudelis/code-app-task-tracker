import type { Task } from './tasks';

/** The `Me` responsible choice value (`csa_responsible`). */
export const ME_RESPONSIBLE = 100000000;

/** The `Customer` responsible choice value (`csa_responsible`). */
export const CUSTOMER_RESPONSIBLE = 100000001;

/**
 * The Responsible filter setting:
 * - `all` shows every task, regardless of (or missing) responsible;
 * - `me` shows only tasks I'm responsible for;
 * - `customer` shows only tasks the customer is responsible for.
 */
export type ResponsibleFilter = 'all' | 'me' | 'customer';

/**
 * Pure Responsible predicate shared by every view (overview tree, swimlane
 * board, project board). `all` matches everything. `me`/`customer` match only
 * tasks whose responsible equals that choice; a task with no responsible set
 * matches neither, so it is hidden under `me` and `customer` and shown only
 * under `all`. Keeping this a pure function lets the filter be tested
 * independently and applied identically wherever tasks are displayed.
 */
export function matchesResponsible(task: Task, filter: ResponsibleFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'me':
      return task.responsible === ME_RESPONSIBLE;
    case 'customer':
      return task.responsible === CUSTOMER_RESPONSIBLE;
  }
}

/** Keep only the tasks matching the Responsible filter. */
export function filterTasksByResponsible(
  tasks: Task[],
  filter: ResponsibleFilter,
): Task[] {
  return tasks.filter((task) => matchesResponsible(task, filter));
}

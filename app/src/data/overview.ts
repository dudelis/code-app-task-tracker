import type { Customer } from './customers';
import type { Project } from './projects';
import { isNotDone, type Task } from './tasks';

/** A project with its not-done tasks nested beneath it, for the overview tree. */
export interface ProjectTreeNode {
  project: Project;
  tasks: Task[];
}

/** A customer with its active projects nested beneath it, for the overview tree. */
export interface CustomerTreeNode {
  customer: Customer;
  projects: ProjectTreeNode[];
}

/**
 * Build the default Customer → Project → Task overview tree.
 *
 * Default filter: only active customers appear, only active projects are nested
 * under their owning customer, and only not-done tasks are nested under their
 * owning project. This is a pure function so the default-filter logic can be
 * tested independently of data access; the seams already request active-only
 * and not-done, but enforcing it here keeps the view correct regardless of what
 * the data source returns.
 */
export function buildOverviewTree(
  customers: Customer[],
  projects: Project[],
  tasks: Task[],
): CustomerTreeNode[] {
  const notDoneTasksByProject = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!isNotDone(task)) continue;
    const siblings = notDoneTasksByProject.get(task.projectId);
    if (siblings) {
      siblings.push(task);
    } else {
      notDoneTasksByProject.set(task.projectId, [task]);
    }
  }

  const activeProjectNodesByCustomer = new Map<string, ProjectTreeNode[]>();
  for (const project of projects) {
    if (!project.active) continue;
    const node: ProjectTreeNode = {
      project,
      tasks: notDoneTasksByProject.get(project.id) ?? [],
    };
    const siblings = activeProjectNodesByCustomer.get(project.customerId);
    if (siblings) {
      siblings.push(node);
    } else {
      activeProjectNodesByCustomer.set(project.customerId, [node]);
    }
  }

  return customers
    .filter((customer) => customer.active)
    .map((customer) => ({
      customer,
      projects: activeProjectNodesByCustomer.get(customer.id) ?? [],
    }));
}

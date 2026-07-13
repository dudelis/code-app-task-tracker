import type { Customer } from './customers';
import type { Project } from './projects';
import { isNotDone, type Task } from './tasks';
import { isVisible } from './visibility';

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
 * Build the Customer → Project → Task overview tree.
 *
 * Visibility: inactive customers and projects are hidden by default; passing
 * `showInactive` reveals them. Only not-done tasks are nested under their
 * owning project. This is a pure function so the visibility logic can be tested
 * independently of data access; the callers load every customer and project so
 * the toggle can reveal inactive ones without re-fetching.
 */
export function buildOverviewTree(
  customers: Customer[],
  projects: Project[],
  tasks: Task[],
  showInactive = false,
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

  const projectNodesByCustomer = new Map<string, ProjectTreeNode[]>();
  for (const project of projects) {
    if (!isVisible(project, showInactive)) continue;
    const node: ProjectTreeNode = {
      project,
      tasks: notDoneTasksByProject.get(project.id) ?? [],
    };
    const siblings = projectNodesByCustomer.get(project.customerId);
    if (siblings) {
      siblings.push(node);
    } else {
      projectNodesByCustomer.set(project.customerId, [node]);
    }
  }

  return customers
    .filter((customer) => isVisible(customer, showInactive))
    .map((customer) => ({
      customer,
      projects: projectNodesByCustomer.get(customer.id) ?? [],
    }));
}

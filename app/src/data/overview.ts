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

/**
 * A project grouped for the table (Grid / My Tasks) views: its open tasks and,
 * separately, its Done tasks — the latter shown behind a collapsed "Completed"
 * line. Both lists are ordered by sort order then name.
 */
export interface GridProjectGroup {
  project: Project;
  openTasks: Task[];
  completedTasks: Task[];
}

/**
 * One customer's tasks partitioned for the Grid table: active projects (each
 * split into open and Completed tasks) plus a single Inactive bucket holding
 * inactive projects with their tasks. Projects are alphabetical within each
 * bucket. Kept separate from active projects so the view can gather inactive
 * work into one collapsed section at the bottom.
 */
export interface CustomerGrid {
  activeProjects: GridProjectGroup[];
  inactiveProjects: GridProjectGroup[];
}

/** Order tasks by sort order, then by name for stability. */
function compareTasks(a: Task, b: Task): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name);
}

/** Order projects alphabetically by name for stable display. */
function compareProjects(a: Project, b: Project): number {
  return a.name.localeCompare(b.name);
}

/**
 * Split one project's tasks into open (not Done) and completed (Done) lists,
 * each ordered by sort order then name.
 */
function groupProjectTasks(project: Project, tasks: Task[]): GridProjectGroup {
  const openTasks = tasks.filter(isNotDone).sort(compareTasks);
  const completedTasks = tasks.filter((task) => !isNotDone(task)).sort(compareTasks);
  return { project, openTasks, completedTasks };
}

/**
 * Build one customer's Grid partition: group the customer's projects by their
 * active flag, ordering each bucket alphabetically, and split every project's
 * tasks into open and Completed lists. Tasks whose project is not the
 * customer's (or is missing) are ignored. Pure, so placement and ordering can
 * be unit-tested without data access; the caller pre-applies any Responsible
 * filter, exactly as the swimlane board does.
 */
export function buildCustomerGrid(
  customer: Customer,
  projects: Project[],
  tasks: Task[],
): CustomerGrid {
  const tasksByProject = new Map<string, Task[]>();
  for (const task of tasks) {
    const siblings = tasksByProject.get(task.projectId);
    if (siblings) {
      siblings.push(task);
    } else {
      tasksByProject.set(task.projectId, [task]);
    }
  }

  const owned = projects.filter((project) => project.customerId === customer.id);

  const activeProjects = owned
    .filter((project) => project.active)
    .sort(compareProjects)
    .map((project) => groupProjectTasks(project, tasksByProject.get(project.id) ?? []));

  const inactiveProjects = owned
    .filter((project) => !project.active)
    .sort(compareProjects)
    .map((project) => groupProjectTasks(project, tasksByProject.get(project.id) ?? []));

  return { activeProjects, inactiveProjects };
}

/**
 * One company's slice of the global My Tasks view: a customer with its Grid
 * partition (active projects split into open/Completed, plus an Inactive
 * bucket). Reuses {@link CustomerGrid}'s shape so the global and per-customer
 * table views share one row/section structure.
 */
export interface CompanyGrid extends CustomerGrid {
  customer: Customer;
}

/** Order customers alphabetically by name for stable display. */
function compareCustomers(a: Customer, b: Customer): number {
  return a.name.localeCompare(b.name);
}

/**
 * Build the global My Tasks partition: every customer that owns at least one
 * project, alphabetical, each with its per-customer Grid partition (active
 * projects with open/Completed splits and a bottom Inactive bucket). Composes
 * {@link buildCustomerGrid} per company so the single-customer and company-
 * grouped shapes stay identical below the company level. Companies with no
 * projects are omitted so the view lists only companies with work. Pure, so
 * grouping and ordering can be unit-tested without data access; the caller
 * pre-applies any Responsible filter, exactly as the Grid does.
 */
export function buildGlobalGrid(
  customers: Customer[],
  projects: Project[],
  tasks: Task[],
): CompanyGrid[] {
  return [...customers]
    .sort(compareCustomers)
    .map((customer) => ({ customer, ...buildCustomerGrid(customer, projects, tasks) }))
    .filter(
      (company) =>
        company.activeProjects.length > 0 || company.inactiveProjects.length > 0,
    );
}


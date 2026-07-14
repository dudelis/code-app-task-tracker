import type { Csa_projects } from '../generated/models/Csa_projectsModel';
import type { Csa_projectsBase } from '../generated/models/Csa_projectsModel';
import { Csa_projectscsa_priority } from '../generated/models/Csa_projectsModel';
import type { IGetAllOptions } from '../generated/models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';
import type { TasksFetcher } from './tasks';

/**
 * A Project as consumed by the UI — a thin, stable projection of the generated
 * Dataverse model so components never depend on raw `csa_*` field names.
 */
export interface Project {
  id: string;
  name: string;
  active: boolean;
  /** Id of the owning Customer (the `csa_customerid` lookup value). */
  customerId: string;
  /** Free-text description (`csa_description`); '' when unset. */
  description: string;
  /** URL to the project's materials (`csa_materialsurl`); '' when unset. */
  materialsUrl: string;
  /** Due date as the raw Dataverse date string (`csa_duedate`); '' when unset. */
  dueDate: string;
  /** Raw Dataverse priority choice value (`csa_priority`), or undefined when unset. */
  priority?: Csa_projectscsa_priority;
  /** Workflow-maintained rollup summary of the project's notes (`csa_notessummary`); '' when unset. */
  notesSummary: string;
}

/** OData filter that returns only active projects (custom csa_active field, not statecode). */
export const ACTIVE_PROJECTS_FILTER = 'csa_active eq true';

/**
 * Signature of the generated `Csa_projectsService.getAll`. Injected so the
 * data-access seam can be exercised without importing the Power Apps runtime.
 */
export type ProjectsFetcher = (
  options?: IGetAllOptions,
) => Promise<IOperationResult<Csa_projects[]>>;

/** Resolve a priority choice value to its display label, or '' when unset/unknown. */
export function priorityLabel(value?: Csa_projectscsa_priority | undefined): string {
  if (value === undefined) return '';
  return Csa_projectscsa_priority[value] ?? '';
}

/** Map a raw Dataverse record to the UI-facing Project shape. */
export function mapProject(record: Csa_projects): Project {
  return {
    id: record.csa_projectid,
    name: record.csa_name ?? '',
    active: record.csa_active === true,
    customerId: record._csa_customerid_value ?? '',
    description: record.csa_description ?? '',
    materialsUrl: record.csa_materialsurl ?? '',
    dueDate: record.csa_duedate ?? '',
    priority: record.csa_priority,
    notesSummary: record.csa_notessummary ?? '',
  };
}

/** Keep only active projects and project them to the UI shape. */
export function selectActiveProjects(records: Csa_projects[]): Project[] {
  return records.filter((r) => r.csa_active === true).map(mapProject);
}

/**
 * Read active projects through the data-access seam. Requests active-only from
 * Dataverse and re-applies the active filter client-side as defense in depth.
 */
export async function fetchActiveProjects(fetch: ProjectsFetcher): Promise<Project[]> {
  const result = await fetch({
    filter: ACTIVE_PROJECTS_FILTER,
    orderBy: ['csa_name asc'],
  });
  return selectActiveProjects(result.data ?? []);
}

/** Map every project (active and inactive) to the UI shape. */
export function selectProjects(records: Csa_projects[]): Project[] {
  return records.map(mapProject);
}

/**
 * Read every project through the data-access seam, active and inactive, sorted
 * by name. The overview loads all projects so the "show inactive" toggle can
 * reveal inactive ones without re-fetching.
 */
export async function fetchAllProjects(fetch: ProjectsFetcher): Promise<Project[]> {
  const result = await fetch({
    orderBy: ['csa_name asc'],
  });
  return selectProjects(result.data ?? []);
}

/**
 * Signature of the generated `Csa_projectsService.update`. Injected so the
 * write seam can be exercised without importing the Power Apps runtime.
 */
export type ProjectUpdater = (
  id: string,
  changedFields: Partial<Omit<Csa_projectsBase, 'csa_projectid'>>,
) => Promise<IOperationResult<Csa_projects>>;

/** Persist a project's Active/Inactive state through the write seam. */
export async function updateProjectActive(
  update: ProjectUpdater,
  id: string,
  active: boolean,
): Promise<void> {
  await update(id, { csa_active: active });
}

/** OData bind value for a Customer lookup, e.g. `/csa_customers(<id>)`. */
export function customerBind(customerId: string): string {
  return `/csa_customers(${customerId})`;
}

/**
 * Editable values for the unified create/edit Project detail pane — the stable
 * projection the form binds to so the UI never touches raw `csa_*` fields.
 */
export interface ProjectFormValues {
  name: string;
  /** Id of the owning Customer (required); empty until one is chosen. */
  customerId: string;
  active: boolean;
  /** Free-text description; '' when unset. */
  description: string;
  /** URL to the project's materials; '' when unset. */
  materialsUrl: string;
  /** Due date as a date string; '' when unset. */
  dueDate: string;
  /** Selected priority choice value, or null when unset. */
  priority: number | null;
  /** Workflow-maintained notes summary carried through the form; '' when unset. */
  notesSummary: string;
}

/** Field-level validation errors for the Project form, keyed by field. */
export interface ProjectFormErrors {
  name?: string;
  customerId?: string;
}

/** Selectable priority choices for the form, in Dataverse order. */
export const PRIORITY_OPTIONS: { value: number; label: string }[] = (
  Object.keys(Csa_projectscsa_priority) as unknown as Csa_projectscsa_priority[]
).map((value) => ({ value: Number(value), label: Csa_projectscsa_priority[value] }));

/**
 * Blank form values for creating a project; Active defaults to Yes. An optional
 * customer id pre-fills the required Customer selector (contextual "+ Project").
 * The new context fields start empty and Priority starts unset.
 */
export function newProjectForm(customerId = ''): ProjectFormValues {
  return {
    name: '',
    customerId,
    active: true,
    description: '',
    materialsUrl: '',
    dueDate: '',
    priority: null,
    notesSummary: '',
  };
}

/** Project an existing project into editable form values. */
export function projectToForm(project: Project): ProjectFormValues {
  return {
    name: project.name,
    customerId: project.customerId,
    active: project.active,
    description: project.description ?? '',
    materialsUrl: project.materialsUrl ?? '',
    dueDate: project.dueDate ?? '',
    priority: project.priority ?? null,
    notesSummary: project.notesSummary ?? '',
  };
}

/** Pure validation for the Project form. Name and Customer are both required. */
export function validateProjectForm(values: ProjectFormValues): ProjectFormErrors {
  const errors: ProjectFormErrors = {};
  if (values.name.trim() === '') {
    errors.name = 'Name is required.';
  }
  if (values.customerId.trim() === '') {
    errors.customerId = 'Customer is required.';
  }
  return errors;
}

/**
 * Signature of the generated `Csa_projectsService.create`. Injected so the
 * write seam can be exercised without importing the Power Apps runtime.
 */
export type ProjectCreator = (
  record: Omit<Csa_projectsBase, 'csa_projectid'>,
) => Promise<IOperationResult<Csa_projects>>;

/**
 * Create a project through the write seam and return the UI projection. The name
 * is trimmed; the owning Customer is bound via `csa_CustomerId@odata.bind`; the
 * server-assigned id comes back on the created record.
 */
export async function createProject(
  create: ProjectCreator,
  values: ProjectFormValues,
): Promise<Project> {
  const name = values.name.trim();
  const priority = (values.priority ?? undefined) as Csa_projectscsa_priority | undefined;
  const result = await create({
    csa_name: name,
    csa_active: values.active,
    csa_description: values.description,
    csa_materialsurl: values.materialsUrl,
    csa_notessummary: values.notesSummary,
    ...(values.dueDate ? { csa_duedate: values.dueDate } : {}),
    ...(priority !== undefined ? { csa_priority: priority } : {}),
    'csa_CustomerId@odata.bind': customerBind(values.customerId),
  } as Omit<Csa_projectsBase, 'csa_projectid'>);
  return {
    id: result.data?.csa_projectid ?? '',
    name,
    active: values.active,
    customerId: values.customerId,
    description: values.description,
    materialsUrl: values.materialsUrl,
    dueDate: values.dueDate,
    priority,
    notesSummary: values.notesSummary,
  };
}

/**
 * Update a project's name, owning Customer, and active state through the write
 * seam and return the UI projection built from the submitted values.
 */
export async function updateProject(
  update: ProjectUpdater,
  id: string,
  values: ProjectFormValues,
): Promise<Project> {
  const name = values.name.trim();
  const priority = (values.priority ?? undefined) as Csa_projectscsa_priority | undefined;
  await update(id, {
    csa_name: name,
    csa_active: values.active,
    csa_description: values.description,
    csa_materialsurl: values.materialsUrl,
    csa_notessummary: values.notesSummary,
    csa_duedate: values.dueDate ? values.dueDate : null,
    csa_priority: priority ?? null,
    'csa_CustomerId@odata.bind': customerBind(values.customerId),
  } as Partial<Omit<Csa_projectsBase, 'csa_projectid'>>);
  return {
    id,
    name,
    active: values.active,
    customerId: values.customerId,
    description: values.description,
    materialsUrl: values.materialsUrl,
    dueDate: values.dueDate,
    priority,
    notesSummary: values.notesSummary,
  };
}

/**
 * Signature of the generated `Csa_projectsService.delete`. Injected so the
 * delete seam can be exercised without importing the Power Apps runtime.
 */
export type ProjectDeleter = (id: string) => Promise<void>;

/** Permanently delete a project record through the seam (hard delete per ADR-0002). */
export async function deleteProject(remove: ProjectDeleter, id: string): Promise<void> {
  await remove(id);
}

/** OData filter selecting every task that belongs to a project. */
export function projectTasksFilter(projectId: string): string {
  return `_csa_projectid_value eq ${projectId}`;
}

/**
 * Resolve the ids of every task belonging to a project through the tasks fetch
 * seam. Used by the Project cascade to enumerate the task children it must
 * delete before the project itself.
 */
export async function fetchProjectTaskIds(
  fetch: TasksFetcher,
  projectId: string,
): Promise<string[]> {
  const result = await fetch({ filter: projectTasksFilter(projectId) });
  return (result.data ?? []).map((task) => task.csa_taskid);
}

/**
 * The cascade steps for deleting a project, each already bound to its data seam.
 * Injected so the orchestration order is unit-testable and the data modules stay
 * decoupled — the Project cascade composes the reusable Task cascade per task
 * without importing the tasks/notes/labels modules directly.
 */
export interface ProjectCascadeDeps {
  /** Resolve the ids of every task belonging to the project. */
  listTaskIds: (projectId: string) => Promise<string[]>;
  /** Hard-delete a single task and its subtree (composes `deleteTaskCascade`). */
  deleteTaskCascade: (taskId: string) => Promise<void>;
  /** Delete every note attached directly to the project (not its tasks' notes). */
  deleteProjectNotes: (projectId: string) => Promise<void>;
  /** Detach every contact link from the project (the project side of the M:N). */
  detachContacts: (projectId: string) => Promise<void>;
  /** Delete the project record itself. */
  deleteProject: (projectId: string) => Promise<void>;
}

/**
 * Hard-delete a project and its subtree (ADR-0002): enumerate the project's
 * tasks, cascade-delete each (its notes and label links go with it), delete the
 * notes attached directly to the project, detach the project's contact links,
 * then delete the project. Children (and M:N links) are always removed before
 * the parent, so no orphaned descendants or dangling associations remain.
 */
export async function deleteProjectCascade(
  deps: ProjectCascadeDeps,
  projectId: string,
): Promise<void> {
  const taskIds = await deps.listTaskIds(projectId);
  for (const taskId of taskIds) {
    await deps.deleteTaskCascade(taskId);
  }
  await deps.deleteProjectNotes(projectId);
  await deps.detachContacts(projectId);
  await deps.deleteProject(projectId);
}

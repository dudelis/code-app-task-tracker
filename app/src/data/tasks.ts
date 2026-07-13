import type { Csa_tasks, Csa_tasksBase } from '../generated/models/Csa_tasksModel';
import { Csa_taskscsa_responsible, Csa_taskscsa_status } from '../generated/models/Csa_tasksModel';
import type { IGetAllOptions } from '../generated/models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';

/**
 * A Task as consumed by the UI — a thin, stable projection of the generated
 * Dataverse model so components never depend on raw `csa_*` field names.
 */
export interface Task {
  id: string;
  name: string;
  /** Raw Dataverse status choice value (`csa_status`), or undefined when unset. */
  status?: number;
  /** Human-readable status label for display; empty when the status is unset. */
  statusLabel: string;
  /** Id of the owning Project (the `csa_projectid` lookup value). */
  projectId: string;
  /** Manual ordering within a status column; 0 when unset. */
  sortOrder: number;
  /** Raw Dataverse responsible choice value (`csa_responsible`), or undefined when unset. */
  responsible?: number;
  /** Due date as the raw Dataverse date string (`csa_duedate`), or undefined when unset. */
  duedate?: string;
  /** Free-text description (`csa_description`), or undefined when unset. */
  description?: string;
}

/** The `Backlog` status choice value; also the status an unset task is treated as. */
export const BACKLOG_STATUS = 100000000;

/** The `Done` status choice value; Done tasks are hidden from the overview by default. */
export const DONE_STATUS = 100000004;

/** OData filter that excludes Done tasks. Tasks with no status set are kept. */
export const NOT_DONE_TASKS_FILTER = `csa_status ne ${DONE_STATUS}`;

/**
 * Signature of the generated `Csa_tasksService.getAll`. Injected so the
 * data-access seam can be exercised without importing the Power Apps runtime.
 */
export type TasksFetcher = (
  options?: IGetAllOptions,
) => Promise<IOperationResult<Csa_tasks[]>>;

/** Resolve a status choice value to its display label, or '' when unset/unknown. */
function statusLabel(status: number | undefined): string {
  if (status === undefined) return '';
  return Csa_taskscsa_status[status as Csa_taskscsa_status] ?? '';
}

/** Map a raw Dataverse record to the UI-facing Task shape. */
export function mapTask(record: Csa_tasks): Task {
  return {
    id: record.csa_taskid,
    name: record.csa_name ?? '',
    status: record.csa_status,
    statusLabel: statusLabel(record.csa_status),
    projectId: record._csa_projectid_value ?? '',
    sortOrder: record.csa_sortorder ?? 0,
    responsible: record.csa_responsible,
    duedate: record.csa_duedate,
    description: record.csa_description,
  };
}

/** Pure not-done filter: true when a task is not in the Done status. */
export function isNotDone(task: Task): boolean {
  return task.status !== DONE_STATUS;
}

/**
 * Pure overdue rule for a task's due date, relative to `today` (both as
 * `YYYY-MM-DD` strings; only the date portion of `duedate` is compared, so a
 * datetime value is tolerated). A task is overdue when it has a due date
 * strictly before `today` and is not yet Done — due today is not overdue, and a
 * Done task is never overdue. Keeping this pure lets the board highlight overdue
 * cards without embedding date logic in the component.
 */
export function isOverdue(task: Task, today: string): boolean {
  if (task.status === DONE_STATUS) return false;
  const due = task.duedate?.slice(0, 10);
  if (!due) return false;
  return due < today;
}

/** Project records to the UI shape and keep only not-done tasks. */
export function selectNotDoneTasks(records: Csa_tasks[]): Task[] {
  return records.map(mapTask).filter(isNotDone);
}

/**
 * Read not-done tasks through the data-access seam. Requests not-done from
 * Dataverse and re-applies the not-done filter client-side as defense in depth.
 */
export async function fetchNotDoneTasks(fetch: TasksFetcher): Promise<Task[]> {
  const result = await fetch({
    filter: NOT_DONE_TASKS_FILTER,
    orderBy: ['csa_sortorder asc', 'csa_name asc'],
  });
  return selectNotDoneTasks(result.data ?? []);
}

/**
 * Read every task through the data-access seam, ordered by sort order then
 * name. The board needs all statuses (including Done) so a task can be dragged
 * into and out of every column; callers that hide Done re-filter downstream.
 */
export async function fetchAllTasks(fetch: TasksFetcher): Promise<Task[]> {
  const result = await fetch({
    orderBy: ['csa_sortorder asc', 'csa_name asc'],
  });
  return (result.data ?? []).map(mapTask);
}

/**
 * Signature of the generated `Csa_tasksService.update`. Injected so the
 * write seam can be exercised without importing the Power Apps runtime.
 */
export type TaskUpdater = (
  id: string,
  changedFields: Partial<Omit<Csa_tasksBase, 'csa_taskid'>>,
) => Promise<IOperationResult<Csa_tasks>>;

/** Persist a task's new status choice through the write seam. */
export async function updateTaskStatus(
  update: TaskUpdater,
  id: string,
  status: number,
): Promise<void> {
  await update(id, { csa_status: status as Csa_taskscsa_status });
}

/**
 * Editable values for the unified create/edit Task detail pane — the stable
 * projection the form binds to so the UI never touches raw `csa_*` fields.
 * `responsible` is null when nobody is assigned; `duedate`/`description` are
 * empty strings when unset. `projectId` is the required owning Project; it is
 * fixed on edit and picked (context-prefilled) on create.
 */
export interface TaskFormValues {
  name: string;
  status: number;
  responsible: number | null;
  duedate: string;
  description: string;
  /** Id of the owning Project (required); empty until one is chosen on create. */
  projectId: string;
}

/** Field-level validation errors for the Task form, keyed by field. */
export interface TaskFormErrors {
  name?: string;
  projectId?: string;
}

/** Selectable responsible choices for the form, in Dataverse order. */
export const RESPONSIBLE_CHOICES: { value: number; label: string }[] = (
  Object.keys(Csa_taskscsa_responsible) as unknown as Csa_taskscsa_responsible[]
).map((value) => ({ value: Number(value), label: Csa_taskscsa_responsible[value] }));

/**
 * Blank form values for creating a task. An optional project id pre-fills the
 * required Project selector and a status defaults the column (both supplied by
 * the contextual "+ Task" entry point); the global "New Task" leaves the project
 * empty and defaults Status to Backlog.
 */
export function newTaskForm(projectId = '', status: number = BACKLOG_STATUS): TaskFormValues {
  return { name: '', status, responsible: null, duedate: '', description: '', projectId };
}

/**
 * User-entered fields for the inline per-bucket quick-add: `name` is required,
 * `duedate` and `responsible` are optional. A thin input the board's quick-add
 * composer collects before composing full form values.
 */
export interface QuickAddTaskInput {
  name: string;
  duedate?: string;
  responsible?: number | null;
}

/**
 * Compose Task form values for the inline quick-add on a board bucket: start
 * from {@link newTaskForm} — which defaults the owning Project from the swimlane
 * and the Status from the originating bucket — then overlay the quick-add inputs
 * (name, plus optional due date and responsible). Pure, so the bucket
 * context-defaulting and name-required validation can be tested without the UI.
 */
export function quickAddTaskForm(
  projectId: string,
  status: number,
  input: QuickAddTaskInput,
): TaskFormValues {
  return {
    ...newTaskForm(projectId, status),
    name: input.name,
    duedate: input.duedate ?? '',
    responsible: input.responsible ?? null,
  };
}

/** Project an existing task into editable form values. */
export function taskToForm(task: Task): TaskFormValues {
  return {
    name: task.name,
    status: task.status ?? BACKLOG_STATUS,
    responsible: task.responsible ?? null,
    duedate: task.duedate ?? '',
    description: task.description ?? '',
    projectId: task.projectId,
  };
}
export function validateTaskForm(values: TaskFormValues): TaskFormErrors {
  const errors: TaskFormErrors = {};
  if (values.name.trim() === '') {
    errors.name = 'Name is required.';
  }
  if (values.projectId.trim() === '') {
    errors.projectId = 'Project is required.';
  }
  return errors;
}

/** OData bind value for a Project lookup, e.g. `/csa_projects(<id>)`. */
export function projectBind(projectId: string): string {
  return `/csa_projects(${projectId})`;
}

/**
 * Signature of the generated `Csa_tasksService.create`. Injected so the
 * write seam can be exercised without importing the Power Apps runtime.
 */
export type TaskCreator = (
  record: Omit<Csa_tasksBase, 'csa_taskid'>,
) => Promise<IOperationResult<Csa_tasks>>;

/**
 * Create a task through the write seam and return the UI projection. The name is
 * trimmed; an unassigned responsible and a blank due date are sent as `null`;
 * the owning Project is bound via `csa_ProjectId@odata.bind`; `csa_sortorder` is
 * set programmatically to 0 (it is never shown on the form). The server-assigned
 * id comes back on the created record.
 */
export async function createTask(
  create: TaskCreator,
  values: TaskFormValues,
): Promise<Task> {
  const name = values.name.trim();
  const duedate = values.duedate.trim() === '' ? null : values.duedate;
  const responsible = values.responsible;
  const description = values.description;
  const result = await create({
    csa_name: name,
    csa_status: values.status,
    csa_responsible: responsible,
    csa_duedate: duedate,
    csa_description: description,
    csa_sortorder: 0,
    'csa_ProjectId@odata.bind': projectBind(values.projectId),
  } as Omit<Csa_tasksBase, 'csa_taskid'>);
  return {
    id: result.data?.csa_taskid ?? '',
    name,
    status: values.status,
    statusLabel: statusLabel(values.status),
    projectId: values.projectId,
    sortOrder: 0,
    responsible: responsible ?? undefined,
    duedate: duedate ?? undefined,
    description,
  };
}

/**
 * Persist a task's edited fields through the write seam and return the merged UI
 * projection. The name is trimmed; an unassigned responsible and a blank due
 * date are sent as `null` so Dataverse clears them. When the form's `projectId`
 * differs from the task's current owner the task is reassigned via the Project
 * lookup `@odata.bind`; otherwise the project is left untouched. The original
 * task carries fields the form does not edit (sort order) into the returned
 * value.
 */
export async function updateTask(
  update: TaskUpdater,
  task: Task,
  values: TaskFormValues,
): Promise<Task> {
  const name = values.name.trim();
  const duedate = values.duedate.trim() === '' ? null : values.duedate;
  const responsible = values.responsible;
  const description = values.description;
  // Reassign the owning Project only when a non-empty choice differs from the
  // current one, sending the lookup as an `@odata.bind` (mirrors createTask).
  const projectId = values.projectId.trim();
  const projectChanged = projectId !== '' && projectId !== task.projectId;
  const changedFields = {
    csa_name: name,
    csa_status: values.status,
    csa_responsible: responsible,
    csa_duedate: duedate,
    csa_description: description,
    ...(projectChanged ? { 'csa_ProjectId@odata.bind': projectBind(projectId) } : {}),
  } as Partial<Omit<Csa_tasksBase, 'csa_taskid'>>;
  await update(task.id, changedFields);
  return {
    ...task,
    name,
    status: values.status,
    statusLabel: statusLabel(values.status),
    projectId: projectChanged ? projectId : task.projectId,
    responsible: responsible ?? undefined,
    duedate: duedate ?? undefined,
    description,
  };
}

/**
 * Signature of the generated `Csa_tasksService.delete`. Injected so the delete
 * seam can be exercised without importing the Power Apps runtime.
 */
export type TaskDeleter = (id: string) => Promise<void>;

/** Permanently delete a task record through the seam (hard delete per ADR-0002). */
export async function deleteTask(remove: TaskDeleter, id: string): Promise<void> {
  await remove(id);
}

/**
 * The cascade steps for deleting a task, each already bound to its data seam.
 * Injected so the orchestration order is unit-testable and so the data modules
 * stay decoupled — the Task cascade composes note and label-link cleanup without
 * importing the notes/labels modules directly.
 */
export interface TaskCascadeDeps {
  /** Delete every note belonging to the task. */
  deleteNotes: (taskId: string) => Promise<void>;
  /** Remove every M:N label link from the task. */
  detachLabels: (taskId: string) => Promise<void>;
  /** Delete the task record itself. */
  deleteTask: (taskId: string) => Promise<void>;
}

/**
 * Hard-delete a task and its subtree (ADR-0002): delete the task's child notes
 * and detach its label links first, then delete the task, so no orphaned
 * children remain. Children are always removed before the parent. Reusable —
 * later Customer/Project cascades compose this per task.
 */
export async function deleteTaskCascade(
  deps: TaskCascadeDeps,
  taskId: string,
): Promise<void> {
  await deps.deleteNotes(taskId);
  await deps.detachLabels(taskId);
  await deps.deleteTask(taskId);
}

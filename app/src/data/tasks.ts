import type { Csa_tasks } from '../generated/models/Csa_tasksModel';
import { Csa_taskscsa_status } from '../generated/models/Csa_tasksModel';
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
}

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
  };
}

/** Pure not-done filter: true when a task is not in the Done status. */
export function isNotDone(task: Task): boolean {
  return task.status !== DONE_STATUS;
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

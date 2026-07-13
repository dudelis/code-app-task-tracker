import type { Csa_projects } from '../generated/models/Csa_projectsModel';
import type { IGetAllOptions } from '../generated/models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';

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

/** Map a raw Dataverse record to the UI-facing Project shape. */
export function mapProject(record: Csa_projects): Project {
  return {
    id: record.csa_projectid,
    name: record.csa_name ?? '',
    active: record.csa_active === true,
    customerId: record._csa_customerid_value ?? '',
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

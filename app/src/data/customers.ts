import type { Csa_customers } from '../generated/models/Csa_customersModel';
import type { IGetAllOptions } from '../generated/models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';

/**
 * A Customer as consumed by the UI — a thin, stable projection of the generated
 * Dataverse model so components never depend on raw `csa_*` field names.
 */
export interface Customer {
  id: string;
  name: string;
  active: boolean;
}

/** OData filter that returns only active customers (custom csa_active field, not statecode). */
export const ACTIVE_CUSTOMERS_FILTER = 'csa_active eq true';

/**
 * Signature of the generated `Csa_customersService.getAll`. Injected so the
 * data-access seam can be exercised without importing the Power Apps runtime.
 */
export type CustomersFetcher = (
  options?: IGetAllOptions,
) => Promise<IOperationResult<Csa_customers[]>>;

/** Map a raw Dataverse record to the UI-facing Customer shape. */
export function mapCustomer(record: Csa_customers): Customer {
  return {
    id: record.csa_customerid,
    name: record.csa_name ?? '',
    active: record.csa_active === true,
  };
}

/** Keep only active customers and project them to the UI shape. */
export function selectActiveCustomers(records: Csa_customers[]): Customer[] {
  return records.filter((r) => r.csa_active === true).map(mapCustomer);
}

/**
 * Read active customers through the data-access seam. Requests active-only from
 * Dataverse and re-applies the active filter client-side as defense in depth.
 */
export async function fetchActiveCustomers(fetch: CustomersFetcher): Promise<Customer[]> {
  const result = await fetch({
    filter: ACTIVE_CUSTOMERS_FILTER,
    orderBy: ['csa_name asc'],
  });
  return selectActiveCustomers(result.data ?? []);
}

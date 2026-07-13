import type { Csa_customers } from '../generated/models/Csa_customersModel';
import type { Csa_customersBase } from '../generated/models/Csa_customersModel';
import type { IGetAllOptions } from '../generated/models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';
import type { ProjectsFetcher } from './projects';

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

/** Map every customer (active and inactive) to the UI shape. */
export function selectCustomers(records: Csa_customers[]): Customer[] {
  return records.map(mapCustomer);
}

/**
 * Read every customer through the data-access seam, active and inactive, sorted
 * by name. The overview loads all customers so the "show inactive" toggle can
 * reveal inactive ones without re-fetching.
 */
export async function fetchAllCustomers(fetch: CustomersFetcher): Promise<Customer[]> {
  const result = await fetch({
    orderBy: ['csa_name asc'],
  });
  return selectCustomers(result.data ?? []);
}

/**
 * Signature of the generated `Csa_customersService.update`. Injected so the
 * write seam can be exercised without importing the Power Apps runtime.
 */
export type CustomerUpdater = (
  id: string,
  changedFields: Partial<Omit<Csa_customersBase, 'csa_customerid'>>,
) => Promise<IOperationResult<Csa_customers>>;

/** Persist a customer's Active/Inactive state through the write seam. */
export async function updateCustomerActive(
  update: CustomerUpdater,
  id: string,
  active: boolean,
): Promise<void> {
  await update(id, { csa_active: active });
}

/**
 * Editable values for the unified create/edit Customer detail pane — the stable
 * projection the form binds to so the UI never touches raw `csa_*` fields.
 */
export interface CustomerFormValues {
  name: string;
  active: boolean;
}

/** Field-level validation errors for the Customer form, keyed by field. */
export interface CustomerFormErrors {
  name?: string;
}

/** Blank form values for creating a customer; Active defaults to Yes. */
export function newCustomerForm(): CustomerFormValues {
  return { name: '', active: true };
}

/** Project an existing customer into editable form values. */
export function customerToForm(customer: Customer): CustomerFormValues {
  return { name: customer.name, active: customer.active };
}

/** Pure validation for the Customer form. Name is required (non-blank). */
export function validateCustomerForm(values: CustomerFormValues): CustomerFormErrors {
  const errors: CustomerFormErrors = {};
  if (values.name.trim() === '') {
    errors.name = 'Name is required.';
  }
  return errors;
}

/**
 * Signature of the generated `Csa_customersService.create`. Injected so the
 * write seam can be exercised without importing the Power Apps runtime.
 */
export type CustomerCreator = (
  record: Omit<Csa_customersBase, 'csa_customerid'>,
) => Promise<IOperationResult<Csa_customers>>;

/**
 * Create a customer through the write seam and return the UI projection. The
 * name is trimmed; the server-assigned id comes back on the created record.
 */
export async function createCustomer(
  create: CustomerCreator,
  values: CustomerFormValues,
): Promise<Customer> {
  const name = values.name.trim();
  const result = await create({
    csa_name: name,
    csa_active: values.active,
  } as Omit<Csa_customersBase, 'csa_customerid'>);
  return {
    id: result.data?.csa_customerid ?? '',
    name,
    active: values.active,
  };
}

/**
 * Update a customer's name and active state through the write seam and return
 * the UI projection built from the submitted values.
 */
export async function updateCustomer(
  update: CustomerUpdater,
  id: string,
  values: CustomerFormValues,
): Promise<Customer> {
  const name = values.name.trim();
  await update(id, { csa_name: name, csa_active: values.active });
  return { id, name, active: values.active };
}

/**
 * Signature of the generated `Csa_customersService.delete`. Injected so the
 * delete seam can be exercised without importing the Power Apps runtime.
 */
export type CustomerDeleter = (id: string) => Promise<void>;

/** Permanently delete a customer record through the seam (hard delete per ADR-0002). */
export async function deleteCustomer(remove: CustomerDeleter, id: string): Promise<void> {
  await remove(id);
}

/** OData filter selecting every project that belongs to a customer. */
export function customerProjectsFilter(customerId: string): string {
  return `_csa_customerid_value eq ${customerId}`;
}

/**
 * Resolve the ids of every project belonging to a customer through the projects
 * fetch seam. Used by the Customer cascade to enumerate the project children it
 * must cascade-delete before the customer itself.
 */
export async function fetchCustomerProjectIds(
  fetch: ProjectsFetcher,
  customerId: string,
): Promise<string[]> {
  const result = await fetch({ filter: customerProjectsFilter(customerId) });
  return (result.data ?? []).map((project) => project.csa_projectid);
}

/**
 * The cascade steps for deleting a customer, each already bound to its data
 * seam. Injected so the orchestration order is unit-testable and the data
 * modules stay decoupled — the Customer cascade composes the reusable Project
 * cascade (which itself composes the Task cascade) per project.
 */
export interface CustomerCascadeDeps {
  /** Resolve the ids of every project belonging to the customer. */
  listProjectIds: (customerId: string) => Promise<string[]>;
  /** Hard-delete a single project and its subtree (composes `deleteProjectCascade`). */
  deleteProjectCascade: (projectId: string) => Promise<void>;
  /** Delete the customer record itself. */
  deleteCustomer: (customerId: string) => Promise<void>;
}

/**
 * Hard-delete a customer and its subtree (ADR-0002): enumerate the customer's
 * projects, cascade-delete each (its tasks, their notes and label links go with
 * it), then delete the customer. Children are always removed before the parent,
 * so no orphaned descendants remain.
 */
export async function deleteCustomerCascade(
  deps: CustomerCascadeDeps,
  customerId: string,
): Promise<void> {
  const projectIds = await deps.listProjectIds(customerId);
  for (const projectId of projectIds) {
    await deps.deleteProjectCascade(projectId);
  }
  await deps.deleteCustomer(customerId);
}

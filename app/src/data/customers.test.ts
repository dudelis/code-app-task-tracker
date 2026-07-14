import { describe, expect, it, vi } from 'vitest';
import type { Csa_customers } from '../generated/models/Csa_customersModel';
import type { Csa_projects } from '../generated/models/Csa_projectsModel';
import type { IOperationResult } from '@microsoft/power-apps/data';
import {
  ACTIVE_CUSTOMERS_FILTER,
  createCustomer,
  customerProjectsFilter,
  customerToForm,
  deleteCustomer,
  deleteCustomerCascade,
  fetchActiveCustomers,
  fetchAllCustomers,
  fetchCustomerProjectIds,
  mapCustomer,
  newCustomerForm,
  selectActiveCustomers,
  selectCustomers,
  updateCustomer,
  updateCustomerActive,
  validateCustomerForm,
  type CustomerCascadeDeps,
  type CustomerCreator,
  type CustomerDeleter,
  type CustomersFetcher,
  type CustomerUpdater,
} from './customers';
import type { ProjectsFetcher } from './projects';

function record(partial: Partial<Csa_customers>): Csa_customers {
  return { csa_customerid: 'id', statecode: 0, ...partial } as Csa_customers;
}

function ok(data: Csa_customers[]): IOperationResult<Csa_customers[]> {
  return { data } as IOperationResult<Csa_customers[]>;
}

function okRecord(rec: Csa_customers): IOperationResult<Csa_customers> {
  return { data: rec } as IOperationResult<Csa_customers>;
}

describe('mapCustomer', () => {
  it('surfaces description, industry, and portfolioSummary when present on the record', () => {
    expect(
      mapCustomer(
        record({
          csa_customerid: 'a',
          csa_name: 'Acme',
          csa_active: true,
          csa_description: 'A widget maker',
          csa_industry: 'Manufacturing',
          csa_portfoliosummary: 'Three active projects',
        }),
      ),
    ).toEqual({
      id: 'a',
      name: 'Acme',
      active: true,
      description: 'A widget maker',
      industry: 'Manufacturing',
      portfolioSummary: 'Three active projects',
    });
  });

  it('defaults description, industry, and portfolioSummary to empty strings when absent', () => {
    expect(mapCustomer(record({ csa_customerid: 'a', csa_name: 'Acme', csa_active: true }))).toEqual({
      id: 'a',
      name: 'Acme',
      active: true,
      description: '',
      industry: '',
      portfolioSummary: '',
    });
  });
});

describe('selectActiveCustomers', () => {
  it('keeps only active customers and projects to the UI shape', () => {
    const records = [
      record({ csa_customerid: 'a', csa_name: 'Acme', csa_active: true }),
      record({ csa_customerid: 'b', csa_name: 'Beta', csa_active: false }),
      record({ csa_customerid: 'c', csa_name: 'Gamma', csa_active: true }),
    ];

    expect(selectActiveCustomers(records)).toEqual([
      { id: 'a', name: 'Acme', active: true, description: '', industry: '', portfolioSummary: '' },
      { id: 'c', name: 'Gamma', active: true, description: '', industry: '', portfolioSummary: '' },
    ]);
  });

  it('treats a missing active flag as inactive', () => {
    expect(selectActiveCustomers([record({ csa_customerid: 'x', csa_name: 'No flag' })])).toEqual([]);
  });
});

describe('fetchActiveCustomers', () => {
  it('reads customers through the seam requesting active-only, sorted by name', async () => {
    const fetch: CustomersFetcher = vi.fn(async () =>
      ok([
        record({ csa_customerid: 'a', csa_name: 'Acme', csa_active: true }),
        record({ csa_customerid: 'c', csa_name: 'Gamma', csa_active: true }),
      ]),
    );

    const customers = await fetchActiveCustomers(fetch);

    expect(fetch).toHaveBeenCalledWith({
      filter: ACTIVE_CUSTOMERS_FILTER,
      orderBy: ['csa_name asc'],
    });
    expect(customers).toEqual([
      { id: 'a', name: 'Acme', active: true, description: '', industry: '', portfolioSummary: '' },
      { id: 'c', name: 'Gamma', active: true, description: '', industry: '', portfolioSummary: '' },
    ]);
  });

  it('filters out any inactive record the data source still returns', async () => {
    const fetch: CustomersFetcher = vi.fn(async () =>
      ok([
        record({ csa_customerid: 'a', csa_name: 'Acme', csa_active: true }),
        record({ csa_customerid: 'b', csa_name: 'Beta', csa_active: false }),
      ]),
    );

    expect(await fetchActiveCustomers(fetch)).toEqual([
      { id: 'a', name: 'Acme', active: true, description: '', industry: '', portfolioSummary: '' },
    ]);
  });

  it('returns an empty list when the data source yields no data', async () => {
    const fetch: CustomersFetcher = vi.fn(async () => ({}) as IOperationResult<Csa_customers[]>);
    expect(await fetchActiveCustomers(fetch)).toEqual([]);
  });
});

describe('selectCustomers', () => {
  it('maps active and inactive customers alike', () => {
    const records = [
      record({ csa_customerid: 'a', csa_name: 'Acme', csa_active: true }),
      record({ csa_customerid: 'b', csa_name: 'Beta', csa_active: false }),
    ];

    expect(selectCustomers(records)).toEqual([
      { id: 'a', name: 'Acme', active: true, description: '', industry: '', portfolioSummary: '' },
      { id: 'b', name: 'Beta', active: false, description: '', industry: '', portfolioSummary: '' },
    ]);
  });
});

describe('fetchAllCustomers', () => {
  it('reads every customer through the seam without an active filter, sorted by name', async () => {
    const fetch: CustomersFetcher = vi.fn(async () =>
      ok([
        record({ csa_customerid: 'a', csa_name: 'Acme', csa_active: true }),
        record({ csa_customerid: 'b', csa_name: 'Beta', csa_active: false }),
      ]),
    );

    const customers = await fetchAllCustomers(fetch);

    expect(fetch).toHaveBeenCalledWith({ orderBy: ['csa_name asc'] });
    expect(customers).toEqual([
      { id: 'a', name: 'Acme', active: true, description: '', industry: '', portfolioSummary: '' },
      { id: 'b', name: 'Beta', active: false, description: '', industry: '', portfolioSummary: '' },
    ]);
  });

  it('returns an empty list when the data source yields no data', async () => {
    const fetch: CustomersFetcher = vi.fn(async () => ({}) as IOperationResult<Csa_customers[]>);
    expect(await fetchAllCustomers(fetch)).toEqual([]);
  });
});

describe('updateCustomerActive', () => {
  it('writes the new active state through the update seam', async () => {
    const update: CustomerUpdater = vi.fn(async () => ({}) as IOperationResult<Csa_customers>);

    await updateCustomerActive(update, 'c1', false);

    expect(update).toHaveBeenCalledWith('c1', { csa_active: false });
  });

  it('can reactivate a customer', async () => {
    const update: CustomerUpdater = vi.fn(async () => ({}) as IOperationResult<Csa_customers>);

    await updateCustomerActive(update, 'c1', true);

    expect(update).toHaveBeenCalledWith('c1', { csa_active: true });
  });
});

describe('newCustomerForm', () => {
  it('starts empty with Active defaulting to Yes', () => {
    expect(newCustomerForm()).toEqual({ name: '', active: true, description: '', industry: '', portfolioSummary: '' });
  });
});

describe('customerToForm', () => {
  it('projects an existing customer into editable form values', () => {
    expect(
      customerToForm({
        id: 'c1',
        name: 'Acme',
        active: false,
        description: 'A widget maker',
        industry: 'Manufacturing',
        portfolioSummary: 'Three active projects',
      }),
    ).toEqual({
      name: 'Acme',
      active: false,
      description: 'A widget maker',
      industry: 'Manufacturing',
      portfolioSummary: 'Three active projects',
    });
  });
});

describe('validateCustomerForm', () => {
  it('reports no errors when the name is present', () => {
    expect(
      validateCustomerForm({ name: 'Acme', active: true, description: '', industry: '', portfolioSummary: '' }),
    ).toEqual({});
  });

  it('does not require description or industry', () => {
    expect(
      validateCustomerForm({ name: 'Acme', active: true, description: '', industry: '', portfolioSummary: '' }),
    ).toEqual({});
  });

  it('requires a name', () => {
    expect(
      validateCustomerForm({ name: '', active: true, description: '', industry: '', portfolioSummary: '' }),
    ).toEqual({
      name: 'Name is required.',
    });
  });

  it('treats a whitespace-only name as missing', () => {
    expect(
      validateCustomerForm({ name: '   ', active: true, description: '', industry: '', portfolioSummary: '' }),
    ).toEqual({
      name: 'Name is required.',
    });
  });
});

describe('createCustomer', () => {
  it('creates through the seam with a trimmed name and returns the projection', async () => {
    const create: CustomerCreator = vi.fn(async () =>
      okRecord(record({ csa_customerid: 'new-id', csa_name: 'Acme', csa_active: true })),
    );

    const created = await createCustomer(create, {
      name: '  Acme  ',
      active: true,
      description: 'A widget maker',
      industry: 'Manufacturing',
      portfolioSummary: '',
    });

    expect(create).toHaveBeenCalledWith({
      csa_name: 'Acme',
      csa_active: true,
      csa_description: 'A widget maker',
      csa_industry: 'Manufacturing',
      csa_portfoliosummary: '',
    });
    expect(created).toEqual({
      id: 'new-id',
      name: 'Acme',
      active: true,
      description: 'A widget maker',
      industry: 'Manufacturing',
      portfolioSummary: '',
    });
  });

  it('carries the chosen Active state through', async () => {
    const create: CustomerCreator = vi.fn(async () =>
      okRecord(record({ csa_customerid: 'new-id' })),
    );

    await createCustomer(create, { name: 'Beta', active: false, description: '', industry: '', portfolioSummary: '' });

    expect(create).toHaveBeenCalledWith({
      csa_name: 'Beta',
      csa_active: false,
      csa_description: '',
      csa_industry: '',
      csa_portfoliosummary: '',
    });
  });
});

describe('updateCustomer', () => {
  it('updates through the seam with a trimmed name and returns the projection', async () => {
    const update: CustomerUpdater = vi.fn(async () => ({}) as IOperationResult<Csa_customers>);

    const updated = await updateCustomer(update, 'c1', {
      name: '  Renamed  ',
      active: false,
      description: 'Now with detail',
      industry: 'Retail',
      portfolioSummary: 'Portfolio note',
    });

    expect(update).toHaveBeenCalledWith('c1', {
      csa_name: 'Renamed',
      csa_active: false,
      csa_description: 'Now with detail',
      csa_industry: 'Retail',
      csa_portfoliosummary: 'Portfolio note',
    });
    expect(updated).toEqual({
      id: 'c1',
      name: 'Renamed',
      active: false,
      description: 'Now with detail',
      industry: 'Retail',
      portfolioSummary: 'Portfolio note',
    });
  });
});

describe('deleteCustomer', () => {
  it('deletes a customer record through the seam', async () => {
    const remove: CustomerDeleter = vi.fn(async () => undefined);

    await deleteCustomer(remove, 'c1');

    expect(remove).toHaveBeenCalledWith('c1');
  });
});

describe('customerProjectsFilter', () => {
  it('builds an OData filter for projects owned by the customer', () => {
    expect(customerProjectsFilter('c1')).toBe('_csa_customerid_value eq c1');
  });
});

describe('fetchCustomerProjectIds', () => {
  it('reads the customer\'s projects through the seam and returns their ids', async () => {
    const okProjects = (data: Csa_projects[]): IOperationResult<Csa_projects[]> =>
      ({ data }) as IOperationResult<Csa_projects[]>;
    const fetch: ProjectsFetcher = vi.fn(async () =>
      okProjects([
        { csa_projectid: 'p1' } as Csa_projects,
        { csa_projectid: 'p2' } as Csa_projects,
      ]),
    );

    const ids = await fetchCustomerProjectIds(fetch, 'c1');

    expect(fetch).toHaveBeenCalledWith({ filter: customerProjectsFilter('c1') });
    expect(ids).toEqual(['p1', 'p2']);
  });

  it('returns an empty list when the customer has no projects', async () => {
    const fetch: ProjectsFetcher = vi.fn(
      async () => ({ data: [] as Csa_projects[] }) as IOperationResult<Csa_projects[]>,
    );

    expect(await fetchCustomerProjectIds(fetch, 'c1')).toEqual([]);
  });
});

describe('deleteCustomerCascade', () => {
  it('cascade-deletes every project before deleting the customer, leaving no orphans', async () => {
    const order: string[] = [];
    const deps: CustomerCascadeDeps = {
      listProjectIds: vi.fn(async () => ['p1', 'p2']),
      deleteProjectCascade: vi.fn(async (projectId: string) => {
        order.push(`project:${projectId}`);
      }),
      deleteCustomer: vi.fn(async (customerId: string) => {
        order.push(`customer:${customerId}`);
      }),
    };

    await deleteCustomerCascade(deps, 'c1');

    // Both projects (and their whole subtrees) are cascade-deleted before the
    // customer itself, so no orphaned descendants remain.
    expect(order).toEqual(['project:p1', 'project:p2', 'customer:c1']);
    expect(deps.listProjectIds).toHaveBeenCalledWith('c1');
    expect(deps.deleteProjectCascade).toHaveBeenCalledTimes(2);
    expect(deps.deleteCustomer).toHaveBeenCalledWith('c1');
  });

  it('deletes the customer directly when it has no projects', async () => {
    const deps: CustomerCascadeDeps = {
      listProjectIds: vi.fn(async () => []),
      deleteProjectCascade: vi.fn(async () => undefined),
      deleteCustomer: vi.fn(async () => undefined),
    };

    await deleteCustomerCascade(deps, 'c9');

    expect(deps.deleteProjectCascade).not.toHaveBeenCalled();
    expect(deps.deleteCustomer).toHaveBeenCalledWith('c9');
  });

  it('does not delete the customer when a project cascade fails', async () => {
    const deps: CustomerCascadeDeps = {
      listProjectIds: vi.fn(async () => ['p1']),
      deleteProjectCascade: vi.fn(async () => {
        throw new Error('project cascade failed');
      }),
      deleteCustomer: vi.fn(async () => undefined),
    };

    await expect(deleteCustomerCascade(deps, 'c1')).rejects.toThrow('project cascade failed');
    expect(deps.deleteCustomer).not.toHaveBeenCalled();
  });
});

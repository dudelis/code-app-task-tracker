import { describe, expect, it, vi } from 'vitest';
import type { Csa_customers } from '../generated/models/Csa_customersModel';
import type { IOperationResult } from '@microsoft/power-apps/data';
import {
  ACTIVE_CUSTOMERS_FILTER,
  fetchActiveCustomers,
  selectActiveCustomers,
  type CustomersFetcher,
} from './customers';

function record(partial: Partial<Csa_customers>): Csa_customers {
  return { csa_customerid: 'id', statecode: 0, ...partial } as Csa_customers;
}

function ok(data: Csa_customers[]): IOperationResult<Csa_customers[]> {
  return { data } as IOperationResult<Csa_customers[]>;
}

describe('selectActiveCustomers', () => {
  it('keeps only active customers and projects to the UI shape', () => {
    const records = [
      record({ csa_customerid: 'a', csa_name: 'Acme', csa_active: true }),
      record({ csa_customerid: 'b', csa_name: 'Beta', csa_active: false }),
      record({ csa_customerid: 'c', csa_name: 'Gamma', csa_active: true }),
    ];

    expect(selectActiveCustomers(records)).toEqual([
      { id: 'a', name: 'Acme', active: true },
      { id: 'c', name: 'Gamma', active: true },
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
      { id: 'a', name: 'Acme', active: true },
      { id: 'c', name: 'Gamma', active: true },
    ]);
  });

  it('filters out any inactive record the data source still returns', async () => {
    const fetch: CustomersFetcher = vi.fn(async () =>
      ok([
        record({ csa_customerid: 'a', csa_name: 'Acme', csa_active: true }),
        record({ csa_customerid: 'b', csa_name: 'Beta', csa_active: false }),
      ]),
    );

    expect(await fetchActiveCustomers(fetch)).toEqual([{ id: 'a', name: 'Acme', active: true }]);
  });

  it('returns an empty list when the data source yields no data', async () => {
    const fetch: CustomersFetcher = vi.fn(async () => ({}) as IOperationResult<Csa_customers[]>);
    expect(await fetchActiveCustomers(fetch)).toEqual([]);
  });
});

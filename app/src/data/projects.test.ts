import { describe, expect, it, vi } from 'vitest';
import type { Csa_projects } from '../generated/models/Csa_projectsModel';
import type { IOperationResult } from '@microsoft/power-apps/data';
import {
  ACTIVE_PROJECTS_FILTER,
  fetchActiveProjects,
  selectActiveProjects,
  type ProjectsFetcher,
} from './projects';

function record(partial: Partial<Csa_projects>): Csa_projects {
  return { csa_projectid: 'id', statecode: 0, ...partial } as Csa_projects;
}

function ok(data: Csa_projects[]): IOperationResult<Csa_projects[]> {
  return { data } as IOperationResult<Csa_projects[]>;
}

describe('selectActiveProjects', () => {
  it('keeps only active projects and projects to the UI shape', () => {
    const records = [
      record({
        csa_projectid: 'p1',
        csa_name: 'Website',
        csa_active: true,
        _csa_customerid_value: 'c1',
      }),
      record({
        csa_projectid: 'p2',
        csa_name: 'Migration',
        csa_active: false,
        _csa_customerid_value: 'c1',
      }),
      record({
        csa_projectid: 'p3',
        csa_name: 'Support',
        csa_active: true,
        _csa_customerid_value: 'c2',
      }),
    ];

    expect(selectActiveProjects(records)).toEqual([
      { id: 'p1', name: 'Website', active: true, customerId: 'c1' },
      { id: 'p3', name: 'Support', active: true, customerId: 'c2' },
    ]);
  });

  it('treats a missing active flag as inactive', () => {
    expect(
      selectActiveProjects([record({ csa_projectid: 'x', csa_name: 'No flag' })]),
    ).toEqual([]);
  });

  it('maps a missing customer lookup to an empty owner id', () => {
    expect(
      selectActiveProjects([
        record({ csa_projectid: 'p', csa_name: 'Orphan', csa_active: true }),
      ]),
    ).toEqual([{ id: 'p', name: 'Orphan', active: true, customerId: '' }]);
  });
});

describe('fetchActiveProjects', () => {
  it('reads projects through the seam requesting active-only, sorted by name', async () => {
    const fetch: ProjectsFetcher = vi.fn(async () =>
      ok([
        record({
          csa_projectid: 'p1',
          csa_name: 'Website',
          csa_active: true,
          _csa_customerid_value: 'c1',
        }),
        record({
          csa_projectid: 'p3',
          csa_name: 'Support',
          csa_active: true,
          _csa_customerid_value: 'c2',
        }),
      ]),
    );

    const projects = await fetchActiveProjects(fetch);

    expect(fetch).toHaveBeenCalledWith({
      filter: ACTIVE_PROJECTS_FILTER,
      orderBy: ['csa_name asc'],
    });
    expect(projects).toEqual([
      { id: 'p1', name: 'Website', active: true, customerId: 'c1' },
      { id: 'p3', name: 'Support', active: true, customerId: 'c2' },
    ]);
  });

  it('filters out any inactive record the data source still returns', async () => {
    const fetch: ProjectsFetcher = vi.fn(async () =>
      ok([
        record({
          csa_projectid: 'p1',
          csa_name: 'Website',
          csa_active: true,
          _csa_customerid_value: 'c1',
        }),
        record({
          csa_projectid: 'p2',
          csa_name: 'Migration',
          csa_active: false,
          _csa_customerid_value: 'c1',
        }),
      ]),
    );

    expect(await fetchActiveProjects(fetch)).toEqual([
      { id: 'p1', name: 'Website', active: true, customerId: 'c1' },
    ]);
  });

  it('returns an empty list when the data source yields no data', async () => {
    const fetch: ProjectsFetcher = vi.fn(async () => ({}) as IOperationResult<Csa_projects[]>);
    expect(await fetchActiveProjects(fetch)).toEqual([]);
  });
});

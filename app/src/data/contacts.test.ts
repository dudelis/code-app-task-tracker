import { describe, expect, it, vi } from 'vitest';
import type { Csa_contacts } from '../generated/models/Csa_contactsModel';
import type { IOperationResult } from '@microsoft/power-apps/data';
import {
  CONTACTS_ORDER_BY,
  CONTACT_PROJECT_NAV,
  computeContactLinkChanges,
  contactCustomerBind,
  contactToForm,
  createContact,
  customerContactsFilter,
  deleteContact,
  deleteContactCascade,
  detachAllContactProjects,
  detachAllProjectContacts,
  fetchCustomerContacts,
  fetchProjectContacts,
  mapContact,
  newContactForm,
  saveProjectContacts,
  updateContact,
  validateContactForm,
  type ContactCreator,
  type ContactDeleter,
  type ContactProjectsWriter,
  type ContactsFetcher,
  type ContactUpdater,
  type ProjectContactsReader,
  type ProjectContactsWriter,
} from './contacts';

function record(partial: Partial<Csa_contacts>): Csa_contacts {
  return { csa_contactid: 'id', statecode: 0, ...partial } as Csa_contacts;
}

function okList(data: Csa_contacts[]): IOperationResult<Csa_contacts[]> {
  return { data } as IOperationResult<Csa_contacts[]>;
}

function okOne(data: Csa_contacts): IOperationResult<Csa_contacts> {
  return { data } as IOperationResult<Csa_contacts>;
}

describe('mapContact', () => {
  it('surfaces name, role, email, phone, and customer when present on the record', () => {
    expect(
      mapContact(
        record({
          csa_contactid: 'a',
          csa_name: 'Ada Lovelace',
          csa_role: 'Sponsor',
          csa_email: 'ada@example.com',
          csa_phone: '555-0100',
          _csa_customerid_value: 'cust-1',
        }),
      ),
    ).toEqual({
      id: 'a',
      name: 'Ada Lovelace',
      role: 'Sponsor',
      email: 'ada@example.com',
      phone: '555-0100',
      customerId: 'cust-1',
    });
  });

  it('defaults text fields and customerId to empty strings when absent', () => {
    expect(mapContact(record({ csa_contactid: 'x' }))).toEqual({
      id: 'x',
      name: '',
      role: '',
      email: '',
      phone: '',
      customerId: '',
    });
  });
});

describe('customerContactsFilter', () => {
  it('filters contacts to a single parent customer', () => {
    expect(customerContactsFilter('cust-1')).toBe('_csa_customerid_value eq cust-1');
  });
});

describe('contactCustomerBind', () => {
  it('builds the parent-customer odata bind reference', () => {
    expect(contactCustomerBind('cust-1')).toBe('/csa_customers(cust-1)');
  });
});

describe('fetchCustomerContacts', () => {
  it('reads a customer\'s contacts through the seam, filtered and ordered by name', async () => {
    const fetch: ContactsFetcher = vi.fn(async () =>
      okList([
        record({ csa_contactid: 'c', csa_name: 'Gamma', _csa_customerid_value: 'cust-1' }),
        record({ csa_contactid: 'a', csa_name: 'Acme', _csa_customerid_value: 'cust-1' }),
      ]),
    );

    const contacts = await fetchCustomerContacts(fetch, 'cust-1');

    expect(fetch).toHaveBeenCalledWith({
      filter: customerContactsFilter('cust-1'),
      orderBy: CONTACTS_ORDER_BY,
    });
    expect(contacts.map((c) => c.name)).toEqual(['Acme', 'Gamma']);
  });

  it('returns an empty list when the data source returns no data', async () => {
    const fetch: ContactsFetcher = vi.fn(async () => ({}) as IOperationResult<Csa_contacts[]>);
    expect(await fetchCustomerContacts(fetch, 'cust-1')).toEqual([]);
  });
});

describe('createContact', () => {
  it('creates a contact through the seam, trimmed and bound to the customer', async () => {
    const create: ContactCreator = vi.fn(async () =>
      okOne(
        record({
          csa_contactid: 'n-1',
          csa_name: 'Ada Lovelace',
          csa_role: 'Sponsor',
          csa_email: 'ada@example.com',
          csa_phone: '555-0100',
          _csa_customerid_value: 'cust-1',
        }),
      ),
    );

    const contact = await createContact(create, 'cust-1', {
      name: '  Ada Lovelace  ',
      role: '  Sponsor  ',
      email: '  ada@example.com  ',
      phone: '  555-0100  ',
    });

    expect(create).toHaveBeenCalledWith({
      csa_name: 'Ada Lovelace',
      csa_role: 'Sponsor',
      csa_email: 'ada@example.com',
      csa_phone: '555-0100',
      'csa_CustomerId@odata.bind': contactCustomerBind('cust-1'),
    });
    expect(contact).toEqual({
      id: 'n-1',
      name: 'Ada Lovelace',
      role: 'Sponsor',
      email: 'ada@example.com',
      phone: '555-0100',
      customerId: 'cust-1',
    });
  });

  it('falls back to the trimmed values when the server does not echo the record', async () => {
    const create: ContactCreator = vi.fn(async () => ({}) as IOperationResult<Csa_contacts>);

    const contact = await createContact(create, 'cust-1', {
      name: '  Ada  ',
      role: '  Sponsor  ',
      email: '  ada@example.com  ',
      phone: '  555-0100  ',
    });

    expect(contact).toEqual({
      id: '',
      name: 'Ada',
      role: 'Sponsor',
      email: 'ada@example.com',
      phone: '555-0100',
      customerId: 'cust-1',
    });
  });
});

describe('updateContact', () => {
  it('forwards changed fields to the write seam', async () => {
    const update: ContactUpdater = vi.fn(async () => okOne(record({ csa_contactid: 'c-1' })));

    await updateContact(update, 'c-1', { csa_role: 'Champion' });

    expect(update).toHaveBeenCalledWith('c-1', { csa_role: 'Champion' });
  });
});

describe('deleteContact', () => {
  it('removes a contact through the delete seam', async () => {
    const remove: ContactDeleter = vi.fn(async () => {});

    await deleteContact(remove, 'c-1');

    expect(remove).toHaveBeenCalledWith('c-1');
  });
});

describe('validateContactForm', () => {
  it('requires a non-blank name', () => {
    expect(validateContactForm({ name: '   ', role: '', email: '', phone: '' })).toEqual({
      name: 'Name is required.',
    });
  });

  it('treats role, email, and phone as optional', () => {
    expect(
      validateContactForm({ name: 'Ada', role: '', email: '', phone: '' }),
    ).toEqual({});
  });
});

describe('newContactForm', () => {
  it('returns blank form values', () => {
    expect(newContactForm()).toEqual({ name: '', role: '', email: '', phone: '' });
  });
});

describe('contactToForm', () => {
  it('projects a contact into editable form values', () => {
    expect(
      contactToForm({
        id: 'c-1',
        name: 'Ada Lovelace',
        role: 'Sponsor',
        email: 'ada@example.com',
        phone: '555-0100',
        customerId: 'cust-1',
      }),
    ).toEqual({
      name: 'Ada Lovelace',
      role: 'Sponsor',
      email: 'ada@example.com',
      phone: '555-0100',
    });
  });
});

describe('CONTACT_PROJECT_NAV', () => {
  it('is the shared contact\u2194project many-to-many navigation property', () => {
    expect(CONTACT_PROJECT_NAV).toBe('csa_csa_contact_csa_project');
  });
});

describe('computeContactLinkChanges', () => {
  it('computes attach and detach deltas between current and desired sets', () => {
    expect(computeContactLinkChanges(['a', 'b'], ['b', 'c'])).toEqual({
      attach: ['c'],
      detach: ['a'],
    });
  });

  it('is a no-op when the sets are equal', () => {
    expect(computeContactLinkChanges(['a', 'b'], ['a', 'b'])).toEqual({
      attach: [],
      detach: [],
    });
  });

  it('de-duplicates both inputs', () => {
    expect(computeContactLinkChanges(['a', 'a'], ['a', 'b', 'b'])).toEqual({
      attach: ['b'],
      detach: [],
    });
  });

  it('attaches all desired when the project has no contacts yet', () => {
    expect(computeContactLinkChanges([], ['a', 'b'])).toEqual({
      attach: ['a', 'b'],
      detach: [],
    });
  });

  it('detaches all current when the desired set is empty', () => {
    expect(computeContactLinkChanges(['a', 'b'], [])).toEqual({
      attach: [],
      detach: ['a', 'b'],
    });
  });
});

describe('fetchProjectContacts', () => {
  it('reads a project\'s linked contacts through the seam and projects them, sorted by name', async () => {
    const read: ProjectContactsReader = vi.fn(async () => [
      record({ csa_contactid: 'g', csa_name: 'Gamma' }),
      record({ csa_contactid: 'a', csa_name: 'Acme' }),
    ]);

    const contacts = await fetchProjectContacts(read, 'p-1');

    expect(read).toHaveBeenCalledWith('p-1');
    expect(contacts.map((c) => c.name)).toEqual(['Acme', 'Gamma']);
    expect(contacts.map((c) => c.id)).toEqual(['a', 'g']);
  });
});

describe('saveProjectContacts', () => {
  it('writes the desired contact set through the M:N seam and returns it', async () => {
    const write: ProjectContactsWriter = vi.fn(async () => undefined);

    const result = await saveProjectContacts(write, 'p-1', ['b', 'c']);

    expect(write).toHaveBeenCalledWith('p-1', ['b', 'c']);
    expect(result).toEqual(['b', 'c']);
  });

  it('de-duplicates desired ids (first-seen order) before writing', async () => {
    const write: ProjectContactsWriter = vi.fn(async () => undefined);

    const result = await saveProjectContacts(write, 'p-1', ['a', 'a', 'b']);

    expect(write).toHaveBeenCalledWith('p-1', ['a', 'b']);
    expect(result).toEqual(['a', 'b']);
  });

  it('clears all contacts by writing an empty set', async () => {
    const write: ProjectContactsWriter = vi.fn(async () => undefined);

    const result = await saveProjectContacts(write, 'p-1', []);

    expect(write).toHaveBeenCalledWith('p-1', []);
    expect(result).toEqual([]);
  });
});

describe('detachAllProjectContacts', () => {
  it('detaches every contact from a project by writing an empty set', async () => {
    const write: ProjectContactsWriter = vi.fn(async () => undefined);

    await detachAllProjectContacts(write, 'p-1');

    expect(write).toHaveBeenCalledWith('p-1', []);
  });
});

describe('detachAllContactProjects', () => {
  it('detaches every project from a contact by writing an empty set', async () => {
    const write: ContactProjectsWriter = vi.fn(async () => undefined);

    await detachAllContactProjects(write, 'c-1');

    expect(write).toHaveBeenCalledWith('c-1', []);
  });
});

describe('deleteContactCascade', () => {
  it('detaches the contact\'s project links, then deletes the contact, in order', async () => {
    const order: string[] = [];
    const deps = {
      detachProjects: vi.fn(async (id: string) => {
        order.push(`detach:${id}`);
      }),
      deleteContact: vi.fn(async (id: string) => {
        order.push(`delete:${id}`);
      }),
    };

    await deleteContactCascade(deps, 'c-1');

    // Child-before-parent (ADR-0002): the M:N links are removed before the contact,
    // so no dangling associations remain.
    expect(order).toEqual(['detach:c-1', 'delete:c-1']);
    expect(deps.detachProjects).toHaveBeenCalledWith('c-1');
    expect(deps.deleteContact).toHaveBeenCalledWith('c-1');
  });

  it('does not delete the contact when detaching its project links fails', async () => {
    const deps = {
      detachProjects: vi.fn(async () => {
        throw new Error('detach failed');
      }),
      deleteContact: vi.fn(async () => undefined),
    };

    await expect(deleteContactCascade(deps, 'c-1')).rejects.toThrow('detach failed');
    expect(deps.deleteContact).not.toHaveBeenCalled();
  });
});

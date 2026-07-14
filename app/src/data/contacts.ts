import type { Csa_contacts, Csa_contactsBase } from '../generated/models/Csa_contactsModel';
import type { IGetAllOptions } from '../generated/models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';

/**
 * A Contact as consumed by the UI — a thin, stable projection of the generated
 * Dataverse model so components never depend on raw `csa_*` field names. A
 * contact is a person at a Customer.
 */
export interface Contact {
  id: string;
  name: string;
  /** The contact's role at the customer (`csa_role`); '' when unset. */
  role: string;
  /** The contact's email address (`csa_email`); '' when unset. */
  email: string;
  /** The contact's phone number (`csa_phone`); '' when unset. */
  phone: string;
  /** Id of the owning Customer (the `csa_customerid` lookup value). */
  customerId: string;
}

/** Map a raw Dataverse record to the UI-facing Contact shape. */
export function mapContact(record: Csa_contacts): Contact {
  return {
    id: record.csa_contactid,
    name: record.csa_name ?? '',
    role: record.csa_role ?? '',
    email: record.csa_email ?? '',
    phone: record.csa_phone ?? '',
    customerId: record._csa_customerid_value ?? '',
  };
}

/** OData filter selecting every contact that belongs to a customer. */
export function customerContactsFilter(customerId: string): string {
  return `_csa_customerid_value eq ${customerId}`;
}

/**
 * Order clause for the customer contacts read. The same order is re-applied
 * client-side (see `fetchCustomerContacts`) as defense in depth.
 */
export const CONTACTS_ORDER_BY = ['csa_name asc'];

/**
 * Signature of the generated `Csa_contactsService.getAll`. Injected so the
 * data-access seam can be exercised without importing the Power Apps runtime.
 */
export type ContactsFetcher = (
  options?: IGetAllOptions,
) => Promise<IOperationResult<Csa_contacts[]>>;

/**
 * Signature of the generated `Csa_contactsService.create`. Injected so the
 * write seam can be exercised without importing the Power Apps runtime.
 */
export type ContactCreator = (
  record: Omit<Csa_contactsBase, 'csa_contactid'>,
) => Promise<IOperationResult<Csa_contacts>>;

/**
 * Signature of the generated `Csa_contactsService.update`. Injected so the
 * write seam can be exercised without importing the Power Apps runtime.
 */
export type ContactUpdater = (
  id: string,
  changedFields: Partial<Omit<Csa_contactsBase, 'csa_contactid'>>,
) => Promise<IOperationResult<Csa_contacts>>;

/**
 * Signature of the generated `Csa_contactsService.delete`. Injected so the
 * delete seam can be exercised without importing the Power Apps runtime.
 */
export type ContactDeleter = (id: string) => Promise<void>;

/**
 * Read a customer's contacts through the data-access seam. Requests the ordered
 * set filtered to the customer and re-sorts by name client-side so the UI order
 * is deterministic regardless of the source order.
 */
export async function fetchCustomerContacts(
  fetch: ContactsFetcher,
  customerId: string,
): Promise<Contact[]> {
  const result = await fetch({
    filter: customerContactsFilter(customerId),
    orderBy: CONTACTS_ORDER_BY,
  });
  return (result.data ?? [])
    .map(mapContact)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** OData bind value for a Customer lookup, e.g. `/csa_customers(<id>)`. */
export function contactCustomerBind(customerId: string): string {
  return `/csa_customers(${customerId})`;
}

/**
 * Editable values for the unified create/edit Contact detail pane — the stable
 * projection the form binds to so the UI never touches raw `csa_*` fields.
 */
export interface ContactFormValues {
  name: string;
  role: string;
  email: string;
  phone: string;
}

/** Field-level validation errors for the Contact form, keyed by field. */
export interface ContactFormErrors {
  name?: string;
}

/** Blank form values for creating a contact. */
export function newContactForm(): ContactFormValues {
  return { name: '', role: '', email: '', phone: '' };
}

/** Project an existing contact into editable form values. */
export function contactToForm(contact: Contact): ContactFormValues {
  return {
    name: contact.name,
    role: contact.role,
    email: contact.email,
    phone: contact.phone,
  };
}

/** Pure validation for the Contact form. Name is required (non-blank). */
export function validateContactForm(values: ContactFormValues): ContactFormErrors {
  const errors: ContactFormErrors = {};
  if (values.name.trim() === '') {
    errors.name = 'Name is required.';
  }
  return errors;
}

/**
 * Create a contact through the write seam and return the UI projection. Text
 * fields are trimmed; the owning Customer is bound via
 * `csa_CustomerId@odata.bind`. The server-assigned id comes back on the created
 * record; the trimmed values are used as a fallback when the server does not
 * echo them.
 */
export async function createContact(
  create: ContactCreator,
  customerId: string,
  values: ContactFormValues,
): Promise<Contact> {
  const name = values.name.trim();
  const role = values.role.trim();
  const email = values.email.trim();
  const phone = values.phone.trim();
  const result = await create({
    csa_name: name,
    csa_role: role,
    csa_email: email,
    csa_phone: phone,
    'csa_CustomerId@odata.bind': contactCustomerBind(customerId),
  } as Omit<Csa_contactsBase, 'csa_contactid'>);
  return {
    id: result.data?.csa_contactid ?? '',
    name: result.data?.csa_name ?? name,
    role: result.data?.csa_role ?? role,
    email: result.data?.csa_email ?? email,
    phone: result.data?.csa_phone ?? phone,
    customerId: result.data?._csa_customerid_value ?? customerId,
  };
}

/** Update a contact's fields through the write seam. */
export async function updateContact(
  update: ContactUpdater,
  id: string,
  changedFields: Partial<Omit<Csa_contactsBase, 'csa_contactid'>>,
): Promise<void> {
  await update(id, changedFields);
}

/** Permanently delete a contact record through the seam (hard delete per ADR-0002). */
export async function deleteContact(remove: ContactDeleter, id: string): Promise<void> {
  await remove(id);
}

/**
 * Navigation property for the contact↔project many-to-many relationship. The
 * relationship uses the same name from both sides (contact side and project
 * side), so this one const drives both the read/write seams; kept here so the
 * data module owns the relationship name and the UI/live wiring import it from
 * one place. Mirrors `TASK_LABEL_NAV`.
 */
export const CONTACT_PROJECT_NAV = 'csa_csa_contact_csa_project';

/**
 * Signature of the seam that reads the contacts currently linked to a project via
 * the many-to-many relationship. Injected as `import type` only so the live
 * (uncertain) expand/query mechanics stay out of unit tests.
 */
export type ProjectContactsReader = (projectId: string) => Promise<Csa_contacts[]>;

/**
 * Signature of the seam that writes a project's linked-contact set. The live
 * implementation replaces the project's many-to-many collection with
 * `desiredContactIds`; injected as `import type` only so the uncertain
 * association mechanics stay untested.
 */
export type ProjectContactsWriter = (
  projectId: string,
  desiredContactIds: string[],
) => Promise<void>;

/**
 * Signature of the seam that writes a contact's linked-project set (the contact
 * side of the same M:N). Injected as `import type` only so the uncertain
 * association mechanics stay untested. Used by the contact delete cascade.
 */
export type ContactProjectsWriter = (
  contactId: string,
  desiredProjectIds: string[],
) => Promise<void>;

/**
 * The attach/detach delta between a project's (or contact's) current links and
 * the desired set. Pure and fully testable — it captures the M:N link semantics
 * independently of the live association mechanics behind the seam.
 */
export interface ContactLinkChanges {
  attach: string[];
  detach: string[];
}

/**
 * Compute which ids to attach and which to detach to move from the `current`
 * link set to the `desired` set. Both inputs are de-duplicated; order of the
 * results follows the input order. Identical semantics to `computeLabelChanges`.
 */
export function computeContactLinkChanges(
  current: string[],
  desired: string[],
): ContactLinkChanges {
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);
  const attach = [...desiredSet].filter((id) => !currentSet.has(id));
  const detach = [...currentSet].filter((id) => !desiredSet.has(id));
  return { attach, detach };
}

/** Read a project's linked contacts through the seam and project them for the UI. */
export async function fetchProjectContacts(
  read: ProjectContactsReader,
  projectId: string,
): Promise<Contact[]> {
  const records = await read(projectId);
  return records
    .map(mapContact)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Persist a project's desired linked-contact set through the write seam. The
 * desired ids are de-duplicated (preserving first-seen order) before being
 * written, and the normalised list is returned so callers can update their UI
 * projection. Mirrors `saveTaskLabels`.
 */
export async function saveProjectContacts(
  write: ProjectContactsWriter,
  projectId: string,
  desiredContactIds: string[],
): Promise<string[]> {
  const normalized = [...new Set(desiredContactIds)];
  await write(projectId, normalized);
  return normalized;
}

/**
 * Detach every contact from a project by writing an empty M:N set through the
 * write seam. Reusable link cleanup — the Project cascade composes this to
 * remove a project's contact links before the project itself is deleted
 * (ADR-0002). Mirrors `detachAllTaskLabels`.
 */
export async function detachAllProjectContacts(
  write: ProjectContactsWriter,
  projectId: string,
): Promise<void> {
  await write(projectId, []);
}

/**
 * Detach every project from a contact by writing an empty M:N set through the
 * contact-side write seam. The Contact cascade composes this to remove a
 * contact's project links before the contact itself is deleted (ADR-0002).
 */
export async function detachAllContactProjects(
  write: ContactProjectsWriter,
  contactId: string,
): Promise<void> {
  await write(contactId, []);
}

/**
 * The cascade steps for deleting a contact, each already bound to its data seam.
 * Injected so the orchestration order is unit-testable and the data modules stay
 * decoupled. Mirrors `ProjectCascadeDeps`'s shape.
 */
export interface ContactCascadeDeps {
  /** Detach every project link from the contact (the contact side of the M:N). */
  detachProjects: (contactId: string) => Promise<void>;
  /** Delete the contact record itself. */
  deleteContact: (contactId: string) => Promise<void>;
}

/**
 * Hard-delete a contact and its links (ADR-0002): detach the contact's project
 * links, then delete the contact. Children (the M:N links) are always removed
 * before the parent, so no dangling associations remain. Mirrors
 * `deleteProjectCascade`'s child-before-parent shape.
 */
export async function deleteContactCascade(
  deps: ContactCascadeDeps,
  contactId: string,
): Promise<void> {
  await deps.detachProjects(contactId);
  await deps.deleteContact(contactId);
}

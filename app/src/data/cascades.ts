import { getClient } from '@microsoft/power-apps/data'
import type { DataClient, IOperationOptions } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { Csa_customersService } from '../generated/services/Csa_customersService'
import { Csa_projectsService } from '../generated/services/Csa_projectsService'
import { Csa_tasksService } from '../generated/services/Csa_tasksService'
import { Csa_notesService } from '../generated/services/Csa_notesService'
import { Csa_projectnotesService } from '../generated/services/Csa_projectnotesService'
import { Csa_contactsService } from '../generated/services/Csa_contactsService'
import type { Csa_tasks } from '../generated/models/Csa_tasksModel'
import type { Csa_labels } from '../generated/models/Csa_labelsModel'
import type { Csa_projects } from '../generated/models/Csa_projectsModel'
import type { Csa_contacts } from '../generated/models/Csa_contactsModel'
import { deleteTask, deleteTaskCascade, type Task } from './tasks'
import { deleteProject, deleteProjectCascade, fetchProjectTaskIds } from './projects'
import { deleteCustomer, deleteCustomerCascade, fetchCustomerProjectIds } from './customers'
import { deleteTaskNotes } from './notes'
import { deleteProjectNotes } from './projectNotes'
import { TASK_LABEL_NAV, detachAllTaskLabels, fetchTaskLabels, type Label } from './labels'
import {
  CONTACT_PROJECT_NAV,
  deleteContact,
  deleteContactCascade,
  detachAllContactProjects,
  detachAllProjectContacts,
} from './contacts'

// Shared Dataverse client used only for the task↔label many-to-many association,
// which the generated services do not model. All uncertain live mechanics live
// here behind the labels.ts seams; the deterministic parts are unit-tested.
const labelClient: DataClient = getClient(dataSourcesInfo)

/**
 * Replace a task's attached-label collection with `desiredLabelIds` in one
 * PATCH via `@odata.bind`. UNVERIFIED against live Dataverse — the typed Code
 * App DataClient exposes no dedicated associate/disassociate, so this is a
 * best-effort implementation that still needs manual live validation (#10).
 */
export async function writeTaskLabels(taskId: string, desiredLabelIds: string[]): Promise<void> {
  await labelClient.updateRecordAsync<Record<string, string[]>, Csa_tasks>('csa_tasks', taskId, {
    [`${TASK_LABEL_NAV}@odata.bind`]: desiredLabelIds.map((id) => `/csa_labels(${id})`),
  })
}

/**
 * Read a task's attached labels by expanding the M:N navigation property. The
 * typed options do not model `$expand`, so the request is built and cast.
 * UNVERIFIED against live Dataverse — needs manual live validation (#10).
 */
export async function readTaskLabels(taskId: string): Promise<Csa_labels[]> {
  const result = await labelClient.retrieveRecordAsync<Record<string, unknown>>(
    'csa_tasks',
    taskId,
    { select: ['csa_taskid'], expand: [{ attributeName: TASK_LABEL_NAV }] } as unknown as IOperationOptions,
  )
  return (result.data?.[TASK_LABEL_NAV] as Csa_labels[] | undefined) ?? []
}

/**
 * Replace a project's linked-contact collection with `desiredContactIds` in one
 * PATCH via `@odata.bind`. UNVERIFIED against live Dataverse — the typed Code
 * App DataClient exposes no dedicated associate/disassociate, so this is a
 * best-effort implementation that still needs manual live validation.
 */
export async function writeProjectContacts(
  projectId: string,
  desiredContactIds: string[],
): Promise<void> {
  await labelClient.updateRecordAsync<Record<string, string[]>, Csa_projects>(
    'csa_projects',
    projectId,
    {
      [`${CONTACT_PROJECT_NAV}@odata.bind`]: desiredContactIds.map((id) => `/csa_contacts(${id})`),
    },
  )
}

/**
 * Read a project's linked contacts by expanding the M:N navigation property. The
 * typed options do not model `$expand`, so the request is built and cast.
 * UNVERIFIED against live Dataverse — needs manual live validation.
 */
export async function readProjectContacts(projectId: string): Promise<Csa_contacts[]> {
  const result = await labelClient.retrieveRecordAsync<Record<string, unknown>>(
    'csa_projects',
    projectId,
    { select: ['csa_projectid'], expand: [{ attributeName: CONTACT_PROJECT_NAV }] } as unknown as IOperationOptions,
  )
  return (result.data?.[CONTACT_PROJECT_NAV] as Csa_contacts[] | undefined) ?? []
}

/**
 * Replace a contact's linked-project collection with `desiredProjectIds` in one
 * PATCH via `@odata.bind` (the contact side of the same M:N). UNVERIFIED against
 * live Dataverse — best-effort, still needs manual live validation.
 */
export async function writeContactProjects(
  contactId: string,
  desiredProjectIds: string[],
): Promise<void> {
  await labelClient.updateRecordAsync<Record<string, string[]>, Csa_contacts>(
    'csa_contacts',
    contactId,
    {
      [`${CONTACT_PROJECT_NAV}@odata.bind`]: desiredProjectIds.map((id) => `/csa_projects(${id})`),
    },
  )
}

/**
 * Hard-delete a task and its subtree (ADR-0002) through the composed data seams:
 * delete the task's notes, detach its label links, then delete the task. Reused
 * by the Task pane's own delete and by the Project/Customer cascades below, so
 * every deletion of a task follows the same child-before-parent order.
 */
export function runTaskCascade(taskId: string): Promise<void> {
  return deleteTaskCascade(
    {
      deleteNotes: (id) =>
        deleteTaskNotes(
          (options) => Csa_notesService.getAll(options),
          (noteId) => Csa_notesService.delete(noteId),
          id,
        ).then(() => undefined),
      detachLabels: (id) => detachAllTaskLabels(writeTaskLabels, id),
      deleteTask: (id) => deleteTask((tid) => Csa_tasksService.delete(tid), id),
    },
    taskId,
  )
}

/**
 * Hard-delete a project and its subtree (ADR-0002): enumerate the project's
 * tasks, run the reusable Task cascade for each, then delete the project.
 */
export function runProjectCascade(projectId: string): Promise<void> {
  return deleteProjectCascade(
    {
      listTaskIds: (id) => fetchProjectTaskIds((options) => Csa_tasksService.getAll(options), id),
      deleteTaskCascade: runTaskCascade,
      deleteProjectNotes: (id) =>
        deleteProjectNotes(
          (options) => Csa_projectnotesService.getAll(options),
          (noteId) => Csa_projectnotesService.delete(noteId),
          id,
        ).then(() => undefined),
      detachContacts: (id) => detachAllProjectContacts(writeProjectContacts, id),
      deleteProject: (id) => deleteProject((pid) => Csa_projectsService.delete(pid), id),
    },
    projectId,
  )
}

/**
 * Hard-delete a contact and its links (ADR-0002): detach the contact's project
 * links (the contact side of the M:N), then delete the contact. The link
 * cleanup goes through the same uncertain-live association mechanics as labels,
 * so it stays behind the contacts.ts seams; the deterministic ordering is
 * unit-tested via `deleteContactCascade`.
 */
export function runContactCascade(contactId: string): Promise<void> {
  return deleteContactCascade(
    {
      detachProjects: (id) => detachAllContactProjects(writeContactProjects, id),
      deleteContact: (id) => deleteContact((cid) => Csa_contactsService.delete(cid), id),
    },
    contactId,
  )
}

/**
 * Hard-delete a customer and its subtree (ADR-0002): enumerate the customer's
 * projects, run the Project cascade for each, then delete the customer.
 */
export function runCustomerCascade(customerId: string): Promise<void> {
  return deleteCustomerCascade(
    {
      listProjectIds: (id) =>
        fetchCustomerProjectIds((options) => Csa_projectsService.getAll(options), id),
      deleteProjectCascade: runProjectCascade,
      deleteCustomer: (id) => deleteCustomer((cid) => Csa_customersService.delete(cid), id),
    },
    customerId,
  )
}

/**
 * Best-effort read of every task's attached labels for board display. Per-task
 * failures degrade to an empty label set rather than failing the whole load,
 * since the live M:N read is not yet verified.
 */
export async function loadTaskLabels(tasks: Task[]): Promise<Record<string, Label[]>> {
  const entries = await Promise.all(
    tasks.map(async (task) => {
      try {
        return [task.id, await fetchTaskLabels(readTaskLabels, task.id)] as const
      } catch {
        return [task.id, [] as Label[]] as const
      }
    }),
  )
  return Object.fromEntries(entries)
}

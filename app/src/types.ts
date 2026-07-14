import type { Customer } from './data/customers'
import type { Project } from './data/projects'
import type { Task } from './data/tasks'
import type { Label } from './data/labels'

/** The full overview dataset held in App state once loading succeeds. */
export interface OverviewData {
  customers: Customer[]
  projects: Project[]
  tasks: Task[]
  labels: Label[]
  taskLabels: Record<string, Label[]>
}

/** Async status of the top-level overview load. */
export type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: OverviewData }

/** What the Customer detail drawer is doing: creating or editing. */
export type CustomerPane =
  | { mode: 'create' }
  | { mode: 'edit'; customer: Customer }

/** What the Project detail drawer is doing: creating (under a customer) or editing. */
export type ProjectPane =
  | { mode: 'create'; customerId: string }
  | { mode: 'edit'; project: Project }

// The Task drawer is now edit-only: inline per-bucket quick-add is the primary
// create path, so the drawer is opened solely to edit an existing task.
export type TaskPane = { mode: 'edit'; task: Task }

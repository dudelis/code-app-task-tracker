import { RESPONSIBLE_CHOICES } from '../data/tasks'
import type { ResponsibleFilter } from '../data/responsible'

/** Options for the toolbar Responsible filter toggle. */
export const RESPONSIBLE_OPTIONS: { value: ResponsibleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'me', label: 'Me' },
  { value: 'customer', label: 'Customer' },
]

/** Resolve a task's responsible choice value to its label (Me/Customer), or null when unset. */
export function responsibleLabel(value: number | undefined): string | null {
  if (value === undefined) return null
  return RESPONSIBLE_CHOICES.find((choice) => choice.value === value)?.label ?? null
}

/**
 * Pure "has unsaved field edits" predicate shared by the detail dialogs (Task
 * today; Project and Customer next). A detail dialog captures a snapshot of its
 * form values when it opens, then compares the live values against that snapshot
 * to decide whether the close-guard should block a backdrop/Esc dismissal.
 *
 * Keeping this pure and injectable-free lets the guard be unit-tested without a
 * DOM: the dialog computes dirtiness by passing its current form object
 * (including any array-valued fields such as selected label ids) against the
 * originals captured on open.
 */

/**
 * Value-equality for a single form field. Primitives compare by strict equality;
 * arrays compare order-independently (as multisets of their stringified members)
 * so that e.g. toggling a label off then on — which can reorder the id list
 * without changing the selected set — does not read as a dirty edit.
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    const sortedA = [...a].map(String).sort()
    const sortedB = [...b].map(String).sort()
    return sortedA.every((value, index) => value === sortedB[index])
  }
  return a === b
}

/**
 * True when `current` differs from `original` in any field. Compares the union
 * of both objects' keys so an added or removed field also counts as a change.
 */
export function isFormDirty<T extends Record<string, unknown>>(
  current: T,
  original: T,
): boolean {
  const keys = new Set([...Object.keys(current), ...Object.keys(original)])
  for (const key of keys) {
    if (!valuesEqual(current[key], original[key])) return true
  }
  return false
}

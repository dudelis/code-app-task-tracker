/**
 * Typed-name delete confirmation (ADR-0002). Deleting a Customer or Project
 * destroys a large, irreversible subtree, so those two deletions are guarded by
 * type-to-confirm: the delete button stays disabled until the user types the
 * record's exact name. Task/Label/Note deletion uses a plain confirm and does
 * not go through this predicate.
 */

/**
 * True when `typedName` exactly matches `actualName`, comparing after trimming
 * surrounding whitespace on both sides. The match is case-sensitive (per the
 * issue: "exact"). An empty actual name never confirms, so a blank record name
 * can never enable the delete button.
 */
export function isDeleteConfirmed(typedName: string, actualName: string): boolean {
  const actual = actualName.trim();
  if (actual === '') return false;
  return typedName.trim() === actual;
}

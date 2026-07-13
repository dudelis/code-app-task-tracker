/**
 * Active/Inactive visibility rules shared by the overview and its controls.
 *
 * Active/Inactive is a *visibility* concern, not deletion: records are always
 * loaded, and the "show inactive" toggle decides whether inactive ones appear.
 * These are pure functions so the default-visibility and toggle logic can be
 * tested independently of data access and React state.
 */

/** Anything whose visibility depends on an `active` flag (Customer, Project). */
export interface Activatable {
  active: boolean;
}

/**
 * Whether an item should be shown given the current "show inactive" setting.
 * Active items are always visible; inactive items appear only when showing
 * inactive is turned on.
 */
export function isVisible(item: Activatable, showInactive: boolean): boolean {
  return showInactive || item.active;
}

/** Keep only the items visible under the current "show inactive" setting. */
export function filterVisible<T extends Activatable>(items: T[], showInactive: boolean): T[] {
  return items.filter((item) => isVisible(item, showInactive));
}

/** The active state an item takes when its Active/Inactive toggle is flipped. */
export function toggleActive(active: boolean): boolean {
  return !active;
}

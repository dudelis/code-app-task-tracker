import type { Csa_labels, Csa_labelsBase } from '../generated/models/Csa_labelsModel';
import { Csa_labelscsa_color } from '../generated/models/Csa_labelsModel';
import type { IGetAllOptions } from '../generated/models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';

/**
 * A Label as consumed by the UI — a thin, stable projection of the generated
 * Dataverse model so components never depend on raw `csa_*` field names. Labels
 * are shared globally; the same set is reused across every customer/project.
 */
export interface Label {
  id: string;
  name: string;
  /** Raw Dataverse colour choice value (`csa_color`), or undefined when unset. */
  color?: number;
  /** Human-readable colour label for display; empty when the colour is unset. */
  colorLabel: string;
}

/** OData filter that returns only active labels (`statecode` 0 = Active). */
export const ACTIVE_LABELS_FILTER = 'statecode eq 0';

/**
 * Navigation property for the task↔label many-to-many relationship, on the task
 * side. Used by the live association/read seam; kept here so the data module
 * owns the relationship name and the UI wiring imports it from one place.
 */
export const TASK_LABEL_NAV = 'csa_csa_task_csa_label';

/** Resolve a colour choice value to its display label, or '' when unset/unknown. */
function colorLabel(color: number | undefined): string {
  if (color === undefined) return '';
  return Csa_labelscsa_color[color as Csa_labelscsa_color] ?? '';
}

/** Map a raw Dataverse record to the UI-facing Label shape. */
export function mapLabel(record: Csa_labels): Label {
  return {
    id: record.csa_labelid,
    name: record.csa_name ?? '',
    color: record.csa_color,
    colorLabel: colorLabel(record.csa_color),
  };
}

/** Project records to the UI shape, sorted by name (case-insensitive). */
export function selectLabels(records: Csa_labels[]): Label[] {
  return records
    .map(mapLabel)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Signature of the generated `Csa_labelsService.getAll`. Injected so the
 * data-access seam can be exercised without importing the Power Apps runtime.
 */
export type LabelsFetcher = (
  options?: IGetAllOptions,
) => Promise<IOperationResult<Csa_labels[]>>;

/**
 * Read the shared active labels through the data-access seam, sorted by name.
 * These populate the label picker; the same global set is offered on every task.
 */
export async function fetchAllLabels(fetch: LabelsFetcher): Promise<Label[]> {
  const result = await fetch({
    filter: ACTIVE_LABELS_FILTER,
    orderBy: ['csa_name asc'],
  });
  return selectLabels(result.data ?? []);
}

/**
 * Signature of the seam that reads the labels currently attached to a task via
 * the many-to-many relationship. Injected as `import type` only so the live
 * (uncertain) expand/query mechanics stay out of unit tests.
 */
export type TaskLabelsReader = (taskId: string) => Promise<Csa_labels[]>;

/** Read a task's attached labels through the seam and project them for the UI. */
export async function fetchTaskLabels(
  read: TaskLabelsReader,
  taskId: string,
): Promise<Label[]> {
  const records = await read(taskId);
  return selectLabels(records);
}

/**
 * The attach/detach delta between a task's current labels and the desired set.
 * Pure and fully testable — it captures the M:N link semantics independently of
 * the live association mechanics behind the seam.
 */
export interface LabelChanges {
  attach: string[];
  detach: string[];
}

/**
 * Compute which label ids to attach and which to detach to move a task from its
 * `current` set to the `desired` set. Both inputs are de-duplicated; order of
 * the results follows the input order.
 */
export function computeLabelChanges(
  current: string[],
  desired: string[],
): LabelChanges {
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);
  const attach = [...desiredSet].filter((id) => !currentSet.has(id));
  const detach = [...currentSet].filter((id) => !desiredSet.has(id));
  return { attach, detach };
}

/**
 * Signature of the seam that writes a task's label set. The live implementation
 * replaces the task's many-to-many collection with `desiredLabelIds`; injected
 * as `import type` only so the uncertain association mechanics stay untested.
 */
export type TaskLabelsWriter = (
  taskId: string,
  desiredLabelIds: string[],
) => Promise<void>;

/**
 * Persist a task's desired label set through the write seam. The desired ids are
 * de-duplicated (preserving first-seen order) before being written, and the
 * normalised list is returned so callers can update their UI projection.
 */
export async function saveTaskLabels(
  write: TaskLabelsWriter,
  taskId: string,
  desiredLabelIds: string[],
): Promise<string[]> {
  const normalized = [...new Set(desiredLabelIds)];
  await write(taskId, normalized);
  return normalized;
}

/**
 * Detach every label from a task by writing an empty M:N set through the write
 * seam. Reusable label-link cleanup — the Task cascade composes this to remove a
 * task's label links before the task itself is deleted (ADR-0002).
 */
export async function detachAllTaskLabels(
  write: TaskLabelsWriter,
  taskId: string,
): Promise<void> {
  await write(taskId, []);
}

/**
 * The colour choices offered in the Labels management view, derived from the
 * generated `csa_color` option set so the list stays in sync with Dataverse.
 */
export const LABEL_COLOR_CHOICES: { value: number; label: string }[] = Object.entries(
  Csa_labelscsa_color,
).map(([value, label]) => ({ value: Number(value), label }));

/**
 * Find an existing label whose name matches `name` case-insensitively (trimmed
 * on both sides). Pure — this is the dedupe used by inline label creation so a
 * typed name reuses an existing label instead of creating a duplicate.
 */
export function findLabelByName(labels: Label[], name: string): Label | undefined {
  const needle = name.trim().toLowerCase();
  if (needle === '') return undefined;
  return labels.find((label) => label.name.trim().toLowerCase() === needle);
}

/**
 * Editable values for the create/edit Label form — the stable projection the
 * management view binds to. `color` is `null` when no colour is set.
 */
export interface LabelFormValues {
  name: string;
  color: number | null;
}

/** Field-level validation errors for the Label form, keyed by field. */
export interface LabelFormErrors {
  name?: string;
}

/** Blank form values for creating a label; colour defaults to unset. */
export function newLabelForm(): LabelFormValues {
  return { name: '', color: null };
}

/** Project an existing label into editable form values. */
export function labelToForm(label: Label): LabelFormValues {
  return { name: label.name, color: label.color ?? null };
}

/** Pure validation for the Label form. Name is required (non-blank). */
export function validateLabelForm(values: LabelFormValues): LabelFormErrors {
  const errors: LabelFormErrors = {};
  if (values.name.trim() === '') {
    errors.name = 'Name is required.';
  }
  return errors;
}

/** Build the UI Label projection from submitted form values and an id. */
function labelFromForm(id: string, values: LabelFormValues): Label {
  const name = values.name.trim();
  return {
    id,
    name,
    color: values.color ?? undefined,
    colorLabel: colorLabel(values.color ?? undefined),
  };
}

/**
 * Signature of the generated `Csa_labelsService.create`. Injected so the write
 * seam can be exercised without importing the Power Apps runtime.
 */
export type LabelCreator = (
  record: Omit<Csa_labelsBase, 'csa_labelid'>,
) => Promise<IOperationResult<Csa_labels>>;

/**
 * Create a label through the write seam and return the UI projection. The name
 * is trimmed; `csa_color` is only sent when a colour was chosen. Used both by
 * the management view and by inline creation from a task's label picker.
 */
export async function createLabel(
  create: LabelCreator,
  values: LabelFormValues,
): Promise<Label> {
  const name = values.name.trim();
  const record: Record<string, unknown> = { csa_name: name };
  if (values.color !== null) {
    record.csa_color = values.color;
  }
  const result = await create(record as Omit<Csa_labelsBase, 'csa_labelid'>);
  return labelFromForm(result.data?.csa_labelid ?? '', values);
}

/**
 * Signature of the generated `Csa_labelsService.update`. Injected so the write
 * seam can be exercised without importing the Power Apps runtime.
 */
export type LabelUpdater = (
  id: string,
  changedFields: Partial<Omit<Csa_labelsBase, 'csa_labelid'>>,
) => Promise<IOperationResult<Csa_labels>>;

/**
 * Update a label's name and colour through the write seam. Sending `null` for
 * `csa_color` clears the colour in Dataverse (recolour-to-none). Returns the UI
 * projection built from the submitted values.
 */
export async function updateLabel(
  update: LabelUpdater,
  id: string,
  values: LabelFormValues,
): Promise<Label> {
  const name = values.name.trim();
  const changed: Record<string, unknown> = { csa_name: name, csa_color: values.color };
  await update(id, changed as Partial<Omit<Csa_labelsBase, 'csa_labelid'>>);
  return labelFromForm(id, values);
}

/**
 * Signature of the generated `Csa_labelsService.delete`. Injected so the delete
 * seam can be exercised without importing the Power Apps runtime.
 */
export type LabelDeleter = (id: string) => Promise<void>;

/**
 * Permanently delete a label through the seam (hard delete per ADR-0002). The
 * live delete detaches the label from every task that carried it.
 */
export async function deleteLabel(remove: LabelDeleter, id: string): Promise<void> {
  await remove(id);
}

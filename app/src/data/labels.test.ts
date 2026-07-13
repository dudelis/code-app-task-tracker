import { describe, expect, it, vi } from 'vitest';
import type { Csa_labels } from '../generated/models/Csa_labelsModel';
import type { IOperationResult } from '@microsoft/power-apps/data';
import {
  ACTIVE_LABELS_FILTER,
  TASK_LABEL_NAV,
  computeLabelChanges,
  createLabel,
  deleteLabel,
  detachAllTaskLabels,
  fetchAllLabels,
  fetchTaskLabels,
  findLabelByName,
  labelToForm,
  LABEL_COLOR_CHOICES,
  mapLabel,
  newLabelForm,
  saveTaskLabels,
  selectLabels,
  updateLabel,
  validateLabelForm,
  type Label,
  type LabelCreator,
  type LabelDeleter,
  type LabelsFetcher,
  type LabelUpdater,
  type TaskLabelsReader,
  type TaskLabelsWriter,
} from './labels';

function record(partial: Partial<Csa_labels>): Csa_labels {
  return { csa_labelid: 'id', statecode: 0, ...partial } as Csa_labels;
}

function ok(data: Csa_labels[]): IOperationResult<Csa_labels[]> {
  return { data } as IOperationResult<Csa_labels[]>;
}

describe('mapLabel', () => {
  it('projects a record and resolves the colour choice to its label', () => {
    expect(
      mapLabel(record({ csa_labelid: 'a', csa_name: 'Bug', csa_color: 100000000 })),
    ).toEqual({ id: 'a', name: 'Bug', color: 100000000, colorLabel: 'Red' });
  });

  it('treats a missing name and colour as empty', () => {
    expect(mapLabel(record({ csa_labelid: 'x' }))).toEqual({
      id: 'x',
      name: '',
      color: undefined,
      colorLabel: '',
    });
  });
});

describe('selectLabels', () => {
  it('projects and sorts labels by name, case-insensitively', () => {
    const records = [
      record({ csa_labelid: 'b', csa_name: 'beta', csa_color: 100000003 }),
      record({ csa_labelid: 'a', csa_name: 'Alpha', csa_color: 100000004 }),
    ];

    expect(selectLabels(records)).toEqual([
      { id: 'a', name: 'Alpha', color: 100000004, colorLabel: 'Blue' },
      { id: 'b', name: 'beta', color: 100000003, colorLabel: 'Green' },
    ]);
  });
});

describe('fetchAllLabels', () => {
  it('reads active labels through the seam, sorted by name', async () => {
    const fetch: LabelsFetcher = vi.fn(async () =>
      ok([
        record({ csa_labelid: 'a', csa_name: 'Alpha' }),
        record({ csa_labelid: 'b', csa_name: 'Beta' }),
      ]),
    );

    const labels = await fetchAllLabels(fetch);

    expect(fetch).toHaveBeenCalledWith({
      filter: ACTIVE_LABELS_FILTER,
      orderBy: ['csa_name asc'],
    });
    expect(labels).toEqual([
      { id: 'a', name: 'Alpha', color: undefined, colorLabel: '' },
      { id: 'b', name: 'Beta', color: undefined, colorLabel: '' },
    ]);
  });

  it('returns an empty list when the data source returns no data', async () => {
    const fetch: LabelsFetcher = vi.fn(async () => ({}) as IOperationResult<Csa_labels[]>);
    expect(await fetchAllLabels(fetch)).toEqual([]);
  });
});

describe('fetchTaskLabels', () => {
  it('reads a task\'s attached labels through the seam and projects them', async () => {
    const read: TaskLabelsReader = vi.fn(async () => [
      record({ csa_labelid: 'b', csa_name: 'Beta' }),
      record({ csa_labelid: 'a', csa_name: 'Alpha' }),
    ]);

    const labels = await fetchTaskLabels(read, 'task-1');

    expect(read).toHaveBeenCalledWith('task-1');
    // Projected and sorted by name.
    expect(labels).toEqual([
      { id: 'a', name: 'Alpha', color: undefined, colorLabel: '' },
      { id: 'b', name: 'Beta', color: undefined, colorLabel: '' },
    ]);
  });
});

describe('computeLabelChanges', () => {
  it('computes attach and detach deltas between current and desired sets', () => {
    expect(computeLabelChanges(['a', 'b'], ['b', 'c'])).toEqual({
      attach: ['c'],
      detach: ['a'],
    });
  });

  it('is a no-op when the sets are equal', () => {
    expect(computeLabelChanges(['a', 'b'], ['a', 'b'])).toEqual({
      attach: [],
      detach: [],
    });
  });

  it('de-duplicates both inputs', () => {
    expect(computeLabelChanges(['a', 'a'], ['a', 'b', 'b'])).toEqual({
      attach: ['b'],
      detach: [],
    });
  });

  it('attaches all desired when the task has no labels yet', () => {
    expect(computeLabelChanges([], ['a', 'b'])).toEqual({
      attach: ['a', 'b'],
      detach: [],
    });
  });

  it('detaches all current when the desired set is empty', () => {
    expect(computeLabelChanges(['a', 'b'], [])).toEqual({
      attach: [],
      detach: ['a', 'b'],
    });
  });
});

describe('saveTaskLabels', () => {
  it('writes the desired label set through the M:N seam and returns it', async () => {
    const write: TaskLabelsWriter = vi.fn(async () => undefined);

    const result = await saveTaskLabels(write, 'task-1', ['b', 'c']);

    // The association goes through the injected seam — a task moving from
    // [a, b] to [b, c] links c and unlinks a, expressed as the desired set.
    expect(write).toHaveBeenCalledWith('task-1', ['b', 'c']);
    expect(result).toEqual(['b', 'c']);
  });

  it('de-duplicates desired ids before writing', async () => {
    const write: TaskLabelsWriter = vi.fn(async () => undefined);

    const result = await saveTaskLabels(write, 'task-1', ['a', 'a', 'b']);

    expect(write).toHaveBeenCalledWith('task-1', ['a', 'b']);
    expect(result).toEqual(['a', 'b']);
  });

  it('clears all labels by writing an empty set', async () => {
    const write: TaskLabelsWriter = vi.fn(async () => undefined);

    const result = await saveTaskLabels(write, 'task-1', []);

    expect(write).toHaveBeenCalledWith('task-1', []);
    expect(result).toEqual([]);
  });
});

describe('detachAllTaskLabels', () => {
  it('detaches every label from a task by writing an empty set', async () => {
    const write: TaskLabelsWriter = vi.fn(async () => undefined);

    await detachAllTaskLabels(write, 'task-1');

    expect(write).toHaveBeenCalledWith('task-1', []);
  });
});

describe('TASK_LABEL_NAV', () => {
  it('is the task-side many-to-many navigation property', () => {
    expect(TASK_LABEL_NAV).toBe('csa_csa_task_csa_label');
  });
});

function label(partial: Partial<Label>): Label {
  return { id: 'id', name: 'Label', color: undefined, colorLabel: '', ...partial };
}

function created(csa_labelid: string): IOperationResult<Csa_labels> {
  return { data: record({ csa_labelid }) } as IOperationResult<Csa_labels>;
}

describe('findLabelByName', () => {
  const labels = [
    label({ id: 'a', name: 'Bug' }),
    label({ id: 'b', name: 'Feature' }),
  ];

  it('matches an existing name case-insensitively and trimmed', () => {
    expect(findLabelByName(labels, '  bug ')).toEqual(label({ id: 'a', name: 'Bug' }));
  });

  it('returns undefined when no label matches', () => {
    expect(findLabelByName(labels, 'Chore')).toBeUndefined();
  });

  it('returns undefined for a blank name', () => {
    expect(findLabelByName(labels, '   ')).toBeUndefined();
  });
});

describe('newLabelForm / labelToForm / validateLabelForm', () => {
  it('newLabelForm defaults to a blank name and no colour', () => {
    expect(newLabelForm()).toEqual({ name: '', color: null });
  });

  it('labelToForm projects a label, mapping an unset colour to null', () => {
    expect(labelToForm(label({ name: 'Bug', color: 100000000 }))).toEqual({
      name: 'Bug',
      color: 100000000,
    });
    expect(labelToForm(label({ name: 'Bug', color: undefined }))).toEqual({
      name: 'Bug',
      color: null,
    });
  });

  it('validateLabelForm requires a non-blank name', () => {
    expect(validateLabelForm({ name: '', color: null })).toEqual({ name: 'Name is required.' });
    expect(validateLabelForm({ name: '   ', color: null })).toEqual({ name: 'Name is required.' });
    expect(validateLabelForm({ name: 'Bug', color: null })).toEqual({});
  });
});

describe('LABEL_COLOR_CHOICES', () => {
  it('exposes the colour option set as value/label pairs', () => {
    expect(LABEL_COLOR_CHOICES).toContainEqual({ value: 100000000, label: 'Red' });
    expect(LABEL_COLOR_CHOICES).toContainEqual({ value: 100000006, label: 'Gray' });
    expect(LABEL_COLOR_CHOICES).toHaveLength(7);
  });
});

describe('createLabel', () => {
  it('creates a label with a colour through the seam and returns the projection', async () => {
    const create: LabelCreator = vi.fn(async () => created('new-1'));

    const result = await createLabel(create, { name: '  Bug  ', color: 100000000 });

    expect(create).toHaveBeenCalledWith({ csa_name: 'Bug', csa_color: 100000000 });
    expect(result).toEqual({ id: 'new-1', name: 'Bug', color: 100000000, colorLabel: 'Red' });
  });

  it('omits csa_color when no colour is chosen (inline create default)', async () => {
    const create: LabelCreator = vi.fn(async () => created('new-2'));

    const result = await createLabel(create, { name: 'Chore', color: null });

    expect(create).toHaveBeenCalledWith({ csa_name: 'Chore' });
    expect(result).toEqual({ id: 'new-2', name: 'Chore', color: undefined, colorLabel: '' });
  });
});

describe('updateLabel', () => {
  it('updates name and colour through the seam and returns the projection', async () => {
    const update: LabelUpdater = vi.fn(async () => created('a'));

    const result = await updateLabel(update, 'a', { name: ' Feature ', color: 100000004 });

    expect(update).toHaveBeenCalledWith('a', { csa_name: 'Feature', csa_color: 100000004 });
    expect(result).toEqual({ id: 'a', name: 'Feature', color: 100000004, colorLabel: 'Blue' });
  });

  it('sends csa_color null to clear the colour (recolour to none)', async () => {
    const update: LabelUpdater = vi.fn(async () => created('a'));

    const result = await updateLabel(update, 'a', { name: 'Bug', color: null });

    expect(update).toHaveBeenCalledWith('a', { csa_name: 'Bug', csa_color: null });
    expect(result).toEqual({ id: 'a', name: 'Bug', color: undefined, colorLabel: '' });
  });
});

describe('deleteLabel', () => {
  it('deletes a label through the seam', async () => {
    const remove: LabelDeleter = vi.fn(async () => undefined);

    await deleteLabel(remove, 'a');

    expect(remove).toHaveBeenCalledWith('a');
  });
});

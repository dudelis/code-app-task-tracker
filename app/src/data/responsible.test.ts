import { describe, expect, it } from 'vitest';
import type { Task } from './tasks';
import {
  CUSTOMER_RESPONSIBLE,
  ME_RESPONSIBLE,
  filterTasksByResponsible,
  matchesResponsible,
} from './responsible';

function task(partial: Partial<Task>): Task {
  return { id: 't', name: '', statusLabel: '', projectId: '', sortOrder: 0, ...partial };
}

describe('matchesResponsible', () => {
  it('matches every task under the "all" filter', () => {
    expect(matchesResponsible(task({ responsible: ME_RESPONSIBLE }), 'all')).toBe(true);
    expect(matchesResponsible(task({ responsible: CUSTOMER_RESPONSIBLE }), 'all')).toBe(true);
    expect(matchesResponsible(task({ responsible: undefined }), 'all')).toBe(true);
  });

  it('matches only "Me" tasks under the "me" filter', () => {
    expect(matchesResponsible(task({ responsible: ME_RESPONSIBLE }), 'me')).toBe(true);
    expect(matchesResponsible(task({ responsible: CUSTOMER_RESPONSIBLE }), 'me')).toBe(false);
  });

  it('matches only "Customer" tasks under the "customer" filter', () => {
    expect(matchesResponsible(task({ responsible: CUSTOMER_RESPONSIBLE }), 'customer')).toBe(true);
    expect(matchesResponsible(task({ responsible: ME_RESPONSIBLE }), 'customer')).toBe(false);
  });

  it('hides tasks with no responsible under "me" and "customer"', () => {
    expect(matchesResponsible(task({ responsible: undefined }), 'me')).toBe(false);
    expect(matchesResponsible(task({ responsible: undefined }), 'customer')).toBe(false);
  });
});

describe('filterTasksByResponsible', () => {
  const tasks = [
    task({ id: 'mine', responsible: ME_RESPONSIBLE }),
    task({ id: 'theirs', responsible: CUSTOMER_RESPONSIBLE }),
    task({ id: 'unset', responsible: undefined }),
  ];

  it('keeps every task under "all"', () => {
    expect(filterTasksByResponsible(tasks, 'all').map((t) => t.id)).toEqual([
      'mine',
      'theirs',
      'unset',
    ]);
  });

  it('keeps only my tasks under "me"', () => {
    expect(filterTasksByResponsible(tasks, 'me').map((t) => t.id)).toEqual(['mine']);
  });

  it('keeps only customer tasks under "customer"', () => {
    expect(filterTasksByResponsible(tasks, 'customer').map((t) => t.id)).toEqual(['theirs']);
  });
});

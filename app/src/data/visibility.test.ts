import { describe, expect, it } from 'vitest';
import { filterVisible, isVisible, toggleActive } from './visibility';

describe('isVisible', () => {
  it('shows active items regardless of the toggle', () => {
    expect(isVisible({ active: true }, false)).toBe(true);
    expect(isVisible({ active: true }, true)).toBe(true);
  });

  it('hides inactive items by default and reveals them when showing inactive', () => {
    expect(isVisible({ active: false }, false)).toBe(false);
    expect(isVisible({ active: false }, true)).toBe(true);
  });
});

describe('filterVisible', () => {
  const items = [
    { id: 'a', active: true },
    { id: 'b', active: false },
    { id: 'c', active: true },
  ];

  it('keeps only active items by default', () => {
    expect(filterVisible(items, false)).toEqual([
      { id: 'a', active: true },
      { id: 'c', active: true },
    ]);
  });

  it('keeps every item when showing inactive', () => {
    expect(filterVisible(items, true)).toEqual(items);
  });
});

describe('toggleActive', () => {
  it('flips the active state', () => {
    expect(toggleActive(true)).toBe(false);
    expect(toggleActive(false)).toBe(true);
  });
});

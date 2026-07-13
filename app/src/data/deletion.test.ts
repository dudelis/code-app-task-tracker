import { describe, expect, it } from 'vitest';
import { isDeleteConfirmed } from './deletion';

describe('isDeleteConfirmed', () => {
  it('confirms when the typed name exactly matches the actual name', () => {
    expect(isDeleteConfirmed('Acme Corp', 'Acme Corp')).toBe(true);
  });

  it('ignores surrounding whitespace on both sides', () => {
    expect(isDeleteConfirmed('  Acme Corp  ', 'Acme Corp')).toBe(true);
    expect(isDeleteConfirmed('Acme Corp', '  Acme Corp  ')).toBe(true);
  });

  it('does not confirm on a partial or different name', () => {
    expect(isDeleteConfirmed('Acme', 'Acme Corp')).toBe(false);
    expect(isDeleteConfirmed('Beta Corp', 'Acme Corp')).toBe(false);
  });

  it('is case-sensitive (exact match, not case-insensitive)', () => {
    expect(isDeleteConfirmed('acme corp', 'Acme Corp')).toBe(false);
  });

  it('never confirms when the actual name is blank', () => {
    expect(isDeleteConfirmed('', '')).toBe(false);
    expect(isDeleteConfirmed('   ', '   ')).toBe(false);
  });

  it('does not confirm when the typed name is empty but the actual name is not', () => {
    expect(isDeleteConfirmed('', 'Acme Corp')).toBe(false);
  });
});

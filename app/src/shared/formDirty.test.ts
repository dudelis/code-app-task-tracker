import { describe, expect, it } from 'vitest'
import { isFormDirty } from './formDirty'

interface SampleForm extends Record<string, unknown> {
  name: string
  status: number
  labelIds: string[]
}

function form(overrides: Partial<SampleForm> = {}): SampleForm {
  return { name: 'Task', status: 1, labelIds: ['a', 'b'], ...overrides }
}

describe('isFormDirty', () => {
  it('is pristine when current equals the captured original', () => {
    const original = form()
    expect(isFormDirty(form(), original)).toBe(false)
  })

  it('is dirty when a scalar field changes', () => {
    expect(isFormDirty(form({ name: 'Renamed' }), form())).toBe(true)
  })

  it('is dirty when a numeric field changes', () => {
    expect(isFormDirty(form({ status: 2 }), form())).toBe(true)
  })

  it('treats a reordered array of the same members as pristine', () => {
    // Toggling a label off then on can reorder the id list without changing the set.
    expect(isFormDirty(form({ labelIds: ['b', 'a'] }), form())).toBe(false)
  })

  it('is dirty when an array member is added', () => {
    expect(isFormDirty(form({ labelIds: ['a', 'b', 'c'] }), form())).toBe(true)
  })

  it('is dirty when an array member is removed', () => {
    expect(isFormDirty(form({ labelIds: ['a'] }), form())).toBe(true)
  })

  it('treats null and empty-string edits distinctly from the original', () => {
    const original = { note: null as string | null }
    expect(isFormDirty({ note: '' }, original)).toBe(true)
    expect(isFormDirty({ note: null as string | null }, original)).toBe(false)
  })
})

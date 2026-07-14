import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  LABEL_COLOR_CHOICES,
  createLabel,
  deleteLabel,
  labelToForm,
  newLabelForm,
  updateLabel,
  validateLabelForm,
  type Label,
  type LabelFormValues,
} from '../../data/labels'
import { Csa_labelsService } from '../../generated/services/Csa_labelsService'

/** The Labels management view: create, rename, recolour, and delete labels. */
export function LabelsView({
  labels,
  onBack,
  onLabelUpserted,
  onLabelRemoved,
}: {
  labels: Label[]
  onBack: () => void
  onLabelUpserted: (label: Label) => void
  onLabelRemoved: (labelId: string) => void
}) {
  return (
    <section className="labels-view" aria-label="Labels">
      <header className="labels-view-header">
        <button type="button" className="labels-back" onClick={onBack}>
          ← Back
        </button>
        <h2>Labels</h2>
      </header>
      <LabelCreateForm onCreated={onLabelUpserted} />
      {labels.length === 0 ? (
        <p className="labels-empty">No labels yet. Create one above.</p>
      ) : (
        <ul className="labels-list">
          {labels.map((label) => (
            <LabelRow
              key={label.id}
              label={label}
              onSaved={onLabelUpserted}
              onDeleted={onLabelRemoved}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** The create-a-label form at the top of the Labels management view. */
function LabelCreateForm({ onCreated }: { onCreated: (label: Label) => void }) {
  const [values, setValues] = useState<LabelFormValues>(() => newLabelForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = validateLabelForm(values)
  const canSave = Object.keys(errors).length === 0

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const created = await createLabel((record) => Csa_labelsService.create(record), values)
      onCreated(created)
      setValues(newLabelForm())
      setSaving(false)
    } catch (e: unknown) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Could not create the label.')
    }
  }

  return (
    <form className="label-create-form" onSubmit={handleSubmit}>
      {error && <p role="alert">{error}</p>}
      <input
        type="text"
        aria-label="New label name"
        placeholder="New label name"
        value={values.name}
        aria-invalid={errors.name ? true : undefined}
        onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
      />
      <LabelColorSelect
        value={values.color}
        onChange={(color) => setValues((v) => ({ ...v, color }))}
      />
      <button type="submit" className="label-create-button" disabled={!canSave || saving}>
        {saving ? 'Adding…' : 'Add Label'}
      </button>
    </form>
  )
}

/** A single row in the Labels list: rename, recolour, and delete a label. */
function LabelRow({
  label,
  onSaved,
  onDeleted,
}: {
  label: Label
  onSaved: (label: Label) => void
  onDeleted: (labelId: string) => void
}) {
  const [values, setValues] = useState<LabelFormValues>(() => labelToForm(label))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = validateLabelForm(values)
  const dirty =
    values.name.trim() !== label.name || values.color !== (label.color ?? null)
  const canSave = Object.keys(errors).length === 0 && dirty

  async function handleSave() {
    if (!canSave || saving || deleting) return
    setSaving(true)
    setError(null)
    try {
      const saved = await updateLabel(
        (id, changedFields) => Csa_labelsService.update(id, changedFields),
        label.id,
        values,
      )
      onSaved(saved)
      setSaving(false)
    } catch (e: unknown) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Could not save the label.')
    }
  }

  async function handleDelete() {
    if (saving || deleting) return
    if (!window.confirm(`Delete the label “${label.name}”? This removes it from every task.`)) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      await deleteLabel((id) => Csa_labelsService.delete(id), label.id)
      onDeleted(label.id)
    } catch (e: unknown) {
      setDeleting(false)
      setError(e instanceof Error ? e.message : 'Could not delete the label.')
    }
  }

  return (
    <li className="label-row">
      <input
        type="text"
        aria-label="Label name"
        value={values.name}
        aria-invalid={errors.name ? true : undefined}
        onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
      />
      <LabelColorSelect
        value={values.color}
        onChange={(color) => setValues((v) => ({ ...v, color }))}
      />
      <button
        type="button"
        className="label-row-save"
        disabled={!canSave || saving || deleting}
        onClick={handleSave}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        className="label-row-delete"
        disabled={saving || deleting}
        onClick={handleDelete}
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
      {error && <span className="detail-error">{error}</span>}
    </li>
  )
}

/** Colour picker shared by the Labels create form and each label row. */
function LabelColorSelect({
  value,
  onChange,
}: {
  value: number | null
  onChange: (color: number | null) => void
}) {
  return (
    <select
      aria-label="Label colour"
      value={value === null ? '' : String(value)}
      onChange={(event) =>
        onChange(event.target.value === '' ? null : Number(event.target.value))
      }
    >
      <option value="">No colour</option>
      {LABEL_COLOR_CHOICES.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  )
}

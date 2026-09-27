import { useEffect, useState } from 'react'
import { clearDraft, loadDraft, newId, saveDraft } from '../storage.js'
import { DIFFICULTY, WEIGHT_UNIT, WORKOUT_TYPES, today } from '../workout.js'

function blankSet(previous) {
  // New sets copy the previous set's numbers, since they're usually the same.
  return { id: newId(), weight: previous?.weight ?? '', reps: previous?.reps ?? '' }
}

function blankExercise() {
  return { id: newId(), name: '', sets: [blankSet()] }
}

function blankWorkout() {
  return {
    date: today(),
    type: '',
    difficulty: 3,
    notes: '',
    exercises: [blankExercise()],
  }
}

// Saved workouts store numbers (or null); the form works with strings.
function toFormState(workout) {
  return {
    ...workout,
    exercises: workout.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => ({
        id: s.id,
        weight: s.weight == null ? '' : String(s.weight),
        reps: s.reps == null ? '' : String(s.reps),
      })),
    })),
  }
}

function toNumber(value) {
  return value === '' ? null : Number(value)
}

export default function WorkoutForm({ initial, exerciseNames, onSave, onCancel }) {
  const isEditing = Boolean(initial)
  const [workout, setWorkout] = useState(() =>
    isEditing ? toFormState(initial) : (loadDraft() ?? blankWorkout()),
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isEditing) saveDraft(workout)
  }, [workout, isEditing])

  function update(patch) {
    setWorkout((w) => ({ ...w, ...patch }))
  }

  function updateExercise(exerciseId, change) {
    setWorkout((w) => ({
      ...w,
      exercises: w.exercises.map((e) => (e.id === exerciseId ? change(e) : e)),
    }))
  }

  function addExercise() {
    setWorkout((w) => ({ ...w, exercises: [...w.exercises, blankExercise()] }))
  }

  function removeExercise(exerciseId) {
    setWorkout((w) => ({
      ...w,
      exercises: w.exercises.filter((e) => e.id !== exerciseId),
    }))
  }

  function addSet(exerciseId) {
    updateExercise(exerciseId, (e) => ({
      ...e,
      sets: [...e.sets, blankSet(e.sets.at(-1))],
    }))
  }

  function updateSet(exerciseId, setId, patch) {
    updateExercise(exerciseId, (e) => ({
      ...e,
      sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
    }))
  }

  function removeSet(exerciseId, setId) {
    updateExercise(exerciseId, (e) => ({
      ...e,
      sets: e.sets.filter((s) => s.id !== setId),
    }))
  }

  function discard() {
    if (!confirm('Discard this workout?')) return
    clearDraft()
    setWorkout(blankWorkout())
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const exercises = workout.exercises
      .map((e) => ({
        id: e.id,
        name: e.name.trim(),
        sets: e.sets
          .filter((s) => s.weight !== '' || s.reps !== '')
          .map((s) => ({ id: s.id, weight: toNumber(s.weight), reps: toNumber(s.reps) })),
      }))
      .filter((e) => e.name)

    if (exercises.length === 0) {
      setError('Add at least one exercise with a name.')
      return
    }

    const now = Date.now()
    setSaving(true)
    setError('')
    try {
      await onSave({
        id: initial?.id ?? newId(),
        createdAt: initial?.createdAt ?? now,
        updatedAt: now,
        date: workout.date,
        type: workout.type.trim() || 'Workout',
        difficulty: workout.difficulty,
        notes: workout.notes.trim(),
        exercises,
      })
      if (!isEditing) clearDraft()
    } catch (err) {
      // The draft is kept, so nothing is lost; the user can retry.
      setError(`Couldn't save: ${err.message}. Check your connection and try again.`)
      setSaving(false)
    }
  }

  return (
    <form className="workout-form" onSubmit={handleSubmit}>
      <h2>{isEditing ? 'Edit workout' : 'Log workout'}</h2>

      <div className="row">
        <label className="field">
          <span>Date</span>
          <input
            type="date"
            value={workout.date}
            onChange={(e) => update({ date: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Workout type</span>
          <input
            list="workout-types"
            placeholder="e.g. Push"
            value={workout.type}
            onChange={(e) => update({ type: e.target.value })}
          />
          <datalist id="workout-types">
            {WORKOUT_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      </div>

      <fieldset className="field">
        <legend>Difficulty</legend>
        <div className="segmented">
          {DIFFICULTY.map((d) => (
            <button
              key={d.value}
              type="button"
              className={workout.difficulty === d.value ? 'selected' : ''}
              aria-pressed={workout.difficulty === d.value}
              onClick={() => update({ difficulty: d.value })}
            >
              {d.label}
            </button>
          ))}
        </div>
      </fieldset>

      <datalist id="exercise-names">
        {exerciseNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {workout.exercises.map((exercise, exerciseIndex) => (
        <section key={exercise.id} className="card exercise">
          <div className="exercise-header">
            <input
              className="exercise-name"
              list="exercise-names"
              placeholder={`Exercise ${exerciseIndex + 1} (e.g. Bench Press)`}
              aria-label="Exercise name"
              value={exercise.name}
              onChange={(e) => updateExercise(exercise.id, (ex) => ({ ...ex, name: e.target.value }))}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Remove exercise"
              onClick={() => removeExercise(exercise.id)}
            >
              ✕
            </button>
          </div>

          {exercise.sets.length > 0 && (
            <div className="sets">
              <div className="set-row set-labels">
                <span>Set</span>
                <span>{WEIGHT_UNIT}</span>
                <span>Reps</span>
                <span />
              </div>
              {exercise.sets.map((set, setIndex) => (
                <div key={set.id} className="set-row">
                  <span className="set-number">{setIndex + 1}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    aria-label={`Set ${setIndex + 1} weight`}
                    value={set.weight}
                    onChange={(e) => updateSet(exercise.id, set.id, { weight: e.target.value })}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    aria-label={`Set ${setIndex + 1} reps`}
                    value={set.reps}
                    onChange={(e) => updateSet(exercise.id, set.id, { reps: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove set ${setIndex + 1}`}
                    onClick={() => removeSet(exercise.id, set.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <button type="button" className="secondary" onClick={() => addSet(exercise.id)}>
            + Add set
          </button>
        </section>
      ))}

      <button type="button" className="secondary" onClick={addExercise}>
        + Add exercise
      </button>

      <label className="field">
        <span>Notes</span>
        <textarea
          rows={3}
          placeholder="How did it feel?"
          value={workout.notes}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        {isEditing ? (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button type="button" className="secondary" onClick={discard}>
            Discard
          </button>
        )}
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Save workout'}
        </button>
      </div>
    </form>
  )
}

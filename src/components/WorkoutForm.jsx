import { useEffect, useMemo, useState } from 'react'
import { clearDraft, loadDraft, newId, saveDraft } from '../storage.js'
import {
  DIFFICULTY,
  EQUIPMENT,
  GRIPS,
  WEIGHT_UNIT,
  WORKOUT_TYPES,
  formatClock,
  formatDuration,
  nowTime,
  restBeforeSets,
  secondsBetween,
  timeOf,
  toTimestamp,
  today,
} from '../workout.js'

const nowIso = () => new Date().toISOString()

function blankSet(previous) {
  // New sets copy the previous set's numbers, since they're usually the same.
  return {
    id: newId(),
    weight: previous?.weight ?? '',
    reps: previous?.reps ?? '',
    grip: previous?.grip ?? '',
    startedAt: null,
    endedAt: null,
  }
}

function blankExercise(startedAt = null) {
  return {
    id: newId(),
    name: '',
    equipment: '',
    difficulty: null,
    notes: '',
    startedAt,
    endedAt: null,
    sets: [blankSet()],
  }
}

// Stops a running set and marks a started exercise as finished.
function finishExercise(exercise, at) {
  return {
    ...exercise,
    endedAt: exercise.endedAt ?? (exercise.startedAt ? at : null),
    sets: exercise.sets.map((s) => (s.startedAt && !s.endedAt ? { ...s, endedAt: at } : s)),
  }
}

// The current time, updated every second while `active`.
function useNow(active) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function blankWorkout() {
  return {
    date: today(),
    startTime: nowTime(),
    endTime: '',
    type: '',
    location: '',
    notes: '',
    exercises: [blankExercise(nowIso())],
  }
}

// Saved workouts store numbers (or null) and timestamps; the form works with strings.
function toFormState(workout) {
  return {
    date: workout.date,
    startTime: timeOf(workout.startedAt),
    endTime: timeOf(workout.endedAt),
    type: workout.type,
    location: workout.location,
    notes: workout.notes,
    exercises: workout.exercises.map((e) => ({
      id: e.id,
      name: e.name,
      equipment: e.equipment,
      difficulty: e.difficulty,
      notes: e.notes,
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      sets: e.sets.map((s) => ({
        id: s.id,
        weight: s.weight == null ? '' : String(s.weight),
        reps: s.reps == null ? '' : String(s.reps),
        grip: s.grip,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
      })),
    })),
  }
}

function toNumber(value) {
  return value === '' ? null : Number(value)
}

export default function WorkoutForm({ initial, catalog, locations, onSave, onCancel }) {
  const isEditing = Boolean(initial)
  const [workout, setWorkout] = useState(() =>
    isEditing ? toFormState(initial) : (loadDraft() ?? blankWorkout()),
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const exerciseNames = useMemo(() => [...new Set(catalog.map((e) => e.name))], [catalog])

  // Logging a new workout today: exercises and sets are timed as they happen.
  const isLive = !isEditing && workout.date === today()

  // The timer bar works on the newest exercise.
  const current = workout.exercises.at(-1)
  const runningSetIndex = current ? current.sets.findIndex((s) => s.startedAt && !s.endedAt) : -1
  const runningSet = current?.sets[runningSetIndex]
  const lastTimedIndex = current ? current.sets.findLastIndex((s) => s.startedAt) : -1
  const lastDoneSet = current?.sets.findLast((s) => s.endedAt)
  const now = useNow(isLive && Boolean(runningSet || lastDoneSet))
  const secondsSince = (iso) => Math.max(0, Math.round((now - Date.parse(iso)) / 1000))

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

  function findInCatalog(name) {
    return catalog.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
  }

  // Picking a known exercise fills in its equipment.
  function changeExerciseName(exerciseId, name) {
    const match = findInCatalog(name)
    updateExercise(exerciseId, (e) => ({ ...e, name, equipment: match?.equipment ?? e.equipment }))
  }

  // When live, adding an exercise finishes the previous one.
  function addExercise() {
    setWorkout((w) => {
      if (!isLive) return { ...w, exercises: [...w.exercises, blankExercise()] }
      const at = nowIso()
      return {
        ...w,
        exercises: [...w.exercises.map((e) => finishExercise(e, at)), blankExercise(at)],
      }
    })
  }

  // Starts the set after the last timed one, adding a set if needed.
  function startNextSet() {
    const at = nowIso()
    updateExercise(current.id, (e) => {
      const index = e.sets.findLastIndex((s) => s.startedAt) + 1
      const sets = index < e.sets.length ? e.sets : [...e.sets, blankSet(e.sets.at(-1))]
      return {
        ...e,
        startedAt: e.startedAt ?? at,
        endedAt: null,
        sets: sets.map((s, i) => (i === index ? { ...s, startedAt: at } : s)),
      }
    })
  }

  function finishSet() {
    const at = nowIso()
    updateExercise(current.id, (e) => ({
      ...e,
      sets: e.sets.map((s) => (s.startedAt && !s.endedAt ? { ...s, endedAt: at } : s)),
    }))
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

    const savedAt = nowIso()
    const exercises = workout.exercises
      .map((e) => (isLive ? finishExercise(e, savedAt) : e))
      .map((e) => ({
        id: e.id,
        // Use the known exercise's capitalization ("bench press" → "Bench Press").
        name: findInCatalog(e.name)?.name ?? e.name.trim(),
        equipment: e.equipment || 'other',
        difficulty: e.difficulty,
        notes: e.notes.trim(),
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        sets: e.sets
          // Keep timed sets without numbers, like a plank.
          .filter((s) => s.weight !== '' || s.reps !== '' || s.startedAt)
          .map((s) => ({
            id: s.id,
            weight: toNumber(s.weight),
            reps: toNumber(s.reps),
            grip: s.grip,
            startedAt: s.startedAt,
            endedAt: s.endedAt,
          })),
      }))
      .filter((e) => e.name)

    if (exercises.length === 0) {
      setError('Add at least one exercise with a name.')
      return
    }

    // Saving a new workout on the day it happens means it just finished.
    let { startTime, endTime } = workout
    if (!endTime && !isEditing && workout.date === today()) endTime = nowTime()
    // An end time before the start time means the workout went past midnight.
    const endDayOffset = startTime && endTime && endTime < startTime ? 1 : 0

    const now = Date.now()
    setSaving(true)
    setError('')
    try {
      await onSave({
        id: initial?.id ?? newId(),
        createdAt: initial?.createdAt ?? now,
        updatedAt: now,
        date: workout.date,
        startedAt: startTime ? toTimestamp(workout.date, startTime) : null,
        endedAt: endTime ? toTimestamp(workout.date, endTime, endDayOffset) : null,
        type: workout.type.trim() || 'Workout',
        location: workout.location.trim(),
        notes: workout.notes.trim(),
        exercises,
      })
      if (!isEditing) clearDraft()
    } catch (err) {
      // The draft is kept, so nothing is lost; the user can retry.
      setError(`Couldn't save: ${err.message}. Your workout is still here, so you can try again.`)
      setSaving(false)
    }
  }

  return (
    <form className={`workout-form${isLive ? ' has-timer' : ''}`} onSubmit={handleSubmit}>
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

      <div className="row">
        <label className="field">
          <span>Start</span>
          <input
            type="time"
            value={workout.startTime}
            onChange={(e) => update({ startTime: e.target.value })}
          />
        </label>
        <label className="field">
          <span>End</span>
          <input
            type="time"
            value={workout.endTime}
            onChange={(e) => update({ endTime: e.target.value })}
          />
        </label>
      </div>
      {!isEditing && !workout.endTime && (
        <p className="hint">Leave End blank and it's set when you save.</p>
      )}

      <label className="field">
        <span>Location</span>
        <input
          list="locations"
          placeholder="e.g. Planet Fitness"
          value={workout.location}
          onChange={(e) => update({ location: e.target.value })}
        />
        <datalist id="locations">
          {locations.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </label>

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
              onChange={(e) => changeExerciseName(exercise.id, e.target.value)}
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

          {exercise.startedAt && exercise.endedAt && (
            <p className="hint">Took {formatDuration(exercise.startedAt, exercise.endedAt)}</p>
          )}

          <select
            aria-label="Equipment"
            value={exercise.equipment}
            onChange={(e) => updateExercise(exercise.id, (ex) => ({ ...ex, equipment: e.target.value }))}
          >
            <option value="">Equipment…</option>
            {EQUIPMENT.map((eq) => (
              <option key={eq.value} value={eq.value}>
                {eq.label}
              </option>
            ))}
          </select>

          {exercise.sets.length > 0 && (
            <div className="sets">
              <div className="set-row set-labels">
                <span>Set</span>
                <span>{WEIGHT_UNIT}</span>
                <span>Reps</span>
                <span>Grip</span>
                <span />
              </div>
              {exercise.sets.map((set, setIndex) => (
                <div key={set.id}>
                  <div className="set-row">
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
                    <select
                      aria-label={`Set ${setIndex + 1} grip`}
                      value={set.grip}
                      onChange={(e) => updateSet(exercise.id, set.id, { grip: e.target.value })}
                    >
                      <option value="">—</option>
                      {GRIPS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove set ${setIndex + 1}`}
                      onClick={() => removeSet(exercise.id, set.id)}
                    >
                      ✕
                    </button>
                  </div>
                  {set.startedAt && (
                    <SetTiming
                      set={set}
                      restBefore={restBeforeSets(exercise.sets)[setIndex]}
                      secondsSince={secondsSince}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <button type="button" className="secondary" onClick={() => addSet(exercise.id)}>
            + Add set
          </button>

          <fieldset className="field">
            <legend>Difficulty</legend>
            <div className="segmented">
              {DIFFICULTY.map((d) => {
                const selected = exercise.difficulty === d.value
                return (
                  <button
                    key={d.value}
                    type="button"
                    className={selected ? 'selected' : ''}
                    aria-pressed={selected}
                    // Tapping the selected rating again clears it.
                    onClick={() =>
                      updateExercise(exercise.id, (ex) => ({
                        ...ex,
                        difficulty: selected ? null : d.value,
                      }))
                    }
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <input
            placeholder="Notes (optional)"
            aria-label="Exercise notes"
            value={exercise.notes}
            onChange={(e) => updateExercise(exercise.id, (ex) => ({ ...ex, notes: e.target.value }))}
          />
        </section>
      ))}

      <button type="button" className="secondary" onClick={addExercise}>
        + Add exercise
      </button>

      <label className="field">
        <span>Workout notes</span>
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

      {isLive && current && (
        <div className="timer-bar">
          <div className="timer-status">
            <span className="timer-label">
              {current.name.trim() || `Exercise ${workout.exercises.length}`}
            </span>
            <strong className="timer-clock">
              {runningSet
                ? `Set ${runningSetIndex + 1} · ${formatClock(secondsSince(runningSet.startedAt))}`
                : lastDoneSet
                  ? `Resting ${formatClock(secondsSince(lastDoneSet.endedAt))}`
                  : 'Ready'}
            </strong>
          </div>
          {runningSet ? (
            <button type="button" className="primary timer-button done" onClick={finishSet}>
              ■ Done
            </button>
          ) : (
            <button type="button" className="primary timer-button" onClick={startNextSet}>
              ▶ Start set {lastTimedIndex + 2}
            </button>
          )}
        </div>
      )}
    </form>
  )
}

// "Rest 1:30 · Set 0:42" under a timed set; a running set counts up.
function SetTiming({ set, restBefore, secondsSince }) {
  const length = set.endedAt
    ? formatClock(secondsBetween(set.startedAt, set.endedAt))
    : `${formatClock(secondsSince(set.startedAt))}…`
  return (
    <div className="set-timing">
      {restBefore != null && `Rest ${formatClock(restBefore)} · `}Set {length}
    </div>
  )
}

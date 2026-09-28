import { useEffect, useMemo, useState } from 'react'
import TimeRange from './TimeRange.jsx'
import TimerBar from './TimerBar.jsx'
import { clearDraft, loadDraft, newId, saveDraft } from '../storage.js'
import {
  DIFFICULTY,
  EQUIPMENT,
  GRIPS,
  WEIGHT_UNIT,
  WORKOUT_TYPES,
  formatClock,
  formatDuration,
  restBeforeSets,
  secondsBetween,
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

function blankWorkout() {
  return {
    date: today(),
    startedAt: null,
    endedAt: null,
    type: '',
    location: '',
    notes: '',
    exercises: [blankExercise()],
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

// Ends the workout and everything still running in it.
function endWorkout(workout, at) {
  return { ...workout, endedAt: at, exercises: workout.exercises.map((e) => finishExercise(e, at)) }
}

// Saved workouts store numbers (or null); the form works with strings.
function toFormState(workout) {
  return {
    date: workout.date,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
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

function endsBeforeStart({ startedAt, endedAt }) {
  return startedAt && endedAt && Date.parse(endedAt) < Date.parse(startedAt)
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

export default function WorkoutForm({ initial, catalog, locations, onSave, onCancel }) {
  const isEditing = Boolean(initial)
  const [workout, setWorkout] = useState(() =>
    isEditing ? toFormState(initial) : (loadDraft() ?? blankWorkout()),
  )
  const [showTimes, setShowTimes] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const exerciseNames = useMemo(() => [...new Set(catalog.map((e) => e.name))], [catalog])

  // Logging a new workout today: the timer bar times the workout, exercises and sets.
  const isLive = !isEditing && workout.date === today()
  const inProgress = isLive && Boolean(workout.startedAt) && !workout.endedAt
  const now = useNow(inProgress)
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

  // ---------- Live timing ----------

  // The newest exercise starts along with the workout.
  function startWorkout() {
    const at = nowIso()
    setWorkout((w) => ({
      ...w,
      startedAt: at,
      endedAt: null,
      exercises: w.exercises.map((e, i) =>
        i === w.exercises.length - 1 && !e.startedAt ? { ...e, startedAt: at } : e,
      ),
    }))
  }

  function finishWorkout() {
    setWorkout((w) => endWorkout(w, nowIso()))
  }

  // Undo an accidental End workout; the next set restarts the current exercise.
  function resumeWorkout() {
    update({ endedAt: null })
  }

  // Starts the set after the last timed one on the newest exercise, adding a set if needed.
  function startNextSet() {
    const at = nowIso()
    setWorkout((w) => {
      const current = w.exercises.at(-1)
      const index = current.sets.findLastIndex((s) => s.startedAt) + 1
      const sets =
        index < current.sets.length ? current.sets : [...current.sets, blankSet(current.sets.at(-1))]
      const started = {
        ...current,
        startedAt: current.startedAt ?? at,
        endedAt: null,
        sets: sets.map((s, i) => (i === index ? { ...s, startedAt: at } : s)),
      }
      return { ...w, exercises: [...w.exercises.slice(0, -1), started] }
    })
  }

  function finishSet() {
    const at = nowIso()
    setWorkout((w) => ({
      ...w,
      exercises: w.exercises.map((e, i) =>
        i === w.exercises.length - 1
          ? { ...e, sets: e.sets.map((s) => (s.startedAt && !s.endedAt ? { ...s, endedAt: at } : s)) }
          : e,
      ),
    }))
  }

  // ---------- Editing ----------

  // During a workout, adding an exercise finishes the previous one.
  function addExercise() {
    setWorkout((w) => {
      if (!inProgress) return { ...w, exercises: [...w.exercises, blankExercise()] }
      const at = nowIso()
      return {
        ...w,
        exercises: [...w.exercises.map((e) => finishExercise(e, at)), blankExercise(at)],
      }
    })
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

    // Saving a workout that's still going ends it now.
    const final = inProgress ? endWorkout(workout, nowIso()) : workout

    const exercises = final.exercises
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

    const ranges = [final, ...exercises, ...exercises.flatMap((e) => e.sets)]
    if (ranges.some(endsBeforeStart)) {
      setShowTimes(true)
      setError('One of the end times is before its start time. Check the times and try again.')
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
        date: final.date,
        startedAt: final.startedAt,
        endedAt: final.endedAt,
        type: final.type.trim() || 'Workout',
        location: final.location.trim(),
        notes: final.notes.trim(),
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
      <div className="form-header">
        <h2>{isEditing ? 'Edit workout' : 'Log workout'}</h2>
        {inProgress && (
          <button type="button" className="secondary compact" onClick={finishWorkout}>
            End workout
          </button>
        )}
        {isLive && workout.endedAt && (
          <button type="button" className="secondary compact" onClick={resumeWorkout}>
            Resume
          </button>
        )}
      </div>

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

      <div className="times-toggle">
        <button type="button" className="link-button" onClick={() => setShowTimes((v) => !v)}>
          {showTimes ? 'Hide times' : 'Adjust times'}
        </button>
        {workout.startedAt && workout.endedAt && (
          <span className="muted small">
            Workout took {formatDuration(workout.startedAt, workout.endedAt)}
          </span>
        )}
      </div>

      {showTimes && (
        <TimeRange
          label="Workout"
          startedAt={workout.startedAt}
          endedAt={workout.endedAt}
          date={workout.date}
          onChange={update}
        />
      )}

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

          {showTimes ? (
            <TimeRange
              label="Exercise"
              withSeconds
              startedAt={exercise.startedAt}
              endedAt={exercise.endedAt}
              date={workout.date}
              onChange={(times) => updateExercise(exercise.id, (e) => ({ ...e, ...times }))}
            />
          ) : (
            exercise.startedAt &&
            exercise.endedAt && (
              <p className="hint">Took {formatDuration(exercise.startedAt, exercise.endedAt)}</p>
            )
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
                  {showTimes && (
                    <TimeRange
                      label={`Set ${setIndex + 1}`}
                      withSeconds
                      startedAt={set.startedAt}
                      endedAt={set.endedAt}
                      date={workout.date}
                      onChange={(times) => updateSet(exercise.id, set.id, times)}
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

      {isLive && (
        <TimerBar
          workout={workout}
          secondsSince={secondsSince}
          saving={saving}
          onStartWorkout={startWorkout}
          onStartSet={startNextSet}
          onFinishSet={finishSet}
        />
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

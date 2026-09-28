import {
  WEIGHT_UNIT,
  difficultyLabel,
  equipmentLabel,
  formatClock,
  formatDate,
  formatDuration,
  formatSet,
  formatTime,
  restBeforeSets,
  workoutStats,
} from '../workout.js'

// "12m · avg rest 1:45", or '' when the exercise wasn't timed.
function exerciseTiming(exercise) {
  const parts = []
  if (exercise.startedAt && exercise.endedAt) {
    parts.push(formatDuration(exercise.startedAt, exercise.endedAt))
  }
  const rests = restBeforeSets(exercise.sets).filter((r) => r != null)
  if (rests.length) {
    const average = Math.round(rests.reduce((sum, r) => sum + r, 0) / rests.length)
    parts.push(`avg rest ${formatClock(average)}`)
  }
  return parts.join(' · ')
}

export default function WorkoutHistory({ workouts, onEdit, onDelete }) {
  if (workouts.length === 0) {
    return (
      <div className="empty">
        <h2>No workouts yet</h2>
        <p>Workouts you log will show up here.</p>
      </div>
    )
  }

  return (
    <div className="history">
      <h2>History</h2>
      {workouts.map((workout) => {
        const stats = workoutStats(workout)
        const { startedAt, endedAt } = workout
        return (
          <details key={workout.id} className="card workout">
            <summary>
              <div className="workout-title">
                <strong>{workout.type}</strong>
                {startedAt && endedAt && (
                  <span className="muted small">{formatDuration(startedAt, endedAt)}</span>
                )}
              </div>
              <div className="muted">
                {formatDate(workout.date)}
                {startedAt && ` · ${formatTime(startedAt)}`}
                {startedAt && endedAt && `–${formatTime(endedAt)}`}
              </div>
              <div className="muted small">
                {workout.location && `${workout.location} · `}
                {stats.exercises} exercise{stats.exercises === 1 ? '' : 's'} · {stats.sets} set
                {stats.sets === 1 ? '' : 's'}
                {stats.volume > 0 && ` · ${stats.volume.toLocaleString()} ${WEIGHT_UNIT}`}
              </div>
            </summary>

            <ul className="exercise-list">
              {workout.exercises.map((exercise) => (
                <li key={exercise.id}>
                  <div className="exercise-line">
                    <strong>{exercise.name}</strong>
                    <span className="muted small">{equipmentLabel(exercise.equipment)}</span>
                    {exercise.difficulty && (
                      <span className={`badge difficulty-${exercise.difficulty}`}>
                        {difficultyLabel(exercise.difficulty)}
                      </span>
                    )}
                  </div>
                  <span className="muted">
                    {exercise.sets.length ? exercise.sets.map(formatSet).join(', ') : 'No sets'}
                  </span>
                  {exerciseTiming(exercise) && (
                    <span className="muted small">⏱ {exerciseTiming(exercise)}</span>
                  )}
                  {exercise.notes && <span className="exercise-notes">{exercise.notes}</span>}
                </li>
              ))}
            </ul>

            {workout.notes && <p className="notes">{workout.notes}</p>}

            <div className="form-actions">
              <button type="button" className="secondary danger" onClick={() => onDelete(workout)}>
                Delete
              </button>
              <button type="button" className="secondary" onClick={() => onEdit(workout)}>
                Edit
              </button>
            </div>
          </details>
        )
      })}
    </div>
  )
}

import {
  WEIGHT_UNIT,
  difficultyLabel,
  formatDate,
  formatSet,
  workoutStats,
} from '../workout.js'

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
        return (
          <details key={workout.id} className="card workout">
            <summary>
              <div className="workout-title">
                <strong>{workout.type}</strong>
                <span className={`badge difficulty-${workout.difficulty}`}>
                  {difficultyLabel(workout.difficulty)}
                </span>
              </div>
              <div className="muted">{formatDate(workout.date)}</div>
              <div className="muted small">
                {stats.exercises} exercise{stats.exercises === 1 ? '' : 's'} · {stats.sets} set
                {stats.sets === 1 ? '' : 's'}
                {stats.volume > 0 && ` · ${stats.volume.toLocaleString()} ${WEIGHT_UNIT} volume`}
              </div>
            </summary>

            <ul className="exercise-list">
              {workout.exercises.map((exercise) => (
                <li key={exercise.id}>
                  <strong>{exercise.name}</strong>
                  <span className="muted">
                    {exercise.sets.length ? exercise.sets.map(formatSet).join(', ') : 'No sets'}
                  </span>
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

import { formatClock, secondsBetween } from '../workout.js'

// The bar above the tabs while logging a workout live:
// Start workout → Start set / Done for the newest exercise → Save once ended.
export default function TimerBar({ workout, secondsSince, saving, onStartWorkout, onStartSet, onFinishSet }) {
  const { startedAt, endedAt } = workout

  if (!startedAt) {
    return (
      <Bar label="Not started" clock="0:00">
        <button type="button" className="primary timer-button" onClick={onStartWorkout}>
          ▶ Start workout
        </button>
      </Bar>
    )
  }

  if (endedAt) {
    return (
      <Bar label="Workout finished" clock={formatClock(secondsBetween(startedAt, endedAt))}>
        <button type="submit" className="primary timer-button" disabled={saving}>
          {saving ? 'Saving…' : 'Save workout'}
        </button>
      </Bar>
    )
  }

  const workoutClock = `Workout ${formatClock(secondsSince(startedAt))}`
  const current = workout.exercises.at(-1)
  if (!current) return <Bar label="In progress" clock={workoutClock} />

  const runningIndex = current.sets.findIndex((s) => s.startedAt && !s.endedAt)
  const running = current.sets[runningIndex]
  const lastDone = current.sets.findLast((s) => s.endedAt)
  const nextNumber = current.sets.findLastIndex((s) => s.startedAt) + 2
  const name = current.name.trim() || `Exercise ${workout.exercises.length}`

  return (
    <Bar
      label={`${workoutClock} · ${name}`}
      clock={
        running
          ? `Set ${runningIndex + 1} · ${formatClock(secondsSince(running.startedAt))}`
          : lastDone
            ? `Resting ${formatClock(secondsSince(lastDone.endedAt))}`
            : 'Ready'
      }
    >
      {running ? (
        <button type="button" className="primary timer-button done" onClick={onFinishSet}>
          ■ Done
        </button>
      ) : (
        <button type="button" className="primary timer-button" onClick={onStartSet}>
          ▶ Start set {nextNumber}
        </button>
      )}
    </Bar>
  )
}

function Bar({ label, clock, children }) {
  return (
    <div className="timer-bar">
      <div className="timer-status">
        <span className="timer-label">{label}</span>
        <strong className="timer-clock">{clock}</strong>
      </div>
      {children}
    </div>
  )
}

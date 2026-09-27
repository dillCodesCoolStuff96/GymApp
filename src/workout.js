// Shared constants and helpers for describing workouts.

export const WEIGHT_UNIT = 'lbs'

export const WORKOUT_TYPES = [
  'Push',
  'Pull',
  'Legs',
  'Upper Body',
  'Lower Body',
  'Full Body',
  'Cardio',
]

export const DIFFICULTY = [
  { value: 1, label: 'Easy' },
  { value: 2, label: 'Moderate' },
  { value: 3, label: 'Hard' },
  { value: 4, label: 'Very hard' },
  { value: 5, label: 'Max' },
]

export function difficultyLabel(value) {
  return DIFFICULTY.find((d) => d.value === value)?.label ?? ''
}

// Today's date as YYYY-MM-DD in the user's local time zone.
export function today() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export function formatDate(isoDate) {
  return new Date(isoDate + 'T00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatSet({ weight, reps }) {
  if (weight != null && reps != null) return `${weight}×${reps}`
  if (reps != null) return `${reps} reps`
  if (weight != null) return `${weight} ${WEIGHT_UNIT}`
  return '—'
}

export function workoutStats(workout) {
  let sets = 0
  let volume = 0
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      sets++
      volume += (set.weight ?? 0) * (set.reps ?? 0)
    }
  }
  return { exercises: workout.exercises.length, sets, volume }
}

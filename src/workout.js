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

// Values must match the check constraint on exercises.equipment.
export const EQUIPMENT = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'smith_machine', label: 'Smith machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band', label: 'Band' },
  { value: 'other', label: 'Other' },
]

export const GRIPS = ['Overhand', 'Underhand', 'Neutral', 'Wide', 'Close', 'Mixed']

export const DIFFICULTY = [
  { value: 1, label: 'Easy' },
  { value: 2, label: 'Moderate' },
  { value: 3, label: 'Hard' },
  { value: 4, label: 'Very hard' },
  { value: 5, label: 'Max' },
]

export function equipmentLabel(value) {
  return EQUIPMENT.find((e) => e.value === value)?.label ?? ''
}

export function difficultyLabel(value) {
  return DIFFICULTY.find((d) => d.value === value)?.label ?? ''
}

// ---------- Dates and times (all in the user's local time zone) ----------

function pad(n) {
  return String(n).padStart(2, '0')
}

function dateString(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Today's date as YYYY-MM-DD.
export function today() {
  return dateString(new Date())
}

// The local date (YYYY-MM-DD) of an ISO timestamp.
export function localDate(iso) {
  return dateString(new Date(iso))
}

// HH:MM (or HH:MM:SS) of an ISO timestamp, the format <input type="time"> uses; '' if none.
export function clockOf(iso, withSeconds = false) {
  if (!iso) return ''
  const d = new Date(iso)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return withSeconds ? `${time}:${pad(d.getSeconds())}` : time
}

const TWELVE_HOURS = 12 * 60 * 60 * 1000

// ISO timestamp for a time of day (HH:MM or HH:MM:SS) on a local date.
// Returns null for an empty time. When `notBefore` (a start time) is given and
// the result is more than 12 hours before it, it's moved to the next day, since
// that's an end past midnight (11:50 PM → 12:10 AM). A smaller gap is left
// alone so it can be flagged as a mistake.
export function withClock(time, date, notBefore = null) {
  if (!time) return null
  const d = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`)
  if (notBefore && Date.parse(notBefore) - d.getTime() > TWELVE_HOURS) d.setDate(d.getDate() + 1)
  return d.toISOString()
}

export function formatDate(isoDate) {
  return new Date(isoDate + 'T00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function secondsBetween(startIso, endIso) {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000))
}

// Stopwatch style: 0:42, 12:05, 1:02:05.
export function formatClock(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

// Seconds of rest before each set (null when either set wasn't timed).
export function restBeforeSets(sets) {
  return sets.map((set, i) => {
    const previous = sets[i - 1]
    return set.startedAt && previous?.endedAt ? secondsBetween(previous.endedAt, set.startedAt) : null
  })
}

export function formatDuration(startIso, endIso) {
  const minutes = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000)
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

// ---------- Summaries ----------

export function formatSet({ weight, reps, grip, startedAt, endedAt }) {
  let text = '—'
  if (weight != null && reps != null) text = `${weight}×${reps}`
  else if (reps != null) text = `${reps} reps`
  else if (weight != null) text = `${weight} ${WEIGHT_UNIT}`
  // Timed-only sets, like a plank.
  else if (startedAt && endedAt) text = formatClock(secondsBetween(startedAt, endedAt))
  return grip ? `${text} ${grip.toLowerCase()}` : text
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

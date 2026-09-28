import { clockOf, localDate, withClock } from '../workout.js'

// Editable start–end times for a workout, exercise or set. Times are stored
// as ISO timestamps; editing a time keeps its day, and an end earlier than
// the start is taken to be after midnight.
export default function TimeRange({ label, startedAt, endedAt, date, withSeconds, onChange }) {
  const startDay = startedAt ? localDate(startedAt) : date

  function changeStart(time) {
    onChange({ startedAt: withClock(time, startDay), endedAt })
  }

  function changeEnd(time) {
    onChange({ startedAt, endedAt: withClock(time, startDay, startedAt) })
  }

  return (
    <div className="time-range">
      <span className="time-range-label">{label}</span>
      <input
        type="time"
        step={withSeconds ? 1 : 60}
        aria-label={`${label} start time`}
        value={clockOf(startedAt, withSeconds)}
        onChange={(e) => changeStart(e.target.value)}
      />
      <span className="muted">–</span>
      <input
        type="time"
        step={withSeconds ? 1 : 60}
        aria-label={`${label} end time`}
        value={clockOf(endedAt, withSeconds)}
        onChange={(e) => changeEnd(e.target.value)}
      />
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import WorkoutForm from './WorkoutForm.jsx'
import WorkoutHistory from './WorkoutHistory.jsx'
import {
  clearDraft,
  countLocalWorkouts,
  deleteWorkout,
  importLocalWorkouts,
  listWorkouts,
  saveWorkout,
} from '../storage.js'
import { supabase } from '../supabase.js'

export default function Tracker({ user }) {
  const [tab, setTab] = useState('log')
  const [workouts, setWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState('')
  const [localCount, setLocalCount] = useState(countLocalWorkouts)

  function refresh() {
    return listWorkouts()
      .then((list) => {
        setWorkouts(list)
        setLoadError('')
      })
      .catch((err) => setLoadError(`Couldn't load workouts: ${err.message}`))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 2500)
    return () => clearTimeout(timer)
  }, [message])

  // Previously used exercise names, offered as suggestions while logging.
  const exerciseNames = useMemo(() => {
    const names = new Set()
    for (const w of workouts) for (const e of w.exercises) names.add(e.name)
    return [...names].sort()
  }, [workouts])

  // Errors propagate to WorkoutForm, which shows them and keeps the draft.
  async function handleSave(workout) {
    await saveWorkout(workout)
    await refresh()
    setMessage(editing ? 'Workout updated' : 'Workout saved')
    setEditing(null)
    setTab('history')
  }

  function handleEdit(workout) {
    setEditing(workout)
    setTab('log')
  }

  async function handleDelete(workout) {
    if (!confirm(`Delete ${workout.type} workout? This can't be undone.`)) return
    try {
      await deleteWorkout(workout.id)
      await refresh()
      setMessage('Workout deleted')
    } catch (err) {
      alert(`Couldn't delete: ${err.message}`)
    }
  }

  async function handleImport() {
    try {
      const count = await importLocalWorkouts()
      setLocalCount(0)
      await refresh()
      setMessage(`Imported ${count} workout${count === 1 ? '' : 's'}`)
    } catch (err) {
      alert(`Couldn't import: ${err.message}`)
    }
  }

  async function handleSignOut() {
    clearDraft()
    await supabase.auth.signOut()
  }

  function switchTab(next) {
    setEditing(null)
    setTab(next)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>GymApp</h1>
        <div className="account">
          <span className="muted small">{user.email}</span>
          <button type="button" className="link-button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {localCount > 0 && (
        <div className="card banner">
          <p>
            {localCount} workout{localCount === 1 ? ' is' : 's are'} saved only on this device.
            Add {localCount === 1 ? 'it' : 'them'} to your account?
          </p>
          <button type="button" className="primary" onClick={handleImport}>
            Import
          </button>
        </div>
      )}

      {loadError && <p className="error">{loadError}</p>}

      <main>
        {tab === 'log' ? (
          <WorkoutForm
            key={editing?.id ?? 'new'}
            initial={editing}
            exerciseNames={exerciseNames}
            onSave={handleSave}
            onCancel={() => switchTab('history')}
          />
        ) : loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <WorkoutHistory workouts={workouts} onEdit={handleEdit} onDelete={handleDelete} />
        )}
      </main>

      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}

      <nav className="tab-bar">
        <button
          type="button"
          className={tab === 'log' ? 'active' : ''}
          onClick={() => switchTab('log')}
        >
          Log
        </button>
        <button
          type="button"
          className={tab === 'history' ? 'active' : ''}
          onClick={() => switchTab('history')}
        >
          History{!loading && ` (${workouts.length})`}
        </button>
      </nav>
    </div>
  )
}

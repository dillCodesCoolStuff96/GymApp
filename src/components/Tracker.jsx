import { useEffect, useMemo, useState } from 'react'
import WorkoutForm from './WorkoutForm.jsx'
import WorkoutHistory from './WorkoutHistory.jsx'
import {
  clearDraft,
  deleteWorkout,
  listExercises,
  listWorkouts,
  saveWorkout,
} from '../storage.js'
import { supabase } from '../supabase.js'

export default function Tracker({ user }) {
  const [tab, setTab] = useState('log')
  const [workouts, setWorkouts] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState('')

  // Saving can create custom exercises, so the catalog is reloaded too.
  function refresh() {
    return Promise.all([listWorkouts(), listExercises()])
      .then(([workoutList, exerciseList]) => {
        setWorkouts(workoutList)
        setCatalog(exerciseList)
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

  // Previously used locations, offered as suggestions while logging.
  const locations = useMemo(
    () => [...new Set(workouts.map((w) => w.location).filter(Boolean))].sort(),
    [workouts],
  )

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

      {loadError && <p className="error">{loadError}</p>}

      <main>
        {tab === 'log' ? (
          <WorkoutForm
            key={editing?.id ?? 'new'}
            initial={editing}
            catalog={catalog}
            locations={locations}
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

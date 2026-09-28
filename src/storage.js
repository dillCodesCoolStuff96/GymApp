// All data access goes through this file. Workouts are stored in Supabase
// (see supabase/migrations); the in-progress draft stays on the device.

import { supabase } from './supabase.js'

// crypto.randomUUID only exists on https/localhost, so build a v4 UUID by hand
// when the dev server is opened from a phone over the local network (plain http).
export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// A workout with its exercises and sets, fetched in one request.
const WORKOUT_SELECT = `
  id, date, started_at, ended_at, type, location, notes, created_at, updated_at,
  workout_exercises (
    id, position, difficulty, notes, started_at, ended_at,
    exercise:exercises ( id, name, equipment, muscle_group ),
    sets ( id, position, weight, reps, grip, started_at, ended_at )
  )
`

const byPosition = (a, b) => a.position - b.position

function fromRow(row) {
  return {
    id: row.id,
    date: row.date,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    type: row.type,
    location: row.location,
    notes: row.notes,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    exercises: row.workout_exercises.sort(byPosition).map((we) => ({
      id: we.id,
      exerciseId: we.exercise.id,
      name: we.exercise.name,
      equipment: we.exercise.equipment,
      muscleGroup: we.exercise.muscle_group,
      difficulty: we.difficulty,
      notes: we.notes,
      startedAt: we.started_at,
      endedAt: we.ended_at,
      sets: we.sets.sort(byPosition).map((s) => ({
        id: s.id,
        weight: s.weight,
        reps: s.reps,
        grip: s.grip,
        startedAt: s.started_at,
        endedAt: s.ended_at,
      })),
    })),
  }
}

export async function listWorkouts() {
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_SELECT)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

// Built-in exercises plus the user's own custom ones.
export async function listExercises() {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, equipment, muscle_group')
    .order('name')
  if (error) throw error
  return data.map((e) => ({
    id: e.id,
    name: e.name,
    equipment: e.equipment,
    muscleGroup: e.muscle_group,
  }))
}

// Saves the whole workout in one transaction via the save_workout function.
// Exercises are matched by name + equipment; new names become custom exercises.
export async function saveWorkout(workout) {
  const { error } = await supabase.rpc('save_workout', {
    workout: {
      id: workout.id,
      date: workout.date,
      started_at: workout.startedAt,
      ended_at: workout.endedAt,
      type: workout.type,
      location: workout.location,
      notes: workout.notes,
      exercises: workout.exercises.map((e) => ({
        id: e.id,
        name: e.name,
        equipment: e.equipment,
        difficulty: e.difficulty,
        notes: e.notes,
        started_at: e.startedAt,
        ended_at: e.endedAt,
        sets: e.sets.map((s) => ({
          id: s.id,
          weight: s.weight,
          reps: s.reps,
          grip: s.grip,
          started_at: s.startedAt,
          ended_at: s.endedAt,
        })),
      })),
    },
  })
  if (error) throw error
  return workout
}

// Its exercises and sets are deleted along with it (on delete cascade).
export async function deleteWorkout(id) {
  const { error } = await supabase.from('workouts').delete().eq('id', id)
  if (error) throw error
}

// ---------- Device storage ----------

// An in-progress new workout is saved on every change, so closing the
// browser tab mid-session at the gym doesn't lose anything.
const DRAFT_KEY = 'gymapp.draft.v3'

export function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY))
  } catch {
    return null
  }
}

export function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // The draft is a convenience; ignore storage failures (e.g. private mode).
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

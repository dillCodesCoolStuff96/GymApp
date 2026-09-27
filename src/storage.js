// All data access goes through this file. Workouts are stored in Supabase;
// the in-progress draft stays on the device.

import { supabase } from './supabase.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

function fromRow(row) {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    difficulty: row.difficulty,
    notes: row.notes,
    exercises: row.exercises,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  }
}

function toRow(workout) {
  return {
    id: workout.id,
    date: workout.date,
    type: workout.type,
    difficulty: workout.difficulty,
    notes: workout.notes,
    exercises: workout.exercises,
    created_at: new Date(workout.createdAt).toISOString(),
    updated_at: new Date(workout.updatedAt).toISOString(),
  }
}

export async function listWorkouts() {
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function saveWorkout(workout) {
  const { error } = await supabase.from('workouts').upsert(toRow(workout))
  if (error) throw error
  return workout
}

export async function deleteWorkout(id) {
  const { error } = await supabase.from('workouts').delete().eq('id', id)
  if (error) throw error
}

// ---------- Device storage ----------

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}

function writeJson(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Device storage is a convenience; ignore failures (e.g. private mode).
  }
}

// An in-progress new workout is saved on every change, so closing the
// browser tab mid-session at the gym doesn't lose anything.
const DRAFT_KEY = 'gymapp.draft.v1'

export const loadDraft = () => readJson(DRAFT_KEY)
export const saveDraft = (draft) => writeJson(DRAFT_KEY, draft)
export const clearDraft = () => writeJson(DRAFT_KEY, null)

// Workouts logged on this device before accounts existed.
const LOCAL_WORKOUTS_KEY = 'gymapp.workouts.v1'

export function countLocalWorkouts() {
  return readJson(LOCAL_WORKOUTS_KEY)?.length ?? 0
}

export async function importLocalWorkouts() {
  const workouts = readJson(LOCAL_WORKOUTS_KEY) ?? []
  const rows = workouts.map((w) => toRow({ ...w, id: UUID_PATTERN.test(w.id) ? w.id : newId() }))
  const { error } = await supabase.from('workouts').upsert(rows)
  if (error) throw error
  writeJson(LOCAL_WORKOUTS_KEY, null)
  return rows.length
}

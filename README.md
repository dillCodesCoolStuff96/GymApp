# GymApp

A mobile-first workout tracker. Log the date, workout type, difficulty, exercises, sets, weight and reps, then review past workouts.

## Setup

1. Create a Supabase project and run each file in `supabase/migrations/`, in order, in its SQL Editor.
2. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key.
3. Run:

   ```sh
   npm install
   npm run dev
   ```

Open the "Local" URL on your computer, or the "Network" URL on a phone connected to the same Wi-Fi.

## Where data is stored

Workouts are stored in Supabase (Postgres) across four tables: `workouts` (one per session), `exercises` (built-in list plus each user's custom ones), `workout_exercises` (an exercise done in a workout, with difficulty and notes) and `sets` (weight, reps, grip). Workouts are saved through the `save_workout` database function so a workout is never half-saved. Row Level Security ensures each user can only access their own data. All data access goes through `src/storage.js`.

## Project layout

- `src/App.jsx` — shows sign-in or the tracker depending on the session
- `src/components/Auth.jsx` — sign in / create account
- `src/components/Tracker.jsx` — tabs (Log / History) and workout state
- `src/components/WorkoutForm.jsx` — logging and editing a workout
- `src/components/WorkoutHistory.jsx` — list of past workouts
- `src/workout.js` — constants (types, difficulty, units) and formatting helpers
- `src/storage.js` — saving and loading workouts
- `src/supabase.js` — Supabase client
- `supabase/migrations/` — database tables, security rules and the save function

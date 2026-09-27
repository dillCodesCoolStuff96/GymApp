# GymApp

A mobile-first workout tracker. Log the date, workout type, difficulty, exercises, sets, weight and reps, then review past workouts.

## Setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key.
3. Run:

   ```sh
   npm install
   npm run dev
   ```

Open the "Local" URL on your computer, or the "Network" URL on a phone connected to the same Wi-Fi.

## Where data is stored

Workouts are stored in Supabase (Postgres): one row per workout, with its exercises and sets in a JSON column. Row Level Security ensures each user can only access their own workouts. All data access goes through `src/storage.js`.

## Project layout

- `src/App.jsx` — shows sign-in or the tracker depending on the session
- `src/components/Auth.jsx` — sign in / create account
- `src/components/Tracker.jsx` — tabs (Log / History) and workout state
- `src/components/WorkoutForm.jsx` — logging and editing a workout
- `src/components/WorkoutHistory.jsx` — list of past workouts
- `src/workout.js` — constants (types, difficulty, units) and formatting helpers
- `src/storage.js` — saving and loading workouts
- `src/supabase.js` — Supabase client
- `supabase/schema.sql` — database table and security rules

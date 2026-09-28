-- Split workouts into separate tables:
--   workouts           one row per gym session
--   exercises          the exercise list (built-in rows have user_id = null)
--   workout_exercises  an exercise performed in a workout
--   sets               the sets of a workout_exercise
--
-- WARNING: this deletes all existing workouts.
-- Run the whole file once in the Supabase SQL Editor.

drop table if exists public.workouts cascade;

-- ---------- Tables ----------

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  type text not null default '',
  location text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

create index workouts_user_date_idx on public.workouts (user_id, date desc);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  -- null = built-in exercise everyone can use; otherwise a user's custom exercise.
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  equipment text not null default 'other' check (
    equipment in ('barbell', 'dumbbell', 'machine', 'smith_machine', 'cable',
                  'bodyweight', 'kettlebell', 'band', 'other')
  ),
  muscle_group text not null default '',
  created_at timestamptz not null default now()
);

-- One exercise per name + equipment for each owner (and for the built-ins).
create unique index exercises_owner_name_idx
  on public.exercises (user_id, lower(name), equipment) nulls not distinct;

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position smallint not null,
  difficulty smallint check (difficulty between 1 and 5),
  notes text not null default ''
);

create index workout_exercises_workout_idx on public.workout_exercises (workout_id);
create index workout_exercises_exercise_idx on public.workout_exercises (exercise_id);

create table public.sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  position smallint not null,
  weight numeric(6, 2) check (weight >= 0),
  reps smallint check (reps >= 0),
  grip text not null default ''
);

create index sets_workout_exercise_idx on public.sets (workout_exercise_id);

-- ---------- Row Level Security ----------
-- Users can only see and change their own rows. Built-in exercises are readable by everyone.

alter table public.workouts enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.sets enable row level security;

grant select, insert, update, delete on
  public.workouts, public.exercises, public.workout_exercises, public.sets
  to authenticated;

create policy "Users manage their own workouts"
  on public.workouts for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users see built-in and their own exercises"
  on public.exercises for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);

create policy "Users add their own exercises"
  on public.exercises for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users edit their own exercises"
  on public.exercises for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own exercises"
  on public.exercises for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users manage exercises in their own workouts"
  on public.workout_exercises for all to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_id and w.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_id and w.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.exercises e
      where e.id = exercise_id and (e.user_id is null or e.user_id = (select auth.uid()))
    )
  );

create policy "Users manage sets in their own workouts"
  on public.sets for all to authenticated
  using (
    exists (
      select 1 from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = workout_exercise_id and w.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = workout_exercise_id and w.user_id = (select auth.uid())
    )
  );

-- ---------- save_workout ----------
-- Creates or replaces a whole workout (with its exercises and sets) in one
-- transaction, so a dropped connection can never leave it half-saved.
-- Exercises are matched by name + equipment; unknown ones are created as the
-- user's custom exercises. Runs as the calling user, so RLS still applies.
--
-- Payload: { id, date, started_at, ended_at, type, location, notes,
--            exercises: [{ id, name, equipment, difficulty, notes,
--                          sets: [{ id, weight, reps, grip }] }] }

create or replace function public.save_workout(workout jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  workout_id uuid := (workout ->> 'id')::uuid;
  ex jsonb;
  ex_position int;
  ex_name text;
  ex_equipment text;
  exercise_id uuid;
  workout_exercise_id uuid;
begin
  insert into public.workouts (id, date, started_at, ended_at, type, location, notes)
  values (
    workout_id,
    (workout ->> 'date')::date,
    (workout ->> 'started_at')::timestamptz,
    (workout ->> 'ended_at')::timestamptz,
    coalesce(workout ->> 'type', ''),
    coalesce(workout ->> 'location', ''),
    coalesce(workout ->> 'notes', '')
  )
  on conflict (id) do update set
    date = excluded.date,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    type = excluded.type,
    location = excluded.location,
    notes = excluded.notes,
    updated_at = now();

  -- Replace the workout's exercises and sets (sets cascade).
  delete from public.workout_exercises we where we.workout_id = save_workout.workout_id;

  for ex, ex_position in
    select e.value, e.ordinality
    from jsonb_array_elements(workout -> 'exercises') with ordinality as e (value, ordinality)
  loop
    ex_name := trim(ex ->> 'name');
    ex_equipment := coalesce(nullif(ex ->> 'equipment', ''), 'other');

    -- Prefer a built-in exercise, then the user's own.
    select e.id into exercise_id
    from public.exercises e
    where lower(e.name) = lower(ex_name) and e.equipment = ex_equipment
    order by e.user_id nulls first
    limit 1;

    if exercise_id is null then
      insert into public.exercises (name, equipment)
      values (ex_name, ex_equipment)
      returning id into exercise_id;
    end if;

    insert into public.workout_exercises (id, workout_id, exercise_id, position, difficulty, notes)
    values (
      coalesce((ex ->> 'id')::uuid, gen_random_uuid()),
      save_workout.workout_id,
      exercise_id,
      ex_position,
      (ex ->> 'difficulty')::smallint,
      coalesce(ex ->> 'notes', '')
    )
    returning id into workout_exercise_id;

    insert into public.sets (id, workout_exercise_id, position, weight, reps, grip)
    select
      coalesce((s.value ->> 'id')::uuid, gen_random_uuid()),
      workout_exercise_id,
      s.ordinality,
      (s.value ->> 'weight')::numeric,
      (s.value ->> 'reps')::smallint,
      coalesce(s.value ->> 'grip', '')
    from jsonb_array_elements(coalesce(ex -> 'sets', '[]'::jsonb)) with ordinality as s (value, ordinality);
  end loop;

  return workout_id;
end;
$$;

revoke execute on function public.save_workout (jsonb) from public, anon;
grant execute on function public.save_workout (jsonb) to authenticated;

-- ---------- Built-in exercises ----------

insert into public.exercises (user_id, name, equipment, muscle_group) values
  (null, 'Bench Press', 'barbell', 'Chest'),
  (null, 'Incline Bench Press', 'barbell', 'Chest'),
  (null, 'Back Squat', 'barbell', 'Quads'),
  (null, 'Front Squat', 'barbell', 'Quads'),
  (null, 'Deadlift', 'barbell', 'Back'),
  (null, 'Romanian Deadlift', 'barbell', 'Hamstrings'),
  (null, 'Overhead Press', 'barbell', 'Shoulders'),
  (null, 'Barbell Row', 'barbell', 'Back'),
  (null, 'Barbell Curl', 'barbell', 'Biceps'),
  (null, 'Hip Thrust', 'barbell', 'Glutes'),
  (null, 'Dumbbell Bench Press', 'dumbbell', 'Chest'),
  (null, 'Incline Dumbbell Press', 'dumbbell', 'Chest'),
  (null, 'Dumbbell Fly', 'dumbbell', 'Chest'),
  (null, 'Dumbbell Shoulder Press', 'dumbbell', 'Shoulders'),
  (null, 'Lateral Raise', 'dumbbell', 'Shoulders'),
  (null, 'Dumbbell Row', 'dumbbell', 'Back'),
  (null, 'Dumbbell Curl', 'dumbbell', 'Biceps'),
  (null, 'Hammer Curl', 'dumbbell', 'Biceps'),
  (null, 'Overhead Tricep Extension', 'dumbbell', 'Triceps'),
  (null, 'Goblet Squat', 'dumbbell', 'Quads'),
  (null, 'Dumbbell Lunge', 'dumbbell', 'Quads'),
  (null, 'Bulgarian Split Squat', 'dumbbell', 'Quads'),
  (null, 'Leg Press', 'machine', 'Quads'),
  (null, 'Hack Squat', 'machine', 'Quads'),
  (null, 'Leg Extension', 'machine', 'Quads'),
  (null, 'Leg Curl', 'machine', 'Hamstrings'),
  (null, 'Chest Press', 'machine', 'Chest'),
  (null, 'Pec Deck', 'machine', 'Chest'),
  (null, 'Calf Raise', 'machine', 'Calves'),
  (null, 'Smith Machine Squat', 'smith_machine', 'Quads'),
  (null, 'Smith Machine Bench Press', 'smith_machine', 'Chest'),
  (null, 'Lat Pulldown', 'cable', 'Back'),
  (null, 'Seated Cable Row', 'cable', 'Back'),
  (null, 'Tricep Pushdown', 'cable', 'Triceps'),
  (null, 'Cable Fly', 'cable', 'Chest'),
  (null, 'Face Pull', 'cable', 'Shoulders'),
  (null, 'Cable Curl', 'cable', 'Biceps'),
  (null, 'Push-up', 'bodyweight', 'Chest'),
  (null, 'Pull-up', 'bodyweight', 'Back'),
  (null, 'Chin-up', 'bodyweight', 'Back'),
  (null, 'Dip', 'bodyweight', 'Triceps'),
  (null, 'Plank', 'bodyweight', 'Core'),
  (null, 'Hanging Leg Raise', 'bodyweight', 'Core'),
  (null, 'Crunch', 'bodyweight', 'Core'),
  (null, 'Kettlebell Swing', 'kettlebell', 'Glutes');

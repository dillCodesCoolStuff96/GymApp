-- Fix save_workout: 002 qualified a local variable as save_workout.workout_id,
-- which PL/pgSQL only allows for parameters, so every save failed with
-- 'missing FROM-clause entry for table "save_workout"'. Local variables now
-- use a v_ prefix so they can never be confused with column names.
-- Run this once in the Supabase SQL Editor.

create or replace function public.save_workout(workout jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_workout_id uuid := (workout ->> 'id')::uuid;
  v_exercise jsonb;
  v_position int;
  v_name text;
  v_equipment text;
  v_exercise_id uuid;
  v_workout_exercise_id uuid;
begin
  insert into public.workouts (id, date, started_at, ended_at, type, location, notes)
  values (
    v_workout_id,
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
  delete from public.workout_exercises we where we.workout_id = v_workout_id;

  for v_exercise, v_position in
    select e.value, e.ordinality
    from jsonb_array_elements(workout -> 'exercises') with ordinality as e (value, ordinality)
  loop
    v_name := trim(v_exercise ->> 'name');
    v_equipment := coalesce(nullif(v_exercise ->> 'equipment', ''), 'other');

    -- Prefer a built-in exercise, then the user's own.
    select e.id into v_exercise_id
    from public.exercises e
    where lower(e.name) = lower(v_name) and e.equipment = v_equipment
    order by e.user_id nulls first
    limit 1;

    if v_exercise_id is null then
      insert into public.exercises (name, equipment)
      values (v_name, v_equipment)
      returning id into v_exercise_id;
    end if;

    insert into public.workout_exercises (id, workout_id, exercise_id, position, difficulty, notes)
    values (
      coalesce((v_exercise ->> 'id')::uuid, gen_random_uuid()),
      v_workout_id,
      v_exercise_id,
      v_position,
      (v_exercise ->> 'difficulty')::smallint,
      coalesce(v_exercise ->> 'notes', '')
    )
    returning id into v_workout_exercise_id;

    insert into public.sets (id, workout_exercise_id, position, weight, reps, grip)
    select
      coalesce((s.value ->> 'id')::uuid, gen_random_uuid()),
      v_workout_exercise_id,
      s.ordinality,
      (s.value ->> 'weight')::numeric,
      (s.value ->> 'reps')::smallint,
      coalesce(s.value ->> 'grip', '')
    from jsonb_array_elements(coalesce(v_exercise -> 'sets', '[]'::jsonb)) with ordinality as s (value, ordinality);
  end loop;

  return v_workout_id;
end;
$$;

revoke execute on function public.save_workout (jsonb) from public, anon;
grant execute on function public.save_workout (jsonb) to authenticated;

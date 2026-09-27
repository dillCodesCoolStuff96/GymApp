-- GymApp database schema. Run this once in the Supabase SQL Editor.

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  type text not null,
  difficulty smallint not null check (difficulty between 1 and 5),
  notes text not null default '',
  -- [{ id, name, sets: [{ id, weight, reps }] }]
  exercises jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workouts_user_date_idx on public.workouts (user_id, date desc);

-- Row Level Security: each signed-in user can only see and change their own workouts.
alter table public.workouts enable row level security;

create policy "Users manage their own workouts"
  on public.workouts
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

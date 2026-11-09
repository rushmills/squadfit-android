-- ============================================================
-- SquadFit database setup
-- Paste this whole file into Supabase > SQL Editor > New query > Run
-- ============================================================

-- ---------- Group settings (max members) ----------
create table if not exists app_settings (
  id int primary key default 1 check (id = 1),
  max_members int not null default 4
);
insert into app_settings (id, max_members) values (1, 4)
on conflict (id) do nothing;
alter table app_settings enable row level security;

-- ---------- Public profiles (everyone in the group can see) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,        -- login key, made from the name
  display_name text not null,
  color text default '#ff2fa6',
  dash_image text,                      -- chosen dashboard picture id
  created_at timestamptz default now()
);

-- ---------- PRIVATE stats (only the owner can ever read these) ----------
create table if not exists private_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  height_in numeric,
  weight_lb numeric,
  age int,
  gender text,
  start_weight_lb numeric,
  goal_weight_lb numeric,
  goal_months int,                       -- how long they want to take to reach the goal
  updated_at timestamptz default now()
);

-- ---------- Walks / runs ----------
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text not null default 'walk',     -- walk | run
  source text not null default 'manual', -- manual | live
  steps int,
  distance_mi numeric,
  duration_min numeric,
  calories int,
  created_at timestamptz default now()
);

-- ---------- Workouts ----------
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  category text not null,
  exercise text not null,
  weight numeric,
  weight_unit text default 'lb',
  sets int,
  reps int,
  duration_min numeric,
  notes text,
  calories int,
  created_at timestamptz default now()
);

-- ---------- Food diary ----------
create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  meal_type text not null,
  description text not null,
  calories int,
  photo_path text,
  created_at timestamptz default now()
);

create table if not exists water (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  glasses int not null default 0,
  primary key (user_id, day)
);

-- ---------- Safe to re-run: add newer columns if the tables already existed ----------
alter table profiles add column if not exists dash_image text;
alter table private_stats add column if not exists goal_months int;

-- No two people can have the same display name (case-insensitive)
create unique index if not exists profiles_display_name_unique on profiles (lower(display_name));

-- ---------- Helper: is the current user in the group? ----------
create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

-- ---------- Join the group (checks member limit + unique name) ----------
create or replace function join_group(p_username text, p_display_name text, p_color text)
returns void language plpgsql security definer set search_path = public as $$
declare s app_settings;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into s from app_settings where id = 1;
  if exists (select 1 from profiles where id = auth.uid()) then return; end if;
  if (select count(*) from profiles) >= s.max_members then raise exception 'The squad is full'; end if;
  if exists (select 1 from profiles where username = lower(p_username)) then raise exception 'That name is already registered.'; end if;
  insert into profiles (id, username, display_name, color)
  values (auth.uid(), lower(p_username), p_display_name, coalesce(p_color, '#ff5a36'));
end $$;



-- ---------- Names for the login screen (name + color only, nothing else) ----------
create or replace function public_members()
returns table (username text, display_name text, color text)
language sql stable security definer set search_path = public as $$
  select username, display_name, color from profiles order by created_at;
$$;
grant execute on function public_members() to anon, authenticated;

-- ---------- Goal progress % (shares ONLY the percentage) ----------
create or replace function goal_progress()
returns table (user_id uuid, percent int)
language sql stable security definer set search_path = public as $$
  select ps.user_id,
    greatest(0, least(100, round(
      (ps.start_weight_lb - ps.weight_lb) / nullif(ps.start_weight_lb - ps.goal_weight_lb, 0) * 100
    )))::int
  from private_stats ps
  where is_member()
    and ps.goal_weight_lb is not null and ps.start_weight_lb is not null and ps.weight_lb is not null
    and ps.start_weight_lb > ps.goal_weight_lb;
$$;

-- ---------- Row level security ----------
alter table profiles enable row level security;
alter table private_stats enable row level security;
alter table activities enable row level security;
alter table workouts enable row level security;
alter table meals enable row level security;
alter table water enable row level security;

-- profiles: members read all, owner edits own
drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select using (is_member());
drop policy if exists "edit own profile" on profiles;
create policy "edit own profile" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- Members may only change their display name, color and picture choice (not their login username)
revoke update on profiles from anon, authenticated;
grant update (display_name, color, dash_image) on profiles to authenticated;

-- private_stats: OWNER ONLY for everything
drop policy if exists "own stats" on private_stats;
create policy "own stats" on private_stats for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- shared logs: members read, owner writes
do $$
declare t text;
begin
  foreach t in array array['activities','workouts','meals','water'] loop
    execute format('drop policy if exists "read %1$s" on %1$s', t);
    execute format('create policy "read %1$s" on %1$s for select using (is_member())', t);
    execute format('drop policy if exists "write own %1$s" on %1$s', t);
    execute format('create policy "write own %1$s" on %1$s for all using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member())', t);
  end loop;
end $$;

-- ---------- Meal photo storage ----------
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

drop policy if exists "members view meal photos" on storage.objects;
create policy "members view meal photos" on storage.objects for select
  using (bucket_id = 'meal-photos' and is_member());
drop policy if exists "owner uploads meal photos" on storage.objects;
create policy "owner uploads meal photos" on storage.objects for insert
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "owner deletes meal photos" on storage.objects;
create policy "owner deletes meal photos" on storage.objects for delete
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Step-counter test recordings (owner can add; only the database admin can read) ----------
create table if not exists motion_logs (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  data jsonb,
  created_at timestamptz default now()
);
alter table motion_logs enable row level security;
drop policy if exists "add own motion log" on motion_logs;
create policy "add own motion log" on motion_logs for insert with check (user_id = auth.uid());

-- ---------- Profile pictures + admin PIN reset ----------

-- 1. Profile pictures people upload themselves
alter table profiles add column if not exists avatar_url text;
revoke update on profiles from anon, authenticated;
grant update (display_name, color, dash_image, avatar_url) on profiles to authenticated;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
drop policy if exists "owner uploads avatar" on storage.objects;
create policy "owner uploads avatar" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "owner deletes avatar" on storage.objects;
create policy "owner deletes avatar" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Login screen tiles also show uploaded pictures
drop function if exists public_members();
create function public_members()
returns table (username text, display_name text, color text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select username, display_name, color, avatar_url from profiles order by created_at;
$$;
grant execute on function public_members() to anon, authenticated;

-- 2. Squad admin (Rush) can set a temporary PIN for someone who forgot theirs
alter table profiles add column if not exists is_admin boolean not null default false;
update profiles set is_admin = true where username = 'rush';

create or replace function admin_reset_pin(p_username text, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then raise exception 'Only the squad admin can reset PINs'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 numbers'; end if;
  update auth.users set encrypted_password = extensions.crypt('sf-' || p_pin || '-squad', extensions.gen_salt('bf')), updated_at = now()
   where email = lower(p_username) || '@squadfit.app';
  if not found then raise exception 'No account for that name'; end if;
end $$;
revoke execute on function admin_reset_pin(text, text) from public, anon;
grant execute on function admin_reset_pin(text, text) to authenticated;

-- Done!

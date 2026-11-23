-- ============================================================
-- SquadFit update 3: two squads (Side A and Side B)
-- Paste this whole file into Supabase > SQL Editor > New query > Run
-- Safe to run more than once.
--
-- * Everyone already registered goes into Squad A. Rush is in both.
-- * People only see people who share a squad with them
--   (profiles, walks, workouts, food, water, meal photos, goal %).
-- * The login screen only lists a squad's people when the phone
--   has that squad's invite code.
-- ============================================================

-- ---------- Squads ----------
create table if not exists squads (
  id text primary key,
  name text not null,
  code text unique not null,            -- invite code (in the sign-up link)
  max_members int not null default 4,
  created_at timestamptz default now()
);
insert into squads (id, name, code, max_members) values
  ('a', 'Squad A', 'pink' || lpad((floor(random() * 9000) + 1000)::text, 4, '0'), 4),
  ('b', 'Squad B', 'glow' || lpad((floor(random() * 9000) + 1000)::text, 4, '0'), 4)
on conflict (id) do nothing;

create table if not exists squad_members (
  squad_id text not null references squads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (squad_id, user_id)
);

-- Everyone already registered is in Squad A; Rush is in Squad B too
insert into squad_members (squad_id, user_id) select 'a', id from profiles on conflict do nothing;
insert into squad_members (squad_id, user_id) select 'b', id from profiles where username = 'rush' on conflict do nothing;

-- ---------- Helpers ----------
-- Does the signed-in person share a squad with this person? (yourself counts)
create or replace function shares_squad(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid() or exists (
    select 1 from squad_members a join squad_members b on a.squad_id = b.squad_id
    where a.user_id = auth.uid() and b.user_id = other);
$$;
create or replace function in_squad(sq text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from squad_members where squad_id = sq and user_id = auth.uid());
$$;

-- ---------- Who can see what ----------
alter table squads enable row level security;
alter table squad_members enable row level security;
revoke all on squads from anon, authenticated;
grant select (id, name, max_members) on squads to authenticated;   -- invite codes only via my_squads()
drop policy if exists "see my squads" on squads;
create policy "see my squads" on squads for select using (in_squad(id));
drop policy if exists "see my squad members" on squad_members;
create policy "see my squad members" on squad_members for select using (in_squad(squad_id));

drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select using (shares_squad(id));

do $$
declare t text;
begin
  foreach t in array array['activities','workouts','meals','water'] loop
    execute format('drop policy if exists "read %1$s" on %1$s', t);
    execute format('create policy "read %1$s" on %1$s for select using (shares_squad(user_id))', t);
  end loop;
end $$;

drop policy if exists "members view meal photos" on storage.objects;
create policy "members view meal photos" on storage.objects for select
  using (bucket_id = 'meal-photos' and shares_squad(((storage.foldername(name))[1])::uuid));

create or replace function goal_progress()
returns table (user_id uuid, percent int)
language sql stable security definer set search_path = public as $$
  select ps.user_id,
    greatest(0, least(100, round(
      (ps.start_weight_lb - ps.weight_lb) / nullif(ps.start_weight_lb - ps.goal_weight_lb, 0) * 100
    )))::int
  from private_stats ps
  where shares_squad(ps.user_id)
    and ps.goal_weight_lb is not null and ps.start_weight_lb is not null and ps.weight_lb is not null
    and ps.start_weight_lb > ps.goal_weight_lb;
$$;

-- ---------- My squads (with invite codes, for the admin's invite screen) ----------
create or replace function my_squads()
returns table (id text, name text, code text, max_members int)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.code, s.max_members
  from squads s where in_squad(s.id) order by s.id;
$$;
grant execute on function my_squads() to authenticated;

-- Squad code -> squad name (so a phone can remember which squad it belongs to)
create or replace function squad_by_code(p_code text)
returns table (id text, name text)
language sql stable security definer set search_path = public as $$
  select id, name from squads where code = lower(trim(p_code));
$$;
grant execute on function squad_by_code(text) to anon, authenticated;

-- Login screen tiles: only that squad's people, and only with its code
drop function if exists public_members();
drop function if exists public_members(text);
create function public_members(p_code text default null)
returns table (username text, display_name text, color text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.username, p.display_name, p.color, p.avatar_url
  from profiles p join squad_members m on m.user_id = p.id join squads s on s.id = m.squad_id
  where p_code is not null and s.code = lower(trim(p_code))
  order by p.created_at;
$$;
grant execute on function public_members(text) to anon, authenticated;

-- Joining: into the squad the invite code belongs to
drop function if exists join_group(text, text, text);
create or replace function join_group(p_username text, p_display_name text, p_color text, p_code text default null)
returns void language plpgsql security definer set search_path = public as $$
declare sq squads;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into sq from squads where code = lower(trim(coalesce(p_code, '')));
  if sq.id is null then raise exception 'That squad link or code is not valid. Ask Rush for a new one.'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    insert into squad_members (squad_id, user_id) values (sq.id, auth.uid()) on conflict do nothing;
    return;
  end if;
  if (select count(*) from squad_members where squad_id = sq.id) >= sq.max_members then raise exception 'That squad is full'; end if;
  if exists (select 1 from profiles where username = lower(p_username)) then raise exception 'That name is already registered.'; end if;
  insert into profiles (id, username, display_name, color)
  values (auth.uid(), lower(p_username), p_display_name, coalesce(p_color, '#ff5a36'));
  insert into squad_members (squad_id, user_id) values (sq.id, auth.uid());
end $$;
grant execute on function join_group(text, text, text, text) to authenticated;

-- Admin renames a squad
create or replace function rename_squad(p_id text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then raise exception 'Only the admin can rename squads'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Name is too short'; end if;
  update squads set name = left(trim(p_name), 30) where id = p_id;
end $$;
revoke execute on function rename_squad(text, text) from public, anon;
grant execute on function rename_squad(text, text) to authenticated;

-- Show the invite codes (copy them for the app's Me > Squads screen if needed)
select id, name, code from squads order by id;

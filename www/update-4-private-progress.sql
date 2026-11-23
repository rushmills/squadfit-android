-- ============================================================
-- SquadFit update 4: private progress
-- Paste this whole file into Supabase > SQL Editor > New query > Run
-- (Run update-3-two-squads.sql first if you haven't.) Safe to run more than once.
--
-- A member with private progress (Rush, to start) still shows in the squad,
-- but nobody else can read her walks, steps, workouts, food, water, meal photos
-- or goal %. The leaderboard only learns her POSITION (e.g. "1st"), never her numbers.
-- ============================================================

alter table profiles add column if not exists private_progress boolean not null default false;
update profiles set private_progress = true where username = 'rush';
grant update (private_progress) on profiles to authenticated;   -- each person can switch their own on/off

create or replace function is_private(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select private_progress from profiles where id = u), false);
$$;

-- You can see someone's progress if it's you, or they're in your squad and not private
create or replace function can_see_progress(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select u = auth.uid() or (shares_squad(u) and not is_private(u));
$$;

do $$
declare t text;
begin
  foreach t in array array['activities','workouts','meals','water'] loop
    execute format('drop policy if exists "read %1$s" on %1$s', t);
    execute format('create policy "read %1$s" on %1$s for select using (can_see_progress(user_id))', t);
  end loop;
end $$;

drop policy if exists "members view meal photos" on storage.objects;
create policy "members view meal photos" on storage.objects for select
  using (bucket_id = 'meal-photos' and can_see_progress(((storage.foldername(name))[1])::uuid));

create or replace function goal_progress()
returns table (user_id uuid, percent int)
language sql stable security definer set search_path = public as $$
  select ps.user_id,
    greatest(0, least(100, round(
      (ps.start_weight_lb - ps.weight_lb) / nullif(ps.start_weight_lb - ps.goal_weight_lb, 0) * 100
    )))::int
  from private_stats ps
  where can_see_progress(ps.user_id)
    and ps.goal_weight_lb is not null and ps.start_weight_lb is not null and ps.weight_lb is not null
    and ps.start_weight_lb > ps.goal_weight_lb;
$$;

-- Where private members stand in each of my squads: position only, no step numbers.
-- p_today is the phone's "today" (so it matches the app's days).
drop function if exists private_ranks(date);
create function private_ranks(p_today date)
returns table (user_id uuid, squad_id text, today_rank int, week_rank int, moved_today boolean, moved_week boolean)
language sql stable security definer set search_path = public as $$
  with mem as (
    select m.squad_id, m.user_id from squad_members m
    where m.squad_id in (select squad_id from squad_members where user_id = auth.uid())
  ),
  daily as (   -- same rule as the app: phone total or app total, whichever is bigger (never both)
    select a.user_id, a.day,
      greatest(coalesce(sum(a.steps) filter (where a.source = 'phone'), 0),
               coalesce(sum(a.steps) filter (where a.source is distinct from 'phone'), 0)) as steps
    from activities a
    where a.day between p_today - 6 and p_today and a.user_id in (select user_id from mem)
    group by a.user_id, a.day
  ),
  tot as (
    select mem.squad_id, mem.user_id,
      coalesce(sum(d.steps) filter (where d.day = p_today), 0) as td,
      coalesce(sum(d.steps), 0) as wk
    from mem left join daily d on d.user_id = mem.user_id
    group by mem.squad_id, mem.user_id
  )
  select t.user_id, t.squad_id,
    (1 + (select count(*) from tot o where o.squad_id = t.squad_id and o.td > t.td))::int,
    (1 + (select count(*) from tot o where o.squad_id = t.squad_id and o.wk > t.wk))::int,
    t.td > 0, t.wk > 0
  from tot t join profiles p on p.id = t.user_id
  where p.private_progress and t.user_id <> auth.uid() and auth.uid() is not null;
$$;
revoke execute on function private_ranks(date) from public, anon;
grant execute on function private_ranks(date) to authenticated;

select username, private_progress from profiles order by created_at;

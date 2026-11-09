-- SquadFit update: profile pictures + squad admin PIN reset
-- Paste into Supabase > SQL Editor > New query > Run

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

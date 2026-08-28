-- GG.Chat secure admin extension
-- Run this in Supabase SQL Editor AFTER supabase-schema.sql.
-- Safe to rerun. No plaintext admin password is stored.

create extension if not exists pgcrypto;
create schema if not exists private;

alter table public.profiles add column if not exists followers_override integer check (followers_override is null or followers_override >= 0);
alter table public.profiles add column if not exists following_override integer check (following_override is null or following_override >= 0);
alter table public.profiles add column if not exists likes_override integer check (likes_override is null or likes_override >= 0);
alter table public.profiles add column if not exists is_suspended boolean not null default false;
alter table public.profiles add column if not exists suspension_reason text;

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_-]{2,40}$'),
  label text not null,
  icon text not null default 'badge-check',
  color text not null default '#7c5cff',
  description text not null default '',
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  primary key (user_id,badge_id)
);

create table if not exists private.admin_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists private.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked boolean not null default false
);

create index if not exists idx_admin_sessions_user on private.admin_sessions(user_id,expires_at desc);
create index if not exists idx_user_badges_user on public.user_badges(user_id);

insert into public.badges(slug,label,icon,color,description,priority) values
('official','Official','badge-check','#1d9bf0','Officieel GG.Chat-account',10),
('admin','Admin','shield-check','#ef4444','Platformbeheerder',5),
('staff','Staff','shield','#f97316','GG.Chat-medewerker',8),
('moderator','Moderator','gavel','#f59e0b','Communitymoderator',12),
('developer','Developer','code-2','#22c55e','Developer van GG.Chat',15),
('creator','Creator','sparkles','#8b5cf6','Erkende creator',20),
('partner','Partner','handshake','#06b6d4','Officiële partner',25),
('verified-org','Verified Org','building-2','#0ea5e9','Geverifieerde organisatie',30),
('premium','Premium','gem','#a855f7','Premium-lid',40),
('og','OG','crown','#eab308','Vroege GG.Chat-gebruiker',45),
('early','Early Adopter','rocket','#14b8a6','Early adopter',50),
('supporter','Supporter','heart','#ec4899','Supporter van GG.Chat',55),
('gamer','Gamer','gamepad-2','#84cc16','Gaming-badge',70),
('artist','Artist','palette','#f43f5e','Creatieve maker',70),
('music','Music','music-2','#c084fc','Muziekmaker',70),
('news','News','newspaper','#38bdf8','Nieuwsaccount',70),
('education','Education','graduation-cap','#60a5fa','Onderwijsaccount',70),
('community','Community','users','#34d399','Community-bijdrager',70)
on conflict (slug) do update set label=excluded.label,icon=excluded.icon,color=excluded.color,description=excluded.description,priority=excluded.priority;

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

drop policy if exists "badges public read" on public.badges;
create policy "badges public read" on public.badges for select using (active=true);

drop policy if exists "user badges public read" on public.user_badges;
create policy "user badges public read" on public.user_badges for select using (true);

grant select on public.badges,public.user_badges to anon,authenticated;
revoke all on schema private from anon,authenticated;
revoke all on all tables in schema private from anon,authenticated;

create or replace function private.is_role_admin(uid uuid)
returns boolean language sql stable security definer set search_path=public,private as $$
  select exists(select 1 from public.profiles p where p.id=uid and p.role='admin' and p.is_suspended=false);
$$;

create or replace function private.valid_admin_token(raw_token text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,private as $$
  select uid is not null
     and private.is_role_admin(uid)
     and exists(
       select 1 from private.admin_sessions s
       where s.user_id=uid
         and s.token_hash=encode(digest(coalesce(raw_token,''),'sha256'),'hex')
         and s.revoked=false
         and s.expires_at>now()
     );
$$;

-- Call ONLY from SQL Editor as project owner to select the one admin and set the second password.
create or replace function public.bootstrap_admin(p_username text,p_password text)
returns text language plpgsql security definer set search_path=public,private as $$
declare uid uuid;
begin
  if p_password is null or char_length(p_password)<10 then raise exception 'Admin password must be at least 10 characters'; end if;
  select id into uid from public.profiles where username=lower(trim(p_username));
  if uid is null then raise exception 'Profile not found'; end if;
  update public.profiles set role='admin',verified=true where id=uid;
  insert into private.admin_credentials(user_id,password_hash,updated_at)
  values(uid,crypt(p_password,gen_salt('bf',12)),now())
  on conflict(user_id) do update set password_hash=excluded.password_hash,updated_at=now();
  return 'Admin enabled for @'||lower(trim(p_username));
end;$$;
revoke all on function public.bootstrap_admin(text,text) from public,anon,authenticated;

create or replace function public.admin_login(p_password text)
returns text language plpgsql security definer set search_path=public,private as $$
declare stored text; raw_token text;
begin
  if not private.is_role_admin(auth.uid()) then raise exception 'Not authorized'; end if;
  select password_hash into stored from private.admin_credentials where user_id=auth.uid();
  if stored is null or crypt(coalesce(p_password,''),stored)<>stored then
    perform pg_sleep(0.35);
    raise exception 'Invalid admin password';
  end if;
  update private.admin_sessions set revoked=true where user_id=auth.uid() and expires_at>now();
  raw_token:=encode(gen_random_bytes(32),'hex');
  insert into private.admin_sessions(user_id,token_hash,expires_at)
  values(auth.uid(),encode(digest(raw_token,'sha256'),'hex'),now()+interval '45 minutes');
  return raw_token;
end;$$;
grant execute on function public.admin_login(text) to authenticated;

create or replace function public.admin_logout(p_token text)
returns void language sql security definer set search_path=public,private as $$
  update private.admin_sessions set revoked=true
  where user_id=auth.uid() and token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex');
$$;
grant execute on function public.admin_logout(text) to authenticated;

create or replace function public.admin_dashboard_stats(p_token text)
returns jsonb language plpgsql security definer set search_path=public,private as $$
begin
  if not private.valid_admin_token(p_token) then raise exception 'Admin session expired'; end if;
  return jsonb_build_object(
    'users',(select count(*) from public.profiles),
    'posts',(select count(*) from public.posts),
    'likes',(select count(*) from public.likes),
    'comments',(select count(*) from public.comments),
    'follows',(select count(*) from public.follows),
    'messages',(select count(*) from public.messages),
    'suspended',(select count(*) from public.profiles where is_suspended),
    'verified',(select count(*) from public.profiles where verified)
  );
end;$$;
grant execute on function public.admin_dashboard_stats(text) to authenticated;

create or replace function public.admin_list_users(p_token text,p_search text default '',p_limit integer default 100)
returns table(id uuid,username text,display_name text,avatar_url text,verified boolean,role text,is_private boolean,allow_dms boolean,is_suspended boolean,suspension_reason text,followers_override integer,following_override integer,likes_override integer,created_at timestamptz)
language plpgsql security definer set search_path=public,private as $$
begin
  if not private.valid_admin_token(p_token) then raise exception 'Admin session expired'; end if;
  return query select p.id,p.username,p.display_name,p.avatar_url,p.verified,p.role,p.is_private,p.allow_dms,p.is_suspended,p.suspension_reason,p.followers_override,p.following_override,p.likes_override,p.created_at
  from public.profiles p
  where trim(coalesce(p_search,''))='' or p.username ilike '%'||p_search||'%' or p.display_name ilike '%'||p_search||'%'
  order by p.created_at desc limit greatest(1,least(coalesce(p_limit,100),250));
end;$$;
grant execute on function public.admin_list_users(text,text,integer) to authenticated;

create or replace function public.admin_update_user(
  p_token text,p_user uuid,p_verified boolean default null,p_role text default null,p_suspended boolean default null,p_reason text default null,p_private boolean default null,p_allow_dms boolean default null
) returns void language plpgsql security definer set search_path=public,private as $$
begin
  if not private.valid_admin_token(p_token) then raise exception 'Admin session expired'; end if;
  if p_role is not null and p_role not in ('user','creator','moderator','admin') then raise exception 'Invalid role'; end if;
  if p_user=auth.uid() and p_role is not null and p_role<>'admin' then raise exception 'Cannot remove your own admin role here'; end if;
  update public.profiles set
    verified=coalesce(p_verified,verified),
    role=coalesce(p_role,role),
    is_suspended=coalesce(p_suspended,is_suspended),
    suspension_reason=case when p_suspended=false then null when p_reason is not null then nullif(trim(p_reason),'') else suspension_reason end,
    is_private=coalesce(p_private,is_private),
    allow_dms=coalesce(p_allow_dms,allow_dms),
    updated_at=now()
  where id=p_user;
end;$$;
grant execute on function public.admin_update_user(text,uuid,boolean,text,boolean,text,boolean,boolean) to authenticated;

create or replace function public.admin_set_stat_overrides(p_token text,p_user uuid,p_followers integer,p_following integer,p_likes integer)
returns void language plpgsql security definer set search_path=public,private as $$
begin
  if not private.valid_admin_token(p_token) then raise exception 'Admin session expired'; end if;
  if p_followers is not null and p_followers<0 or p_following is not null and p_following<0 or p_likes is not null and p_likes<0 then raise exception 'Stats cannot be negative'; end if;
  update public.profiles set followers_override=p_followers,following_override=p_following,likes_override=p_likes,updated_at=now() where id=p_user;
end;$$;
grant execute on function public.admin_set_stat_overrides(text,uuid,integer,integer,integer) to authenticated;

create or replace function public.admin_assign_badge(p_token text,p_user uuid,p_badge_slug text)
returns void language plpgsql security definer set search_path=public,private as $$
declare bid uuid;
begin
  if not private.valid_admin_token(p_token) then raise exception 'Admin session expired'; end if;
  select id into bid from public.badges where slug=p_badge_slug and active=true;
  if bid is null then raise exception 'Badge not found'; end if;
  insert into public.user_badges(user_id,badge_id,assigned_by) values(p_user,bid,auth.uid()) on conflict do nothing;
end;$$;
grant execute on function public.admin_assign_badge(text,uuid,text) to authenticated;

create or replace function public.admin_remove_badge(p_token text,p_user uuid,p_badge_slug text)
returns void language plpgsql security definer set search_path=public,private as $$
begin
  if not private.valid_admin_token(p_token) then raise exception 'Admin session expired'; end if;
  delete from public.user_badges ub using public.badges b where ub.badge_id=b.id and ub.user_id=p_user and b.slug=p_badge_slug;
end;$$;
grant execute on function public.admin_remove_badge(text,uuid,text) to authenticated;

create or replace function public.admin_send_system_notification(p_token text,p_user uuid,p_text text)
returns void language plpgsql security definer set search_path=public,private as $$
begin
  if not private.valid_admin_token(p_token) then raise exception 'Admin session expired'; end if;
  if char_length(trim(coalesce(p_text,''))) not between 1 and 500 then raise exception 'Message must be 1-500 characters'; end if;
  insert into public.notifications(user_id,actor_id,type,text) values(p_user,auth.uid(),'system',trim(p_text));
end;$$;
grant execute on function public.admin_send_system_notification(text,uuid,text) to authenticated;

create or replace function public.admin_delete_post(p_token text,p_post uuid)
returns void language plpgsql security definer set search_path=public,private as $$
begin
  if not private.valid_admin_token(p_token) then raise exception 'Admin session expired'; end if;
  delete from public.posts where id=p_post;
end;$$;
grant execute on function public.admin_delete_post(text,uuid) to authenticated;

-- Public helper for rendering multiple badges next to a name.
create or replace view public.profile_badges as
select ub.user_id,b.slug,b.label,b.icon,b.color,b.description,b.priority
from public.user_badges ub join public.badges b on b.id=ub.badge_id
where b.active=true;
grant select on public.profile_badges to anon,authenticated;

-- Example first-time setup in SQL Editor (replace values):
-- select public.bootstrap_admin('your_username','A-very-strong-admin-password');

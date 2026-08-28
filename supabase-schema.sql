-- GG.Chat database schema for Supabase
-- Run this entire file once in Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 240),
  avatar_url text,
  banner_url text,
  location text check (char_length(location) <= 80),
  website text check (char_length(website) <= 200),
  verified boolean not null default false,
  badge_label text,
  role text not null default 'user' check (role in ('user','creator','moderator','admin')),
  is_private boolean not null default false,
  allow_dms boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 1000),
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(content)) > 0 or image_url is not null)
);

create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id,following_id),
  check (follower_id <> following_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id,user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  type text not null check (type in ('follow','like','comment','message','system')),
  entity_id uuid,
  text text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_posts_created_at on public.posts(created_at desc);
create index if not exists idx_posts_user_id on public.posts(user_id);
create index if not exists idx_follows_following on public.follows(following_id);
create index if not exists idx_follows_follower on public.follows(follower_id);
create index if not exists idx_comments_post on public.comments(post_id,created_at);
create index if not exists idx_messages_conversation on public.messages(conversation_id,created_at);
create index if not exists idx_notifications_user on public.notifications(user_id,created_at desc);
create index if not exists idx_profiles_username_lower on public.profiles(lower(username));

-- Automatically create a profile when a new auth account is registered.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_username text;
  safe_username text;
begin
  requested_username := lower(coalesce(new.raw_user_meta_data ->> 'username',''));
  if requested_username !~ '^[a-z0-9_.]{3,24}$' then
    requested_username := 'user_' || substr(replace(new.id::text,'-',''),1,8);
  end if;
  safe_username := requested_username;
  if exists(select 1 from public.profiles where username=safe_username) then
    safe_username := substr(requested_username,1,15) || '_' || substr(replace(new.id::text,'-',''),1,6);
  end if;
  insert into public.profiles(id,username,display_name,verified,badge_label,role)
  values(new.id,safe_username,coalesce(nullif(new.raw_user_meta_data ->> 'display_name',''),safe_username),false,null,'user')
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- A browser user may never grant their own verified badge, badge text or role.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.verified := false;
      new.badge_label := null;
      new.role := 'user';
    else
      new.verified := old.verified;
      new.badge_label := old.badge_label;
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges_trigger on public.profiles;
create trigger protect_profile_privileges_trigger
before insert or update on public.profiles
for each row execute procedure public.protect_profile_privileges();

create or replace function public.is_conversation_member(cid uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists(select 1 from public.conversation_members cm where cm.conversation_id=cid and cm.user_id=uid);
$$;

create or replace function public.can_add_conversation_member(cid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists(select 1 from public.conversations c where c.id=cid and c.created_by=auth.uid())
      or public.is_conversation_member(cid,auth.uid());
$$;

-- Keep conversation updated_at fresh when a message arrives.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.conversations set updated_at=now() where id=new.conversation_id;
  return new;
end;
$$;

drop trigger if exists touch_conversation_on_message on public.messages;
create trigger touch_conversation_on_message after insert on public.messages
for each row execute procedure public.touch_conversation();

-- Notification triggers.
create or replace function public.notify_follow()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.follower_id <> new.following_id then
    insert into public.notifications(user_id,actor_id,type,entity_id) values(new.following_id,new.follower_id,'follow',new.follower_id);
  end if;
  return new;
end;$$;

drop trigger if exists notify_on_follow on public.follows;
create trigger notify_on_follow after insert on public.follows for each row execute procedure public.notify_follow();

create or replace function public.notify_like()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.posts where id=new.post_id;
  if owner_id is not null and owner_id <> new.user_id then
    insert into public.notifications(user_id,actor_id,type,entity_id) values(owner_id,new.user_id,'like',new.post_id);
  end if;
  return new;
end;$$;

drop trigger if exists notify_on_like on public.likes;
create trigger notify_on_like after insert on public.likes for each row execute procedure public.notify_like();

create or replace function public.notify_comment()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.posts where id=new.post_id;
  if owner_id is not null and owner_id <> new.user_id then
    insert into public.notifications(user_id,actor_id,type,entity_id) values(owner_id,new.user_id,'comment',new.post_id);
  end if;
  return new;
end;$$;

drop trigger if exists notify_on_comment on public.comments;
create trigger notify_on_comment after insert on public.comments for each row execute procedure public.notify_comment();

create or replace function public.notify_message()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notifications(user_id,actor_id,type,entity_id)
  select cm.user_id,new.sender_id,'message',new.conversation_id
  from public.conversation_members cm
  where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id;
  return new;
end;$$;

drop trigger if exists notify_on_message on public.messages;
create trigger notify_on_message after insert on public.messages for each row execute procedure public.notify_message();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Profiles
create policy "profiles public read" on public.profiles for select using (true);
create policy "profiles own insert" on public.profiles for insert with check (auth.uid()=id);
create policy "profiles own update" on public.profiles for update using (auth.uid()=id) with check (auth.uid()=id);
create policy "profiles own delete" on public.profiles for delete using (auth.uid()=id);

-- Posts
create policy "posts public read" on public.posts for select using (true);
create policy "posts own insert" on public.posts for insert with check (auth.uid()=user_id);
create policy "posts own update" on public.posts for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "posts own delete" on public.posts for delete using (auth.uid()=user_id);

-- Likes
create policy "likes public read" on public.likes for select using (true);
create policy "likes own insert" on public.likes for insert with check (auth.uid()=user_id);
create policy "likes own delete" on public.likes for delete using (auth.uid()=user_id);

-- Comments
create policy "comments public read" on public.comments for select using (true);
create policy "comments own insert" on public.comments for insert with check (auth.uid()=user_id);
create policy "comments own update" on public.comments for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "comments own delete" on public.comments for delete using (auth.uid()=user_id);

-- Follows
create policy "follows public read" on public.follows for select using (true);
create policy "follows own insert" on public.follows for insert with check (auth.uid()=follower_id);
create policy "follows own delete" on public.follows for delete using (auth.uid()=follower_id);

-- Conversations and messages: only members can read them.
create policy "conversation member read" on public.conversations for select using (public.is_conversation_member(id));
create policy "conversation creator insert" on public.conversations for insert with check (auth.uid()=created_by);
create policy "conversation member update" on public.conversations for update using (public.is_conversation_member(id));

create policy "members see same conversation" on public.conversation_members for select using (public.is_conversation_member(conversation_id));
create policy "conversation creator can add members" on public.conversation_members for insert with check (public.can_add_conversation_member(conversation_id));
create policy "member can leave" on public.conversation_members for delete using (auth.uid()=user_id);

create policy "members read messages" on public.messages for select using (public.is_conversation_member(conversation_id));
create policy "members send messages" on public.messages for insert with check (auth.uid()=sender_id and public.is_conversation_member(conversation_id));
create policy "recipient marks read" on public.messages for update using (public.is_conversation_member(conversation_id)) with check (public.is_conversation_member(conversation_id));

-- Notifications are private to their owner. Only database triggers create them.
create policy "notification owner read" on public.notifications for select using (auth.uid()=user_id);
create policy "notification owner update" on public.notifications for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "notification owner delete" on public.notifications for delete using (auth.uid()=user_id);

grant usage on schema public to anon, authenticated;
grant select on public.profiles,public.posts,public.likes,public.comments,public.follows to anon,authenticated;
grant insert,update,delete on public.profiles,public.posts,public.likes,public.comments,public.follows to authenticated;
grant select,insert,update,delete on public.conversations,public.conversation_members,public.messages,public.notifications to authenticated;

-- Enable realtime tables used by the frontend. Ignore duplicate-membership errors if rerun.
do $$
begin
  begin alter publication supabase_realtime add table public.posts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
end $$;

-- HOW TO GIVE AN OFFICIAL BADGE (run manually as project owner in SQL Editor):
-- update public.profiles set verified=true, badge_label='Official', role='creator' where username='username_here';

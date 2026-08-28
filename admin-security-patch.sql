-- GG.Chat admin privilege bridge
-- Run AFTER admin-schema.sql.
-- This lets ONLY authenticated admin RPCs update protected profile fields.
-- Normal browser updates still cannot self-promote or self-verify.

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public,private
as $$
declare
  admin_override text;
begin
  admin_override := current_setting('gg.admin_privileged', true);

  if auth.uid() is not null
     and not (
       admin_override = '1'
       and private.is_role_admin(auth.uid())
     ) then
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

create or replace function public.admin_update_user(
  p_token text,
  p_user uuid,
  p_verified boolean default null,
  p_role text default null,
  p_suspended boolean default null,
  p_reason text default null,
  p_private boolean default null,
  p_allow_dms boolean default null
)
returns void
language plpgsql
security definer
set search_path=public,private
as $$
begin
  if not private.valid_admin_token(p_token) then
    raise exception 'Admin session expired';
  end if;

  if p_role is not null and p_role not in ('user','creator','moderator','admin') then
    raise exception 'Invalid role';
  end if;

  if p_user = auth.uid() and p_role is not null and p_role <> 'admin' then
    raise exception 'Cannot remove your own admin role here';
  end if;

  perform set_config('gg.admin_privileged','1',true);

  update public.profiles
  set
    verified = coalesce(p_verified, verified),
    role = coalesce(p_role, role),
    is_suspended = coalesce(p_suspended, is_suspended),
    suspension_reason = case
      when p_suspended = false then null
      when p_reason is not null then nullif(trim(p_reason),'')
      else suspension_reason
    end,
    is_private = coalesce(p_private, is_private),
    allow_dms = coalesce(p_allow_dms, allow_dms),
    updated_at = now()
  where id = p_user;

  perform set_config('gg.admin_privileged','0',true);
end;
$$;

grant execute on function public.admin_update_user(text,uuid,boolean,text,boolean,text,boolean,boolean) to authenticated;

-- Extra helper: use only if you need to completely remove a user's public social profile.
create or replace function public.admin_delete_profile(p_token text,p_user uuid)
returns void
language plpgsql
security definer
set search_path=public,private
as $$
begin
  if not private.valid_admin_token(p_token) then
    raise exception 'Admin session expired';
  end if;

  if p_user = auth.uid() then
    raise exception 'Cannot delete your own admin profile';
  end if;

  delete from public.profiles where id=p_user;
end;
$$;

grant execute on function public.admin_delete_profile(text,uuid) to authenticated;

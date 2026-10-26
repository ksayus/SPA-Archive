-- ============================================================
-- SPA CENTRAL ARCHIVE · Supabase schema
-- Run with: psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default '未命名档案员',
  bio text,
  avatar_url text,
  role text not null default 'user' check (role in ('user','editor','admin')),
  clearance integer not null default 0 check (clearance between 0 and 5),
  xp integer not null default 0 check (xp >= 0),
  points integer not null default 0 check (points >= 0),
  status text not null default 'active' check (status in ('active','suspended')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_clearance_idx on public.profiles(clearance);
create index if not exists profiles_xp_idx on public.profiles(xp desc);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------- categories ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- archives ----------
create table if not exists public.archives (
  id uuid primary key default gen_random_uuid(),
  archive_no text not null unique,
  slug text not null unique,
  title text not null,
  subtitle text,
  summary text,
  content text not null,
  category_id uuid references public.categories(id) on delete set null,
  clearance integer not null default 0 check (clearance between 0 and 5),
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  cover_url text,
  featured boolean not null default false,
  published boolean not null default true,
  read_minutes integer not null default 3,
  views integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists archives_category_idx on public.archives(category_id);
create index if not exists archives_clearance_idx on public.archives(clearance);
create index if not exists archives_published_idx on public.archives(published);
create index if not exists archives_featured_idx on public.archives(featured) where featured = true;
create index if not exists archives_created_at_idx on public.archives(created_at desc);
create index if not exists archives_tags_idx on public.archives using gin(tags);

drop trigger if exists archives_updated_at on public.archives;
create trigger archives_updated_at before update on public.archives
for each row execute function public.set_updated_at();

create or replace function public.prepare_archive()
returns trigger
language plpgsql
as $$
begin
  new.read_minutes = greatest(1, ceil(coalesce(length(new.content), 0) / 500.0)::integer);
  if new.created_by is null then
    new.created_by = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists archives_prepare on public.archives;
create trigger archives_prepare before insert or update on public.archives
for each row execute function public.prepare_archive();

-- Public catalog: metadata only. Content stays in public.archives, protected by RLS.
create or replace view public.archive_catalog as
select
  id, archive_no, slug, title, subtitle, summary,
  category_id, clearance, tags, cover_url, featured, published,
  read_minutes, views, created_at, updated_at
from public.archives
where published = true;

-- ---------- reading / bookmarks ----------
create table if not exists public.reading_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  archive_id uuid not null references public.archives(id) on delete cascade,
  first_read_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  read_count integer not null default 1,
  primary key (user_id, archive_id)
);

create index if not exists reading_history_user_idx on public.reading_history(user_id, last_read_at desc);
create index if not exists reading_history_archive_idx on public.reading_history(archive_id);

create table if not exists public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  archive_id uuid not null references public.archives(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, archive_id)
);

create index if not exists bookmarks_user_idx on public.bookmarks(user_id, created_at desc);

-- ---------- tasks ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  category text not null default 'once' check (category in ('daily','weekly','once','manual')),
  reward_xp integer not null default 0 check (reward_xp >= 0),
  reward_points integer not null default 0 check (reward_points >= 0),
  requirement jsonb not null default '{"type":"always"}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  period_key text not null,
  status text not null default 'completed' check (status in ('completed','pending','approved','rejected')),
  proof text,
  admin_note text,
  reward_xp integer not null default 0,
  reward_points integer not null default 0,
  completed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique (user_id, task_id, period_key)
);

create index if not exists task_completions_user_idx on public.task_completions(user_id, completed_at desc);
create index if not exists task_completions_status_idx on public.task_completions(status);

-- ---------- feedback / submissions ----------
create table if not exists public.archive_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  archive_id uuid references public.archives(id) on delete set null,
  kind text not null default 'correction' check (kind in ('correction','addition','report','other')),
  content text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reward_xp integer not null default 0,
  reward_points integer not null default 0,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index if not exists archive_feedback_status_idx on public.archive_feedback(status, created_at desc);
create index if not exists archive_feedback_user_idx on public.archive_feedback(user_id, created_at desc);

-- ---------- announcements / audit ----------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  level integer not null default 0 check (level between 0 and 5),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

-- ============================================================
-- security helpers
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','editor') and status = 'active'
  );
$$;

create or replace function public.my_clearance()
returns integer
language sql
stable
security definer
set search_path = public, auth, extensions
as $$
  select coalesce((
    select clearance from public.profiles
    where id = auth.uid() and status = 'active'
  ), -1);
$$;

create or replace function public.can_read_archive(p_clearance integer)
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions
as $$
  select
    public.is_admin()
    or public.is_editor()
    or p_clearance = 0
    or (auth.uid() is not null and public.my_clearance() >= p_clearance);
$$;

create or replace function public.log_audit(
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, auth, extensions
as $$
  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

-- ============================================================
-- new-user trigger
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  insert into public.profiles(id, email, display_name, role, clearance)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,''), '@', 1), '未命名档案员'),
    'user',
    0
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Protect privileged profile columns from self-service edits.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    if new.role is distinct from old.role
       or new.clearance is distinct from old.clearance
       or new.xp is distinct from old.xp
       or new.points is distinct from old.points
       or new.status is distinct from old.status
       or new.email is distinct from old.email then
      raise exception '权限字段不可自行修改';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_fields on public.profiles;
create trigger profiles_protect_fields before update on public.profiles
for each row execute function public.protect_profile_fields();

-- Bookmark only what you are allowed to read.
create or replace function public.check_bookmark_access()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare v_clearance integer;
begin
  select clearance into v_clearance from public.archives where id = new.archive_id;
  if v_clearance is null then
    raise exception '档案不存在';
  end if;
  if not public.can_read_archive(v_clearance) then
    raise exception '权限不足，无法收藏该档案';
  end if;
  return new;
end;
$$;

drop trigger if exists bookmarks_check_access on public.bookmarks;
create trigger bookmarks_check_access before insert on public.bookmarks
for each row execute function public.check_bookmark_access();

-- ============================================================
-- clearance progression
-- ============================================================
create or replace function public.sync_clearance(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_xp integer;
  v_clearance integer;
  v_role text;
  v_target integer;
begin
  select xp, clearance, role into v_xp, v_clearance, v_role
  from public.profiles where id = p_user_id;

  if v_role is null or v_role = 'admin' then
    return v_clearance;
  end if;

  v_target := case
    when v_xp >= 900 then 3
    when v_xp >= 350 then 2
    when v_xp >= 100 then 1
    else 0
  end;

  if v_clearance < v_target then
    update public.profiles set clearance = v_target where id = p_user_id;
    return v_target;
  end if;
  return v_clearance;
end;
$$;

revoke all on function public.sync_clearance(uuid) from public, anon, authenticated;

-- ============================================================
-- account registration (email confirmation is bypassed intentionally:
-- this is a closed fan-archive with an invite code, not a public mailbox)
-- ============================================================
create or replace function public.register_account(
  p_email text,
  p_password text,
  p_display_name text,
  p_invite text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(coalesce(p_email,'')));
  v_name text := trim(coalesce(p_display_name,''));
begin
  if p_invite is distinct from 'SPA-ENLIST-2026' then
    return jsonb_build_object('ok', false, 'error', '调阅申请码无效');
  end if;
  if v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    return jsonb_build_object('ok', false, 'error', '请输入有效的邮箱地址');
  end if;
  if length(coalesce(p_password,'')) < 8 then
    return jsonb_build_object('ok', false, 'error', '密码至少需要 8 位');
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    return jsonb_build_object('ok', false, 'error', '该邮箱已登记');
  end if;
  if v_name = '' then
    v_name := split_part(v_email, '@', 1);
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('display_name', v_name),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  update public.profiles
  set display_name = v_name
  where id = v_id;

  insert into public.audit_logs(actor_id, action, target_type, target_id, details)
  values (v_id, 'account.register', 'user', v_id::text, jsonb_build_object('email', v_email));

  return jsonb_build_object('ok', true, 'user_id', v_id, 'email', v_email);
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

-- ============================================================
-- reading
-- ============================================================
create or replace function public.record_archive_view(p_archive_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare v_clearance integer;
begin
  select clearance into v_clearance from public.archives
  where id = p_archive_id and published = true;
  if v_clearance is null then
    return jsonb_build_object('ok', false, 'error', '档案不存在');
  end if;
  if not public.can_read_archive(v_clearance) then
    return jsonb_build_object('ok', false, 'error', '权限不足');
  end if;
  update public.archives set views = views + 1 where id = p_archive_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mark_archive_read(p_archive_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_clearance integer;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', '未登录');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and status = 'active') then
    return jsonb_build_object('ok', false, 'error', '账号不可用');
  end if;
  select clearance into v_clearance from public.archives
  where id = p_archive_id and published = true;
  if v_clearance is null then
    return jsonb_build_object('ok', false, 'error', '档案不存在');
  end if;
  if not public.can_read_archive(v_clearance) then
    return jsonb_build_object('ok', false, 'error', '权限不足');
  end if;

  insert into public.reading_history(user_id, archive_id)
  values (v_uid, p_archive_id)
  on conflict (user_id, archive_id) do update
    set last_read_at = now(),
        read_count = public.reading_history.read_count + 1;

  update public.archives set views = views + 1 where id = p_archive_id;
  update public.profiles set last_seen_at = now() where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- tasks
-- ============================================================
create or replace function public.claim_task(p_task_slug text, p_proof text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_profile public.profiles%rowtype;
  v_period text;
  v_ok boolean := false;
  v_count integer := 0;
  v_req jsonb;
  v_type text;
  v_completion_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', '请先登录');
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null or v_profile.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', '账号不可用');
  end if;
  select * into v_task from public.tasks where slug = p_task_slug and active = true;
  if v_task.id is null then
    return jsonb_build_object('ok', false, 'error', '任务不存在或已关闭');
  end if;

  v_period := case v_task.category
    when 'daily' then to_char(now() at time zone 'utc', 'YYYY-MM-DD')
    when 'weekly' then to_char(now() at time zone 'utc', 'IYYY-IW')
    when 'once' then 'once'
    else 'manual-' || extract(epoch from clock_timestamp())::bigint
  end;

  if v_task.category <> 'manual' and exists (
    select 1 from public.task_completions
    where user_id = v_uid and task_id = v_task.id and period_key = v_period
      and status in ('completed','pending','approved')
  ) then
    return jsonb_build_object('ok', false, 'error', '本期已领取');
  end if;

  if v_task.category = 'manual' then
    insert into public.task_completions(user_id, task_id, period_key, status, proof, reward_xp, reward_points)
    values (v_uid, v_task.id, v_period, 'pending', nullif(trim(p_proof),''), v_task.reward_xp, v_task.reward_points)
    returning id into v_completion_id;
    perform public.log_audit('task.submit', 'task', v_task.id::text, jsonb_build_object('slug', v_task.slug));
    return jsonb_build_object('ok', true, 'status', 'pending', 'message', '已提交，等待管理员审核', 'completion_id', v_completion_id);
  end if;

  v_req := coalesce(v_task.requirement, '{"type":"always"}'::jsonb);
  v_type := coalesce(v_req->>'type', 'always');

  if v_type = 'always' then
    v_ok := true;

  elsif v_type = 'read_count' then
    if coalesce(v_req->>'window','total') = 'day' then
      select count(*) into v_count from public.reading_history
      where user_id = v_uid and last_read_at::date = (now() at time zone 'utc')::date;
    else
      select count(*) into v_count from public.reading_history where user_id = v_uid;
    end if;
    v_ok := v_count >= coalesce((v_req->>'count')::integer, 1);

  elsif v_type = 'bookmark_count' then
    select count(*) into v_count from public.bookmarks where user_id = v_uid;
    v_ok := v_count >= coalesce((v_req->>'count')::integer, 1);

  elsif v_type = 'category_count' then
    select count(distinct a.category_id) into v_count
    from public.reading_history rh
    join public.archives a on a.id = rh.archive_id
    where rh.user_id = v_uid;
    v_ok := v_count >= coalesce((v_req->>'count')::integer, 1);

  elsif v_type = 'profile_complete' then
    v_ok := length(coalesce(v_profile.display_name,'')) >= 2
            and length(coalesce(v_profile.bio,'')) >= 8;

  elsif v_type = 'read_clearance' then
    select count(*) into v_count
    from public.reading_history rh
    join public.archives a on a.id = rh.archive_id
    where rh.user_id = v_uid and a.clearance >= coalesce((v_req->>'min')::integer, 1);
    v_ok := v_count >= coalesce((v_req->>'count')::integer, 1);

  elsif v_type = 'minas_count' then
    select count(*) into v_count
    from public.reading_history rh
    join public.archives a on a.id = rh.archive_id
    join public.categories c on c.id = a.category_id
    where rh.user_id = v_uid and c.slug = 'minas';
    v_ok := v_count >= coalesce((v_req->>'count')::integer, 1);

  elsif v_type = 'streak' then
    select count(distinct (tc.completed_at at time zone 'utc')::date) into v_count
    from public.task_completions tc
    join public.tasks t on t.id = tc.task_id
    where tc.user_id = v_uid and t.slug = 'daily-checkin'
      and tc.status = 'completed'
      and tc.completed_at >= now() - interval '7 days';
    v_ok := v_count >= coalesce((v_req->>'count')::integer, 7);

  else
    return jsonb_build_object('ok', false, 'error', '未知任务条件');
  end if;

  if not v_ok then
    return jsonb_build_object('ok', false, 'error', '条件尚未满足', 'progress', v_count);
  end if;

  insert into public.task_completions(user_id, task_id, period_key, status, reward_xp, reward_points)
  values (v_uid, v_task.id, v_period, 'completed', v_task.reward_xp, v_task.reward_points)
  returning id into v_completion_id;

  update public.profiles
  set xp = xp + v_task.reward_xp,
      points = points + v_task.reward_points,
      last_seen_at = now()
  where id = v_uid;

  perform public.sync_clearance(v_uid);
  perform public.log_audit('task.claim', 'task', v_task.id::text,
    jsonb_build_object('slug', v_task.slug, 'xp', v_task.reward_xp, 'points', v_task.reward_points));

  select clearance into v_count from public.profiles where id = v_uid;
  return jsonb_build_object(
    'ok', true, 'status', 'completed', 'xp', v_task.reward_xp, 'points', v_task.reward_points,
    'clearance', v_count, 'message', '任务完成，权限档案已更新'
  );
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', '本期已领取');
end;
$$;

-- ============================================================
-- feedback
-- ============================================================
create or replace function public.submit_feedback(
  p_archive_id uuid,
  p_kind text,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', '请先登录');
  end if;
  if length(trim(coalesce(p_content,''))) < 5 then
    return jsonb_build_object('ok', false, 'error', '请填写至少 5 个字符');
  end if;
  if p_kind not in ('correction','addition','report','other') then
    p_kind := 'other';
  end if;
  insert into public.archive_feedback(user_id, archive_id, kind, content)
  values (auth.uid(), p_archive_id, p_kind, trim(p_content))
  returning id into v_id;
  perform public.log_audit('feedback.submit', 'archive', p_archive_id::text, jsonb_build_object('kind', p_kind));
  return jsonb_build_object('ok', true, 'id', v_id, 'message', '报告已归档，等待审核');
end;
$$;

-- ============================================================
-- admin actions
-- ============================================================
create or replace function public.admin_update_user(
  p_user_id uuid,
  p_role text default null,
  p_clearance integer default null,
  p_xp integer default null,
  p_points integer default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', '需要管理员权限');
  end if;
  if p_role is not null and p_role not in ('user','editor','admin') then
    return jsonb_build_object('ok', false, 'error', '角色无效');
  end if;
  if p_clearance is not null and (p_clearance < 0 or p_clearance > 5) then
    return jsonb_build_object('ok', false, 'error', '权限等级无效');
  end if;
  if p_status is not null and p_status not in ('active','suspended') then
    return jsonb_build_object('ok', false, 'error', '状态无效');
  end if;

  update public.profiles set
    role = coalesce(p_role, role),
    clearance = coalesce(p_clearance, clearance),
    xp = coalesce(p_xp, xp),
    points = coalesce(p_points, points),
    status = coalesce(p_status, status)
  where id = p_user_id;

  if p_status = 'suspended' then
    update auth.users set banned_until = now() + interval '100 years' where id = p_user_id;
  elsif p_status = 'active' then
    update auth.users set banned_until = null where id = p_user_id;
  end if;

  perform public.log_audit('admin.user_update', 'user', p_user_id::text,
    jsonb_build_object('role', p_role, 'clearance', p_clearance, 'xp', p_xp, 'points', p_points, 'status', p_status));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_reset_password(p_user_id uuid, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', '需要管理员权限');
  end if;
  if length(coalesce(p_password,'')) < 8 then
    return jsonb_build_object('ok', false, 'error', '密码至少需要 8 位');
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;
  perform public.log_audit('admin.reset_password', 'user', p_user_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_review_submission(
  p_kind text,
  p_id uuid,
  p_approve boolean,
  p_note text default null,
  p_xp integer default null,
  p_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user uuid;
  v_task uuid;
  v_reward_xp integer;
  v_reward_points integer;
  v_status text;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', '需要管理员权限');
  end if;
  v_status := case when p_approve then 'approved' else 'rejected' end;

  if p_kind = 'task' then
    select user_id, task_id, reward_xp, reward_points
    into v_user, v_task, v_reward_xp, v_reward_points
    from public.task_completions
    where id = p_id and status = 'pending';
    if v_user is null then
      return jsonb_build_object('ok', false, 'error', '待审记录不存在');
    end if;
    update public.task_completions
    set status = v_status,
        admin_note = p_note,
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        reward_xp = coalesce(p_xp, reward_xp),
        reward_points = coalesce(p_points, reward_points)
    where id = p_id;
    if p_approve then
      update public.profiles
      set xp = xp + coalesce(p_xp, v_reward_xp),
          points = points + coalesce(p_points, v_reward_points)
      where id = v_user;
      perform public.sync_clearance(v_user);
    end if;
  elsif p_kind = 'feedback' then
    select user_id, reward_xp, reward_points into v_user, v_reward_xp, v_reward_points
    from public.archive_feedback
    where id = p_id and status = 'pending';
    if v_user is null then
      return jsonb_build_object('ok', false, 'error', '待审记录不存在');
    end if;
    update public.archive_feedback
    set status = v_status,
        admin_note = p_note,
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        reward_xp = coalesce(p_xp, reward_xp),
        reward_points = coalesce(p_points, reward_points)
    where id = p_id;
    if p_approve then
      update public.profiles
      set xp = xp + coalesce(p_xp, v_reward_xp),
          points = points + coalesce(p_points, v_reward_points)
      where id = v_user;
      perform public.sync_clearance(v_user);
    end if;
  else
    return jsonb_build_object('ok', false, 'error', '未知审核类型');
  end if;

  perform public.log_audit('admin.review', p_kind, p_id::text,
    jsonb_build_object('approve', p_approve, 'note', p_note));
  return jsonb_build_object('ok', true, 'status', v_status);
end;
$$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare v jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', '需要管理员权限');
  end if;
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'active_users', (select count(*) from public.profiles where status = 'active'),
    'admins', (select count(*) from public.profiles where role = 'admin'),
    'archives', (select count(*) from public.archives),
    'published_archives', (select count(*) from public.archives where published = true),
    'reads', (select count(*) from public.reading_history),
    'reads_today', (select count(*) from public.reading_history where last_read_at::date = (now() at time zone 'utc')::date),
    'pending_feedback', (select count(*) from public.archive_feedback where status = 'pending'),
    'pending_tasks', (select count(*) from public.task_completions where status = 'pending'),
    'tasks', (select count(*) from public.tasks where active = true),
    'by_clearance', (
      select coalesce(jsonb_object_agg(clearance, cnt), '{}'::jsonb)
      from (select clearance, count(*) cnt from public.archives where published = true group by clearance) s
    )
  ) into v;
  return v;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.archives enable row level security;
alter table public.reading_history enable row level security;
alter table public.bookmarks enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.archive_feedback enable row level security;
alter table public.announcements enable row level security;
alter table public.audit_logs enable row level security;

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select
using (id = auth.uid());

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles for select
using (public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update
using (public.is_admin())
with check (public.is_admin());

-- categories
drop policy if exists categories_select_all on public.categories;
create policy categories_select_all on public.categories for select using (true);

drop policy if exists categories_write_editor on public.categories;
create policy categories_write_editor on public.categories for all
using (public.is_editor()) with check (public.is_editor());

-- archives
drop policy if exists archives_select_allowed on public.archives;
create policy archives_select_allowed on public.archives for select
using (published = true and public.can_read_archive(clearance));

drop policy if exists archives_select_editor on public.archives;
create policy archives_select_editor on public.archives for select
using (public.is_editor());

drop policy if exists archives_write_editor on public.archives;
create policy archives_write_editor on public.archives for all
using (public.is_editor()) with check (public.is_editor());

-- reading history
drop policy if exists reading_select_own on public.reading_history;
create policy reading_select_own on public.reading_history for select
using (user_id = auth.uid());

drop policy if exists reading_select_admin on public.reading_history;
create policy reading_select_admin on public.reading_history for select
using (public.is_admin());

-- bookmarks
drop policy if exists bookmarks_select_own on public.bookmarks;
create policy bookmarks_select_own on public.bookmarks for select
using (user_id = auth.uid());

drop policy if exists bookmarks_insert_own on public.bookmarks;
create policy bookmarks_insert_own on public.bookmarks for insert
with check (user_id = auth.uid());

drop policy if exists bookmarks_delete_own on public.bookmarks;
create policy bookmarks_delete_own on public.bookmarks for delete
using (user_id = auth.uid());

drop policy if exists bookmarks_select_admin on public.bookmarks;
create policy bookmarks_select_admin on public.bookmarks for select
using (public.is_admin());

-- tasks
drop policy if exists tasks_select_active on public.tasks;
create policy tasks_select_active on public.tasks for select using (active = true);

drop policy if exists tasks_select_editor on public.tasks;
create policy tasks_select_editor on public.tasks for select using (public.is_editor());

drop policy if exists tasks_write_editor on public.tasks;
create policy tasks_write_editor on public.tasks for all
using (public.is_editor()) with check (public.is_editor());

-- task completions
drop policy if exists completions_select_own on public.task_completions;
create policy completions_select_own on public.task_completions for select
using (user_id = auth.uid());

drop policy if exists completions_select_admin on public.task_completions;
create policy completions_select_admin on public.task_completions for select
using (public.is_admin());

-- feedback
drop policy if exists feedback_select_own on public.archive_feedback;
create policy feedback_select_own on public.archive_feedback for select
using (user_id = auth.uid());

drop policy if exists feedback_select_admin on public.archive_feedback;
create policy feedback_select_admin on public.archive_feedback for select
using (public.is_admin());

-- announcements
drop policy if exists announcements_select_active on public.announcements;
create policy announcements_select_active on public.announcements for select using (active = true);

drop policy if exists announcements_select_editor on public.announcements;
create policy announcements_select_editor on public.announcements for select using (public.is_editor());

drop policy if exists announcements_write_editor on public.announcements;
create policy announcements_write_editor on public.announcements for all
using (public.is_editor()) with check (public.is_editor());

-- audit
drop policy if exists audit_select_admin on public.audit_logs;
create policy audit_select_admin on public.audit_logs for select using (public.is_admin());

-- ============================================================
-- grants
-- ============================================================
grant usage on schema public to anon, authenticated;

grant select on public.archive_catalog to anon, authenticated;
grant select on public.categories to anon, authenticated;
grant select on public.tasks to anon, authenticated;
grant select on public.announcements to anon, authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.archives to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
grant select on public.reading_history to authenticated;
grant select on public.task_completions to authenticated;
grant select on public.archive_feedback to authenticated;
grant select on public.audit_logs to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_editor() to anon, authenticated;
grant execute on function public.my_clearance() to anon, authenticated;
grant execute on function public.can_read_archive(integer) to anon, authenticated;
grant execute on function public.register_account(text,text,text,text) to anon, authenticated;
grant execute on function public.record_archive_view(uuid) to anon, authenticated;
grant execute on function public.mark_archive_read(uuid) to authenticated;
grant execute on function public.claim_task(text,text) to authenticated;
grant execute on function public.submit_feedback(uuid,text,text) to authenticated;
grant execute on function public.admin_update_user(uuid,text,integer,integer,integer,text) to authenticated;
grant execute on function public.admin_reset_password(uuid,text) to authenticated;
grant execute on function public.admin_review_submission(text,uuid,boolean,text,integer,integer) to authenticated;
grant execute on function public.admin_stats() to authenticated;

revoke all on function public.log_audit(text,text,text,jsonb) from public, anon, authenticated;

-- ============================================================
-- realtime (optional; harmless if publication does not exist)
-- ============================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.announcements;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end;
$$;

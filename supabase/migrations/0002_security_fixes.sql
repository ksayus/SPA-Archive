-- ============================================================
-- SPA CENTRAL ARCHIVE · security & consistency fixes
-- Apply after 0001_init.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Announcements: restricted notices must not leak their body
--    through the anonymous API. Level 0 stays public.
-- ------------------------------------------------------------
drop policy if exists announcements_select_active on public.announcements;
create policy announcements_select_active on public.announcements for select
using (
  active = true
  and (
    level = 0
    or public.my_clearance() >= level
  )
);

-- ------------------------------------------------------------
-- 2. Trusted profile writes.
--    The profile guard previously blocked XP/clearance updates made
--    inside SECURITY DEFINER RPCs, because auth.uid() still belongs
--    to the caller. Trusted RPCs now set a transaction-local flag.
-- ------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if auth.uid() = old.id
     and not public.is_admin()
     and coalesce(current_setting('spa.trusted_profile_write', true), 'off') <> 'on' then
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

-- ------------------------------------------------------------
-- 3. Clearance sync: allow the trusted update through the guard.
-- ------------------------------------------------------------
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
    perform set_config('spa.trusted_profile_write', 'on', true);
    update public.profiles set clearance = v_target where id = p_user_id;
    perform set_config('spa.trusted_profile_write', 'off', true);
    return v_target;
  end if;
  return v_clearance;
end;
$$;

revoke all on function public.sync_clearance(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Task claiming: XP/points award is a trusted profile write.
--    Also enforce the manual-submission proof at the database layer.
-- ------------------------------------------------------------
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
    if length(trim(coalesce(p_proof, ''))) < 10 then
      return jsonb_build_object('ok', false, 'error', '请提交至少 10 个字符的材料说明');
    end if;
    insert into public.task_completions(user_id, task_id, period_key, status, proof, reward_xp, reward_points)
    values (v_uid, v_task.id, v_period, 'pending', trim(p_proof), v_task.reward_xp, v_task.reward_points)
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

  perform set_config('spa.trusted_profile_write', 'on', true);
  update public.profiles
  set xp = xp + v_task.reward_xp,
      points = points + v_task.reward_points,
      last_seen_at = now()
  where id = v_uid;
  perform public.sync_clearance(v_uid);
  perform set_config('spa.trusted_profile_write', 'off', true);

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

-- Keep the intended grants explicit after replacing the function.
revoke all on function public.claim_task(text, text) from public, anon;
grant execute on function public.claim_task(text, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Keep task copy aligned with the six-level clearance scale.
-- ------------------------------------------------------------
update public.tasks
set description = '调阅至少 1 份 III 级（NIM+）或更高等级档案。'
where slug = 'read-ton';

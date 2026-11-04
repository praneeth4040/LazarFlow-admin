-- ═══════════════════════════════════════════════════════════════════════
-- 001_users_admin_production.sql
--
-- Users-admin production tables:
--   admin_grants   — unified, append-only log of every admin grant
--                    (credits, subscriptions, bans, notifications, ...)
--   notifications  — per-user in-app notifications (delivery + read state)
--   user_bans      — first-class ban rows (one active ban per user)
--
-- Plus:
--   is_admin()                    — SECURITY DEFINER helper used everywhere
--   adjust_flux_balance(...)      — atomic credit add/deduct/set + audit
--   set_subscription(...)         — atomic grant/extend/revoke + audit
--   set_user_ban(...)             — atomic ban/unban + feature_flags mirror
--   send_notification(...)        — batch insert with server-side
--                                   {{name}}/{{email}} personalization
--
-- Run this in the Supabase SQL editor (DDL cannot go through PostgREST).
-- Idempotent: uses create-or-replace / if-not-exists where possible.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 0. Admin helper ────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ── 1. admin_grants ────────────────────────────────────────────────────
create table if not exists public.admin_grants (
  id             uuid primary key default gen_random_uuid(),
  grant_type     text not null check (grant_type in (
                   'credit_add', 'credit_deduct', 'credit_set',
                   'subscription_grant', 'subscription_extend', 'subscription_revoke',
                   'ban', 'unban', 'session_revoke', 'device_reset', 'notification')),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_admin_id uuid references public.profiles(id) on delete set null,
  amount         int,              -- signed credit delta (credit_*)
  balance_after  int,              -- resulting flux_balance (credit_*)
  plan           text,             -- subscription tier (subscription_*)
  days           int,              -- duration (subscription_*)
  expires_at     timestamptz,      -- resulting expiry (subscription_*)
  reason         text,
  note           text,
  before_state   jsonb,            -- snapshot of profiles fields before
  after_state    jsonb,            -- snapshot of profiles fields after
  metadata       jsonb,            -- campaign ids, batch ids, extras
  created_at     timestamptz not null default now()
);

create index if not exists admin_grants_target_idx
  on public.admin_grants (target_user_id, created_at desc);
create index if not exists admin_grants_actor_idx
  on public.admin_grants (actor_admin_id, created_at desc);
create index if not exists admin_grants_type_idx
  on public.admin_grants (grant_type, created_at desc);

alter table public.admin_grants enable row level security;

create policy admin_grants_admin_read
  on public.admin_grants for select to authenticated
  using (public.is_admin());

create policy admin_grants_admin_insert
  on public.admin_grants for insert to authenticated
  with check (public.is_admin());

-- Append-only on purpose: no update / delete policies. The service role
-- (used by SECURITY DEFINER RPCs) bypasses RLS anyway.

-- ── 2. notifications ───────────────────────────────────────────────────
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  body          text not null,
  category      text not null default 'general',
  channel       text not null default 'in_app',
  action_label  text,
  action_url    text,
  status        text not null default 'sent'
                check (status in ('queued', 'scheduled', 'sent', 'failed')),
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  read_at       timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_campaign_idx
  on public.notifications (campaign_id);
create index if not exists notifications_pending_idx
  on public.notifications (status, scheduled_at)
  where status in ('queued', 'scheduled');

alter table public.notifications enable row level security;

create policy notifications_admin_read
  on public.notifications for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

create policy notifications_admin_insert
  on public.notifications for insert to authenticated
  with check (public.is_admin());

-- Users may only update their own rows (mark as read).
create policy notifications_owner_update
  on public.notifications for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ── 3. user_bans ───────────────────────────────────────────────────────
create table if not exists public.user_bans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  reason      text not null,
  banned_by   uuid references public.profiles(id) on delete set null,
  banned_at   timestamptz not null default now(),
  until       timestamptz,        -- null = permanent
  active      boolean not null default true,
  lifted_at   timestamptz,
  lifted_by   uuid references public.profiles(id) on delete set null
);

-- At most one active ban per user.
create unique index if not exists user_bans_one_active
  on public.user_bans (user_id) where active;

alter table public.user_bans enable row level security;

create policy user_bans_admin_read
  on public.user_bans for select to authenticated
  using (public.is_admin());

create policy user_bans_admin_insert
  on public.user_bans for insert to authenticated
  with check (public.is_admin());

create policy user_bans_admin_update
  on public.user_bans for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 4. adjust_flux_balance ─────────────────────────────────────────────
-- Locked read-modify-write: safe against concurrent app-side spends.
create or replace function public.adjust_flux_balance(
  p_target uuid,
  p_mode   text,                    -- 'add' | 'deduct' | 'set'
  p_amount int,
  p_reason text,
  p_note   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   uuid := auth.uid();
  v_current int;
  v_next    int;
  v_delta   int;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_mode not in ('add', 'deduct', 'set') then
    raise exception 'invalid_mode';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'invalid_amount';
  end if;

  select p.flux_balance into v_current
  from public.profiles p
  where p.id = p_target
  for update;

  if v_current is null then
    raise exception 'user_not_found';
  end if;

  v_next := case p_mode
              when 'add'    then v_current + p_amount
              when 'deduct' then v_current - p_amount
              else p_amount
            end;
  if v_next < 0 then
    raise exception 'insufficient_balance';
  end if;
  v_delta := v_next - v_current;

  update public.profiles
  set flux_balance = v_next, updated_at = now()
  where id = p_target;

  insert into public.admin_grants (
    grant_type, target_user_id, actor_admin_id,
    amount, balance_after, reason, note, before_state, after_state
  ) values (
    case p_mode when 'add' then 'credit_add'
                when 'deduct' then 'credit_deduct'
                else 'credit_set' end,
    p_target, v_admin,
    v_delta, v_next, p_reason, p_note,
    jsonb_build_object('flux_balance', v_current),
    jsonb_build_object('flux_balance', v_next)
  );

  return jsonb_build_object('balance_after', v_next, 'delta', v_delta);
end;
$$;

-- ── 5. set_subscription ────────────────────────────────────────────────
create or replace function public.set_subscription(
  p_target uuid,
  p_mode   text,                    -- 'grant' | 'extend' | 'revoke'
  p_plan   text default null,
  p_status text default 'active',
  p_days   int default null,
  p_note   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin    uuid := auth.uid();
  v_before   jsonb;
  v_tier     text;
  v_status   text;
  v_expires  timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_mode not in ('grant', 'extend', 'revoke') then
    raise exception 'invalid_mode';
  end if;

  select p.subscription_tier, p.subscription_status, p.subscription_expires_at
  into v_tier, v_status, v_expires
  from public.profiles p
  where p.id = p_target
  for update;

  if v_tier is null and v_status is null then
    raise exception 'user_not_found';
  end if;

  v_before := jsonb_build_object(
    'subscription_tier', v_tier,
    'subscription_status', v_status,
    'subscription_expires_at', v_expires
  );

  if p_mode = 'revoke' then
    v_tier := 'free';
    v_status := 'inactive';
    v_expires := null;
  elsif p_mode = 'extend' then
    -- Extend from the later of now / current expiry.
    if v_expires is not null and v_expires > now() then
      v_expires := v_expires + make_interval(days => coalesce(p_days, 0));
    else
      v_expires := now() + make_interval(days => coalesce(p_days, 0));
    end if;
    v_tier := case when v_tier is not null and v_tier <> 'free' then v_tier else p_plan end;
    v_status := 'active';
  else -- grant
    v_tier := p_plan;
    v_status := coalesce(p_status, 'active');
    v_expires := now() + make_interval(days => coalesce(p_days, 0));
  end if;

  update public.profiles
  set subscription_tier = v_tier,
      subscription_status = v_status,
      subscription_expires_at = v_expires,
      updated_at = now()
  where id = p_target;

  insert into public.admin_grants (
    grant_type, target_user_id, actor_admin_id,
    plan, days, expires_at, reason, note, before_state, after_state
  ) values (
    'subscription_' || p_mode,
    p_target, v_admin,
    v_tier, p_days, v_expires, p_note, p_note,
    v_before,
    jsonb_build_object(
      'subscription_tier', v_tier,
      'subscription_status', v_status,
      'subscription_expires_at', v_expires
    )
  );

  return jsonb_build_object(
    'subscription_tier', v_tier,
    'subscription_status', v_status,
    'subscription_expires_at', v_expires
  );
end;
$$;

-- ── 6. set_user_ban ────────────────────────────────────────────────────
-- Bans live in user_bans; feature_flags is mirrored so the mobile app
-- (which reads the flag) keeps working unchanged.
create or replace function public.set_user_ban(
  p_target uuid,
  p_banned boolean,
  p_reason text default null,
  p_until  timestamptz default null,
  p_note   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   uuid := auth.uid();
  v_is_admin boolean;
  v_flags   jsonb;
  v_ban_id  uuid;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select p.is_admin into v_is_admin
  from public.profiles p
  where p.id = p_target
  for update;

  if v_is_admin is null then
    raise exception 'user_not_found';
  end if;
  if v_is_admin and p_banned then
    raise exception 'cannot_ban_admin';
  end if;

  select p.feature_flags into v_flags
  from public.profiles p
  where p.id = p_target;

  v_flags := coalesce(v_flags, '{}'::jsonb);

  if p_banned then
    -- Close any prior active ban, then open the new one.
    update public.user_bans
    set active = false, lifted_at = now(), lifted_by = v_admin
    where user_id = p_target and active;

    insert into public.user_bans (user_id, reason, banned_by, until)
    values (p_target, coalesce(p_reason, 'No reason provided'), v_admin, p_until)
    returning id into v_ban_id;

    v_flags := jsonb_set(v_flags, '{banned}', 'true')
    || jsonb_build_object('ban', jsonb_build_object(
         'active', true,
         'reason', coalesce(p_reason, 'No reason provided'),
         'at', now(),
         'until', p_until
       ));

    update public.profiles
    set feature_flags = v_flags,
        session_token = null,
        active_device_id = null,
        updated_at = now()
    where id = p_target;

    insert into public.admin_grants (
      grant_type, target_user_id, actor_admin_id,
      reason, note, before_state, after_state, metadata
    ) values (
      'ban', p_target, v_admin,
      p_reason, p_note,
      jsonb_build_object('feature_flags', v_flags),
      jsonb_build_object('banned', true),
      jsonb_build_object('ban_id', v_ban_id, 'until', p_until)
    );

    return jsonb_build_object('banned', true, 'ban_id', v_ban_id);
  else
    update public.user_bans
    set active = false, lifted_at = now(), lifted_by = v_admin
    where user_id = p_target and active;

    v_flags := jsonb_set(v_flags, '{banned}', 'false');
    v_flags := jsonb_set(v_flags, '{ban,active}', 'false');
    v_flags := jsonb_set(v_flags, '{ban,lifted_at}', to_jsonb(now()));

    update public.profiles
    set feature_flags = v_flags, updated_at = now()
    where id = p_target;

    insert into public.admin_grants (
      grant_type, target_user_id, actor_admin_id,
      reason, note, before_state, after_state
    ) values (
      'unban', p_target, v_admin,
      p_reason, p_note,
      jsonb_build_object('banned', true),
      jsonb_build_object('banned', false)
    );

    return jsonb_build_object('banned', false);
  end if;
end;
$$;

-- ── 7. send_notification ───────────────────────────────────────────────
-- Batch insert with server-side personalization; one admin_grants row
-- per campaign. p_targets is a JSON array of profile uuids.
create or replace function public.send_notification(
  p_targets       jsonb,
  p_title         text,
  p_body          text,
  p_category      text default 'general',
  p_channel       text default 'in_app',
  p_action_label  text default null,
  p_action_url    text default null,
  p_scheduled_at  timestamptz default null,
  p_note          text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin      uuid := auth.uid();
  v_campaign   uuid := gen_random_uuid();
  v_count      int;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception 'invalid_targets';
  end if;

  insert into public.notifications (
    campaign_id, user_id, title, body, category, channel,
    action_label, action_url, status, scheduled_at, sent_at, created_by
  )
  select
    v_campaign,
    prof.id,
    replace(replace(p_title,  '{{name}}',  coalesce(prof.display_name, prof.username, 'there')),
            '{{email}}', coalesce(prof.emails, '')),
    replace(replace(p_body,   '{{name}}',  coalesce(prof.display_name, prof.username, 'there')),
            '{{email}}', coalesce(prof.emails, '')),
    coalesce(p_category, 'general'),
    coalesce(p_channel, 'in_app'),
    p_action_label,
    p_action_url,
    case when p_scheduled_at is null then 'sent' else 'scheduled' end,
    p_scheduled_at,
    case when p_scheduled_at is null then now() else null end,
    v_admin
  from public.profiles prof
  join jsonb_array_elements_text(p_targets) t(uid)
    on prof.id = t.uid::uuid;

  get diagnostics v_count = row_count;

  insert into public.admin_grants (
    grant_type, target_user_id, actor_admin_id,
    reason, note, metadata
  ) values (
    'notification', v_admin, v_admin,   -- self-row marks the campaign actor
    p_note, p_note,
    jsonb_build_object(
      'campaign_id', v_campaign,
      'recipients', v_count,
      'category', p_category,
      'channel', p_channel,
      'scheduled_at', p_scheduled_at
    )
  );

  return jsonb_build_object('campaign_id', v_campaign, 'count', v_count);
end;
$$;

-- RPCs are admin-only: lock down execute rights.
revoke execute on function public.adjust_flux_balance(uuid, text, int, text, text) from public, anon;
revoke execute on function public.set_subscription(uuid, text, text, text, int, text) from public, anon;
revoke execute on function public.set_user_ban(uuid, boolean, text, timestamptz, text) from public, anon;
revoke execute on function public.send_notification(jsonb, text, text, text, text, text, text, timestamptz, text) from public, anon;
grant execute on function public.adjust_flux_balance(uuid, text, int, text, text) to authenticated;
grant execute on function public.set_subscription(uuid, text, text, text, int, text) to authenticated;
grant execute on function public.set_user_ban(uuid, boolean, text, timestamptz, text) to authenticated;
grant execute on function public.send_notification(jsonb, text, text, text, text, text, text, timestamptz, text) to authenticated;

-- ── 8. One-time backfill: bans previously stored in feature_flags ─────
insert into public.user_bans (user_id, reason, banned_by, banned_at, until, active)
select
  p.id,
  coalesce(p.feature_flags #>> '{ban,reason}', 'Migrated from feature_flags'),
  null,
  coalesce(nullif(p.feature_flags #>> '{ban,at}', '')::timestamptz, now()),
  nullif(p.feature_flags #>> '{ban,until}', '')::timestamptz,
  true
from public.profiles p
where coalesce(p.feature_flags ->> 'banned', 'false')::boolean
  and not exists (
    select 1 from public.user_bans b where b.user_id = p.id and b.active
  )
on conflict do nothing;

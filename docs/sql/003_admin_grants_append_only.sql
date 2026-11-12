-- ═══════════════════════════════════════════════════════════════════════
-- 003_admin_grants_append_only.sql
--
-- Makes admin_grants a true append-only audit log:
--   1. Drops any UPDATE / DELETE policies on admin_grants — admins keep
--      SELECT + INSERT only (those two are owned by 002). Audit rows can
--      no longer be edited or erased through the API.
--   2. Restricts `type` to the known action values for NEW rows (NOT VALID
--      — existing rows are not re-checked, so this cannot fail on data).
--
-- Safe to re-run. Run in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 0. Make sure RLS is on (idempotent) ────────────────────────────────
alter table public.admin_grants enable row level security;

-- ── 1. Append-only: drop any UPDATE / DELETE policies ──────────────────
do $$
declare
  r record;
begin
  for r in
    select policy_name
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'admin_grants'
      and cmd in ('UPDATE', 'DELETE')
  loop
    execute format('drop policy if exists %I on public.admin_grants', r.policy_name);
    raise notice 'dropped policy % (%)', r.policy_name, r.cmd;
  end loop;
end $$;

-- Without UPDATE/DELETE policies, RLS blocks every UPDATE/DELETE from
-- authenticated clients — the table is append-only. (Service role and
-- table owner bypass RLS by design.)

-- ── 2. Known type values only (enforced for new rows) ──────────────────
alter table public.admin_grants drop constraint if exists admin_grants_type_check;
alter table public.admin_grants
  add constraint admin_grants_type_check check (type in (
    'credit_add', 'credit_deduct', 'credit_set',
    'subscription_grant', 'subscription_extend', 'subscription_revoke',
    'ban', 'unban', 'session_revoke', 'device_reset', 'notification'
  )) not valid;

-- ── 3. Verify ───────────────────────────────────────────────────────────
-- Remaining policies (expect only the 002 read/insert pair):
--   select policy_name, cmd from pg_policies where tablename = 'admin_grants';
-- Constraint present:
--   select conname from pg_constraint
--   where conrelid = 'public.admin_grants'::regclass and contype = 'c';

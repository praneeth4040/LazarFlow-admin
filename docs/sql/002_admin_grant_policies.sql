-- ═══════════════════════════════════════════════════════════════════════
-- 002_admin_grant_policies.sql
--
-- The admin_grants / notifications tables exist (built 2026-10-30) with RLS
-- enabled, but no INSERT policy — verified: an authenticated admin gets 403
-- on insert. This adds the missing policies so the admin dashboard can log
-- grants and send notifications.
--
-- Run in the Supabase SQL editor. Safe to re-run (drops + recreates).
-- ═══════════════════════════════════════════════════════════════════════

-- Admin helper (used by the policies below). No-op if it already exists.
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

-- ── admin_grants: admins read + insert (append-only, no update/delete) ──
drop policy if exists admin_grants_admin_read on public.admin_grants;
create policy admin_grants_admin_read
  on public.admin_grants for select to authenticated
  using (public.is_admin());

drop policy if exists admin_grants_admin_insert on public.admin_grants;
create policy admin_grants_admin_insert
  on public.admin_grants for insert to authenticated
  with check (public.is_admin());

-- ── notifications: admins read/insert; users read + update their own ───
drop policy if exists notifications_admin_read on public.notifications;
create policy notifications_admin_read
  on public.notifications for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

drop policy if exists notifications_admin_insert on public.notifications;
create policy notifications_admin_insert
  on public.notifications for insert to authenticated
  with check (public.is_admin());

drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update
  on public.notifications for update to authenticated
  using (public.is_admin() or user_id = auth.uid())
  with check (public.is_admin() or user_id = auth.uid());

# Users Admin — Backend Specification

Status: **frontend shipped, backend pending**
Last updated: 2026-10-25

The Users workspace (`src/components/views/UsersView.jsx`) is fully interactive against the
current schema. Four capabilities need backend work before they are production-safe:

| Capability | Current implementation | Backend needed |
| --- | --- | --- |
| Adjust credits | Writes `profiles.flux_balance` directly | `flux_ledger` + atomic RPC |
| Grant / revoke subscription | Writes `profiles.subscription_*` directly | `plans` + `subscriptions` + RPC |
| Ban / unban | Writes `profiles.feature_flags` and clears session | `user_bans` + auth enforcement |
| In-app notifications | `notifications` if present, otherwise browser outbox | `notifications` + delivery worker |
| Audit trail | Session-only toast log | `admin_audit_logs` |

Until these land, the UI degrades gracefully and labels anything that is not persisted.

---

## 1. Security baseline (do this first)

The admin app runs in the browser with the **anon key**. At the last audit that key had full
read/write access to every `public` table, so any visitor to the admin bundle can call the
REST API directly. None of the admin mutations below are safe until this changes.

Recommended model:

1. Keep the anon key for public reads only.
2. Sign admins in through Supabase Auth and require an `is_admin` claim (or a row in
   `admin_users`).
3. Move every write into a `SECURITY DEFINER` RPC that checks `auth.uid()` against the admin
   list and rejects everyone else.
4. Enable RLS on all `public` tables. Default deny. Add explicit policies for user-owned
   reads (`user_id = auth.uid()`), and let admins read through RLS using an
   `is_admin(auth.uid())` helper.
5. Never expose `service_role` in the frontend.

```sql
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and is_admin = true
  );
$$;
```

Every RPC in this document should start with:

```sql
if not public.is_admin() then
  raise exception 'not_authorized' using errcode = '42501';
end if;
```

### Admin roles (recommended)

A single `is_admin` boolean will not survive a support team. Add roles now so the UI can hide
dangerous actions later.

```sql
create table public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'support', 'analyst')),
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now()
);
```

| Role | Users | Credits | Subscriptions | Bans | Notifications | Audit log |
| --- | --- | --- | --- | --- | --- | --- |
| owner | full | full | full | full | full | read |
| admin | full | full | full | full | full | read |
| support | read | add ≤ 100 | extend only | read | send 1:1 | own actions |
| analyst | read | read | read | read | read | read |

`profiles.is_admin` can remain as a compatibility flag while `admin_roles` is rolled out.

---

## 2. Credits — `flux_ledger`

`profiles.flux_balance` is the source of truth today, but there is no history. The UI already
looks for a `flux_ledger` table and falls back to a session-only list when it is absent.

```sql
create table public.flux_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  note text,
  source text not null default 'admin'
    check (source in ('admin', 'purchase', 'subscription', 'ai_job', 'refund', 'promo', 'migration')),
  reference_id text,                       -- payment id, job id, campaign id…
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index flux_ledger_user_created_idx on public.flux_ledger (user_id, created_at desc);
create index flux_ledger_created_idx on public.flux_ledger (created_at desc);
```

### Atomic adjustment RPC

Direct `UPDATE profiles SET flux_balance = …` from the browser loses concurrent writes. Replace
it with a locked read-modify-write:

```sql
create or replace function public.adjust_flux_balance(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_note text default null,
  p_source text default 'admin',
  p_reference_id text default null
)
returns table (balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select flux_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_balance + p_delta < 0 then
    raise exception 'insufficient_balance' using errcode = '22003';
  end if;

  update public.profiles
  set flux_balance = v_balance + p_delta,
      updated_at = now()
  where id = p_user_id;

  insert into public.flux_ledger
    (user_id, delta, balance_after, reason, note, source, reference_id, created_by)
  values
    (p_user_id, p_delta, v_balance + p_delta, p_reason, p_note, p_source, p_reference_id, auth.uid());

  insert into public.admin_audit_logs
    (actor_id, action, target_type, target_id, before, after, note)
  values
    (auth.uid(), 'credits.adjust', 'profile', p_user_id,
     jsonb_build_object('flux_balance', v_balance),
     jsonb_build_object('flux_balance', v_balance + p_delta),
     coalesce(p_note, p_reason));

  return query select v_balance + p_delta;
end;
$$;
```

For "set exact balance", the frontend should compute the delta from the current balance and call
the same RPC, or pass `p_delta` and let the RPC reject negatives.

Frontend contract: the UI reads `id, user_id, delta, balance_after, reason, note, created_at`.
Adding `source`, `reference_id`, `created_by` is backwards compatible.

---

## 3. Subscriptions — `plans` and `subscriptions`

Today a plan is three loose columns on `profiles`:

- `subscription_tier` — `free`, `daily`, `weekly`, `monthly`
- `subscription_status` — `inactive`, `active`, `trialing`, `canceled`, `past_due`
- `subscription_expires_at` — timestamp

There is no plan catalog, no price, and no record of who granted what. Payments store a
free-form `tier` string (`sub_daily`, `sub_monthly`, …) with no FK.

### Plan catalog

```sql
create table public.plans (
  id text primary key,                     -- 'daily', 'weekly', 'monthly'
  name text not null,
  description text,
  price_inr numeric(10,2) not null default 0,
  duration_days integer not null check (duration_days > 0),
  flux_credits integer not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Seed rows should be derived from `payments.amount` / `payments.tier` before hard-coding prices.
The UI deliberately does not display a price until this table exists.

### Subscription records

```sql
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  source text not null default 'admin'
    check (source in ('razorpay', 'admin', 'promo', 'migration')),
  gateway_subscription_id text,
  granted_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_idx on public.subscriptions (user_id, created_at desc);
create unique index subscriptions_one_live_idx
  on public.subscriptions (user_id)
  where status in ('active', 'trialing');
```

`profiles.subscription_*` stays as a denormalised cache for the mobile app. The RPC writes both
so existing clients keep working.

### Grant / extend / revoke RPC

```sql
create or replace function public.grant_subscription(
  p_user_id uuid,
  p_plan_id text,
  p_days integer default null,
  p_status text default 'active',
  p_note text default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans;
  v_days integer;
  v_base timestamptz;
  v_row public.subscriptions;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  v_days := coalesce(p_days, v_plan.duration_days);

  select greatest(coalesce(subscription_expires_at, now()), now())
    into v_base
  from public.profiles
  where id = p_user_id;

  insert into public.subscriptions
    (user_id, plan_id, status, current_period_end, source, granted_by, note)
  values
    (p_user_id, p_plan_id, p_status, v_base + make_interval(days => v_days),
     'admin', auth.uid(), p_note)
  returning * into v_row;

  update public.profiles
  set subscription_tier = p_plan_id,
      subscription_status = p_status,
      subscription_expires_at = v_base + make_interval(days => v_days),
      updated_at = now()
  where id = p_user_id;

  if v_plan.flux_credits > 0 then
    perform public.adjust_flux_balance(
      p_user_id, v_plan.flux_credits, 'Plan grant: ' || v_plan.name,
      p_note, 'subscription', v_row.id::text
    );
  end if;

  insert into public.admin_audit_logs
    (actor_id, action, target_type, target_id, after, note)
  values
    (auth.uid(), 'subscription.grant', 'profile', p_user_id, to_jsonb(v_row), p_note);

  return v_row;
end;
$$;
```

```sql
create or replace function public.revoke_subscription(
  p_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.subscriptions
  set status = 'canceled', canceled_at = now(), ended_at = now(), updated_at = now()
  where user_id = p_user_id and status in ('active', 'trialing');

  update public.profiles
  set subscription_tier = 'free',
      subscription_status = 'inactive',
      subscription_expires_at = null,
      updated_at = now()
  where id = p_user_id;

  insert into public.admin_audit_logs
    (actor_id, action, target_type, target_id, note)
  values (auth.uid(), 'subscription.revoke', 'profile', p_user_id, p_reason);
end;
$$;
```

Renewal/expiry: add a scheduled job (pg_cron or an edge function) that flips
`active → expired` when `current_period_end < now()` and mirrors the change to `profiles`.
Do not rely on the client to reconcile.

Frontend contract: `subscription_tier`, `subscription_status`, `subscription_expires_at` remain
read from `profiles`. The plan catalog is optional; when present, replace the hard-coded
`GRANT_PLANS` list in `usersUtils.js`.

---

## 4. Bans — `user_bans`

The frontend currently writes:

```json
{
  "banned": true,
  "ban": {
    "active": true,
    "reason": "Payment fraud",
    "at": "2026-10-25T10:00:00.000Z",
    "until": null,
    "by": "Admin Name"
  }
}
```

into `profiles.feature_flags`, and clears `session_token` + `active_device_id`. This is an
interim store only. It is **not enforced** by the mobile app or any API middleware.

```sql
create table public.user_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  scope text not null default 'full'
    check (scope in ('full', 'login', 'purchase', 'lobby_create', 'ai')),
  is_active boolean not null default true,
  banned_at timestamptz not null default now(),
  expires_at timestamptz,
  banned_by uuid references auth.users(id),
  lifted_at timestamptz,
  lifted_by uuid references auth.users(id),
  lift_reason text,
  created_at timestamptz not null default now()
);

create index user_bans_active_idx on public.user_bans (user_id) where is_active;
create unique index user_bans_one_active_idx on public.user_bans (user_id) where is_active;
```

```sql
create or replace function public.ban_user(
  p_user_id uuid,
  p_reason text,
  p_until timestamptz default null,
  p_scope text default 'full'
)
returns public.user_bans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_bans;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id and is_admin) then
    raise exception 'cannot_ban_admin' using errcode = '22023';
  end if;

  update public.user_bans
  set is_active = false, lifted_at = now(), lifted_by = auth.uid(), lift_reason = 'replaced'
  where user_id = p_user_id and is_active;

  insert into public.user_bans (user_id, reason, scope, expires_at, banned_by)
  values (p_user_id, p_reason, p_scope, p_until, auth.uid())
  returning * into v_row;

  update public.profiles
  set session_token = null,
      active_device_id = null,
      updated_at = now()
  where id = p_user_id;

  insert into public.admin_audit_logs
    (actor_id, action, target_type, target_id, after, note)
  values (auth.uid(), 'user.ban', 'profile', p_user_id, to_jsonb(v_row), p_reason);

  return v_row;
end;
$$;
```

`unban_user(p_user_id, p_reason)` flips `is_active`, stamps `lifted_*`, and writes an audit row.
A scheduled job clears expired bans (`expires_at < now()`).

### Enforcement checklist

- Middleware / edge function: reject authenticated requests when an active ban exists.
- Login: return a clear `account_suspended` error with the reason and expiry.
- Mobile app: read the ban state on launch and show a blocking screen.
- RLS: banned users can still read their own profile so the app can display the message.
- Do not delete data on ban; keep lobbies, credits and payment history.

---

## 5. Notifications — `notifications`

The composer targets an audience, personalises `{{name}}`, `{{email}}`, `{{plan}}`,
`{{credits}}`, `{{lobbies}}`, and can schedule. If the table is missing, entries go to
`localStorage` under `lazarflow_admin_notification_outbox_v1` and are labelled "backend pending".

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid,                          -- groups a send; null for 1:1
  title text not null,
  body text not null,
  category text not null default 'system'
    check (category in ('announcement', 'billing', 'product', 'system', 'security')),
  channel text not null default 'in_app'
    check (channel in ('in_app', 'push', 'email', 'whatsapp')),
  action_label text,
  action_url text,
  image_url text,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'sent'
    check (status in ('draft', 'scheduled', 'sent', 'failed', 'canceled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_scheduled_idx on public.notifications (scheduled_at)
  where status = 'scheduled';
```

Campaign metadata (audience, template, counts) belongs in a parent table so the outbox can show
one row per send:

```sql
create table public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'system',
  channel text not null default 'in_app',
  audience jsonb not null default '{}'::jsonb,   -- {type:'plan_paid', filters:{...}}
  action_label text,
  action_url text,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'canceled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipient_count integer not null default 0,
  read_count integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
```

The UI tolerates `campaign_id` being absent by grouping on
`title + created_at minute + category`. Once the parent table exists, join it for exact counts.

### Send RPC

`send_notification(p_campaign_id uuid, p_user_ids uuid[])` should:

1. Verify admin.
2. Insert one `notifications` row per recipient (batch insert, chunked).
3. Set `status = 'sent'`, `sent_at = now()` or leave `scheduled`.
4. Update `recipient_count`.
5. Write an `admin_audit_logs` row.
6. Enqueue push/email work if the channel is not `in_app`.

Personalisation must happen server-side for scheduled sends, because profile values can change
between scheduling and delivery. The frontend already sends the raw template plus tokens; move
`personalize()` into the RPC for production.

### Read receipts

```sql
create or replace function public.mark_notification_read(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_id and user_id = auth.uid();
$$;
```

### Preferences

```sql
create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  in_app boolean not null default true,
  push boolean not null default true,
  email boolean not null default false,
  whatsapp boolean not null default false,
  categories jsonb not null default '{}'::jsonb,  -- {"billing": true, "product": false}
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now()
);
```

The composer should disable a channel for users who opted out. Transactional categories
(`security`, `billing`) should not be mutable.

### Delivery worker

- Push: read `profiles.expo_push_token` / `fcm_token`, send via Expo/FCM, record failures.
- Email: queue to the transactional provider, respect bounce/complaint lists.
- WhatsApp: only with explicit opt-in and template approval.
- Retries: exponential backoff, max 3 attempts, store `last_error`.

Add a `notification_deliveries` table if per-channel status is needed:

```sql
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'delivered', 'failed', 'bounced')),
  provider_id text,
  attempts integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);
```

---

## 6. Audit log — `admin_audit_logs`

Every mutation in this document writes here. This is the difference between "we think support
refunded 500 credits" and "we know who did it".

```sql
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  actor_email text,
  action text not null,                    -- credits.adjust, subscription.grant, user.ban…
  target_type text not null,               -- profile, payment, campaign…
  target_id uuid,
  before jsonb,
  after jsonb,
  note text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_target_idx on public.admin_audit_logs (target_type, target_id);
create index admin_audit_logs_actor_idx on public.admin_audit_logs (actor_id, created_at desc);
```

Rules:

- Append-only. No `UPDATE` or `DELETE` policies for anyone.
- Admins can read; only the owner can export.
- Log the reason/note, not just the diff.
- Retention: keep at least 12 months, or per local regulation.

---

## 7. Supporting tables

### User notes (support context)

```sql
create table public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  pinned boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

The drawer has room for a "Notes" card; wire it once this table exists. Never put secrets or
payment credentials in notes.

### Billing history (refunds, invoices)

`payments` is missing refund and invoice fields. Add:

```sql
alter table public.payments
  add column if not exists plan_id text references public.plans(id),
  add column if not exists refunded_amount numeric(10,2) not null default 0,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reason text,
  add column if not exists invoice_id text,
  add column if not exists failure_reason text,
  add column if not exists updated_at timestamptz not null default now();
```

Also change `status` default from `captured` to `created` — the current default books revenue
for every abandoned order.

Webhook events should be stored idempotently:

```sql
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  gateway text not null,
  event_id text not null,
  event_type text not null,
  payment_id uuid references public.payments(id),
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (gateway, event_id)
);
```

---

## 8. Row Level Security

Minimum policies:

| Table | User | Admin |
| --- | --- | --- |
| `profiles` | select/update own row (never `is_admin`, `flux_balance`) | select all via `is_admin()` |
| `flux_ledger` | select own | select all |
| `subscriptions` | select own | select all |
| `notifications` | select/update `read_at` own | select all |
| `notification_preferences` | select/update own | select all |
| `user_bans` | select own active ban (for the block screen) | select all |
| `plans` | select active | select all |
| `admin_audit_logs` | none | select |
| `user_notes` | none | select |

Writes go through RPCs. Do not grant `INSERT`/`UPDATE` on money or ban tables to `anon` or
`authenticated`.

```sql
alter table public.flux_ledger enable row level security;

create policy flux_ledger_own_read on public.flux_ledger
  for select using (user_id = auth.uid() or public.is_admin());

create policy notifications_own_read on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());

create policy notifications_own_update on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

Note: a permissive `UPDATE` policy lets a user change `title`/`body`. Prefer a
`mark_notification_read` RPC and no direct `UPDATE` policy.

---

## 9. Migration from the interim state

1. **Snapshot** `profiles.feature_flags` before touching it.
2. Create `user_bans`, backfill one row per profile where `feature_flags->>'banned' = 'true'`
   or `feature_flags->'ban'->>'active' = 'true'`.
3. Create `flux_ledger` and seed an opening balance entry per user with a non-zero
   `flux_balance` (`delta = balance`, `balance_after = balance`, `reason = 'Opening balance'`,
   `source = 'migration'`).
4. Create `plans` from observed `payments.tier` / `profiles.subscription_tier` values, then
   backfill `subscriptions` from profiles where `subscription_tier <> 'free'`.
5. Create `notifications` and `notification_campaigns`. Local outbox entries cannot be migrated
   automatically; export the JSON from the browser if they matter.
6. Create `admin_audit_logs` before enabling any RPC.
7. Remove the `feature_flags` ban fallback from the frontend only after step 2 is verified.
8. Flip the frontend from direct `profiles` updates to RPC calls (`adjust_flux_balance`,
   `grant_subscription`, `revoke_subscription`, `ban_user`, `unban_user`,
   `send_notification`).

### Frontend switch points

| File | Current write | Replace with |
| --- | --- | --- |
| `UsersView.jsx` → `applyPatch` | `profiles.update` | RPCs |
| `UsersView.jsx` → `handleCredits` | `flux_balance` update | `adjust_flux_balance` |
| `UsersView.jsx` → `handleSubscription` | three profile columns | `grant_subscription` / `revoke_subscription` |
| `UsersView.jsx` → `handleBan` | `feature_flags` | `ban_user` |
| `UsersView.jsx` → `handleUnban` | `feature_flags` | `unban_user` |
| `UsersView.jsx` → `sendNotifications` | per-user insert | `send_notification` |
| `usersUtils.js` → `GRANT_PLANS` | hard-coded | `plans` table |

Reads are already column-scoped and can stay as-is.

---

## 10. Future admin needs (SaaS roadmap)

Ordered by impact for this product:

1. **Admin auth + RLS** — blocks everything else.
2. **Audit log** — required before giving anyone else access.
3. **Ledger + atomic balance RPC** — stops drift and double-spend.
4. **Plan catalog + subscription records** — enables pricing changes and refunds.
5. **Ban enforcement** — otherwise the button is cosmetic.
6. **Notification delivery + preferences** — turns the composer into a real channel.
7. **Support notes** — reduces repeated investigation.
8. **Refunds / invoices / webhook events** — finance and reconciliation.
9. **Cohort analytics** — retention, churn, ARPU, conversion by plan.
10. **Impersonation with consent** — "view as user" for support, fully audited, read-only by default.
11. **Data export / deletion** — GDPR/DPDP requests, with a queued job and audit trail.
12. **Feature flags** — replace the ad-hoc `feature_flags` usage with a real flag table.
13. **Rate limits / abuse signals** — device switches, multi-accounting, payment failures.
14. **Scheduled jobs dashboard** — expiry, dunning, notification retries.
15. **Approval workflow** — large credit grants and permanent bans require a second admin.

---

## 11. Frontend notes / known limits

- Credit history is session-only until `flux_ledger` exists; the drawer says so explicitly.
- Notifications fall back to `localStorage`; clearing browser data loses them.
- Ban state is visible only in the admin app until enforcement ships.
- Subscription prices are not displayed because there is no plan catalog.
- Bulk actions run in batches of 8 to avoid flooding the API; partial failures are reported.
- CSV export includes email, username, display name, phone, plan, status, credits, lobbies,
  join/last-activity dates, admin flag, ban flag, captured revenue, AI jobs and tokens.
  Cells that could be interpreted as spreadsheet formulas are prefixed with an apostrophe.
- The workspace never selects `session_token`, `whatsapp_*`, `expo_push_token`,
  `developer_profiles.password_hash` or API key hashes.

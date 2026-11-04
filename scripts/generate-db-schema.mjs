#!/usr/bin/env node
/**
 * Generates DATABASE_SCHEMA.md from the live Supabase project.
 *
 * Read-only: it fetches the PostgREST OpenAPI spec, row counts, one sample
 * batch per table (for jsonb key shapes) and, if an anon key is supplied,
 * compares anon vs service-role visibility to flag RLS gaps.
 *
 * Usage:
 *   node --env-file=../LazarFlow-backend/.env --env-file=.env \
 *     scripts/generate-db-schema.mjs
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional env: SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'DATABASE_SCHEMA.md')

const URL_BASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!URL_BASE || !SERVICE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Run with: node --env-file=../LazarFlow-backend/.env scripts/generate-db-schema.mjs')
  process.exit(1)
}

const projectRef = URL_BASE.replace(/^https?:\/\//, '').split('.')[0]
const today = new Date().toISOString().slice(0, 10)

/* ------------------------------------------------------------------ */
/* Hand-maintained metadata. Update here when tables are added.        */
/* ------------------------------------------------------------------ */

const DOMAIN_ORDER = [
  'Identity and Access',
  'Lobbies and Tournaments',
  'Teams and Strategy',
  'Themes',
  'OCR',
  'Billing',
  'Developer Platform',
  'Content and Comms',
  'Admin and Observability',
]

const TABLE_META = {
  profiles: {
    domain: 'Identity and Access',
    purpose: 'App user profile: identity, subscription state, flux balance, push/WhatsApp tokens, single-device session.',
    notes: [
      '1:1 with `auth.users` (271 / 271, no orphans).',
      '`feature_flags` is `{}` for every row — no feature-flag system is in use.',
      '`subscription_status` does not reconcile with `subscription_expires_at` (an expired row is still `active`).',
      'Holds secrets and PII: `session_token`, `whatsapp_*_token`, `expo_push_token`, `phone`, `emails`.',
      '`id` references `auth.users.id` logically, but there is no FK constraint.',
    ],
  },
  team_profiles: {
    domain: 'Identity and Access',
    purpose: 'Legacy/Firebase team-member accounts, separate from Supabase Auth.',
    notes: [
      'Used by the LazarTrack app; `firebase_uid` has no FK.',
      '`team_id` has no FK constraint, but both values match existing `teams.id` rows.',
    ],
  },
  lobbies: {
    domain: 'Lobbies and Tournaments',
    purpose: 'A tournament lobby created by an organizer.',
    notes: [
      '`share_id`, `is_public`, `selected_template_id`, `theme`, `theme_config` no longer exist (the old schema doc was wrong).',
      '`final_standings` is never populated (0 / 109).',
      '69 of 109 lobbies are stuck in `setup`; 37 "active" lobbies are older than 7 days.',
    ],
  },
  lobby_teams: {
    domain: 'Lobbies and Tournaments',
    purpose: 'Teams registered in a lobby, with members and computed points.',
    notes: [
      '`team_id` is always NULL (0 / 608) — lobby teams are not linked to the `teams` table.',
      'Average 0.9 members per team, so most teams have no roster.',
    ],
  },
  lobby_history: {
    domain: 'Lobbies and Tournaments',
    purpose: 'Immutable snapshot of a lobby (archive).',
    notes: ['`original_lobby_id` points at the live `lobbies` row.'],
  },
  lobby_team_history: {
    domain: 'Lobbies and Tournaments',
    purpose: 'Archived teams belonging to a `lobby_history` row.',
    notes: ['871 rows, no orphans.'],
  },
  tournament_teams: {
    domain: 'Lobbies and Tournaments',
    purpose: 'Duplicate mirror of `lobby_teams`.',
    notes: [
      '⚠ Dead table: identical 608 IDs, names and lobby IDs as `lobby_teams`.',
      '`id` is nullable and is not a primary key. No code reads or writes it — drop it or replace with a view.',
    ],
  },
  teams: {
    domain: 'Teams and Strategy',
    purpose: 'Persistent team entity (newer model).',
    notes: ['Only 2 rows. `owner_user_id` / `lobbies_played` no longer exist (old doc was wrong).'],
  },
  strategies: {
    domain: 'Teams and Strategy',
    purpose: 'Versioned team strategies (map / character).',
    notes: ['`created_by` → `team_profiles.id`, `team_id` → `teams.id`. Only 2 rows.'],
  },
  team_lobby_notifications: {
    domain: 'Teams and Strategy',
    purpose: 'Notifications delivered to a team about a lobby.',
    notes: [
      '3 rows, all `pending`; there is no delivery/attempt log.',
      'General push history now lives in `notifications` (Admin and Observability).',
    ],
  },
  themes: {
    domain: 'Themes',
    purpose: 'Scoreboard/render theme: image URL plus a mapping config used by the renderer.',
    notes: [
      '15 duplicate rows across 4 URL groups (8× Yellow Monster, 6× Green Goblin, 3× Pink Perls, 2× Demo).',
      'Statuses: 19 `verified`, 12 `pending`, 11 `rejected`, 5 `deleted` (soft-deleted rows still present).',
      'Only 20 of 47 have a complete 12-cell mapping.',
      '`user_id` has no FK constraint (`NULL` = community theme).',
    ],
  },
  ocr_jobs: {
    domain: 'OCR',
    purpose: 'OCR extraction job (lobby processing / result extraction).',
    notes: [
      '`lobby_id` is `text` with **no FK** — 88 jobs point at lobbies that no longer exist.',
      '`user_id` also has no FK constraint.',
      '`token_usage.cost_usd` is 0 on every successful job, so cost tracking is broken.',
      '41 of 202 jobs failed (79.7% success); most failures are upstream 5xx/401 from the OCR service.',
    ],
  },
  payments: {
    domain: 'Billing',
    purpose: 'User purchases (flux packs and subscriptions) via Razorpay.',
    notes: [
      '⚠ `status` defaults to `captured`. Any insert that omits `status` books revenue automatically.',
      '60 of 62 orders are stuck in `created` with no `gateway_payment_id`; only 2 were captured (₹3 lifetime).',
      'No `updated_at`, failure reason, refund, invoice or plan reference.',
      '`tier` is a free-form string, not an FK to a plan catalog.',
      '`user_id` has no FK constraint.',
    ],
  },
  payments_teams: {
    domain: 'Billing',
    purpose: 'Team-tier purchases (parallel to `payments`).',
    notes: ['Empty. No code in any repo uses it.'],
  },
  developer_payments: {
    domain: 'Billing',
    purpose: 'Developer flux purchases.',
    notes: ['Empty. No code in any repo uses it.'],
  },
  developer_profiles: {
    domain: 'Developer Platform',
    purpose: 'Developer portal accounts, with a separate login from app users.',
    notes: [
      '⚠ Stores `password_hash` (bcrypt) directly instead of delegating to Supabase Auth.',
      '`user_id` is nullable and not linked to `profiles`; only 1 row.',
    ],
  },
  api_keys: {
    domain: 'Developer Platform',
    purpose: 'Hashed developer API keys with scopes and a per-key rate limit.',
    notes: [
      '⚠ `key_hash` and `key_hint` are readable with the anon key.',
      '2 rows (1 active, 1 revoked). There is no `expires_at` column.',
      '`developer_id` has no FK constraint to `developer_profiles`.',
    ],
  },
  api_usage_logs: {
    domain: 'Developer Platform',
    purpose: 'Per-request usage log for developer API keys.',
    notes: [
      '`id` is a bigint identity column.',
      '3 rows, all `GET /v1/health` from 127.0.0.1 — the developer platform is scaffolding, not in use.',
    ],
  },
  game_entities: {
    domain: 'Content and Comms',
    purpose: 'Game catalog (characters, pets, maps) used by LazarTrack.',
    notes: [
      '94 rows: 65 characters, 24 pets, 5 maps.',
      '`source_id` is a free-form text key (numeric IDs for characters/pets, `map_*` for maps), not an FK.',
    ],
  },
  chat_messages: {
    domain: 'Content and Comms',
    purpose: 'WhatsApp chat history.',
    notes: ['Empty.'],
  },
  reports: {
    domain: 'Content and Comms',
    purpose: 'User-submitted team reports.',
    notes: ['Empty. Team-oriented; not a general support/ticket queue.'],
  },
  beta_signups: {
    domain: 'Content and Comms',
    purpose: 'Waitlist email addresses.',
    notes: ['2 rows. No status, source or notes columns.'],
  },
  notifications: {
    domain: 'Admin and Observability',
    purpose: 'Push-notification ledger: one row per Expo push delivered to a user.',
    notes: [
      'RLS: users read their own rows; admins read AND write everything (FOR ALL policy, 2026-10-31).',
      'Created 2026-10-30 — not yet written by any code; the send endpoints gain recording in a follow-up step.',
      'Broadcast recording needs the route to fetch user ids alongside tokens (`get_all_user_tokens` returns tokens only).',
    ],
  },
  logs: {
    domain: 'Admin and Observability',
    purpose: 'Structured backend event feed for the admin (event/route/outcome/reason/status_code mirror the request log extras).',
    notes: [
      'RLS: admin-only reads AND admin-only writes (FOR ALL policy, 2026-10-31) — user accepted that admins can edit/delete audit rows; the backend sink writes via service role.',
      'Created 2026-10-30 — sink wired 2026-10-31: policy-filtered log events batch-inserted by `service/admin_log.py`.',
      '`user_id` / `target_user_id` are `ON DELETE SET NULL` so the audit trail survives user deletion.',
    ],
  },
  admin_grants: {
    domain: 'Admin and Observability',
    purpose: 'Ledger of admin-granted subscriptions and flux credits (who got what, from whom, why, balance after).',
    notes: [
      'RLS: recipients read their own grants; admins read AND write everything (FOR ALL policy, 2026-10-31).',
      'Created 2026-10-30 — not yet written by code; the admin grant action will record here.',
      'Covers manual grants only — automated flux deductions still have no ledger.',
    ],
  },
}

const MISSING_TABLES = [
  ['subscriptions', 'Subscription history, renewals, cancellations. Today only `profiles.subscription_*` exists.'],
  ['plans / prices', 'A plan catalog. `payments.tier` is a free-form string (11 distinct values for 62 orders).'],
  ['flux_ledger', 'Immutable credit/debit ledger. `profiles.flux_balance` is a mutable integer with no history; `admin_grants` (2026-10-30) covers admin-granted credits only.'],
  ['audit_logs (full)', '`logs` (2026-10-30) records backend events going forward; refunds and role-change actions are not yet recorded anywhere.'],
  ['support_tickets', 'A real support queue. `reports` is empty and team-oriented.'],
  ['refunds', 'Refunds/disputes against `payments`.'],
  ['webhook_events', 'Razorpay webhook log for replay and debugging.'],
  ['invoices', 'Invoice/receipt records.'],
  ['feature_flags', 'Global flags. `profiles.feature_flags` exists but is `{}` for all rows.'],
  ['admin_users / roles', 'Roles beyond the single `profiles.is_admin` boolean.'],
]

/* ------------------------------------------------------------------ */
/* Fetch                                                               */
/* ------------------------------------------------------------------ */

const svcHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }

async function rest(p, headers = {}) {
  const res = await fetch(URL_BASE + p, { headers: { ...svcHeaders, ...headers } })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, ok: res.ok, headers: res.headers, body }
}

const spec = await rest('/rest/v1/')
if (!spec.ok) {
  console.error(`Could not read the OpenAPI spec (${spec.status}):`, spec.body)
  process.exit(1)
}

const definitions = spec.body.definitions || {}
const rpcs = Object.keys(spec.body.paths || {})
  .filter(p => p.startsWith('/rpc/'))
  .map(p => p.slice(5))
  .sort()

const tables = Object.keys(definitions).sort()

const normalizeType = (p) => {
  if (!p) return 'unknown'
  if (p.format === 'jsonb') return 'jsonb'
  if (p.type === 'string' && p.format === 'uuid') return 'uuid'
  if (p.type === 'string' && p.format === 'character varying') return 'varchar'
  if (p.type === 'string' && p.format === 'text') return 'text'
  if (p.type === 'integer' && p.format === 'bigint') return 'bigint'
  if (p.type === 'integer' && p.format === 'integer') return 'integer'
  if (p.type === 'number' && p.format === 'numeric') return 'numeric'
  if (p.type === 'string' && p.format === 'timestamp with time zone') return 'timestamptz'
  if (p.type === 'string' && p.format === 'date') return 'date'
  if (p.type === 'boolean') return 'boolean'
  if (p.type === 'object' || p.type === 'array') return p.format || p.type
  return p.format ? `${p.type}(${p.format})` : (p.type || 'unknown')
}

const parseFk = (desc) => {
  const m = /table='([^']+)' column='([^']+)'/.exec(desc || '')
  return m ? { table: m[1], column: m[2] } : null
}

// Counts + jsonb key inventory
const stats = {}
for (const name of tables) {
  const countRes = await rest(`/rest/v1/${name}?select=*&limit=0`, { Prefer: 'count=exact' })
  const range = countRes.headers.get('content-range')
  const count = range ? Number(range.split('/')[1]) : null

  const sampleRes = await rest(`/rest/v1/${name}?select=*&limit=25`)
  const rows = Array.isArray(sampleRes.body) ? sampleRes.body : []
  const jsonbKeys = {}
  for (const col of Object.keys(definitions[name].properties || {})) {
    const prop = definitions[name].properties[col]
    if (prop.format !== 'jsonb' && prop.type !== 'object') continue
    const keys = new Set()
    let empty = 0
    const arrayLengths = []
    for (const row of rows) {
      const v = row[col]
      if (Array.isArray(v)) {
        arrayLengths.push(v.length)
      } else if (v && typeof v === 'object') {
        const ks = Object.keys(v)
        if (!ks.length) empty++
        ks.forEach(k => keys.add(k))
      }
    }
    jsonbKeys[col] = { keys: [...keys].sort(), empty, sampled: rows.length, arrayLengths }
  }

  stats[name] = { count, jsonbKeys }
}

// Optional: anon visibility comparison
let anonExposure = null
if (ANON) {
  anonExposure = []
  for (const name of tables) {
    const res = await fetch(`${URL_BASE}/rest/v1/${name}?select=*&limit=0`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Prefer: 'count=exact' },
    })
    const range = res.headers.get('content-range')
    anonExposure.push({
      table: name,
      anonStatus: res.status,
      anonCount: range ? Number(range.split('/')[1]) : null,
    })
  }
}

const bucketsRes = await rest('/storage/v1/bucket')
const buckets = Array.isArray(bucketsRes.body) ? bucketsRes.body : []

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

const SENSITIVE = /token|secret|password|hash|hint|phone|email|fcm/i
// Columns whose names look sensitive but are not secrets.
const NOT_SENSITIVE = new Set(['token_usage'])
const isSensitive = (col) => !NOT_SENSITIVE.has(col) && SENSITIVE.test(col)
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const code = (s) => (s === null || s === undefined || s === '' ? '—' : '`' + esc(s) + '`')
const pad = (n) => (n === null || n === undefined ? '?' : n.toLocaleString('en-US'))
// GitHub-style heading anchor: drop backticks/punctuation (keep _ and -), spaces -> -
const slug = (s) => String(s).toLowerCase().replace(/`/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')

const byDomain = new Map(DOMAIN_ORDER.map(d => [d, []]))
for (const name of tables) {
  const meta = TABLE_META[name]
  const domain = meta?.domain && byDomain.has(meta.domain) ? meta.domain : 'Uncategorized'
  if (!byDomain.has(domain)) byDomain.set(domain, [])
  byDomain.get(domain).push(name)
}

const totalRows = tables.reduce((a, t) => a + (stats[t].count || 0), 0)

const L = []
const add = (...lines) => L.push(...lines)

add(
  '# LazarFlow — Database Schema Reference',
  '',
  `> **Generated file.** Last generated **${today}** from project \`${projectRef}\`.`,
  '> Regenerate with `node --env-file=../LazarFlow-backend/.env --env-file=.env scripts/generate-db-schema.mjs`.',
  '> Edit `scripts/generate-db-schema.mjs` (the `TABLE_META` map), not this file directly.',
  '',
  '## Contents',
  '',
  '- [Security warning](#security-warning)',
  '- [Overview](#overview)',
  '- [Entity relationships](#entity-relationships)',
  ...DOMAIN_ORDER.map(d => `- [${d}](#${slug(d)})`),
  '- [RPC functions](#rpc-functions)',
  '- [Storage buckets](#storage-buckets)',
  '- [Known gaps](#known-gaps)',
  '- [Drift from the old `databaseSchema.md`](#drift-from-the-old-databaseschemamd)',
  '- [How this file was generated](#how-this-file-was-generated)',
  '',
  '## Security warning',
  '',
  'The admin app uses the **anon key in the browser**. At the time of the last audit, the anon key had',
  'full `SELECT` / `INSERT` / `UPDATE` access to every table in `public` — RLS was either disabled or',
  'permissive. Treat every table below as public until proven otherwise.',
  '',
  'Consequences:',
  '',
  '- `profiles.session_token`, `whatsapp_access_token`, `whatsapp_refresh_token`, `developer_profiles.password_hash`,',
  '  `api_keys.key_hash` / `key_hint`, `expo_push_token`, `phone`, `emails` and `payments.gateway_order_id` are readable.',
  '- Anyone can `UPDATE profiles.is_admin`, `payments.status`, `themes.status`, `api_keys.name`, `developer_profiles.status`.',
  '- Admin screens must not rely on the anon key for authorization. Move admin reads/writes behind the backend or an Edge Function.',
  '',
)

if (anonExposure) {
  const readable = anonExposure.filter(r => r.anonStatus === 200 || r.anonStatus === 206)
  const full = readable.filter(r => r.anonCount !== null && r.anonCount === stats[r.table].count)
  add(
    `**Live check (${today}):** the anon key can read **${readable.length} / ${tables.length}** tables;`,
    `${full.length} of those return the exact same row count as the service role.`,
    '',
  )
  if (readable.length) {
    add('| Table | Anon status | Anon rows | Service rows | Verdict |', '| --- | ---: | ---: | ---: | --- |')
    for (const r of readable) {
      const svc = stats[r.table].count
      const verdict = r.anonCount === svc ? '**full read**' : 'partial read'
      add(`| \`${r.table}\` | ${r.anonStatus} | ${pad(r.anonCount)} | ${pad(svc)} | ${verdict} |`)
    }
    add('')
  }
  const denied = anonExposure.filter(r => !(r.anonStatus === 200 || r.anonStatus === 206))
  if (denied.length) {
    add('Tables the anon key could not read:', '', denied.map(r => `\`${r.table}\` (${r.anonStatus})`).join(', '), '')
  }
  add('> This check only covers reads. Write access (INSERT/UPDATE/DELETE) must be tested separately.', '')
}

add(
  '## Overview',
  '',
  `**${tables.length} tables** in \`public\`, **${pad(totalRows)} rows** total, as of ${today}.`,
  '',
  '| Domain | Tables | Rows |',
  '| --- | ---: | ---: |',
)
for (const [domain, names] of byDomain) {
  if (!names.length) continue
  const rows = names.reduce((a, n) => a + (stats[n].count || 0), 0)
  add(`| ${domain} | ${names.length} | ${pad(rows)} |`)
}
add('')

add(
  '### Table index',
  '',
  '| Table | Rows | Domain | Purpose |',
  '| --- | ---: | --- | --- |',
)
for (const [domain, names] of byDomain) {
  for (const name of names) {
    add(`| [\`${name}\`](#${slug(name)}) | ${pad(stats[name].count)} | ${domain} | ${esc(TABLE_META[name]?.purpose || '—')} |`)
  }
}
add(
  '',
  '**Legend**',
  '',
  '- **Null** — `NOT NULL` or `NULL` (nullable).',
  '- **Default** — server-side default from PostgREST; `—` means no default was reported.',
  '- **PK (inferred)** — PostgREST does not expose keys, so `id` columns are marked as the likely primary key.',
  '- **FK** — foreign key parsed from the PostgREST column description.',
  '- ⚠ — sensitive (secret/PII) or a known correctness problem.',
  '',
  '> Primary keys, indexes, unique constraints, triggers and check constraints are **not** exposed by PostgREST.',
  '> To capture them, run the generator against a Postgres connection string (see the end of this file).',
  '',
)

/* ---------------- relationships ---------------- */

const edges = []
for (const name of tables) {
  for (const [col, prop] of Object.entries(definitions[name].properties || {})) {
    const fk = parseFk(prop.description)
    if (!fk) continue
    const nullable = !(definitions[name].required || []).includes(col)
    edges.push({ from: fk.table, to: name, col, refColumn: fk.column, nullable })
  }
}

add('## Entity relationships', '', '```mermaid', 'erDiagram')
for (const e of edges) {
  add(`  ${e.from} ${e.nullable ? '|o' : '||'}--o{ ${e.to} : "${e.col}"`)
}
add('```', '', 'Foreign keys:', '')
for (const e of edges) {
  add(`- \`${e.to}.${e.col}\` → \`${e.from}.${e.refColumn}\`${e.nullable ? ' _(nullable)_' : ''}`)
}
add('')

/* ---------------- tables ---------------- */

for (const [domain, names] of byDomain) {
  if (!names.length) continue
  add(`## ${domain}`, '')
  for (const name of names) {
    const def = definitions[name]
    const required = new Set(def.required || [])
    const meta = TABLE_META[name]
    add(`### \`${name}\``, '')
    add(`**Rows:** ${pad(stats[name].count)}`, '')
    if (meta?.purpose) add(meta.purpose, '')
    add('| Column | Type | Null | Default | Notes |', '| --- | --- | --- | --- | --- |')

    for (const [col, prop] of Object.entries(def.properties || {})) {
      const type = normalizeType(prop)
      const nullable = required.has(col) ? 'NOT NULL' : 'NULL'
      const fk = parseFk(prop.description)
      const notes = []
      const isIdentity = !fk && type === 'bigint' && !nullable.startsWith('NULL') && prop.default === undefined
      if (col === 'id' && !nullable.startsWith('NULL')) notes.push(isIdentity ? 'PK (inferred, identity)' : 'PK (inferred)')
      else if (isIdentity) notes.push('identity (inferred)')
      if (fk) notes.push(`FK → \`${fk.table}.${fk.column}\``)
      if (isSensitive(col)) notes.push('⚠ sensitive')
      const shape = stats[name].jsonbKeys[col]
      if (shape) {
        if (shape.arrayLengths?.length) {
          const lens = shape.arrayLengths
          const min = Math.min(...lens)
          const max = Math.max(...lens)
          notes.push(max === 0
            ? 'jsonb: empty `[]` in all sampled rows'
            : `jsonb array (${min === max ? min : `${min}–${max}`} items, ${lens.length} sampled)`)
        } else if (shape.keys.length) {
          notes.push(`jsonb keys: ${shape.keys.map(k => '`' + k + '`').join(', ')}`)
        } else if (shape.sampled && shape.empty === shape.sampled) {
          notes.push('jsonb: empty `{}` in all sampled rows')
        }
      }
      add(`| \`${col}\` | ${type} | ${nullable} | ${code(prop.default)} | ${notes.join('; ') || ''} |`)
    }
    add('')

    if (meta?.notes?.length) {
      add('**Notes**', '')
      for (const n of meta.notes) add(`- ${n}`)
      add('')
    }
  }
}

/* ---------------- rpcs / storage ---------------- */

add('## RPC functions', '')
if (rpcs.length) {
  add('| Function |', '| --- |')
  for (const fn of rpcs) add(`| \`${fn}\` |`)
  add('', '> All three are POST-accessible. `backfill_profiles_from_auth` is potentially mutating — verify its',
    '> `SECURITY DEFINER` settings and grants before exposing it.')
} else {
  add('_None exposed._')
}
add('')

add('## Storage buckets', '')
if (buckets.length) {
  add('| Bucket | Public | Size limit | Allowed MIME types |', '| --- | --- | --- | --- |')
  for (const b of buckets) {
    add(`| \`${b.id}\` | ${b.public ? 'yes' : 'no'} | ${b.file_size_limit ?? '—'} | ${b.allowed_mime_types?.join(', ') || '—'} |`)
  }
  add('', '> Every bucket is public. Anything uploaded is readable by URL without auth.')
} else {
  add('_None._')
}
add('')

/* ---------------- gaps / drift ---------------- */

add('## Known gaps', '')
add('Tables a SaaS admin portal needs that do **not** exist yet:', '')
add('| Missing | Why it matters |', '| --- | --- |')
for (const [t, why] of MISSING_TABLES) add(`| \`${t}\` | ${esc(why)} |`)
add(
  '',
  'Also referenced in code but missing from the database:',
  '',
  '- `public.ad_reward_progress` — used by `LazarFlow-backend/service/database_service/rewards.py`; ad rewards currently fail with `PGRST205`.',
  '',
)

add(
  '## Drift from the old `databaseSchema.md`',
  '',
  'The previous doc described 8 tables and is no longer accurate. Key differences:',
  '',
  '- 14 undocumented tables now exist: `payments`, `payments_teams`, `developer_profiles`, `developer_payments`,',
  '  `api_keys`, `api_usage_logs`, `game_entities`, `strategies`, `reports`, `beta_signups`, `tournament_teams`,',
  '  `lobby_team_history`, `team_lobby_notifications`.',
  '- `lobbies` lost `share_id`, `is_public`, `selected_template_id`, `theme`, `theme_config`.',
  '- `profiles.phone` is `bigint` (not an array); `flux_balance` is `integer`; added `active_device_id`,',
  '  `device_switch_count`, `device_switch_reset_at`, `session_token`.',
  '- `teams` lost `owner_user_id`, `lobbies_played`, `lobbies_count`.',
  '- `ocr_jobs.lobby_id` is `text` with no FK; `image_urls` is `jsonb`.',
  '',
)

add(
  '## How this file was generated',
  '',
  'The generator is read-only and uses the service-role key over PostgREST:',
  '',
  '```bash',
  'cd LazarFlow-admin',
  'node --env-file=../LazarFlow-backend/.env --env-file=.env \\',
  '  scripts/generate-db-schema.mjs',
  '```',
  '',
  'It reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (required) and `SUPABASE_ANON_KEY` /',
  '`VITE_SUPABASE_ANON_KEY` (optional, enables the live anon-exposure check).',
  '',
  '**What it cannot see** (PostgREST limitation): RLS policies, indexes, triggers, check/unique constraints,',
  'function bodies, grants, table ownership, storage policies. For those, run the equivalent queries over a',
  'Postgres connection string with `pg_catalog` / `information_schema`.',
  '',
  '### Verified against',
  '',
  `- Project: \`${projectRef}\``,
  `- Generated: ${today}`,
  `- Tables: ${tables.length} · Rows: ${pad(totalRows)}`,
  '',
)

fs.writeFileSync(OUT, L.join('\n'))
console.log(`Wrote ${path.relative(process.cwd(), OUT)} — ${tables.length} tables, ${pad(totalRows)} rows, ${edges.length} FKs.`)

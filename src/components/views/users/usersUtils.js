import { csvCell, relative, titleCase } from '../overviewUtils'

// Re-exported so the users modules keep a single import surface.
export { compactNumber, downloadCsv, lockBodyScroll } from '../overviewUtils'

// ── Plan catalog ───────────────────────────────────────────────────────────
// Tiers mirror the values currently used by payments.tier / profiles.subscription_tier.
// Prices are intentionally not hard-coded: the DB has no plan catalog yet.

export const PLAN_META = {
  free: { key: 'free', label: 'Free', tone: 'muted', days: null },
  daily: { key: 'daily', label: 'Daily', tone: 'info', days: 1 },
  weekly: { key: 'weekly', label: 'Weekly', tone: 'violet', days: 7 },
  monthly: { key: 'monthly', label: 'Monthly', tone: 'ok', days: 30 },
}

export const GRANT_PLANS = [
  { key: 'daily', label: 'Daily', days: 1 },
  { key: 'weekly', label: 'Weekly', days: 7 },
  { key: 'monthly', label: 'Monthly', days: 30 },
]

export const planMeta = (tier) => {
  const key = String(tier || 'free').toLowerCase()
  return PLAN_META[key] || { key, label: titleCase(key), tone: 'muted', days: null }
}

export const planLabel = (tier) => planMeta(tier).label

// ── Ban state ──────────────────────────────────────────────────────────────
// Until profiles.is_banned / user_bans exist, ban state is stored in the
// currently-unused profiles.feature_flags jsonb column.

export const isBanned = (profile) => {
  const flags = profile?.feature_flags
  if (!flags || typeof flags !== 'object') return false
  if (flags.banned === true) return true
  return flags.ban?.active === true
}

export const banMeta = (profile) => {
  const flags = profile?.feature_flags
  if (!flags || typeof flags !== 'object') return null
  return flags.ban && typeof flags.ban === 'object' ? flags.ban : null
}

// ── Subscription state ─────────────────────────────────────────────────────

export const subscriptionState = (profile, now = 0) => {
  const tier = String(profile?.subscription_tier || 'free').toLowerCase()
  const raw = String(profile?.subscription_status || 'inactive').toLowerCase()
  const expires = profile?.subscription_expires_at
    ? new Date(profile.subscription_expires_at)
    : null
  const expired = Boolean(
    expires && !Number.isNaN(expires.getTime()) && expires.getTime() < now,
  )

  if (isBanned(profile)) {
    return { key: 'banned', label: 'Banned', tone: 'danger', tier, expired }
  }

  if (raw === 'active') {
    return expired
      ? { key: 'expired', label: 'Expired', tone: 'warn', tier, expired }
      : { key: 'active', label: 'Active', tone: 'ok', tier, expired }
  }
  if (raw === 'trialing') {
    return expired
      ? { key: 'expired', label: 'Trial ended', tone: 'warn', tier, expired }
      : { key: 'trialing', label: 'Trial', tone: 'info', tier, expired }
  }
  if (raw === 'canceled') return { key: 'canceled', label: 'Canceled', tone: 'warn', tier, expired }
  if (raw === 'past_due') return { key: 'past_due', label: 'Past due', tone: 'danger', tier, expired }

  return {
    key: tier === 'free' ? 'free' : 'inactive',
    label: 'Inactive',
    tone: 'muted',
    tier,
    expired,
  }
}

export const daysLeft = (iso, now = Date.now()) => {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return Math.ceil((time - now) / 86_400_000)
}

export const addDays = (from, days) => {
  const base = from instanceof Date ? from : new Date(from)
  const date = new Date(base)
  date.setDate(date.getDate() + Number(days || 0))
  return date
}

// ── Display helpers ────────────────────────────────────────────────────────

export const displayEmail = (profile) => profile?.emails || 'No email'

export const displayName = (profile) => (
  profile?.display_name || profile?.username || displayEmail(profile)
)

export const displayHandle = (profile) => (
  profile?.username ? `@${profile.username}` : ''
)

export const initials = (profile) => {
  const source = profile?.display_name || profile?.username || profile?.emails || 'U'
  return source
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U'
}

const AVATAR_TONES = ['t0', 't1', 't2', 't3', 't4', 't5']

export const avatarTone = (seed = '') => {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

export const relativeTime = (iso, now) => (iso ? relative(iso, now) : '—')

export const formatDate = (iso, now) => {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('en-GB', sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
}

export const formatDateTime = (iso) => {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Row model ──────────────────────────────────────────────────────────────

const groupBy = (items, key) => {
  const map = new Map()
  for (const item of items || []) {
    const id = item?.[key]
    if (!id) continue
    if (!map.has(id)) map.set(id, [])
    map.get(id).push(item)
  }
  return map
}

const newestFirst = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)

export const buildUserRows = ({ profiles = [], lobbies = [], payments = [], jobs = [], now = Date.now() }) => {
  const lobbiesByUser = groupBy(lobbies, 'user_id')
  const paymentsByUser = groupBy(payments, 'user_id')
  const jobsByUser = groupBy(jobs, 'user_id')

  for (const list of lobbiesByUser.values()) list.sort(newestFirst)
  for (const list of paymentsByUser.values()) list.sort(newestFirst)
  for (const list of jobsByUser.values()) list.sort(newestFirst)

  return profiles.map((profile) => {
    const userLobbies = lobbiesByUser.get(profile.id) || []
    const userPayments = paymentsByUser.get(profile.id) || []
    const userJobs = jobsByUser.get(profile.id) || []

    const captured = userPayments.filter((payment) => payment.status === 'captured')
    const pending = userPayments.filter((payment) => payment.status !== 'captured')
    const capturedRevenue = captured.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
    const pendingRevenue = pending.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)

    const tokens = userJobs.reduce((sum, job) => {
      const usage = job.token_usage || {}
      return sum + (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0)
    }, 0)

    const latestLobby = userLobbies[0] || null
    const latestJob = userJobs[0] || null
    const latestPayment = userPayments[0] || null

    const lastActiveTs = Math.max(
      new Date(profile.updated_at || 0).getTime() || 0,
      new Date(profile.last_ad_watched_at || 0).getTime() || 0,
      new Date(latestLobby?.created_at || 0).getTime() || 0,
      new Date(latestJob?.created_at || 0).getTime() || 0,
    )

    const banned = isBanned(profile)
    const plan = planMeta(profile.subscription_tier)
    const sub = subscriptionState(profile, now)

    return {
      ...profile,
      plan,
      sub,
      banned,
      ban: banMeta(profile),
      balance: Number(profile.flux_balance) || 0,
      lobbyCount: userLobbies.length,
      activeLobbyCount: userLobbies.filter((lobby) => lobby.status === 'active').length,
      latestLobby,
      lobbyList: userLobbies,
      paymentList: userPayments,
      latestPayment,
      capturedRevenue,
      pendingRevenue,
      capturedCount: captured.length,
      pendingCount: pending.length,
      jobList: userJobs,
      latestJob,
      jobCount: userJobs.length,
      tokens,
      joinedTs: new Date(profile.created_at || 0).getTime() || 0,
      lastActiveTs,
      search: [
        profile.emails,
        profile.username,
        profile.display_name,
        profile.phone,
        profile.id,
        plan.label,
      ].filter(Boolean).join(' ').toLowerCase(),
    }
  })
}

// ── Filtering / sorting ────────────────────────────────────────────────────

export const DEFAULT_FILTERS = {
  plan: 'all',
  status: 'all',
  activity: 'all',
  joined: 'all',
  credits: 'all',
}

const ACTIVITY_WINDOW = {
  active7: 7 * 86_400_000,
  active30: 30 * 86_400_000,
  inactive30: 30 * 86_400_000,
}

export const filterRows = (rows, { query = '', filters = DEFAULT_FILTERS, now = Date.now() }) => {
  const needle = query.trim().toLowerCase()
  const weekAgo = now - ACTIVITY_WINDOW.active7
  const monthAgo = now - ACTIVITY_WINDOW.active30
  const monthStart = new Date(now)
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  return rows.filter((row) => {
    if (needle && !row.search.includes(needle)) return false

    if (filters.plan === 'free' && row.plan.key !== 'free') return false
    if (filters.plan === 'paid' && row.plan.key === 'free') return false
    if (filters.status === 'inactive') {
      if (!['inactive', 'free'].includes(row.sub.key)) return false
    } else if (filters.status !== 'all' && row.sub.key !== filters.status) {
      return false
    }

    if (filters.activity === 'active7' && row.lastActiveTs < weekAgo) return false
    if (filters.activity === 'active30' && row.lastActiveTs < monthAgo) return false
    if (filters.activity === 'inactive30' && row.lastActiveTs >= monthAgo) return false
    if (filters.activity === 'new' && row.joinedTs < monthAgo) return false

    if (filters.joined === '7d' && row.joinedTs < weekAgo) return false
    if (filters.joined === '30d' && row.joinedTs < monthAgo) return false
    if (filters.joined === 'month' && row.joinedTs < monthStart.getTime()) return false
    if (filters.joined === 'older' && row.joinedTs >= monthAgo) return false

    if (filters.credits === 'has' && row.balance <= 0) return false
    if (filters.credits === 'none' && row.balance > 0) return false

    return true
  })
}

export const sortRows = (rows, sort = { key: 'joined', dir: 'desc' }) => {
  const direction = sort.dir === 'asc' ? 1 : -1
  const sorted = [...rows]
  sorted.sort((a, b) => {
    switch (sort.key) {
      case 'user':
        return displayEmail(a).localeCompare(displayEmail(b)) * direction
      case 'plan':
        return a.plan.label.localeCompare(b.plan.label) * direction
      case 'credits':
        return (a.balance - b.balance) * direction
      case 'lobbies':
        return (a.lobbyCount - b.lobbyCount) * direction
      case 'lastActive':
        return (a.lastActiveTs - b.lastActiveTs) * direction
      case 'joined':
      default:
        return (a.joinedTs - b.joinedTs) * direction
    }
  })
  return sorted
}

// ── CSV export ─────────────────────────────────────────────────────────────

export const rowsToCsv = (rows, now = Date.now()) => {
  const header = [
    'Email', 'Username', 'Display name', 'Phone', 'Plan', 'Status',
    'Credits', 'Lobbies', 'Active lobbies', 'Joined', 'Last activity',
    'Admin', 'Banned', 'Captured revenue (INR)', 'AI jobs', 'Tokens',
  ]

  const lines = rows.map((row) => [
    row.emails || '',
    row.username || '',
    row.display_name || '',
    row.phone || '',
    row.plan.label,
    row.sub.label,
    row.balance,
    row.lobbyCount,
    row.activeLobbyCount,
    formatDate(row.created_at, now),
    row.lastActiveTs ? formatDate(new Date(row.lastActiveTs).toISOString(), now) : 'Never',
    row.is_admin ? 'Yes' : 'No',
    row.banned ? 'Yes' : 'No',
    row.capturedRevenue,
    row.jobCount,
    row.tokens,
  ].map(csvCell).join(','))

  return [header.join(','), ...lines].join('\n')
}

// ── Async helpers ──────────────────────────────────────────────────────────

export const runBatched = async (items, worker, size = 8) => {
  const results = []
  for (let index = 0; index < items.length; index += size) {
    const batch = items.slice(index, index + size)
    const settled = await Promise.all(batch.map((item) => worker(item)))
    results.push(...settled)
  }
  return results
}

// ── Notification helpers ───────────────────────────────────────────────────
// Matches the backend dispatcher (2026-10 rebuild): channels are 'in_app'
// and 'push' only; kind classification is set server-side; no scheduling.

export const NOTIFICATION_CHANNELS = [
  { key: 'in_app', label: 'In-app', enabled: true },
  { key: 'push', label: 'Push', enabled: true },
]

export const personalize = (template, row) => String(template || '')
  .replaceAll('{{name}}', row?.display_name || row?.username || 'there')
  .replaceAll('{{email}}', row?.emails || '')
  .replaceAll('{{plan}}', planLabel(row?.subscription_tier))
  .replaceAll('{{credits}}', (Number(row?.flux_balance) || 0).toLocaleString('en-IN'))
  .replaceAll('{{lobbies}}', String(row?.lobbyCount ?? row?.lobbies_created_count ?? 0))

// Group per-user notification rows into campaigns. Row shape is what
// push_service writes: { user_id, title, body, data: {campaign_id},
// source, sent_by, status, channel, kind, read_at, created_at }.
export const notificationCampaigns = (notifications = []) => {
  const map = new Map()
  for (const item of notifications) {
    const campaignId = item.data?.campaign_id
      || `${item.title}|${String(item.created_at || '').slice(0, 16)}`
    if (!map.has(campaignId)) {
      map.set(campaignId, {
        id: campaignId,
        title: item.title,
        body: item.body,
        channel: item.channel || 'in_app',
        status: item.status || 'delivered',
        created_at: item.created_at,
        created_by: item.sent_by,
        user_ids: [],
        read_count: 0,
      })
    }
    const campaign = map.get(campaignId)
    if (item.user_id) campaign.user_ids.push(item.user_id)
    if (item.read_at) campaign.read_count += 1
  }
  return [...map.values()].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
}

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Ban, Bell, CheckCircle2, Crown, Download, RefreshCcw,
  Search, Send, ShieldCheck, SlidersHorizontal, UserCheck, Users, UserX, X, Zap,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import UserTable from './users/UserTable'
import UserDetailPanel from './users/UserDetailPanel'
import NotificationsPanel from './users/NotificationsPanel'
import { BanModal, CreditModal, SubscriptionModal } from './users/UserModals'
import {
  addDays, buildUserRows, DEFAULT_FILTERS, downloadCsv, filterRows,
  notificationCampaigns, personalize, rowsToCsv, runBatched, sortRows,
} from './users/usersUtils'
import './UsersView.css'

// admin_grants.type → drawer label for credit-type rows.
const GRANT_TYPE_LABELS = {
  credit_add: 'Credits added',
  credit_deduct: 'Credits deducted',
  credit_set: 'Credits set',
}

const TABS = [
  { key: 'directory', label: 'Directory' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'credits', label: 'Credits' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'moderation', label: 'Moderation' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'trialing', label: 'Trial' },
  { value: 'expired', label: 'Expired' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'banned', label: 'Banned' },
]

const ACTIVITY_OPTIONS = [
  { value: 'all', label: 'Any activity' },
  { value: 'active7', label: 'Active in 7 days' },
  { value: 'active30', label: 'Active in 30 days' },
  { value: 'inactive30', label: 'Inactive 30+ days' },
  { value: 'new', label: 'New in 30 days' },
]

const JOINED_OPTIONS = [
  { value: 'all', label: 'Any join date' },
  { value: '7d', label: 'Joined in 7 days' },
  { value: '30d', label: 'Joined in 30 days' },
  { value: 'month', label: 'Joined this month' },
  { value: 'older', label: 'Older than 30 days' },
]

const StatTile = ({ icon: Icon, label, value, sub, tone = 'blue' }) => (
  <div className={`usr-stat ${tone}`}>
    <span className="usr-stat-top">
      <span className="usr-stat-icon">{Icon && <Icon size={18} />}</span>
      <span className="usr-stat-label">{label}</span>
    </span>
    <strong className="usr-stat-value">{value}</strong>
    <span className="usr-stat-sub">{sub}</span>
  </div>
)

const UsersView = ({ admin, initialQuery = '', externalRefreshKey = 0 }) => {
  const [profiles, setProfiles] = useState([])
  const [lobbies, setLobbies] = useState([])
  const [payments, setPayments] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [now, setNow] = useState(Date.now())

  const [view, setView] = useState('directory')
  const [query, setQuery] = useState(() => initialQuery)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [sort, setSort] = useState({ key: 'joined', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selected, setSelected] = useState([])
  const [detailId, setDetailId] = useState(null)

  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const [notifications, setNotifications] = useState([])
  const [notifyTargets, setNotifyTargets] = useState([])
  const [grants, setGrants] = useState([])
  const [grantsAvailable, setGrantsAvailable] = useState(false)
  const grantsWarnedRef = useRef(false)
  const [creditEvents, setCreditEvents] = useState([])

  const adminLabel = admin?.display_name || admin?.username || admin?.emails || 'Admin'

  const showToast = (message, tone = 'ok') => {
    setToast({ message, tone })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4500)
  }

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [profilesRes, lobbiesRes, paymentsRes, jobsRes] = await Promise.all([
          supabase.from('profiles').select(
            'id, username, display_name, avatar_url, emails, phone, created_at, updated_at, ' +
            'last_ad_watched_at, subscription_tier, subscription_status, subscription_expires_at, ' +
            'flux_balance, lobbies_created_count, is_admin, ads_watched_count, device_switch_count, ' +
            'feature_flags, expo_push_token',
          ).order('created_at', { ascending: false }),
          supabase.from('lobbies').select('id, user_id, name, status, created_at').order('created_at', { ascending: false }),
          supabase.from('payments').select('id, user_id, amount, currency, status, tier, created_at').order('created_at', { ascending: false }),
          supabase.from('ocr_jobs').select('id, user_id, status, token_usage, created_at').order('created_at', { ascending: false }),
        ])

        if (profilesRes.error) throw profilesRes.error
        if (lobbiesRes.error) throw lobbiesRes.error
        if (paymentsRes.error) throw paymentsRes.error
        if (jobsRes.error) throw jobsRes.error
        if (cancelled) return

        setProfiles(profilesRes.data || [])
        setLobbies(lobbiesRes.data || [])
        setPayments(paymentsRes.data || [])
        setJobs(jobsRes.data || [])
        setNow(Date.now())

        const [notificationsRes, grantsRes] = await Promise.all([
          supabase.from('notifications').select(
            'id, user_id, title, body, data, source, sent_by, status, error, created_at, channel, read_at, kind',
          ).order('created_at', { ascending: false }).limit(400),
          supabase.from('admin_grants').select(
            'id, user_id, granted_by, type, amount, plan_id, balance_after, note, metadata, created_at',
          ).order('created_at', { ascending: false }).limit(600),
        ])

        if (cancelled) return
        setNotifications(notificationsRes.error ? [] : notificationsRes.data || [])
        setGrantsAvailable(!grantsRes.error)
        setGrants(grantsRes.error ? [] : grantsRes.data || [])
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load users')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey, externalRefreshKey])

  const rows = useMemo(
    () => buildUserRows({ profiles, lobbies, payments, jobs, now }),
    [profiles, lobbies, payments, jobs, now],
  )

  const stats = useMemo(() => {
    const monthStart = new Date(now)
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const activeSubs = rows.filter((row) => row.sub.key === 'active' || row.sub.key === 'trialing').length
    const creditTotal = rows.reduce((sum, row) => sum + Math.max(0, row.balance), 0)
    const creditHolders = rows.filter((row) => row.balance > 0).length
    const banned = rows.filter((row) => row.banned).length
    const newMonth = rows.filter((row) => row.joinedTs >= monthStart.getTime()).length
    const capturedRevenue = rows.reduce((sum, row) => sum + row.capturedRevenue, 0)
    const capturedCount = rows.reduce((sum, row) => sum + row.capturedCount, 0)

    return { activeSubs, creditTotal, creditHolders, banned, newMonth, capturedRevenue, capturedCount }
  }, [rows, now])

  const subscriptionRows = useMemo(
    () => rows.filter((row) => row.plan.key !== 'free' || row.sub.key !== 'free'),
    [rows],
  )
  const creditRows = useMemo(() => rows.filter((row) => row.balance > 0), [rows])
  const moderationRows = useMemo(() => rows.filter((row) => row.banned), [rows])

  const campaigns = useMemo(
    () => notificationCampaigns(notifications),
    [notifications],
  )

  const tabRows = view === 'subscriptions'
    ? subscriptionRows
    : view === 'credits'
      ? creditRows
      : view === 'moderation'
        ? moderationRows
        : rows

  const filtered = useMemo(
    () => sortRows(filterRows(tabRows, { query, filters, now }), sort),
    [tabRows, query, filters, sort, now],
  )

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeEnd = Math.min(safePage * pageSize, filtered.length)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => { setPage(1) }, [query, filters, sort, view, pageSize])
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])

  const pageIds = pageRows.map((row) => row.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id))
  const somePageSelected = pageIds.some((id) => selected.includes(id))
  const selectedRows = useMemo(() => rows.filter((row) => selected.includes(row.id)), [rows, selected])
  const allSelectedBanned = selectedRows.length > 0 && selectedRows.every((row) => row.banned)
  const detailRow = useMemo(() => rows.find((row) => row.id === detailId) || null, [rows, detailId])

  // Credit-type admin_grants mapped to the drawer's history row shape.
  const detailLedger = useMemo(() => (
    detailRow
      ? grants
          .filter((entry) => entry.user_id === detailRow.id
            && (entry.type === 'credit_add' || entry.type === 'credit_deduct' || entry.type === 'credit_set'))
          .map((entry) => ({
            id: entry.id,
            user_id: entry.user_id,
            delta: Number(entry.amount) || 0,
            balance_after: entry.balance_after,
            reason: GRANT_TYPE_LABELS[entry.type] || entry.type,
            note: entry.metadata?.note || entry.note || null,
            created_at: entry.created_at,
          }))
      : []
  ), [grants, detailRow])
  const detailCreditEvents = useMemo(
    () => (detailRow ? creditEvents.filter((entry) => entry.user_id === detailRow.id) : []),
    [creditEvents, detailRow],
  )
  const detailNotifications = useMemo(() => {
    if (!detailRow) return []
    return notifications
      .filter((item) => item.user_id === detailRow.id)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  }, [detailRow, notifications])

  const hasFilters = Boolean(query.trim())
    || Object.entries(filters).some(([, value]) => value !== 'all')

  const clearFilters = () => {
    setQuery('')
    setFilters(DEFAULT_FILTERS)
  }

  const toggleSort = (key) => {
    setSort((current) => (
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'user' || key === 'plan' ? 'asc' : 'desc' }
    ))
  }

  const toggleRow = (id) => {
    setSelected((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ))
  }

  const togglePage = () => {
    setSelected((current) => {
      if (allPageSelected) return current.filter((id) => !pageIds.includes(id))
      return [...new Set([...current, ...pageIds])]
    })
  }

  const applyPatch = async (id, patch) => {
    const { data, error: updateError } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', id)
      .select(
        'id, flux_balance, subscription_tier, subscription_status, ' +
        'subscription_expires_at, feature_flags, active_device_id, device_switch_count, device_switch_reset_at',
      )
      .single()

    if (updateError) throw updateError
    setProfiles((current) => current.map((profile) => (
      profile.id === id ? { ...profile, ...data } : profile
    )))
    return data
  }

  // Append one row to the admin_grants audit table. Best-effort: if RLS
  // blocks the insert (policies not installed yet) the action still applies
  // and we warn once instead of failing the whole operation.
  const logAdminGrant = async ({ userId, type, amount = null, balanceAfter = null, planId = null, note = null, metadata = null }) => {
    try {
      const { data, error } = await supabase.from('admin_grants').insert({
        user_id: userId,
        granted_by: admin?.id || null,
        type,
        amount,
        balance_after: balanceAfter,
        plan_id: planId,
        note,
        metadata,
      }).select('id, user_id, granted_by, type, amount, plan_id, balance_after, note, metadata, created_at').single()
      if (error) throw error
      setGrants((current) => [data, ...current].slice(0, 600))
      return true
    } catch {
      if (!grantsWarnedRef.current) {
        grantsWarnedRef.current = true
        showToast('Grant logging is blocked by RLS — run docs/sql/002_admin_grant_policies.sql', 'warn')
      }
      return false
    }
  }

  const sendNotifications = async (payload, { silent = false } = {}) => {
    const { targets, channel, title, body } = payload

    if (targets.length === 0) return { count: 0 }

    const campaignId = globalThis.crypto?.randomUUID?.()
      || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // Every send goes through the backend dispatcher: it records the rows
    // (kind/channel/status) and tracks Expo delivery receipts. In-app works
    // for every profile; push needs the user's registered Expo token.
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (!accessToken) throw new Error('Admin session expired — sign in again.')

    const endpoint = channel === 'push'
      ? '/api/notifications/send'
      : '/api/notifications/send-in-app'
    let sent = 0
    const failed = { no_token: 0, other: 0 }
    const notificationIds = []

    await runBatched(targets, async (target) => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            user_id: target.id,
            title: personalize(title, target),
            body: personalize(body, target),
            data: { campaign_id: campaignId },
          }),
        })
        if (res.ok) {
          const result = await res.json().catch(() => null)
          if (result?.notification_id) notificationIds.push(result.notification_id)
          sent += 1
        } else {
          const err = await res.json().catch(() => null)
          if (err?.detail?.code === 'NO_PUSH_TOKEN') failed.no_token += 1
          else failed.other += 1
        }
      } catch {
        failed.other += 1
      }
    }, 4)

    // Pull the dispatcher-written rows so history shows them immediately.
    if (notificationIds.length > 0) {
      const { data: fresh } = await supabase
        .from('notifications')
        .select('id, user_id, title, body, data, source, sent_by, status, error, created_at, channel, read_at, kind')
        .in('id', notificationIds)
      if (fresh?.length) setNotifications((current) => [...fresh, ...current].slice(0, 600))
    }

    await logAdminGrant({
      userId: admin?.id || targets[0]?.id,
      type: 'notification',
      note: title,
      metadata: {
        campaign_id: campaignId,
        recipients: targets.length,
        sent,
        no_push_token: failed.no_token,
        failed: failed.other,
        channel,
      },
    })

    if (!silent) {
      const parts = [`delivered to ${sent}/${targets.length}`]
      if (failed.no_token) parts.push(`${failed.no_token} without a push token`)
      if (failed.other) parts.push(`${failed.other} failed`)
      showToast(
        `${channel === 'push' ? 'Push' : 'In-app'} notification ${parts.join(' · ')}`,
        sent === targets.length ? 'ok' : 'warn',
      )
    }
    return { count: sent, failed: targets.length - sent }
  }

  const handleCredits = async ({ mode, amount, reason, note }) => {
    if (!modal?.targets?.length) return
    setBusy(true)
    try {
      const results = await runBatched(modal.targets, async (target) => {
        try {
          const base = Number(target.flux_balance) || 0
          const next = mode === 'add' ? base + amount : mode === 'deduct' ? base - amount : amount
          if (!Number.isFinite(next) || next < 0) return { ok: false }

          const delta = next - base
          if (delta === 0) return { ok: true, unchanged: true }

          await applyPatch(target.id, { flux_balance: next })

          setCreditEvents((current) => [{
            id: `${target.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            user_id: target.id,
            delta,
            balance_after: next,
            reason,
            note,
            created_at: new Date().toISOString(),
            by: adminLabel,
          }, ...current].slice(0, 300))

          await logAdminGrant({
            userId: target.id,
            type: mode === 'add' ? 'credit_add' : mode === 'deduct' ? 'credit_deduct' : 'credit_set',
            amount: delta,
            balanceAfter: next,
            note: reason,
            metadata: { note: note || null, reason },
          })
          return { ok: true }
        } catch {
          return { ok: false }
        }
      })

      const updated = results.filter((result) => result.ok).length
      const failed = results.length - updated
      const ledgerFailed = results.some((result) => result.ledgerFailed)
      const tone = failed > 0 ? 'warn' : 'ok'
      showToast(
        `${updated} user${updated === 1 ? '' : 's'} updated${failed ? ` · ${failed} failed` : ''}${ledgerFailed ? ' · ledger write failed' : ''}`,
        tone,
      )
      setModal(null)
      setSelected([])
    } finally {
      setBusy(false)
    }
  }

  const handleSubscription = async ({ mode, plan, status, days, note }) => {
    if (!modal?.targets?.length) return
    setBusy(true)
    try {
      const results = await runBatched(modal.targets, async (target) => {
        try {
          let patch
          if (mode === 'revoke') {
            patch = {
              subscription_tier: 'free',
              subscription_status: 'inactive',
              subscription_expires_at: null,
            }
          } else if (mode === 'extend') {
            const current = target.subscription_expires_at ? new Date(target.subscription_expires_at) : null
            const base = current && current.getTime() > Date.now() ? current : new Date()
            patch = {
              subscription_tier: target.subscription_tier && target.subscription_tier !== 'free'
                ? target.subscription_tier
                : plan,
              subscription_status: 'active',
              subscription_expires_at: addDays(base, days).toISOString(),
            }
          } else {
            patch = {
              subscription_tier: plan,
              subscription_status: status,
              subscription_expires_at: addDays(new Date(), days).toISOString(),
            }
          }
          const updated = await applyPatch(target.id, patch)
          const beforeMeta = {
            subscription_tier: target.subscription_tier ?? null,
            subscription_status: target.subscription_status ?? null,
            subscription_expires_at: target.subscription_expires_at ?? null,
          }
          const afterMeta = {
            subscription_tier: updated?.subscription_tier ?? patch.subscription_tier ?? null,
            subscription_status: updated?.subscription_status ?? patch.subscription_status ?? null,
            subscription_expires_at: updated?.subscription_expires_at ?? patch.subscription_expires_at ?? null,
          }
          await logAdminGrant({
            userId: target.id,
            type: `subscription_${mode}`,
            planId: afterMeta.subscription_tier,
            note: note || null,
            metadata: {
              mode,
              requested_plan: plan || null,
              days: days ?? null,
              before: beforeMeta,
              after: afterMeta,
            },
          })
          return { ok: true }
        } catch {
          return { ok: false }
        }
      })

      const updated = results.filter((result) => result.ok).length
      const failed = results.length - updated
      showToast(
        mode === 'revoke'
          ? `${updated} subscription${updated === 1 ? '' : 's'} revoked${failed ? ` · ${failed} failed` : ''}`
          : `${updated} subscription${updated === 1 ? '' : 's'} updated${failed ? ` · ${failed} failed` : ''}`,
        failed ? 'warn' : 'ok',
      )
      setModal(null)
      setSelected([])
    } finally {
      setBusy(false)
    }
  }

  const handleBan = async ({ reason, until, notify, message }) => {
    if (!modal?.targets?.length) return
    const bannable = modal.targets.filter((target) => !target.is_admin)
    const skipped = modal.targets.length - bannable.length

    if (bannable.length === 0) {
      showToast('Admins cannot be banned', 'danger')
      setModal(null)
      return
    }

    setBusy(true)
    try {
      const results = await runBatched(bannable, async (target) => {
        try {
          const flags = { ...(target.feature_flags || {}) }
          flags.banned = true
          flags.ban = {
            active: true,
            reason,
            at: new Date().toISOString(),
            until: until || null,
            by: adminLabel,
          }

          try {
            await applyPatch(target.id, {
              feature_flags: flags,
              session_token: null,
              active_device_id: null,
            })
          } catch {
            // If the session columns are not writable, still persist the ban flag.
            await applyPatch(target.id, { feature_flags: flags })
          }

          await logAdminGrant({
            userId: target.id,
            type: 'ban',
            note: reason,
            metadata: { reason, until: until || null, by: adminLabel, notified: Boolean(notify && message), before_flags: target.feature_flags || {} },
          })

          return { ok: true, target }
        } catch {
          return { ok: false }
        }
      })

      const updated = results.filter((result) => result.ok).length
      const failed = results.length - updated
      const bannedTargets = results.filter((result) => result.ok).map((result) => result.target)
      let notifyFailed = false

      if (notify && message && bannedTargets.length > 0) {
        try {
          await sendNotifications({
            targets: bannedTargets,
            channel: 'in_app',
            title: 'Account suspended',
            body: message,
          }, { silent: true })
        } catch {
          notifyFailed = true
        }
      }

      showToast(
        `${updated} user${updated === 1 ? '' : 's'} banned`
          + `${skipped ? ` · ${skipped} admin skipped` : ''}`
          + `${failed ? ` · ${failed} failed` : ''}`
          + `${notifyFailed ? ' · notification failed' : ''}`,
        failed || notifyFailed ? 'warn' : 'ok',
      )
      setModal(null)
      setSelected([])
    } finally {
      setBusy(false)
    }
  }

  const handleUnban = async () => {
    if (!modal?.targets?.length) return
    setBusy(true)
    try {
      const results = await runBatched(modal.targets, async (target) => {
        try {
          const flags = { ...(target.feature_flags || {}) }
          flags.banned = false
          flags.ban = {
            ...(flags.ban || {}),
            active: false,
            lifted_at: new Date().toISOString(),
            lifted_by: adminLabel,
          }
          await applyPatch(target.id, { feature_flags: flags })
          await logAdminGrant({
            userId: target.id,
            type: 'unban',
            note: flags.ban?.reason || null,
            metadata: { lifted_by: adminLabel, lifted_at: flags.ban?.lifted_at },
          })
          return { ok: true }
        } catch {
          return { ok: false }
        }
      })

      const updated = results.filter((result) => result.ok).length
      const failed = results.length - updated
      showToast(
        `${updated} user${updated === 1 ? '' : 's'} unbanned${failed ? ` · ${failed} failed` : ''}`,
        failed ? 'warn' : 'ok',
      )
      setModal(null)
      setSelected([])
    } finally {
      setBusy(false)
    }
  }

  const handleSignOut = async (target) => {
    try {
      await applyPatch(target.id, { session_token: null, active_device_id: null })
      await logAdminGrant({
        userId: target.id,
        type: 'session_revoke',
        note: 'Active sessions cleared',
        metadata: { cleared: ['session_token', 'active_device_id'] },
      })
      showToast(`Active sessions cleared for ${target.emails || 'user'}`)
    } catch {
      showToast('Could not clear sessions — check column permissions', 'danger')
    }
  }

  const handleResetDevice = async (target) => {
    try {
      await applyPatch(target.id, {
        active_device_id: null,
        device_switch_count: 0,
        device_switch_reset_at: new Date().toISOString(),
      })
      await logAdminGrant({
        userId: target.id,
        type: 'device_reset',
        note: 'Device lock reset',
        metadata: { cleared: ['active_device_id'], device_switch_count: 0 },
      })
      showToast('Device lock reset')
    } catch {
      showToast('Could not reset device lock', 'danger')
    }
  }

  const copyText = async (text, message) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(message)
    } catch {
      showToast('Clipboard is unavailable in this browser', 'danger')
    }
  }

  const switchView = (next) => {
    setView(next)
    setSelected([])
    setDetailId(null)
  }

  const openAction = (type, target) => {
    if (type === 'notify') {
      setNotifyTargets([target])
      switchView('notifications')
      return
    }
    setModal({ type, targets: [target] })
  }

  const openBulk = (type) => {
    if (selectedRows.length === 0) return
    if (type === 'notify') {
      setNotifyTargets(selectedRows)
      switchView('notifications')
      return
    }
    setModal({ type, targets: selectedRows })
  }

  const handleExport = () => {
    if (filtered.length === 0) {
      showToast('Nothing to export', 'warn')
      return
    }
    downloadCsv(
      `lazarflow-users-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(filtered, now),
    )
    showToast(`Exported ${filtered.length} user${filtered.length === 1 ? '' : 's'}`)
  }

  const refresh = () => {
    setRefreshKey((key) => key + 1)
    showToast('Refreshing users…', 'info')
  }

  const emptyCopy = {
    directory: {
      title: 'No users match these filters',
      hint: 'Try a different search term or reset the filters.',
    },
    subscriptions: {
      title: 'No subscriptions yet',
      hint: 'Grant a plan from a user row and it will appear here.',
    },
    credits: {
      title: 'No credits outstanding',
      hint: 'Adjust credits from a user row to see balances here.',
    },
    moderation: {
      title: 'No banned users',
      hint: 'Banned accounts will appear here with their reason and duration.',
    },
  }[view] || { title: 'No users found', hint: 'Try a different search.' }

  const tabCount = (key) => {
    if (key === 'directory') return rows.length
    if (key === 'subscriptions') return subscriptionRows.length
    if (key === 'credits') return creditRows.length
    if (key === 'notifications') return campaigns.length
    if (key === 'moderation') return moderationRows.length
    return 0
  }

  const contextCopy = {
    subscriptions: 'Paid plans and subscription history. Grant, extend or revoke access from any row.',
    credits: 'Users holding Flux credits. Adjust balances and review changes in the drawer.',
    moderation: 'Restricted accounts. Ban state currently lives in profiles.feature_flags until the backend adds user_bans.',
  }[view]

  return (
    <div className="usr-view">
      <section className="usr-hero" aria-labelledby="usr-title">
        <header className="usr-hero-head">
          <div>
            <span className="usr-eyebrow"><Users size={12} /> Community</span>
            <h1 id="usr-title" className="usr-title">Users</h1>
            <p className="usr-subtitle">
              Manage accounts, credits, subscriptions, moderation and communications.
            </p>
          </div>
          <div className="usr-hero-actions">
            <span className={`usr-live ${loading ? 'is-refreshing' : ''}`}>
              <span className="usr-live-dot" aria-hidden="true" />
              {loading ? 'Refreshing…' : `Live · ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </span>
            <button type="button" className="usr-btn" onClick={refresh} disabled={loading}>
              <RefreshCcw size={14} className={loading ? 'usr-spin' : ''} /> Refresh
            </button>
            <button type="button" className="usr-btn" onClick={handleExport}>
              <Download size={14} /> Export CSV
            </button>
            <button
              type="button"
              className="usr-btn usr-btn-primary"
              onClick={() => {
                setNotifyTargets(selectedRows.length > 0 ? selectedRows : [])
                switchView('notifications')
              }}
            >
              <Send size={14} /> Send notification
            </button>
          </div>
        </header>

        {error && (
          <div className="usr-banner danger usr-hero-banner">
            <AlertTriangle size={16} />
            <div>
              <strong>Could not load users</strong>
              <p>{error}</p>
            </div>
            <button type="button" className="usr-btn usr-btn-sm" onClick={refresh}>Retry</button>
          </div>
        )}

        <div className="usr-stats" aria-live="polite">
          <StatTile
            icon={Users}
            tone="blue"
            label="Total users"
            value={loading ? '—' : rows.length.toLocaleString('en-IN')}
            sub={loading ? 'Loading…' : `${stats.newMonth} joined this month`}
          />
          <StatTile
            icon={Crown}
            tone="green"
            label="Active subscriptions"
            value={loading ? '—' : stats.activeSubs.toLocaleString('en-IN')}
            sub={loading ? 'Loading…' : `${subscriptionRows.length} with plan history`}
          />
          <StatTile
            icon={Zap}
            tone="amber"
            label="Credits outstanding"
            value={loading ? '—' : stats.creditTotal.toLocaleString('en-IN')}
            sub={loading ? 'Loading…' : `across ${stats.creditHolders} users`}
          />
          <StatTile
            icon={UserX}
            tone={stats.banned ? 'red' : 'violet'}
            label="Banned"
            value={loading ? '—' : stats.banned.toLocaleString('en-IN')}
            sub={loading ? 'Loading…' : stats.banned ? 'Restricted accounts' : 'None restricted'}
          />
          <StatTile
            icon={CheckCircle2}
            tone="teal"
            label="Captured revenue"
            value={loading ? '—' : `₹${stats.capturedRevenue.toLocaleString('en-IN')}`}
            sub={loading ? 'Loading…' : `${stats.capturedCount} payments`}
          />
        </div>
      </section>

      <nav className="usr-tabs" aria-label="Users sections">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`usr-tab${view === tab.key ? ' active' : ''}`}
            onClick={() => switchView(tab.key)}
          >
            {tab.label}
            <span className="usr-tab-count">{tabCount(tab.key)}</span>
          </button>
        ))}
      </nav>

      {view === 'notifications' ? (
        <NotificationsPanel
          rows={rows}
          campaigns={campaigns}
          selectedTargets={notifyTargets}
          now={now}
          onSend={sendNotifications}
          adminLabel={adminLabel}
        />
      ) : (
        <>
          {contextCopy && (
            <div className="usr-context">
              <SlidersHorizontal size={14} />
              <span>{contextCopy}</span>
            </div>
          )}

          <div className="usr-toolbar">
            <div className="usr-search">
              <Search size={15} className="usr-search-icon" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search email, username, phone or user ID…"
                aria-label="Search users"
              />
              {query && (
                <button type="button" className="usr-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="usr-filters">
              <select
                value={filters.plan}
                onChange={(event) => setFilters((current) => ({ ...current, plan: event.target.value }))}
                aria-label="Filter by plan"
              >
                <option value="all">All plans</option>
                <option value="free">Free plan</option>
                <option value="paid">Paid plans</option>
              </select>

              <select
                value={filters.status}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                aria-label="Filter by status"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <select
                value={filters.activity}
                onChange={(event) => setFilters((current) => ({ ...current, activity: event.target.value }))}
                aria-label="Filter by activity"
              >
                {ACTIVITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <select
                value={filters.joined}
                onChange={(event) => setFilters((current) => ({ ...current, joined: event.target.value }))}
                aria-label="Filter by join date"
              >
                {JOINED_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <select
                value={filters.credits}
                onChange={(event) => setFilters((current) => ({ ...current, credits: event.target.value }))}
                aria-label="Filter by credits"
              >
                <option value="all">Any balance</option>
                <option value="has">Has credits</option>
                <option value="none">No credits</option>
              </select>

              {hasFilters && (
                <button type="button" className="usr-link-btn" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {selectedRows.length > 0 && (
            <div className="usr-bulk">
              <span className="usr-bulk-count"><strong>{selectedRows.length}</strong> selected</span>
              <div className="usr-bulk-actions">
                <button type="button" onClick={() => openBulk('credits')}><Zap size={13} /> Credits</button>
                <button type="button" onClick={() => openBulk('subscription')}><Crown size={13} /> Subscription</button>
                <button type="button" onClick={() => openBulk('notify')}><Bell size={13} /> Notify</button>
                {allSelectedBanned ? (
                  <button type="button" onClick={() => openBulk('unban')}><UserCheck size={13} /> Unban</button>
                ) : (
                  <button type="button" className="is-danger" onClick={() => openBulk('ban')}><Ban size={13} /> Ban</button>
                )}
              </div>
              <button type="button" className="usr-bulk-clear" onClick={() => setSelected([])}>
                <X size={13} /> Clear
              </button>
            </div>
          )}

          <UserTable
            rows={pageRows}
            loading={loading}
            sort={sort}
            onSort={toggleSort}
            selected={selected}
            allPageSelected={allPageSelected}
            somePageSelected={somePageSelected}
            onToggleRow={toggleRow}
            onTogglePage={togglePage}
            onOpen={(row) => setDetailId(row.id)}
            onAction={openAction}
            page={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            total={filtered.length}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onClearFilters={clearFilters}
            hasFilters={hasFilters}
            emptyTitle={emptyCopy.title}
            emptyHint={emptyCopy.hint}
            now={now}
          />
        </>
      )}

      {detailRow && (
        <UserDetailPanel
          row={detailRow}
          ledger={detailLedger}
          creditEvents={detailCreditEvents}
          notifications={detailNotifications}
          grantsAvailable={grantsAvailable}
          now={now}
          suspended={Boolean(modal)}
          onClose={() => setDetailId(null)}
          onCredits={(target) => setModal({ type: 'credits', targets: [target] })}
          onSubscription={(target) => setModal({ type: 'subscription', targets: [target] })}
          onNotify={openAction.bind(null, 'notify')}
          onBan={(target) => setModal({ type: 'ban', targets: [target] })}
          onUnban={(target) => setModal({ type: 'unban', targets: [target] })}
          onSignOut={handleSignOut}
          onResetDevice={handleResetDevice}
          onCopy={copyText}
        />
      )}

      {modal?.type === 'credits' && (
        <CreditModal
          targets={modal.targets}
          onClose={() => !busy && setModal(null)}
          onSubmit={handleCredits}
          busy={busy}
        />
      )}
      {modal?.type === 'subscription' && (
        <SubscriptionModal
          targets={modal.targets}
          onClose={() => !busy && setModal(null)}
          onSubmit={handleSubscription}
          busy={busy}
        />
      )}
      {modal?.type === 'ban' && (
        <BanModal
          targets={modal.targets}
          mode="ban"
          onClose={() => !busy && setModal(null)}
          onSubmit={handleBan}
          busy={busy}
        />
      )}
      {modal?.type === 'unban' && (
        <BanModal
          targets={modal.targets}
          mode="unban"
          onClose={() => !busy && setModal(null)}
          onSubmit={handleUnban}
          busy={busy}
        />
      )}

      {toast && (
        <div className={`usr-toast ${toast.tone}`} role="status" aria-live="polite">
          {toast.tone === 'danger' || toast.tone === 'warn'
            ? <AlertTriangle size={15} />
            : <ShieldCheck size={15} />}
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

export default UsersView

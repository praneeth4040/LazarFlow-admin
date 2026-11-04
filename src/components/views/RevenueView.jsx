import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IndianRupee, Wallet, Hourglass, Target, Receipt,
  RefreshCw, AlertCircle, Download, AlertTriangle, ArrowUpRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  inr, percent, relative, csvCell, downloadCsv, titleCase,
} from './overviewUtils'
import './RevenueView.css'

const KPI_SKELETONS = [0, 1, 2, 3, 4]
const TREND_DAYS = 14
const STALE_HOURS = 24

const STATUS_META = {
  captured: { label: 'Captured', cls: 'captured' },
  created: { label: 'Unpaid', cls: 'created' },
  failed: { label: 'Failed', cls: 'failed' },
  refunded: { label: 'Refunded', cls: 'refunded' },
}
const statusMeta = (status) => STATUS_META[status] || { label: titleCase(status), cls: 'other' }

// "flux_250" → "Flux ₹250" · "sub_weekly" → "Weekly plan"
const tierLabel = (tier) => {
  const text = String(tier || '').trim()
  if (!text) return 'Unknown'
  if (text.startsWith('flux_')) {
    const amount = text.slice(5)
    return /^\d+$/.test(amount) ? `Flux ${inr(Number(amount))}` : `Flux ${amount}`
  }
  if (text.startsWith('sub_')) return `${titleCase(text.slice(4))} plan`
  return titleCase(text)
}

const localDayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

const initialsOf = (user) => {
  const base = String(user?.display_name || user?.username || user?.emails || '?').trim()
  return base.split(/[\s@._]/)[0].slice(0, 2).toUpperCase() || '?'
}

const userLabel = (user) => user?.display_name || user?.username || user?.emails || 'Unknown user'

const RevenueView = ({ externalRefreshKey = 0, onOpenUser }) => {
  const [payments, setPayments] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [retryToken, setRetryToken] = useState(0)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (hasLoadedRef.current) setRefreshing(true)
      else setLoading(true)
      setError('')

      try {
        const [paymentsRes, profilesRes] = await Promise.all([
          supabase.from('payments').select(
            'id, user_id, amount, currency, status, tier, gateway_order_id, gateway_payment_id, created_at'
          ).order('created_at', { ascending: false }),
          supabase.from('profiles').select('id, username, display_name, emails'),
        ])
        if (paymentsRes.error) throw paymentsRes.error
        if (profilesRes.error) throw profilesRes.error
        if (cancelled) return

        setPayments(paymentsRes.data || [])
        setProfiles(profilesRes.data || [])
        setUpdatedAt(new Date())
        hasLoadedRef.current = true
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load payments')
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [externalRefreshKey, retryToken])

  const derived = useMemo(() => {
    const profileMap = new Map(profiles.map(p => [p.id, p]))
    const rows = payments.filter(p => (p.currency || 'INR') === 'INR')
    const amountOf = (p) => Number(p.amount) || 0

    const captured = rows.filter(p => p.status === 'captured')
    const pending = rows.filter(p => p.status === 'created')
    const failed = rows.filter(p => p.status === 'failed')
    const refunded = rows.filter(p => p.status === 'refunded')

    const capturedINR = captured.reduce((sum, p) => sum + amountOf(p), 0)
    const pendingINR = pending.reduce((sum, p) => sum + amountOf(p), 0)
    const attempts = captured.length + pending.length + failed.length

    const now = new Date()
    const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`
    const thisMonthKey = monthKey(now)
    const lastMonthKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    let thisMonth = 0
    let lastMonth = 0
    for (const p of captured) {
      const key = monthKey(new Date(p.created_at))
      if (key === thisMonthKey) thisMonth += amountOf(p)
      else if (key === lastMonthKey) lastMonth += amountOf(p)
    }

    // Daily captured vs pending value for the last 14 days (local timezone).
    const byDay = new Map()
    for (const p of rows) {
      const date = new Date(p.created_at)
      if (Number.isNaN(date.getTime())) continue
      const key = localDayKey(date)
      const bucket = byDay.get(key) || { captured: 0, pending: 0 }
      if (p.status === 'captured') bucket.captured += amountOf(p)
      else if (p.status === 'created') bucket.pending += amountOf(p)
      byDay.set(key, bucket)
    }
    const trend = []
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const bucket = byDay.get(localDayKey(date)) || { captured: 0, pending: 0 }
      trend.push({ label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), ...bucket })
    }

    // Rollup per tier (flux packs / subscriptions). The tier column is
    // free-form text, so unknown values surface as their own row.
    const planMap = new Map()
    for (const p of rows) {
      const tier = String(p.tier || '').trim() || '(no tier)'
      const entry = planMap.get(tier) || { tier, orders: 0, capturedCount: 0, capturedINR: 0, pendingINR: 0 }
      entry.orders += 1
      if (p.status === 'captured') { entry.capturedCount += 1; entry.capturedINR += amountOf(p) }
      else if (p.status === 'created') entry.pendingINR += amountOf(p)
      planMap.set(tier, entry)
    }
    const plans = [...planMap.values()].sort((a, b) => b.orders - a.orders)

    const staleCutoff = now.getTime() - STALE_HOURS * 3_600_000
    const stalePending = pending
      .filter(p => new Date(p.created_at).getTime() < staleCutoff)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    return {
      rows, captured, pending, failed, refunded,
      capturedINR, pendingINR, attempts, thisMonth, lastMonth,
      trend, plans, stalePending, profileMap,
      recent: rows.slice(0, 10).map(p => ({ ...p, user: profileMap.get(p.user_id) || null })),
    }
  }, [payments, profiles])

  const updatedTs = updatedAt ? updatedAt.getTime() : 0

  const exportCsv = () => {
    const lines = ['created_at,status,tier,amount,currency,user,gateway_order_id,gateway_payment_id']
    for (const p of derived.rows) {
      const user = derived.profileMap.get(p.user_id)
      lines.push([
        csvCell(p.created_at), csvCell(p.status), csvCell(tierLabel(p.tier)), csvCell(p.amount),
        csvCell(p.currency), csvCell(user?.emails || user?.username || ''),
        csvCell(p.gateway_order_id), csvCell(p.gateway_payment_id),
      ].join(','))
    }
    downloadCsv(`lazarflow-payments-${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\n'))
  }

  const maxTrendValue = Math.max(1, ...derived.trend.map(d => Math.max(d.captured, d.pending)))
  const trendHasData = derived.trend.some(d => d.captured > 0 || d.pending > 0)
  const maxPlanOrders = Math.max(1, ...derived.plans.map(p => p.orders))

  const cards = [
    {
      key: 'captured',
      label: 'Captured revenue',
      value: inr(derived.capturedINR),
      meta: (
        <>
          <span>{derived.captured.length} paid orders</span>
          {(derived.thisMonth > 0 || derived.lastMonth > 0) && (
            <span className="rev-meta-sep" aria-hidden="true">·</span>
          )}
          {(derived.thisMonth > 0 || derived.lastMonth > 0) && (
            <span>
              This month <strong>{inr(derived.thisMonth)}</strong>
              {derived.lastMonth > 0 && ` · last ${inr(derived.lastMonth)}`}
            </span>
          )}
        </>
      ),
      icon: IndianRupee,
      tone: 'green',
      title: `Total captured payments. This month ${inr(derived.thisMonth)}, last month ${inr(derived.lastMonth)}.`,
    },
    {
      key: 'pending',
      label: 'Pending value',
      value: inr(derived.pendingINR),
      meta: `${derived.pending.length} unpaid orders · ${derived.stalePending.length} stale >${STALE_HOURS}h`,
      icon: Hourglass,
      tone: 'amber',
      title: `${inr(derived.pendingINR)} sits in ${derived.pending.length} orders with status "created". ${derived.stalePending.length} of them are older than ${STALE_HOURS} hours.`,
    },
    {
      key: 'orders',
      label: 'Paid orders',
      value: String(derived.captured.length),
      meta: `${percent(derived.captured.length, derived.attempts)}% of ${derived.attempts} attempts`,
      icon: Receipt,
      tone: 'blue',
      title: `Attempts = captured + unpaid (${derived.pending.length}) + failed (${derived.failed.length}).`,
    },
    {
      key: 'conversion',
      label: 'Conversion',
      value: `${percent(derived.captured.length, derived.attempts)}%`,
      meta: `${derived.failed.length} failed · ${derived.refunded.length} refunded`,
      icon: Target,
      tone: 'violet',
      title: 'Captured orders as a share of all payment attempts.',
    },
    {
      key: 'aov',
      label: 'Avg order value',
      value: inr(derived.captured.length ? derived.capturedINR / derived.captured.length : 0),
      meta: 'Across captured orders only',
      icon: Wallet,
      tone: 'teal',
    },
  ]

  return (
    <div className="revenue-page">
      <section className="rev-hero" aria-labelledby="rev-title">
        <header className="rev-hero-head">
          <div>
            <span className="rev-eyebrow"><Wallet size={12} /> Monetization</span>
            <h1 id="rev-title" className="rev-title">Revenue</h1>
            <p className="rev-subtitle">
              Payments, conversion and unpaid-order follow-ups across the platform.
            </p>
          </div>
          <div className="rev-head-actions">
            <span className={`rev-live ${refreshing ? 'is-refreshing' : ''}`}>
              <span className="rev-live-dot" aria-hidden="true" />
              {refreshing ? 'Refreshing…' : updatedAt ? `Live · ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live'}
            </span>
            <button type="button" className="rev-action" onClick={exportCsv} disabled={loading}>
              <Download size={14} /> Export CSV
            </button>
            <button type="button" className="rev-action" onClick={() => setRetryToken(t => t + 1)}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </header>

        {loading ? (
          <div className="rev-kpi-grid" aria-hidden="true">
            {KPI_SKELETONS.map((i) => (
              <div key={i} className="rev-kpi rev-kpi-skeleton">
                <span className="rev-sk rev-sk-icon" />
                <span className="rev-sk rev-sk-label" />
                <span className="rev-sk rev-sk-value" />
                <span className="rev-sk rev-sk-meta" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rev-error" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button type="button" className="rev-retry" onClick={() => setRetryToken(t => t + 1)}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : (
          <div className="rev-kpi-grid" aria-live="polite">
            {cards.map(({ key, label, value, meta, icon, tone, title }) => {
              const Icon = icon
              return (
                <div key={key} className="rev-kpi" title={title}>
                  <span className="rev-kpi-top">
                    <span className={`rev-kpi-icon ${tone}`}><Icon size={18} /></span>
                    <span className="rev-kpi-label">{label}</span>
                  </span>
                  <span className="rev-kpi-value">{value}</span>
                  <span className="rev-kpi-meta">{meta}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="rev-main">
        <div className="rev-col">
          {/* ── 14-day trend ── */}
          <section className="rev-panel">
            <header className="rev-panel-head">
              <h2 className="rev-panel-title">Last {TREND_DAYS} days</h2>
              <span className="rev-legend">
                <span className="rev-legend-item"><i className="rev-dot captured" /> Captured</span>
                <span className="rev-legend-item"><i className="rev-dot created" /> Unpaid</span>
              </span>
            </header>
            {trendHasData ? (
              <div className="rev-trend" role="img" aria-label="Daily captured and unpaid payment value for the last 14 days">
                {derived.trend.map((day) => (
                  <div key={day.label} className="rev-trend-day">
                    <div className="rev-trend-bars">
                      <i
                        className={`rev-bar captured ${day.captured ? '' : 'empty'}`}
                        style={{ height: `${Math.max(day.captured ? 6 : 2, (day.captured / maxTrendValue) * 100)}%` }}
                        title={`${day.label} — captured ${inr(day.captured)}`}
                      />
                      <i
                        className={`rev-bar created ${day.pending ? '' : 'empty'}`}
                        style={{ height: `${Math.max(day.pending ? 6 : 2, (day.pending / maxTrendValue) * 100)}%` }}
                        title={`${day.label} — unpaid ${inr(day.pending)}`}
                      />
                    </div>
                    <span className="rev-trend-label">{day.label.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rev-empty">No payment activity in the last {TREND_DAYS} days.</p>
            )}
          </section>

          {/* ── Plan mix ── */}
          <section className="rev-panel">
            <header className="rev-panel-head">
              <h2 className="rev-panel-title">Plan &amp; pack mix</h2>
              <span className="rev-panel-hint">{derived.plans.length} tiers</span>
            </header>
            <div className="rev-plan-list">
              {derived.plans.slice(0, 8).map((plan) => (
                <div key={plan.tier} className="rev-plan-row" title={`${plan.orders} orders · captured ${inr(plan.capturedINR)} · unpaid ${inr(plan.pendingINR)}`}>
                  <div className="rev-plan-main">
                    <span className="rev-plan-name">{tierLabel(plan.tier)}</span>
                    <span className="rev-plan-sub">
                      {plan.orders} orders · {plan.capturedCount} paid
                      {plan.pendingINR > 0 && ` · ${inr(plan.pendingINR)} unpaid`}
                    </span>
                  </div>
                  <span className={`rev-plan-amount ${plan.capturedINR > 0 ? 'pos' : 'zero'}`}>
                    {inr(plan.capturedINR)}
                  </span>
                  <i className="rev-plan-bar" style={{ width: `${Math.max(4, (plan.orders / maxPlanOrders) * 100)}%` }} aria-hidden="true" />
                </div>
              ))}
              {derived.plans.length > 8 && (
                <p className="rev-more">+{derived.plans.length - 8} more tiers — see the CSV export for the full list.</p>
              )}
            </div>
          </section>
        </div>

        <div className="rev-col">
          {/* ── Needs attention ── */}
          <section className="rev-panel">
            <header className="rev-panel-head">
              <h2 className="rev-panel-title">
                <AlertTriangle size={14} className="rev-title-warn" /> Needs attention
              </h2>
              <span className="rev-count-chip amber">{derived.stalePending.length}</span>
            </header>
            {derived.stalePending.length === 0 ? (
              <p className="rev-empty">Nothing stale — every unpaid order is under {STALE_HOURS} hours old.</p>
            ) : (
              <div className="rev-stale-list">
                {derived.stalePending.slice(0, 8).map((p) => {
                  const user = derived.profileMap.get(p.user_id) || null
                  return (
                    <div key={p.id} className="rev-stale-row">
                      <div className="rev-stale-info">
                        <span className="rev-stale-amount">{inr(Number(p.amount) || 0)}</span>
                        <span className="rev-stale-tier">{tierLabel(p.tier)}</span>
                      </div>
                      <div className="rev-stale-meta">
                        <span className="rev-stale-user">{user ? userLabel(user) : 'Unknown user'}</span>
                        <span className="rev-stale-age">created {relative(p.created_at, updatedTs)}</span>
                      </div>
                      {user && (
                        <button
                          type="button"
                          className="rev-open-user"
                          onClick={() => onOpenUser?.(user)}
                          title="Open this user in the Users tab"
                          aria-label={`Open ${userLabel(user)} in Users`}
                        >
                          <ArrowUpRight size={13} /> Open
                        </button>
                      )}
                    </div>
                  )
                })}
                {derived.stalePending.length > 8 && (
                  <p className="rev-more">+{derived.stalePending.length - 8} older unpaid orders.</p>
                )}
              </div>
            )}
          </section>

          {/* ── Recent payments ── */}
          <section className="rev-panel">
            <header className="rev-panel-head">
              <h2 className="rev-panel-title">Recent payments</h2>
              <span className="rev-panel-hint">{derived.rows.length} total</span>
            </header>
            <div className="rev-recent-list">
              {derived.recent.map((p) => {
                const meta = statusMeta(p.status)
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="rev-recent-row"
                    onClick={() => p.user && onOpenUser?.(p.user)}
                    disabled={!p.user}
                    title={p.user ? 'Open this user in the Users tab' : 'User profile not found'}
                  >
                    <span className="rev-avatar" aria-hidden="true">{initialsOf(p.user)}</span>
                    <span className="rev-recent-main">
                      <span className="rev-recent-name">{userLabel(p.user)}</span>
                      <span className="rev-recent-sub">{tierLabel(p.tier)} · {relative(p.created_at, updatedTs)}</span>
                    </span>
                    <span className="rev-recent-right">
                      <span className="rev-recent-amount">{inr(Number(p.amount) || 0)}</span>
                      <span className={`rev-pill ${meta.cls}`}>{meta.label}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default RevenueView

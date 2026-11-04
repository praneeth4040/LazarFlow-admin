import { useEffect, useRef, useState } from 'react'
import {
  Users, Trophy, Cpu, Coins, Wallet, Activity,
  AlertCircle, RefreshCw,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import OverviewUsers from './OverviewUsers'
import OverviewLobbies from './OverviewLobbies'
import './OverviewView.css'

// Cost fallback rates (USD per 1M tokens) — used when a job has no recorded
// cost_usd. All current rows store cost_usd = 0, so this drives the estimate.
const RATE_INPUT_PER_M = 0.13
const RATE_OUTPUT_PER_M = 0.52
const FALLBACK_USD_TO_INR = 95.94

const num = (value) => (Number.isFinite(value) ? value : 0).toLocaleString('en-US')
const inr = (value) => `₹${(Number.isFinite(value) ? value : 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`
const usd = (value) => `$${(Number.isFinite(value) ? value : 0).toLocaleString('en-US', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})}`

const isSameMonth = (iso) => {
  if (!iso) return false
  const date = new Date(iso)
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

const jobCostUSD = (usage) => {
  if (!usage) return 0
  const recorded = Number(usage.cost_usd) || 0
  if (recorded > 0) return recorded
  const input = Number(usage.input_tokens) || 0
  const output = Number(usage.output_tokens) || 0
  return (input / 1_000_000) * RATE_INPUT_PER_M + (output / 1_000_000) * RATE_OUTPUT_PER_M
}

const fetchInrRate = async () => {
  try {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(4000)
      : undefined
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal })
    if (!res.ok) return FALLBACK_USD_TO_INR
    const json = await res.json()
    const rate = Number(json?.rates?.INR)
    return Number.isFinite(rate) && rate > 0 ? rate : FALLBACK_USD_TO_INR
  } catch {
    return FALLBACK_USD_TO_INR
  }
}

const KPI_SKELETONS = [0, 1, 2, 3, 4]

const OverviewView = ({ onNavigate, onOpenLobby, refreshKey = 0 }) => {
  const [metrics, setMetrics] = useState(null)
  const [directory, setDirectory] = useState({ profiles: [], lobbies: [], payments: [], lobbyTeams: [] })
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
        const [profilesRes, lobbiesRes, lobbyTeamsRes, jobsRes, paymentsRes, inrRate] = await Promise.all([
          supabase.from('profiles').select(
            'id, emails, username, display_name, phone, created_at, updated_at, last_ad_watched_at, ' +
            'subscription_tier, subscription_status, subscription_expires_at, flux_balance, ' +
            'lobbies_created_count, is_admin, ads_watched_count, device_switch_count',
          ),
          supabase.from('lobbies').select(
            'id, user_id, name, game, status, created_at, updated_at, kill_points, is_promoted, ' +
            'metadata, points_system, final_standings, form_data',
          ),
          supabase.from('lobby_teams').select('lobby_id, members'),
          supabase.from('ocr_jobs').select('status, token_usage'),
          supabase.from('payments').select('user_id, amount, currency, status'),
          fetchInrRate(),
        ])

        if (profilesRes.error) throw profilesRes.error
        if (lobbiesRes.error) throw lobbiesRes.error
        if (lobbyTeamsRes.error) throw lobbyTeamsRes.error
        if (jobsRes.error) throw jobsRes.error
        if (paymentsRes.error) throw paymentsRes.error
        if (cancelled) return

        const profiles = profilesRes.data || []
        const lobbies = lobbiesRes.data || []
        const lobbyTeams = lobbyTeamsRes.data || []
        const jobs = jobsRes.data || []
        const payments = paymentsRes.data || []

        let inputTokens = 0
        let outputTokens = 0
        let costUSD = 0

        for (const job of jobs) {
          const usage = job.token_usage
          inputTokens += Number(usage?.input_tokens) || 0
          outputTokens += Number(usage?.output_tokens) || 0
          costUSD += jobCostUSD(usage)
        }

        let revenueINR = 0
        let capturedOrders = 0
        let pendingOrders = 0
        let pendingINR = 0

        for (const payment of payments) {
          if ((payment.currency || 'INR') !== 'INR') continue
          const amount = Number(payment.amount) || 0
          if (payment.status === 'captured') {
            revenueINR += amount
            capturedOrders += 1
          } else if (payment.status === 'created') {
            pendingINR += amount
            pendingOrders += 1
          }
        }

        setDirectory({ profiles, lobbies, payments, lobbyTeams })
        setMetrics({
          users: profiles.length,
          usersThisMonth: profiles.filter(p => isSameMonth(p.created_at)).length,
          lobbies: lobbies.length,
          activeLobbies: lobbies.filter(l => l.status === 'active').length,
          lobbiesThisMonth: lobbies.filter(l => isSameMonth(l.created_at)).length,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          costUSD,
          costINR: costUSD * inrRate,
          revenueINR,
          capturedOrders,
          pendingOrders,
          pendingINR,
          jobs: jobs.length,
          inrRate,
        })
        setUpdatedAt(new Date())
        hasLoadedRef.current = true
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load overview metrics')
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey, retryToken])

  const cards = metrics ? [
    {
      key: 'users',
      label: 'Total users',
      value: num(metrics.users),
      meta: `${num(metrics.usersThisMonth)} joined this month`,
      icon: Users,
      tone: 'blue',
      target: 'users',
    },
    {
      key: 'lobbies',
      label: 'Lobbies created',
      value: num(metrics.lobbies),
      meta: `${num(metrics.activeLobbies)} active · ${num(metrics.lobbiesThisMonth)} this month`,
      icon: Trophy,
      tone: 'amber',
      target: 'lobbies',
    },
    {
      key: 'tokens',
      label: 'Credits used',
      value: num(metrics.totalTokens),
      meta: (
        <>
          <span>Input <strong>{num(metrics.inputTokens)}</strong></span>
          <span className="ov-meta-sep" aria-hidden="true">·</span>
          <span>Output <strong>{num(metrics.outputTokens)}</strong></span>
        </>
      ),
      icon: Cpu,
      tone: 'violet',
      target: 'jobs',
    },
    {
      key: 'cost',
      label: 'AI spend',
      value: inr(metrics.costINR),
      meta: `${usd(metrics.costUSD)} USD · est. from ${num(metrics.jobs)} jobs`,
      icon: Coins,
      tone: 'green',
      target: 'jobs',
      title: `Estimated at $${RATE_INPUT_PER_M}/1M input and $${RATE_OUTPUT_PER_M}/1M output tokens when a job has no recorded cost. Exchange rate: ₹${metrics.inrRate.toFixed(2)}/USD.`,
    },
    {
      key: 'revenue',
      label: 'Revenue',
      value: inr(metrics.revenueINR),
      meta: `${num(metrics.capturedOrders)} paid · ${num(metrics.pendingOrders)} unpaid`,
      icon: Wallet,
      tone: 'teal',
      target: 'revenue',
      title: `${inr(metrics.pendingINR)} sits in ${num(metrics.pendingOrders)} unpaid orders (status = created).`,
    },
  ] : []

  return (
    <div className="overview-page">
      <section className="ov-hero" aria-labelledby="ov-title">
        <header className="ov-hero-head">
          <div>
            <span className="ov-eyebrow">
              <Activity size={12} />
              Platform health
            </span>
            <h1 id="ov-title" className="ov-title">Overview</h1>
            <p className="ov-subtitle">
              A live snapshot of users, lobbies, AI token usage, spend and revenue.
            </p>
          </div>
          <span className={`ov-live ${refreshing ? 'is-refreshing' : ''}`}>
            <span className="ov-live-dot" aria-hidden="true" />
            {refreshing
              ? 'Refreshing…'
              : updatedAt
                ? `Live · ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Live'}
          </span>
        </header>

        {loading ? (
          <div className="ov-kpi-grid" aria-hidden="true">
            {KPI_SKELETONS.map((i) => (
              <div key={i} className="ov-kpi ov-kpi-skeleton">
                <span className="ov-sk ov-sk-icon" />
                <span className="ov-sk ov-sk-label" />
                <span className="ov-sk ov-sk-value" />
                <span className="ov-sk ov-sk-meta" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="ov-error" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button type="button" className="ov-retry" onClick={() => setRetryToken(t => t + 1)}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : (
          <div className="ov-kpi-grid" aria-live="polite">
            {cards.map((card) => {
              const { key, label, value, meta, icon: Icon, tone, target, title } = card
              const Tag = target ? 'button' : 'div'
              return (
                <Tag
                  key={key}
                  {...(target ? { type: 'button', onClick: () => onNavigate?.(target) } : {})}
                  className={`ov-kpi${target ? '' : ' ov-kpi-static'}`}
                  title={title}
                >
                  <span className="ov-kpi-top">
                    <span className={`ov-kpi-icon ${tone}`}><Icon size={18} /></span>
                    <span className="ov-kpi-label">{label}</span>
                  </span>
                  <span className="ov-kpi-value">{value}</span>
                  <span className="ov-kpi-meta">{meta}</span>
                </Tag>
              )
            })}
          </div>
        )}
      </section>

      {/* Below the hero: the left column is the users directory. The right
          column is reserved for the next overview section. */}
      <div className="ov-main">
        <OverviewUsers
          profiles={directory.profiles}
          lobbies={directory.lobbies}
          payments={directory.payments}
          loading={loading}
          asOf={updatedAt ? updatedAt.getTime() : 0}
          onNavigate={onNavigate}
        />

        <OverviewLobbies
          lobbies={directory.lobbies}
          lobbyTeams={directory.lobbyTeams}
          profiles={directory.profiles}
          loading={loading}
          asOf={updatedAt ? updatedAt.getTime() : 0}
          onNavigate={onNavigate}
          onOpenLobby={onOpenLobby}
        />
      </div>
    </div>
  )
}

export default OverviewView

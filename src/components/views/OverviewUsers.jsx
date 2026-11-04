import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Users, Search, X, ChevronDown, ArrowUp, ArrowDown,
  ChevronsUpDown, ArrowUpRight,
} from 'lucide-react'
import { titleCase, shortDate, fullDate, relative, inr } from './overviewUtils'
import './OverviewUsers.css'

const AVATAR_TONES = ['t0', 't1', 't2', 't3', 't4', 't5']

const avatarTone = (seed) => {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

// An "active" subscription whose expiry has passed is shown as expired —
// the database currently has one active row with a past expiry date.
const subscriptionState = (profile, now = 0) => {
  const raw = String(profile.subscription_status || 'inactive').toLowerCase()
  const expires = profile.subscription_expires_at ? new Date(profile.subscription_expires_at) : null
  const expired = expires && !Number.isNaN(expires.getTime()) && expires.getTime() < now

  if (raw === 'active') {
    return expired
      ? { key: 'expired', label: 'Expired', tone: 'warn' }
      : { key: 'active', label: 'Active', tone: 'ok' }
  }
  if (raw === 'trialing') return { key: 'trialing', label: 'Trial', tone: 'info' }
  if (raw === 'past_due') return { key: 'past_due', label: 'Past due', tone: 'warn' }
  if (raw === 'cancelled' || raw === 'canceled') return { key: 'cancelled', label: 'Cancelled', tone: 'warn' }
  return { key: raw, label: titleCase(raw), tone: 'muted' }
}

const Field = ({ label, value, mono = false }) => (
  <div className="ovu-field">
    <span className="ovu-field-label">{label}</span>
    <span className={`ovu-field-value${mono ? ' is-mono' : ''}`}>{value}</span>
  </div>
)

const SortIcon = ({ column, sort }) => {
  if (sort.key !== column) return <ChevronsUpDown size={11} className="ovu-sort-idle" />
  return sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
}

const OverviewUsers = ({ profiles = [], lobbies = [], payments = [], loading = false, asOf = 0, onNavigate }) => {
  const [query, setQuery] = useState('')
  const [plan, setPlan] = useState('all')
  const [status, setStatus] = useState('all')
  const [activity, setActivity] = useState('all')
  const [joined, setJoined] = useState('all')
  const [sort, setSort] = useState({ key: 'joined', dir: 'desc' })
  const [expanded, setExpanded] = useState(null)

  // Reference timestamp comes from the last successful data load, so render
  // stays pure and every relative label is consistent within a refresh.
  const now = asOf || 0

  // Roll lobby and payment rows up per user once per data refresh.
  const rows = useMemo(() => {
    const lobbyMap = new Map()
    for (const lobby of lobbies) {
      const entry = lobbyMap.get(lobby.user_id) || { count: 0, active: 0, lastTs: 0, lastName: '' }
      entry.count += 1
      if (lobby.status === 'active') entry.active += 1
      const created = new Date(lobby.created_at || 0).getTime()
      if (created > entry.lastTs) {
        entry.lastTs = created
        entry.lastName = lobby.name || ''
      }
      lobbyMap.set(lobby.user_id, entry)
    }

    const paymentMap = new Map()
    for (const payment of payments) {
      if ((payment.currency || 'INR') !== 'INR') continue
      const entry = paymentMap.get(payment.user_id) || { captured: 0, capturedTotal: 0, pending: 0 }
      if (payment.status === 'captured') {
        entry.captured += 1
        entry.capturedTotal += Number(payment.amount) || 0
      } else if (payment.status === 'created') {
        entry.pending += 1
      }
      paymentMap.set(payment.user_id, entry)
    }

    return profiles.map((profile) => {
      const lobby = lobbyMap.get(profile.id) || { count: 0, active: 0, lastTs: 0, lastName: '' }
      const pay = paymentMap.get(profile.id) || { captured: 0, capturedTotal: 0, pending: 0 }
      const email = profile.emails || ''
      const handle = profile.username || ''
      const display = profile.display_name || ''
      const joinedTs = new Date(profile.created_at || 0).getTime() || 0

      return {
        ...profile,
        email,
        handle,
        display,
        tier: String(profile.subscription_tier || 'free').toLowerCase(),
        status: subscriptionState(profile, now),
        joinedTs,
        lobbyCount: lobby.count,
        activeLobbies: lobby.active,
        lastLobbyTs: lobby.lastTs,
        lastName: lobby.lastName,
        credits: Number(profile.flux_balance) || 0,
        pay,
        initial: (email || handle || '?').charAt(0).toUpperCase(),
        avatarTone: avatarTone(email || handle || profile.id),
        search: [email, handle, display, profile.phone ?? '', profile.id].join(' ').toLowerCase(),
      }
    })
  }, [profiles, lobbies, payments, now])

  const planOptions = useMemo(
    () => [...new Set(rows.map((row) => row.tier))].sort(),
    [rows],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const weekAgo = now - 7 * 86_400_000
    const monthAgo = now - 30 * 86_400_000
    const monthStart = new Date(now)
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const filtered = rows.filter((row) => {
      if (needle && !row.search.includes(needle)) return false
      if (plan !== 'all' && row.tier !== plan) return false
      if (status !== 'all' && row.status.key !== status) return false
      if (activity === 'created' && row.lobbyCount === 0) return false
      if (activity === 'active' && row.activeLobbies === 0) return false
      if (activity === 'none' && row.lobbyCount > 0) return false
      if (joined === '7d' && row.joinedTs < weekAgo) return false
      if (joined === '30d' && row.joinedTs < monthAgo) return false
      if (joined === 'month' && row.joinedTs < monthStart.getTime()) return false
      return true
    })

    const direction = sort.dir === 'asc' ? 1 : -1
    filtered.sort((a, b) => {
      switch (sort.key) {
        case 'email':
          return a.email.localeCompare(b.email) * direction
        case 'plan':
          return a.tier.localeCompare(b.tier) * direction
        case 'lastLobby':
          return ((a.lastLobbyTs || 0) - (b.lastLobbyTs || 0)) * direction
        case 'joined':
        default:
          return (a.joinedTs - b.joinedTs) * direction
      }
    })

    return filtered
  }, [rows, query, plan, status, activity, joined, sort, now])

  // Keep the opened detail visible inside the scrollable list.
  useEffect(() => {
    if (!expanded) return
    const node = document.getElementById(`ovu-detail-${expanded}`)
    if (node) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [expanded])

  const hasFilters = Boolean(query.trim()) || plan !== 'all' || status !== 'all'
    || activity !== 'all' || joined !== 'all'

  const clearFilters = () => {
    setQuery('')
    setPlan('all')
    setStatus('all')
    setActivity('all')
    setJoined('all')
  }

  const toggleSort = (key) => {
    setSort((current) => (
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'email' ? 'asc' : 'desc' }
    ))
  }

  return (
    <section className="ovu-panel" aria-labelledby="ovu-title">
      <header className="ovu-head">
        <div className="ovu-head-title">
          <span className="ovu-head-icon"><Users size={16} /></span>
          <div>
            <h2 id="ovu-title">Users</h2>
            <p>Every account, plan and lobby activity</p>
          </div>
        </div>
        <button type="button" className="ovu-open" onClick={() => onNavigate?.('users')}>
          Open Users <ArrowUpRight size={13} />
        </button>
      </header>

      <div className="ovu-toolbar">
        <div className="ovu-search">
          <Search size={14} className="ovu-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search email, username, phone or ID…"
            aria-label="Search users"
          />
          {query && (
            <button type="button" className="ovu-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="ovu-filters">
          <select className="ovu-select" value={plan} onChange={(event) => setPlan(event.target.value)} aria-label="Filter by plan">
            <option value="all">All plans</option>
            {planOptions.map((option) => (
              <option key={option} value={option}>{titleCase(option)}</option>
            ))}
          </select>

          <select className="ovu-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by subscription status">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="inactive">Inactive</option>
          </select>

          <select className="ovu-select" value={activity} onChange={(event) => setActivity(event.target.value)} aria-label="Filter by lobby activity">
            <option value="all">Any lobby activity</option>
            <option value="created">Created a lobby</option>
            <option value="active">Has active lobby</option>
            <option value="none">No lobbies</option>
          </select>

          <select className="ovu-select" value={joined} onChange={(event) => setJoined(event.target.value)} aria-label="Filter by join date">
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="month">This month</option>
          </select>
        </div>
      </div>

      <div className="ovu-summary">
        <span>
          <strong>{loading ? '—' : visible.length}</strong> of {rows.length} users
        </span>
        {hasFilters ? (
          <button type="button" className="ovu-clear" onClick={clearFilters}>Clear filters</button>
        ) : (
          <span className="ovu-hint">Click a row for full details</span>
        )}
      </div>

      <div className="ovu-list-head" role="row">
        <button type="button" className={`ovu-sort${sort.key === 'email' ? ' is-active' : ''}`} onClick={() => toggleSort('email')}>
          User <SortIcon column="email" sort={sort} />
        </button>
        <button type="button" className={`ovu-sort${sort.key === 'plan' ? ' is-active' : ''}`} onClick={() => toggleSort('plan')}>
          Plan <SortIcon column="plan" sort={sort} />
        </button>
        <button type="button" className={`ovu-sort${sort.key === 'joined' ? ' is-active' : ''}`} onClick={() => toggleSort('joined')}>
          Joined <SortIcon column="joined" sort={sort} />
        </button>
        <button type="button" className={`ovu-sort${sort.key === 'lastLobby' ? ' is-active' : ''}`} onClick={() => toggleSort('lastLobby')}>
          Last lobby <SortIcon column="lastLobby" sort={sort} />
        </button>
        <span aria-hidden="true" />
      </div>

      {loading ? (
        <div className="ovu-scroll" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div className="ovu-row ovu-skeleton" key={index}>
              <span className="ovu-sk-user">
                <span className="ovu-sk ovu-sk-avatar" />
                <span className="ovu-sk ovu-sk-line" />
              </span>
              <span className="ovu-sk ovu-sk-pill" />
              <span className="ovu-sk ovu-sk-date" />
              <span className="ovu-sk ovu-sk-date" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="ovu-empty">
          <Users size={26} />
          <strong>No users match these filters</strong>
          <p>Try a different search term or reset the filters.</p>
          <button type="button" className="ovu-clear" onClick={clearFilters}>Clear filters</button>
        </div>
      ) : (
        <div className={`ovu-scroll${expanded ? ' has-open' : ''}`}>
          {visible.map((row) => {
            const open = expanded === row.id
            return (
              <Fragment key={row.id}>
                <button
                  type="button"
                  className={`ovu-row${open ? ' is-open' : ''}`}
                  onClick={() => setExpanded(open ? null : row.id)}
                  aria-expanded={open}
                  aria-controls={open ? `ovu-detail-${row.id}` : undefined}
                >
                  <span className="ovu-user">
                    <span className={`ovu-avatar ${row.avatarTone}`}>{row.initial}</span>
                    <span className="ovu-user-text">
                      <span className="ovu-email" title={row.email}>{row.email || 'No email'}</span>
                      <span className="ovu-handle">{row.handle ? `@${row.handle}` : row.display || '—'}</span>
                    </span>
                  </span>

                  <span className="ovu-plan">
                    <span className={`ovu-plan-badge ${row.tier === 'free' ? 'free' : 'paid'}`}>{row.tier}</span>
                    <span className={`ovu-status ${row.status.tone}`}>
                      <span className="ovu-dot" aria-hidden="true" />
                      {row.status.label}
                    </span>
                  </span>

                  <span className="ovu-joined" title={fullDate(row.created_at)}>{shortDate(row.created_at)}</span>

                  <span className={`ovu-lobby${row.lastLobbyTs ? '' : ' is-empty'}`} title={row.lastLobbyTs ? fullDate(row.lastLobbyTs) : 'No lobby yet'}>
                    {row.lastLobbyTs ? relative(row.lastLobbyTs, now) : '—'}
                  </span>

                  <ChevronDown size={15} className="ovu-chevron" aria-hidden="true" />
                </button>

                {open && (
                  <div className="ovu-detail" id={`ovu-detail-${row.id}`}>
                    <div className="ovu-detail-grid">
                      <Field label="Email" value={row.email || '—'} />
                      <Field label="Phone" value={row.phone ? String(row.phone) : 'Not provided'} />
                      <Field label="Username" value={row.handle ? `@${row.handle}` : '—'} />
                      <Field label="Display name" value={row.display || '—'} />
                      <Field label="Joined" value={fullDate(row.created_at)} />
                      <Field label="Last updated" value={`${relative(row.updated_at, now)} · ${shortDate(row.updated_at)}`} />
                      <Field label="Last active" value={row.last_ad_watched_at ? relative(row.last_ad_watched_at, now) : 'No ad activity'} />
                      <Field label="Plan" value={titleCase(row.tier)} />
                      <Field label="Subscription" value={row.status.label} />
                      <Field label="Expires" value={row.subscription_expires_at ? fullDate(row.subscription_expires_at) : '—'} />
                      <Field label="Flux credits" value={`${row.credits.toLocaleString()} Flux`} />
                      <Field label="Ads watched" value={row.ads_watched_count || 0} />
                      <Field label="Lobbies created" value={`${row.lobbyCount} total · ${row.activeLobbies} active`} />
                      <Field
                        label="Last lobby"
                        value={row.lastLobbyTs ? `${row.lastName || 'Untitled'} · ${relative(row.lastLobbyTs, now)}` : 'None yet'}
                      />
                      <Field
                        label="Payments"
                        value={`${row.pay.captured} captured · ${inr(row.pay.capturedTotal)}${row.pay.pending ? ` · ${row.pay.pending} unpaid` : ''}`}
                      />
                      <Field label="Role" value={row.is_admin ? 'Admin' : 'User'} />
                      <Field label="Device switches" value={row.device_switch_count || 0} />
                      <Field label="User ID" value={row.id} mono />
                    </div>

                    <div className="ovu-detail-foot">
                      <span className="ovu-detail-hint">Joined {shortDate(row.created_at)} · {row.lobbyCount} lobbies</span>
                      <button
                        type="button"
                        className="ovu-detail-open"
                        onClick={() => onNavigate?.('users')}
                      >
                        Open in Users <ArrowUpRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default OverviewUsers

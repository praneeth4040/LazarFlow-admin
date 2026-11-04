import { useMemo, useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Bell, Send, Info, RefreshCcw, RotateCcw,
  CheckCircle2, XCircle, Users, MessageSquare, Terminal, Zap,
} from 'lucide-react'
import './NotificationsView.css'

const KPI_SKELETONS = [0, 1, 2, 3]

// Quick one-off sender over the backend notification dispatcher:
//   In-app → POST /api/notifications/send-in-app (reaches every profile)
//   Push   → POST /api/notifications/send        (needs a registered Expo token)
// Recipients are chosen with filters (search / plan / status / push token)
// instead of clicking through a list. Campaigns with audiences and
// personalization live in Users → Notifications.
const DEFAULT_FILTERS = { plan: 'all', status: 'all' }

const NotificationsView = () => {
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [channel, setChannel] = useState('in_app')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState({ type: '', message: '' })
  const [personalize, setPersonalize] = useState(true)
  const [overrides, setOverrides] = useState([])
  const [overrideDraft, setOverrideDraft] = useState({ user_id: '', title: '', body: '' })
  const [activityLogs, setActivityLogs] = useState([])

  const addLog = (type, message, details = null) => {
    const newLog = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      type, message, details,
    }
    setActivityLogs(prev => [newLog, ...prev].slice(0, 50))
  }

  useEffect(() => { fetchNotificationUsers() }, [])

  const fetchNotificationUsers = async () => {
    setLoadingUsers(true)
    addLog('info', 'Fetching recipients from Supabase...')
    try {
      const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('id, username, display_name, emails, expo_push_token, subscription_tier, subscription_status')
        .order('username', { ascending: true })
      if (pError) addLog('error', 'Failed to fetch profiles from Supabase', pError.message)

      const list = (profiles || []).map(u => ({
        ...u,
        display_name: u.display_name || u.username || u.emails || 'Unknown User',
      }))
      addLog('success', `Fetched ${list.length} users · ${list.filter(u => u.expo_push_token).length} with push enabled`)
      setUsers(list)
    } catch (err) {
      addLog('error', `Failed to fetch recipients: ${err.message}`)
      setStatus({ type: 'error', message: `Recipient list error: ${err.message}` })
    } finally {
      setLoadingUsers(false)
    }
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (filters.plan !== 'all' && (u.subscription_tier || 'free') !== filters.plan) return false
      if (filters.status !== 'all') {
        if (filters.status === 'active' && !(u.subscription_status === 'active' && u.subscription_tier !== 'free')) return false
        if (filters.status === 'inactive' && u.subscription_status === 'active' && u.subscription_tier !== 'free') return false
      }
      if (q) {
        const blob = `${u.display_name} ${u.username} ${u.emails}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [users, query, filters])

  const filtersActive = query.trim() !== ''
    || filters.plan !== 'all' || filters.status !== 'all'

  const resetFilters = () => {
    setQuery('')
    setFilters(DEFAULT_FILTERS)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!message.trim()) { setStatus({ type: 'error', message: 'Message body is required' }); return }
    if (filteredUsers.length === 0) {
      setStatus({ type: 'error', message: 'No recipients match the current filters' })
      return
    }

    setSending(true)
    setStatus({ type: '', message: '' })
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) throw new Error('Admin session expired — sign in again.')

      const finalTitle = title.trim() || 'LazarFlow Notification'
      const finalMessage = message.trim()
      // One audience call replaces the old per-user request loop. When any
      // filter/search is active, the visible matches are pinned by id so the
      // backend sends to exactly the users the admin sees.
      const narrowed = query.trim() !== '' || filters.plan !== 'all' || filters.status !== 'all'
      const payload = {
        title: finalTitle,
        body: finalMessage,
        channel,
        personalize,
        overrides: Object.fromEntries(
          overrides.map((o) => [o.user_id, { title: o.title || undefined, body: o.body || undefined }]),
        ),
      }
      const endpoint = narrowed ? '/api/notifications/send-filtered' : '/api/notifications/broadcast'
      if (narrowed) {
        payload.filters = { user_ids: filteredUsers.map((u) => u.id) }
        if (filters.plan !== 'all') payload.filters.plans = [filters.plan]
        if (filters.status === 'active') payload.filters.statuses = ['active']
      }

      const res = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok) {
        const code = out?.detail?.code || res.status
        throw new Error(out?.detail?.message || `Send failed (${code})`)
      }

      addLog('success', `Campaign sent — ${out.matched ?? filteredUsers.length} matched · ${out.accepted ?? 0} accepted`, out)
      setStatus({
        type: 'success',
        message: `Sent to ${out.matched ?? filteredUsers.length} user(s) — ${out.accepted ?? 0} accepted`
          + `${out.no_token ? `, ${out.no_token} in-app only (no push token)` : ''}`
          + `${out.rejected ? `, ${out.rejected} rejected` : ''}.`,
      })
    } catch (err) {
      addLog('error', 'Send failed', String(err?.message || err))
      setStatus({ type: 'error', message: err?.message || 'Could not send the notification.' })
    } finally {
      setSending(false)
    }
  }

  const addOverride = () => {
    if (!overrideDraft.user_id) return
    setOverrides((prev) => [...prev.filter((o) => o.user_id !== overrideDraft.user_id), { ...overrideDraft }])
    setOverrideDraft({ user_id: '', title: '', body: '' })
  }

  const removeOverride = (userId) => setOverrides((prev) => prev.filter((o) => o.user_id !== userId))

  const audienceLabel = filtersActive
    ? `${filteredUsers.length} matching`
    : 'All users'

  const pushEnabledCount = users.filter((u) => u.expo_push_token).length

  const cards = loadingUsers ? [] : [
    {
      key: 'org',
      label: 'Users',
      value: users.length.toLocaleString('en-IN'),
      meta: 'Profiles available as recipients',
      icon: Users,
      tone: 'blue',
    },
    {
      key: 'push',
      label: 'Push enabled',
      value: pushEnabledCount.toLocaleString('en-IN'),
      meta: 'Users with a registered push token',
      icon: Zap,
      tone: 'violet',
    },
    {
      key: 'audience',
      label: 'Audience',
      value: filteredUsers.length.toLocaleString('en-IN'),
      meta: audienceLabel,
      icon: Send,
      tone: 'green',
    },
    {
      key: 'logs',
      label: 'Log entries',
      value: String(activityLogs.length),
      meta: 'This session, newest first',
      icon: Terminal,
      tone: 'amber',
    },
  ]

  return (
    <div className="ntf-page">
      {/* ── Hero ── */}
      <section className="ntf-hero" aria-labelledby="ntf-title">
        <header className="ntf-hero-head">
          <div>
            <span className="ntf-eyebrow"><Bell size={12} /> Engagement</span>
            <h1 id="ntf-title" className="ntf-title">Notifications</h1>
            <p className="ntf-subtitle">
              Quick in-app and push blasts through the backend dispatcher. For audiences,
              personalization and history, use Users → Notifications.
            </p>
          </div>
          <div className="ntf-head-actions">
            <span className={`ntf-live ${loadingUsers ? 'is-refreshing' : ''}`}>
              <span className="ntf-live-dot" aria-hidden="true" />
              {loadingUsers ? 'Syncing…' : 'Recipients ready'}
            </span>
            <button type="button" className="ntf-action" onClick={fetchNotificationUsers} disabled={loadingUsers}>
              <RefreshCcw size={14} /> Refresh recipients
            </button>
          </div>
        </header>

        {loadingUsers ? (
          <div className="ntf-kpi-grid" aria-hidden="true">
            {KPI_SKELETONS.map((i) => (
              <div key={i} className="ntf-kpi ntf-kpi-skeleton">
                <span className="ntf-sk ntf-sk-icon" />
                <span className="ntf-sk ntf-sk-label" />
                <span className="ntf-sk ntf-sk-value" />
                <span className="ntf-sk ntf-sk-meta" />
              </div>
            ))}
          </div>
        ) : (
          <div className="ntf-kpi-grid" aria-live="polite">
            {cards.map(({ key, label, value, meta, icon, tone }) => {
              const Icon = icon
              return (
                <div key={key} className="ntf-kpi">
                  <span className="ntf-kpi-top">
                    <span className={`ntf-kpi-icon ${tone}`}><Icon size={18} /></span>
                    <span className="ntf-kpi-label">{label}</span>
                  </span>
                  <span className="ntf-kpi-value">{value}</span>
                  <span className="ntf-kpi-meta">{meta}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Compose + preview ── */}
      <div className="ntf-main">
        <section className="ntf-panel" aria-label="Compose notification">
          <header className="ntf-panel-head">
            <h2 className="ntf-panel-title"><MessageSquare size={14} /> Compose</h2>
            <span className="ntf-panel-hint">Delivered through the notification dispatcher</span>
          </header>

          <form onSubmit={handleSend} className="ntf-form">
            <div className="ntf-field">
              <label className="ntf-label">Channel</label>
              <div className="ntf-channel-cards">
                <button
                  type="button"
                  className={`ntf-channel-card${channel === 'in_app' ? ' active' : ''}`}
                  onClick={() => setChannel('in_app')}
                >
                  <span className="ntf-channel-icon"><Bell size={16} /></span>
                  <span className="ntf-channel-text">
                    <strong>In-app</strong>
                    <span>Shows up on every user's notification page — no setup needed</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`ntf-channel-card${channel === 'push' ? ' active' : ''}`}
                  onClick={() => setChannel('push')}
                >
                  <span className="ntf-channel-icon"><Zap size={16} /></span>
                  <span className="ntf-channel-text">
                    <strong>Push</strong>
                    <span>Device notification for the {pushEnabledCount} users with it enabled — others get the in-app copy</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`ntf-channel-card${channel === 'both' ? ' active' : ''}`}
                  onClick={() => setChannel('both')}
                >
                  <span className="ntf-channel-icon"><Bell size={16} /></span>
                  <span className="ntf-channel-text">
                    <strong>Both</strong>
                    <span>Push + the in-app copy for everyone — tokenless users still get the in-app row</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="ntf-field">
              <div className="ntf-filter-head">
                <label className="ntf-label">Recipients by filter</label>
                {filtersActive && (
                  <button type="button" className="ntf-reset" onClick={resetFilters}>
                    <RotateCcw size={12} /> Reset
                  </button>
                )}
              </div>
              <div className="ntf-filters">
                <input
                  type="search"
                  className="ntf-input ntf-filter-search"
                  placeholder="Search name, username or email…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search recipients"
                />
                <select
                  className="ntf-input"
                  value={filters.plan}
                  onChange={(e) => setFilters((f) => ({ ...f, plan: e.target.value }))}
                  aria-label="Filter by plan"
                >
                  <option value="all">All plans</option>
                  <option value="free">Free</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <select
                  className="ntf-input"
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                  aria-label="Filter by subscription status"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active subscribers</option>
                  <option value="inactive">Inactive / free</option>
                </select>
              </div>
              <p className={`ntf-match-pill${filteredUsers.length === 0 ? ' is-empty' : ''}`}>
                <Users size={13} />
                {filteredUsers.length} of {users.length} users match — they'll all receive this notification.
              </p>
            </div>

            <div className="ntf-field">
              <label className="ntf-label ntf-check">
                <input
                  type="checkbox"
                  checked={personalize}
                  onChange={(e) => setPersonalize(e.target.checked)}
                />
                Personalize — replace <code>{'{{name}}'}</code> and <code>{'{{username}}'}</code> per recipient
              </label>
            </div>

            <div className="ntf-field">
              <label className="ntf-label">Per-user overrides (optional)</label>
              {overrides.map((o) => {
                const u = users.find((x) => x.id === o.user_id)
                return (
                  <div key={o.user_id} className="ntf-override-row">
                    <strong>{u?.display_name || o.user_id.slice(0, 8)}</strong>
                    <span className="ntf-override-text">{o.title || '(default title)'} — {o.body || '(default body)'}</span>
                    <button type="button" className="ntf-override-remove" onClick={() => removeOverride(o.user_id)} aria-label="Remove override">
                      <XCircle size={13} />
                    </button>
                  </div>
                )
              })}
              <div className="ntf-override-editor">
                <select
                  className="ntf-input"
                  value={overrideDraft.user_id}
                  onChange={(e) => setOverrideDraft((d) => ({ ...d, user_id: e.target.value }))}
                  aria-label="Pick a user to customize"
                >
                  <option value="">Pick a user to customize…</option>
                  {filteredUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.display_name}</option>
                  ))}
                </select>
                {overrideDraft.user_id && (
                  <>
                    <input
                      type="text" className="ntf-input"
                      placeholder="Custom title (optional)"
                      value={overrideDraft.title}
                      onChange={(e) => setOverrideDraft((d) => ({ ...d, title: e.target.value }))}
                    />
                    <textarea
                      className="ntf-textarea" rows="2"
                      placeholder="Custom body (optional)"
                      value={overrideDraft.body}
                      onChange={(e) => setOverrideDraft((d) => ({ ...d, body: e.target.value }))}
                    />
                    <button type="button" className="ntf-action" onClick={addOverride}>Save override</button>
                  </>
                )}
              </div>
            </div>

            <div className="ntf-field">
              <label className="ntf-label" htmlFor="notif-title">Title (optional)</label>
              <input
                id="notif-title" type="text"
                placeholder="e.g. Lobby Update"
                value={title} onChange={(e) => setTitle(e.target.value)}
                className="ntf-input"
              />
            </div>

            <div className="ntf-field">
              <label className="ntf-label" htmlFor="notif-message">Message body</label>
              <textarea
                id="notif-message"
                placeholder="Enter your message here..."
                value={message} onChange={(e) => setMessage(e.target.value)}
                className="ntf-textarea" rows="4" required
              />
            </div>

            {status.message && (
              <div className={`ntf-status ${status.type}`} role="alert">
                {status.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <div className="ntf-status-content">{status.message}</div>
              </div>
            )}

            <button
              type="submit" className="ntf-send"
              disabled={sending || filteredUsers.length === 0 || !message.trim()}
            >
              {sending
                ? <><RefreshCcw size={15} className="ntf-spin" /> Sending…</>
                : <><Send size={15} /> Send to {filteredUsers.length} user{filteredUsers.length === 1 ? '' : 's'}</>
              }
            </button>
          </form>
        </section>

        <section className="ntf-panel" aria-label="Live preview">
          <header className="ntf-panel-head">
            <h2 className="ntf-panel-title"><Bell size={14} /> Live preview</h2>
          </header>

          <div className="ntf-phone">
            <div className="ntf-phone-screen">
              <div className="ntf-bubble">
                <div className="ntf-app-info">
                  <div className="ntf-app-icon">LF</div>
                  <span className="ntf-app-name">LazarFlow</span>
                  <span className="ntf-time">now</span>
                </div>
                <div className="ntf-content">
                  <div className="ntf-content-title">{title || 'Notification Title'}</div>
                  <div className="ntf-content-message">{message || 'Your message will appear here...'}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="ntf-hint"><Info size={14} /> This is how the notification appears in the app's notification page{channel === 'push' ? ' and as a device push' : ''}.</div>
        </section>
      </div>

      {/* ── Activity logs ── */}
      <section className="ntf-panel" aria-label="Activity logs">
        <header className="ntf-panel-head">
          <h2 className="ntf-panel-title"><Terminal size={14} /> Recent activity logs</h2>
          <button type="button" className="ntf-clear" onClick={() => setActivityLogs([])}>Clear logs</button>
        </header>
        <div className="ntf-logs">
          {activityLogs.length === 0 ? (
            <div className="ntf-empty">No recent activity logs</div>
          ) : (
            activityLogs.map(log => (
              <div key={log.id} className={`ntf-log ntf-log-${log.type}`}>
                <span className="ntf-log-ts">[{log.timestamp}]</span>
                <span className="ntf-log-type">{log.type.toUpperCase()}:</span>
                <span className="ntf-log-message">{log.message}</span>
                {log.details && (
                  <pre className="ntf-log-details">
                    {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

export default NotificationsView

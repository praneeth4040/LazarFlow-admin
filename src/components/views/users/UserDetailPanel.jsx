import { useEffect } from 'react'
import {
  AlertTriangle, Ban, Bell, Calendar, CheckCircle2, Copy, Cpu,
  Crown, Mail, RotateCcw, ShieldCheck, Trophy, UserCheck,
  UserX, X, Zap,
} from 'lucide-react'
import {
  banMeta, compactNumber, daysLeft, displayEmail, displayHandle, displayName,
  formatDate, formatDateTime, initials, lockBodyScroll, relativeTime, avatarTone,
} from './usersUtils'

const Field = ({ label, value, mono = false, children }) => {
  const shown = children ?? (
    value === null || value === undefined || value === '' ? '—' : value
  )
  return (
    <div className="usr-field">
      <span className="usr-field-label">{label}</span>
      <span className={`usr-field-value${mono ? ' is-mono' : ''}`}>{shown}</span>
    </div>
  )
}

const DetailStat = ({ icon: Icon, label, value, sub, tone = '' }) => (
  <div className={`usr-detail-stat ${tone}`}>
    <span className="usr-detail-stat-icon">{Icon && <Icon size={15} />}</span>
    <span className="usr-detail-stat-value">{value}</span>
    <span className="usr-detail-stat-label">{label}</span>
    {sub && <span className="usr-detail-stat-sub">{sub}</span>}
  </div>
)

const ListRow = ({ title, meta, right, tone = '' }) => (
  <div className="usr-mini-row">
    <span className="usr-mini-main">
      <span className="usr-mini-title">{title}</span>
      <span className="usr-mini-meta">{meta}</span>
    </span>
    <span className={`usr-mini-right ${tone}`}>{right}</span>
  </div>
)

const EmptyMini = ({ children }) => <div className="usr-mini-empty">{children}</div>

const UserDetailPanel = ({
  row,
  ledger = [],
  creditEvents = [],
  notifications = [],
  grantsAvailable = false,
  now,
  suspended = false,
  onClose,
  onCredits,
  onSubscription,
  onNotify,
  onBan,
  onUnban,
  onSignOut,
  onResetDevice,
  onCopy,
}) => {
  useEffect(() => {
    if (suspended) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, suspended])

  useEffect(() => lockBodyScroll(), [])

  if (!row) return null

  const ban = banMeta(row)
  const left = daysLeft(row.subscription_expires_at, now)
  const history = grantsAvailable ? ledger : creditEvents
  const expiryLabel = row.subscription_expires_at ? formatDateTime(row.subscription_expires_at) : 'No expiry'
  const bannedUntil = ban?.until ? formatDateTime(ban.until) : 'Permanent'

  return (
    <div
      className="usr-drawer-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside className="usr-drawer" role="dialog" aria-modal="true" aria-labelledby="usr-drawer-title">
        <header className="usr-drawer-head">
          <div className="usr-drawer-identity">
            <span className={`usr-avatar usr-avatar-lg ${avatarTone(row.id)}`} aria-hidden="true">
              {initials(row)}
            </span>
            <div className="usr-drawer-id">
              <h2 id="usr-drawer-title" title={displayEmail(row)}>{displayEmail(row)}</h2>
              <p>
                {displayHandle(row) || displayName(row)}
                {row.phone ? ` · ${row.phone}` : ''}
              </p>
              <div className="usr-badge-row">
                <span className={`usr-pill ${row.plan.tone}`}>{row.plan.label}</span>
                <span className={`usr-pill ${row.sub.tone}`}>{row.sub.label}</span>
                {row.is_admin && <span className="usr-pill admin">Admin</span>}
                {row.banned && <span className="usr-pill danger">Banned</span>}
              </div>
            </div>
          </div>
          <button type="button" className="usr-icon-btn usr-close" onClick={onClose} aria-label="Close user details">
            <X size={18} />
          </button>
        </header>

        <div className="usr-drawer-actions">
          <button type="button" className="usr-btn" onClick={() => onCredits(row)}>
            <Zap size={14} /> Adjust credits
          </button>
          <button type="button" className="usr-btn" onClick={() => onSubscription(row)}>
            <Crown size={14} /> Manage plan
          </button>
          <button type="button" className="usr-btn" onClick={() => onNotify(row)}>
            <Bell size={14} /> Notify
          </button>
          {row.banned ? (
            <button type="button" className="usr-btn usr-btn-ok" onClick={() => onUnban(row)}>
              <UserCheck size={14} /> Unban
            </button>
          ) : (
            <button type="button" className="usr-btn usr-btn-danger" onClick={() => onBan(row)}>
              <UserX size={14} /> Ban user
            </button>
          )}
        </div>

        <div className="usr-drawer-body">
          <div className="usr-detail-stats">
            <DetailStat icon={Zap} label="Credits" value={row.balance.toLocaleString('en-IN')} />
            <DetailStat icon={Trophy} label="Lobbies" value={row.lobbyCount} sub={`${row.activeLobbyCount} active`} />
            <DetailStat icon={Cpu} label="AI jobs" value={row.jobCount} sub={`${compactNumber(row.tokens)} tokens`} />
            <DetailStat
              icon={CheckCircle2}
              label="Captured"
              value={`₹${row.capturedRevenue.toLocaleString('en-IN')}`}
              sub={`${row.capturedCount} payments`}
              tone="ok"
            />
          </div>

          <section className="usr-detail-card">
            <header className="usr-detail-card-head">
              <h3><Crown size={15} /> Subscription</h3>
              <button type="button" className="usr-link-btn" onClick={() => onSubscription(row)}>Manage</button>
            </header>
            <div className="usr-field-grid">
              <Field label="Plan" value={row.plan.label} />
              <Field label="Status" value={row.sub.label} />
              <Field label="Expires" value={expiryLabel} />
              <Field
                label="Time left"
                value={left === null ? '—' : left <= 0 ? 'Expired' : `${left} day${left === 1 ? '' : 's'}`}
              />
              <Field label="Pending orders" value={`${row.pendingCount} · ₹${row.pendingRevenue.toLocaleString('en-IN')}`} />
              <Field label="Lifetime captured" value={`₹${row.capturedRevenue.toLocaleString('en-IN')}`} />
            </div>
          </section>

          <section className="usr-detail-card">
            <header className="usr-detail-card-head">
              <h3><Zap size={15} /> Credits</h3>
              <button type="button" className="usr-link-btn" onClick={() => onCredits(row)}>Adjust</button>
            </header>
            <div className="usr-credit-hero">
              <span className="usr-credit-value">{row.balance.toLocaleString('en-IN')}</span>
              <span className="usr-credit-label">Flux credits available</span>
            </div>

            {history.length === 0 ? (
              <EmptyMini>
                {grantsAvailable
                  ? 'No credit changes recorded yet.'
                  : 'No changes in this session. Grant history needs the admin_grants policies (docs/sql/002).'}
              </EmptyMini>
            ) : (
              <div className="usr-mini-list">
                {history.slice(0, 6).map((entry) => {
                  const delta = Number(entry.delta) || 0
                  return (
                    <ListRow
                      key={entry.id}
                      title={entry.reason || 'Manual adjustment'}
                      meta={`${formatDateTime(entry.created_at)}${entry.note ? ` · ${entry.note}` : ''}`}
                      right={`${delta > 0 ? '+' : ''}${delta.toLocaleString('en-IN')}`}
                      tone={delta >= 0 ? 'ok' : 'danger'}
                    />
                  )
                })}
              </div>
            )}
          </section>

          <section className="usr-detail-card">
            <header className="usr-detail-card-head">
              <h3><ShieldCheck size={15} /> Account & security</h3>
            </header>
            <div className="usr-field-grid">
              <Field label="Email" value={displayEmail(row)} />
              <Field label="Phone" value={row.phone} />
              <Field label="User ID" mono>
                <span className="usr-copy-row">
                  {row.id}
                  <button
                    type="button"
                    className="usr-copy-btn"
                    onClick={() => onCopy(row.id, 'User ID copied')}
                    aria-label="Copy user ID"
                  >
                    <Copy size={11} />
                  </button>
                </span>
              </Field>
              <Field label="Joined" value={formatDateTime(row.created_at)} />
              <Field label="Last activity" value={relativeTime(row.lastActiveTs ? new Date(row.lastActiveTs).toISOString() : null, now)} />
              <Field label="Last ad watched" value={row.last_ad_watched_at ? formatDateTime(row.last_ad_watched_at) : 'Never'} />
              <Field label="Ads watched" value={row.ads_watched_count || 0} />
              <Field label="Device switches" value={row.device_switch_count || 0} />
              <Field label="Role" value={row.is_admin ? 'Admin' : 'User'} />
              <Field label="Lobbies created" value={row.lobbies_created_count ?? row.lobbyCount} />
            </div>
            <div className="usr-inline-actions">
              <button type="button" className="usr-btn usr-btn-sm" onClick={() => onSignOut(row)}>
                <RotateCcw size={13} /> Sign out sessions
              </button>
              <button type="button" className="usr-btn usr-btn-sm" onClick={() => onResetDevice(row)}>
                <ShieldCheck size={13} /> Reset device lock
              </button>
            </div>
          </section>

          <section className="usr-detail-card">
            <header className="usr-detail-card-head">
              <h3><Trophy size={15} /> Recent lobbies</h3>
              <span className="usr-detail-count">{row.lobbyCount} total</span>
            </header>
            {row.lobbyList.length === 0 ? (
              <EmptyMini>No lobbies created yet.</EmptyMini>
            ) : (
              <div className="usr-mini-list">
                {row.lobbyList.slice(0, 5).map((lobby) => (
                  <ListRow
                    key={lobby.id}
                    title={lobby.name || 'Untitled lobby'}
                    meta={`${lobby.status || 'unknown'} · ${formatDate(lobby.created_at, now)}`}
                    right={relativeTime(lobby.created_at, now)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="usr-detail-card">
            <header className="usr-detail-card-head">
              <h3><Mail size={15} /> Payments</h3>
              <span className="usr-detail-count">{row.paymentList.length} total</span>
            </header>
            {row.paymentList.length === 0 ? (
              <EmptyMini>No payments recorded.</EmptyMini>
            ) : (
              <div className="usr-mini-list">
                {row.paymentList.slice(0, 5).map((payment) => (
                  <ListRow
                    key={payment.id}
                    title={`${payment.tier || 'Payment'} · ₹${(Number(payment.amount) || 0).toLocaleString('en-IN')}`}
                    meta={formatDateTime(payment.created_at)}
                    right={payment.status || 'unknown'}
                    tone={payment.status === 'captured' ? 'ok' : 'warn'}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="usr-detail-card">
            <header className="usr-detail-card-head">
              <h3><Cpu size={15} /> AI activity</h3>
              <span className="usr-detail-count">{compactNumber(row.tokens)} tokens</span>
            </header>
            {row.jobList.length === 0 ? (
              <EmptyMini>No OCR / AI jobs yet.</EmptyMini>
            ) : (
              <div className="usr-mini-list">
                {row.jobList.slice(0, 5).map((job) => {
                  const usage = job.token_usage || {}
                  const tokens = (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0)
                  return (
                    <ListRow
                      key={job.id}
                      title={`${job.status || 'job'} · ${compactNumber(tokens)} tokens`}
                      meta={formatDateTime(job.created_at)}
                      right={relativeTime(job.created_at, now)}
                    />
                  )
                })}
              </div>
            )}
          </section>

          <section className="usr-detail-card">
            <header className="usr-detail-card-head">
              <h3><Bell size={15} /> Notifications</h3>
              <button type="button" className="usr-link-btn" onClick={() => onNotify(row)}>Send</button>
            </header>
            {notifications.length === 0 ? (
              <EmptyMini>No notifications sent yet.</EmptyMini>
            ) : (
              <div className="usr-mini-list">
                {notifications.slice(0, 5).map((item) => (
                  <ListRow
                    key={item.id}
                    title={item.title || 'Notification'}
                    meta={`${item.channel || 'in_app'} · ${formatDateTime(item.created_at)}`}
                    right={item.read_at ? 'Read' : item.status || 'delivered'}
                    tone={item.read_at ? 'ok' : 'warn'}
                  />
                ))}
              </div>
            )}
          </section>

          <section className={`usr-detail-card usr-danger-card${row.banned ? ' is-banned' : ''}`}>
            <header className="usr-detail-card-head">
              <h3><AlertTriangle size={15} /> {row.banned ? 'Banned account' : 'Danger zone'}</h3>
            </header>
            {row.banned ? (
              <>
                <div className="usr-field-grid">
                  <Field label="Reason" value={ban?.reason || 'No reason recorded'} />
                  <Field label="Banned at" value={ban?.at ? formatDateTime(ban.at) : '—'} />
                  <Field label="Banned until" value={bannedUntil} />
                  <Field label="Banned by" value={ban?.by || '—'} />
                </div>
                <div className="usr-inline-actions">
                  <button type="button" className="usr-btn usr-btn-ok" onClick={() => onUnban(row)}>
                    <UserCheck size={14} /> Unban user
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="usr-danger-copy">
                  Banning clears the active session and device lock. Backend enforcement in the mobile app
                  still needs to read this flag before allowing access.
                </p>
                <div className="usr-inline-actions">
                  <button type="button" className="usr-btn usr-btn-danger" onClick={() => onBan(row)}>
                    <Ban size={14} /> Ban user
                  </button>
                </div>
              </>
            )}
          </section>

          <p className="usr-drawer-footnote">
            <Calendar size={12} /> Profile last updated {formatDateTime(row.updated_at)}
          </p>
        </div>
      </aside>
    </div>
  )
}

export default UserDetailPanel

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Bell, Check, ChevronDown, Megaphone,
  Send, Users,
} from 'lucide-react'
import {
  compactNumber, displayEmail, formatDateTime,
  NOTIFICATION_CHANNELS, personalize,
} from './usersUtils'

const AUDIENCES = [
  { key: 'all', label: 'All users' },
  { key: 'selected', label: 'Selected users' },
  { key: 'plan_paid', label: 'Paid plans' },
  { key: 'plan_free', label: 'Free plan' },
  { key: 'status_active', label: 'Active subscriptions' },
  { key: 'status_inactive', label: 'Inactive / expired' },
  { key: 'status_banned', label: 'Banned users' },
  { key: 'active7', label: 'Active in last 7 days' },
  { key: 'inactive30', label: 'Inactive 30+ days' },
  { key: 'credits_has', label: 'Users with credits' },
  { key: 'push_enabled', label: 'Push-enabled users' },
]

const TOKENS = [
  { token: '{{name}}', label: 'Name' },
  { token: '{{email}}', label: 'Email' },
  { token: '{{plan}}', label: 'Plan' },
  { token: '{{credits}}', label: 'Credits' },
  { token: '{{lobbies}}', label: 'Lobbies' },
]

const audienceRows = (key, rows, selectedTargets, now) => {
  const weekAgo = now - 7 * 86_400_000
  const monthAgo = now - 30 * 86_400_000
  switch (key) {
    case 'selected': {
      const ids = new Set(selectedTargets.map((row) => row.id))
      return rows.filter((row) => ids.has(row.id))
    }
    case 'plan_paid':
      return rows.filter((row) => row.plan.key !== 'free')
    case 'plan_free':
      return rows.filter((row) => row.plan.key === 'free')
    case 'status_active':
      return rows.filter((row) => row.sub.key === 'active' || row.sub.key === 'trialing')
    case 'status_inactive':
      return rows.filter((row) => ['inactive', 'free', 'expired', 'canceled'].includes(row.sub.key))
    case 'status_banned':
      return rows.filter((row) => row.banned)
    case 'active7':
      return rows.filter((row) => row.lastActiveTs >= weekAgo)
    case 'inactive30':
      return rows.filter((row) => row.lastActiveTs < monthAgo)
    case 'credits_has':
      return rows.filter((row) => row.balance > 0)
    case 'push_enabled':
      return rows.filter((row) => row.expo_push_token)
    case 'all':
    default:
      return rows
  }
}

const statusTone = (status) => {
  if (status === 'delivered' || status === 'sent') return 'ok'
  if (status === 'failed') return 'danger'
  return 'warn'
}

const CampaignCard = ({ campaign, rows, expanded, onToggle }) => {
  const recipients = rows.filter((row) => campaign.user_ids?.includes(row.id))
  const readRate = campaign.user_ids?.length
    ? Math.round(((campaign.read_count || 0) / campaign.user_ids.length) * 100)
    : 0

  return (
    <article className={`usr-campaign${expanded ? ' is-open' : ''}`}>
      <button type="button" className="usr-campaign-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="usr-campaign-title">
          <span className="usr-campaign-icon"><Megaphone size={14} /></span>
          <span className="usr-campaign-text">
            <strong>{campaign.title || 'Untitled notification'}</strong>
            <span>
              {campaign.channel} · {campaign.user_ids?.length || 0} recipients · {formatDateTime(campaign.created_at)}
            </span>
          </span>
        </span>
        <span className="usr-campaign-right">
          <span className={`usr-pill ${statusTone(campaign.status)}`}>{campaign.status || 'delivered'}</span>
          <ChevronDown size={14} className="usr-campaign-chevron" />
        </span>
      </button>

      {expanded && (
        <div className="usr-campaign-body">
          <p className="usr-campaign-message">{campaign.body}</p>
          <div className="usr-campaign-meta">
            <span><Users size={12} /> {campaign.user_ids?.length || 0} recipients</span>
            <span><Check size={12} /> {readRate}% read</span>
          </div>
          {recipients.length > 0 && (
            <p className="usr-campaign-recipients">
              {recipients.slice(0, 4).map((row) => displayEmail(row)).join(', ')}
              {recipients.length > 4 ? ` +${recipients.length - 4} more` : ''}
            </p>
          )}
        </div>
      )}
    </article>
  )
}

const NotificationsPanel = ({
  rows = [],
  campaigns = [],
  selectedTargets = [],
  now = Date.now(),
  onSend,
  adminLabel = 'Admin',
}) => {
  const [audience, setAudience] = useState('all')
  const [channel, setChannel] = useState('in_app')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [expanded, setExpanded] = useState(null)
  const bodyRef = useRef(null)

  useEffect(() => {
    setAudience(selectedTargets.length > 0 ? 'selected' : 'all')
  }, [selectedTargets])

  const targets = useMemo(
    () => audienceRows(audience, rows, selectedTargets, now),
    [audience, rows, selectedTargets, now],
  )

  const sample = targets[0] || rows[0]
  const previewTitle = personalize(title || 'Your notification title', sample)
  const previewBody = personalize(body || 'Write a message to preview it here.', sample)
  const pushCapable = targets.filter((t) => t.expo_push_token).length

  const invalid = !title.trim() || !body.trim() || targets.length === 0

  const insertToken = (token) => {
    const node = bodyRef.current
    if (!node) {
      setBody((value) => value + token)
      return
    }
    const start = node.selectionStart ?? body.length
    const end = node.selectionEnd ?? body.length
    const next = body.slice(0, start) + token + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      node.focus()
      node.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const submit = async () => {
    if (invalid || sending) return
    setSending(true)
    setSendError('')
    try {
      await onSend({
        targets,
        audience,
        channel,
        title: title.trim(),
        body: body.trim(),
      })
      setTitle('')
      setBody('')
    } catch (err) {
      setSendError(err?.message || 'Could not send the notification.')
    } finally {
      setSending(false)
    }
  }

  const totalRecipients = campaigns.reduce((sum, campaign) => sum + (campaign.user_ids?.length || 0), 0)
  const totalRead = campaigns.reduce((sum, campaign) => sum + (campaign.read_count || 0), 0)

  return (
    <div className="usr-notify">
      <div className="usr-notify-stats">
        <div className="usr-notify-stat">
          <span className="usr-notify-stat-label">Campaigns</span>
          <strong>{campaigns.length}</strong>
        </div>
        <div className="usr-notify-stat">
          <span className="usr-notify-stat-label">Recipients</span>
          <strong>{compactNumber(totalRecipients)}</strong>
        </div>
        <div className="usr-notify-stat">
          <span className="usr-notify-stat-label">Read</span>
          <strong>{compactNumber(totalRead)}</strong>
        </div>
      </div>

      <div className="usr-notify-grid">
        <section className="usr-composer" aria-labelledby="usr-composer-title">
          <header className="usr-composer-head">
            <div>
              <h2 id="usr-composer-title"><Bell size={16} /> Compose notification</h2>
              <p>Personalized in-app and push messages through the backend dispatcher.</p>
            </div>
            <span className="usr-composer-by">as {adminLabel}</span>
          </header>

          <div className="usr-form-grid">
            <label className="usr-form-field">
              <span>Audience</span>
              <select value={audience} onChange={(event) => setAudience(event.target.value)}>
                {AUDIENCES.map((option) => {
                  const count = audienceRows(option.key, rows, selectedTargets, now).length
                  return (
                    <option key={option.key} value={option.key} disabled={option.key === 'selected' && selectedTargets.length === 0}>
                      {option.label} ({count})
                    </option>
                  )
                })}
              </select>
            </label>
          </div>

          <div className="usr-channel-row" role="group" aria-label="Delivery channel">
            {NOTIFICATION_CHANNELS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`usr-channel${channel === option.key ? ' active' : ''}`}
                onClick={() => setChannel(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {channel === 'push' && (
            <p className="usr-inline-note">
              Push reaches users who approved notifications in the app —
              {' '}{pushCapable} of {targets.length} selected recipients have a push token.
              Everyone else still gets the in-app copy.
            </p>
          )}

          <label className="usr-form-field">
            <span>Title</span>
            <input
              type="text"
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Your subscription expires tomorrow"
            />
            <em className="usr-char-count">{title.length}/80</em>
          </label>

          <label className="usr-form-field">
            <span>Message</span>
            <textarea
              ref={bodyRef}
              rows={4}
              maxLength={600}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write the message. Use tokens to personalize it per user."
            />
            <em className="usr-char-count">{body.length}/600</em>
          </label>

          <div className="usr-token-row">
            <span>Insert</span>
            {TOKENS.map((token) => (
              <button key={token.token} type="button" onClick={() => insertToken(token.token)}>
                {token.label}
              </button>
            ))}
          </div>

          <div className="usr-preview">
            <span className="usr-preview-label">Preview · {displayEmail(sample) || 'sample user'}</span>
            <div className="usr-preview-card">
              <span className="usr-preview-app">LazarFlow</span>
              <strong>{previewTitle}</strong>
              <p>{previewBody}</p>
            </div>
          </div>

          <div className="usr-composer-foot">
            <span className={`usr-recipient-count${targets.length === 0 ? ' is-empty' : ''}`}>
              <Users size={13} /> {targets.length} recipient{targets.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="usr-btn usr-btn-primary"
              onClick={submit}
              disabled={invalid || sending}
            >
              {sending ? 'Sending…' : 'Send notification'}
            </button>
          </div>
          {sendError && (
            <p className="usr-modal-error"><AlertTriangle size={12} /> {sendError}</p>
          )}
        </section>

        <section className="usr-outbox" aria-labelledby="usr-outbox-title">
          <header className="usr-outbox-head">
            <div>
              <h2 id="usr-outbox-title"><Send size={16} /> History</h2>
              <p>Delivered messages with read tracking.</p>
            </div>
          </header>

          {campaigns.length === 0 ? (
            <div className="usr-outbox-empty">
              <span className="usr-empty-icon"><Megaphone size={24} /></span>
              <strong>No notifications yet</strong>
              <p>Send your first message and it will appear here.</p>
            </div>
          ) : (
            <div className="usr-campaign-list">
              {campaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  rows={rows}
                  expanded={expanded === campaign.id}
                  onToggle={() => setExpanded(expanded === campaign.id ? null : campaign.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default NotificationsPanel

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Ban, Bell, Crown, UserCheck, X, Zap,
} from 'lucide-react'
import { addDays, displayEmail, formatDateTime, GRANT_PLANS, lockBodyScroll, planMeta } from './usersUtils'

const ModalShell = ({ title, subtitle, icon: Icon, tone = '', onClose, children, footer }) => {
  const cardRef = useRef(null)

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    cardRef.current?.focus()
    return lockBodyScroll()
  }, [])

  return (
    <div
      className="usr-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`usr-modal ${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="usr-modal-title"
        tabIndex={-1}
        ref={cardRef}
      >
        <header className="usr-modal-head">
          <span className={`usr-modal-icon ${tone}`}>{Icon && <Icon size={18} />}</span>
          <div className="usr-modal-title-wrap">
            <h2 id="usr-modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="usr-icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={17} />
          </button>
        </header>
        <div className="usr-modal-body">{children}</div>
        {footer && <footer className="usr-modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

const targetSummary = (targets) => {
  if (targets.length === 1) return displayEmail(targets[0])
  return `${targets.length} selected users`
}

// ── Credits ────────────────────────────────────────────────────────────────

const CREDIT_REASONS = [
  'Goodwill / support',
  'Refund correction',
  'Promotion',
  'Purchase correction',
  'Manual adjustment',
]

export const CreditModal = ({ targets = [], onClose, onSubmit, busy = false }) => {
  const [mode, setMode] = useState('add')
  const [amount, setAmount] = useState('50')
  const [reason, setReason] = useState(CREDIT_REASONS[0])
  const [note, setNote] = useState('')

  const single = targets.length === 1 ? targets[0] : null
  const numericAmount = Number(amount)
  const current = Number(single?.flux_balance) || 0
  const preview = useMemo(() => {
    if (!single) return null
    if (mode === 'add') return current + numericAmount
    if (mode === 'deduct') return current - numericAmount
    return numericAmount
  }, [single, mode, current, numericAmount])

  const invalid = !Number.isFinite(numericAmount)
    || (mode === 'set' ? numericAmount < 0 : numericAmount <= 0)
    || (preview !== null && preview < 0)

  const submit = () => {
    if (invalid || busy) return
    onSubmit({ mode, amount: numericAmount, reason, note: note.trim() })
  }

  return (
    <ModalShell
      title="Adjust credits"
      subtitle={targetSummary(targets)}
      icon={Zap}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="usr-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="usr-btn usr-btn-primary" onClick={submit} disabled={invalid || busy}>
            {busy ? 'Saving…' : mode === 'set' ? 'Set balance' : `${mode === 'add' ? 'Add' : 'Deduct'} credits`}
          </button>
        </>
      )}
    >
      <div className="usr-segmented" role="group" aria-label="Credit adjustment mode">
        {[
          { key: 'add', label: 'Add' },
          { key: 'deduct', label: 'Deduct' },
          { key: 'set', label: 'Set exact' },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            className={mode === option.key ? 'active' : ''}
            onClick={() => setMode(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {single && (
        <div className="usr-modal-balance">
          <span>Current balance</span>
          <strong>{current.toLocaleString('en-IN')}</strong>
          <span className="usr-modal-arrow">→</span>
          <span>New balance</span>
          <strong className={preview !== null && preview < 0 ? 'danger' : 'ok'}>
            {preview === null ? '—' : preview.toLocaleString('en-IN')}
          </strong>
        </div>
      )}

      <label className="usr-form-field">
        <span>{mode === 'set' ? 'Exact balance' : 'Credits'}</span>
        <input
          type="number"
          min="0"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          autoFocus
        />
      </label>

      <div className="usr-quick-chips">
        {[50, 100, 250, 500].map((value) => (
          <button key={value} type="button" onClick={() => setAmount(String(value))}>
            +{value}
          </button>
        ))}
      </div>

      <label className="usr-form-field">
        <span>Reason</span>
        <select value={reason} onChange={(event) => setReason(event.target.value)}>
          {CREDIT_REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>

      <label className="usr-form-field">
        <span>Internal note <em>optional</em></span>
        <textarea
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why is this adjustment being made?"
        />
      </label>

      {targets.length > 1 && (
        <p className="usr-modal-note">
          The same {mode === 'set' ? 'balance' : `${mode === 'add' ? 'addition' : 'deduction'} of ${numericAmount || 0} credits`} will be applied to every selected user.
        </p>
      )}
      {preview !== null && preview < 0 && (
        <p className="usr-modal-error"><AlertTriangle size={13} /> Balance cannot go below zero.</p>
      )}
    </ModalShell>
  )
}

// ── Subscription ───────────────────────────────────────────────────────────

export const SubscriptionModal = ({ targets = [], onClose, onSubmit, busy = false }) => {
  const single0 = targets.length === 1 ? targets[0] : null
  const [mode, setMode] = useState('grant')
  // Preselect the target's current plan when it is one of the three.
  const [plan, setPlan] = useState(
    GRANT_PLANS.some((item) => item.key === single0?.subscription_tier)
      ? single0.subscription_tier
      : 'monthly',
  )
  const [note, setNote] = useState('')
  const [openedAt] = useState(() => Date.now())

  const single = targets.length === 1 ? targets[0] : null
  // Duration is implied by the plan — there is no separate days input.
  const days = GRANT_PLANS.find((item) => item.key === plan)?.days ?? 0
  const invalid = mode !== 'revoke' && !plan

  const previewExpiry = useMemo(() => {
    if (mode === 'revoke') return null
    if (mode === 'extend' && single?.subscription_expires_at) {
      const current = new Date(single.subscription_expires_at)
      const base = current.getTime() > openedAt ? current : new Date(openedAt)
      return addDays(base, days)
    }
    return addDays(new Date(openedAt), days)
  }, [mode, single, days, openedAt])

  const submit = () => {
    if (invalid || busy) return
    onSubmit({
      mode,
      plan: mode === 'revoke' ? 'free' : plan,
      status: mode === 'revoke' ? 'inactive' : 'active',
      days,
      note: note.trim(),
    })
  }

  return (
    <ModalShell
      title="Manage subscription"
      subtitle={targetSummary(targets)}
      icon={Crown}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="usr-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={`usr-btn ${mode === 'revoke' ? 'usr-btn-danger' : 'usr-btn-primary'}`}
            onClick={submit}
            disabled={invalid || busy}
          >
            {busy ? 'Saving…' : mode === 'revoke' ? 'Revoke access' : mode === 'extend' ? 'Extend plan' : 'Grant plan'}
          </button>
        </>
      )}
    >
      <div className="usr-segmented" role="group" aria-label="Subscription action">
        {[
          { key: 'grant', label: 'Grant / change' },
          { key: 'extend', label: 'Extend' },
          { key: 'revoke', label: 'Revoke' },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            className={mode === option.key ? 'active' : ''}
            onClick={() => setMode(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {single && (
        <div className="usr-modal-summary">
          <span className={`usr-pill ${planMeta(single.subscription_tier).tone}`}>
            {planMeta(single.subscription_tier).label}
          </span>
          <span>{single.subscription_status || 'inactive'}</span>
          <span className="usr-modal-summary-sep">·</span>
          <span>
            {single.subscription_expires_at
              ? `expires ${formatDateTime(single.subscription_expires_at)}`
              : 'no expiry'}
          </span>
        </div>
      )}

      {mode === 'revoke' ? (
        <div className="usr-modal-warning">
          <AlertTriangle size={16} />
          <div>
            <strong>Immediate access removal</strong>
            <p>
              The plan will be reset to Free, status to inactive and the expiry cleared.
              Payment records are not changed.
            </p>
          </div>
        </div>
      ) : (
        <>
          <label className="usr-form-field">
            <span>Plan {mode === 'extend' ? 'to extend by' : ''}</span>
            <select value={plan} onChange={(event) => setPlan(event.target.value)}>
              {GRANT_PLANS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} — {option.days} {option.days === 1 ? 'day' : 'days'}
                </option>
              ))}
            </select>
          </label>

          <div className="usr-modal-preview">
            <span>New expiry</span>
            <strong>{previewExpiry ? formatDateTime(previewExpiry) : '—'}</strong>
            {mode === 'extend' && <em>Extends from the current expiry when it is still in the future.</em>}
          </div>
        </>
      )}

      <label className="usr-form-field">
        <span>Internal note <em>optional</em></span>
        <textarea
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. support goodwill, upgrade after payment"
        />
      </label>
    </ModalShell>
  )
}

// ── Ban / unban ────────────────────────────────────────────────────────────

const BAN_DURATIONS = [
  { key: 'permanent', label: 'Permanent', days: null },
  { key: '1d', label: '1 day', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
]

export const BanModal = ({ targets = [], mode = 'ban', onClose, onSubmit, busy = false }) => {
  const [reason, setReason] = useState('')
  const [duration, setDuration] = useState('permanent')
  const [notify, setNotify] = useState(true)
  const [message, setMessage] = useState('Your account has been suspended. Contact support if you believe this is a mistake.')

  const unban = mode === 'unban'
  const invalid = !unban && reason.trim().length < 3

  const submit = () => {
    if (invalid || busy) return
    const selected = BAN_DURATIONS.find((option) => option.key === duration)
    const until = selected?.days ? addDays(new Date(), selected.days).toISOString() : null
    onSubmit({
      reason: reason.trim(),
      until,
      notify,
      message: message.trim(),
    })
  }

  return (
    <ModalShell
      title={unban ? 'Unban user' : 'Ban user'}
      subtitle={targetSummary(targets)}
      icon={unban ? UserCheck : Ban}
      tone={unban ? 'ok' : 'danger'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="usr-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={`usr-btn ${unban ? 'usr-btn-ok' : 'usr-btn-danger'}`}
            onClick={submit}
            disabled={invalid || busy}
          >
            {busy ? 'Saving…' : unban ? 'Unban user' : 'Ban user'}
          </button>
        </>
      )}
    >
      {unban ? (
        <div className="usr-modal-warning ok">
          <UserCheck size={18} />
          <div>
            <strong>Restore access</strong>
            <p>
              The ban flag is cleared and the account can sign in again. Credits, plan and lobby data
              are untouched.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="usr-modal-warning">
            <AlertTriangle size={18} />
            <div>
              <strong>This immediately clears the active session</strong>
              <p>
                The user will be signed out and the device lock reset. The ban flag is written to
                <code> profiles.feature_flags</code> until the backend has a dedicated ban table.
              </p>
            </div>
          </div>

          <label className="usr-form-field">
            <span>Reason <em>required</em></span>
            <textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Payment fraud, abusive behaviour, multi-accounting"
              autoFocus
            />
          </label>

          <label className="usr-form-field">
            <span>Duration</span>
            <select value={duration} onChange={(event) => setDuration(event.target.value)}>
              {BAN_DURATIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="usr-checkbox">
            <input
              type="checkbox"
              checked={notify}
              onChange={(event) => setNotify(event.target.checked)}
            />
            <span>Send an in-app notification about the ban</span>
          </label>

          {notify && (
            <label className="usr-form-field">
              <span>Notification message</span>
              <textarea
                rows={2}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
          )}

          {targets.length > 1 && (
            <p className="usr-modal-note">
              <Bell size={12} /> The same reason and duration will be applied to all {targets.length} selected users.
            </p>
          )}
          {targets.some((target) => target.is_admin) && (
            <p className="usr-modal-error">
              <AlertTriangle size={12} /> Admin accounts are skipped and cannot be banned from this screen.
            </p>
          )}
        </>
      )}
    </ModalShell>
  )
}

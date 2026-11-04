import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Settings2, X } from 'lucide-react'
import { lockBodyScroll, STATUS_OPTIONS } from './lobbiesUtils'

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
      className="lob-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`lob-modal ${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lob-modal-title"
        tabIndex={-1}
        ref={cardRef}
      >
        <header className="lob-modal-head">
          <span className={`lob-modal-icon ${tone}`}>{Icon && <Icon size={18} />}</span>
          <div className="lob-modal-title-wrap">
            <h2 id="lob-modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="lob-icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={17} />
          </button>
        </header>
        <div className="lob-modal-body">{children}</div>
        {footer && <footer className="lob-modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

const targetSummary = (targets) => {
  if (targets.length === 1) return targets[0]?.name || 'this lobby'
  return `${targets.length} selected lobbies`
}

export const StatusModal = ({ targets = [], onClose, onSubmit, busy = false }) => {
  const single = targets.length === 1 ? targets[0] : null
  const [status, setStatus] = useState(() => (
    single && STATUS_OPTIONS.some((option) => option.value === single.status.key)
      ? single.status.key
      : 'active'
  ))

  const unchanged = Boolean(single) && single.status.key === status
  const invalid = !status || unchanged

  const submit = () => {
    if (invalid || busy) return
    onSubmit({ status })
  }

  return (
    <ModalShell
      title={single ? 'Change lobby status' : 'Change status for selected lobbies'}
      subtitle={targetSummary(targets)}
      icon={Settings2}
      onClose={busy ? () => {} : onClose}
      footer={(
        <>
          <button type="button" className="lob-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="lob-btn lob-btn-primary" onClick={submit} disabled={invalid || busy}>
            {busy ? 'Saving…' : single ? 'Update status' : `Update ${targets.length} lobbies`}
          </button>
        </>
      )}
    >
      {single && (
        <p className="lob-modal-current">
          Current status: <span className={`lob-pill ${single.status.tone}`}>{single.status.label}</span>
        </p>
      )}

      <div className="lob-status-options" role="radiogroup" aria-label="Lobby status">
        {STATUS_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`lob-status-option${status === option.value ? ' is-selected' : ''}`}
          >
            <input
              type="radio"
              name="lob-status"
              value={option.value}
              checked={status === option.value}
              onChange={() => setStatus(option.value)}
            />
            <span className="lob-status-option-text">
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {status === 'completed' && !unchanged && (
        <p className="lob-modal-warning">
          <AlertTriangle size={13} />
          Completing a lobby does not generate final standings and does not recalculate scores.
        </p>
      )}
      {status === 'setup' && !unchanged && (
        <p className="lob-modal-warning">
          <AlertTriangle size={13} />
          Moving a lobby back to setup does not remove teams or scores, but players may see it as unconfigured.
        </p>
      )}
      {targets.length > 1 && (
        <p className="lob-modal-note">
          The same status will be applied to all {targets.length} selected lobbies.
        </p>
      )}
    </ModalShell>
  )
}

export default StatusModal

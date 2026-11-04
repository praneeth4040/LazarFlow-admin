import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ScrollText, RefreshCw, AlertCircle, Download, Copy, Check,
  ChevronDown, ChevronRight, User as UserIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { csvCell, downloadCsv, fullDate, relative } from './overviewUtils'
import './LogsView.css'

const LOG_LIMIT = 2000
const LEVELS = ['all', 'info', 'warning', 'error', 'debug']
const OUTCOMES = ['all', 'success', 'failure']
const RANGES = [
  { key: 'all', label: 'All time' },
  { key: '24h', label: 'Last 24 hours' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
]
const PAGE_SIZES = [25, 50, 100]

const levelTone = (level) => {
  switch (String(level || '').toLowerCase()) {
    case 'error': return 'error'
    case 'warning': return 'warning'
    case 'success': return 'success'
    default: return 'info'
  }
}

const messageOf = (log) => {
  const detail = log.detail && typeof log.detail === 'object' ? log.detail : {}
  return detail.msg || detail.message || log.reason || null
}

const loggerOf = (log) => (log.detail && typeof log.detail === 'object' ? log.detail.logger : null)

const searchBlobOf = (log) => [
  log.event, log.route, log.level, log.outcome, log.reason,
  log.user_id, log.target_user_id, messageOf(log), loggerOf(log),
].filter(Boolean).join(' ').toLowerCase()

const LogsView = ({ externalRefreshKey = 0, onOpenUser }) => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [retryToken, setRetryToken] = useState(0)
  const hasLoadedRef = useRef(false)
  const truncatedRef = useRef(false)

  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('all')
  const [outcome, setOutcome] = useState('all')
  const [range, setRange] = useState('all')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (hasLoadedRef.current) setRefreshing(true)
      else setLoading(true)
      setError('')
      try {
        const { data, error: fetchError } = await supabase
          .from('logs')
          .select('id, event, level, route, user_id, target_user_id, outcome, reason, status_code, detail, created_at')
          .order('created_at', { ascending: false })
          .limit(LOG_LIMIT)
        if (fetchError) throw fetchError
        if (cancelled) return
        truncatedRef.current = (data || []).length >= LOG_LIMIT
        setLogs(data || [])
        setUpdatedAt(new Date())
        hasLoadedRef.current = true
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load logs')
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

  // Auto-refresh every 30s — logs are append-heavy.
  const retryRef = useRef(retryToken)
  retryRef.current = retryToken
  useEffect(() => {
    if (!autoRefresh) return undefined
    const timer = setInterval(() => setRetryToken((t) => t + 1), 30_000)
    return () => clearInterval(timer)
  }, [autoRefresh])

  const now = updatedAt ? updatedAt.getTime() : Date.now()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cutoff = range === 'all' ? 0
      : now - (range === '24h' ? 86_400_000 : range === '7d' ? 7 * 86_400_000 : 30 * 86_400_000)
    return logs.filter((log) => {
      if (level !== 'all' && String(log.level || '').toLowerCase() !== level) return false
      if (outcome !== 'all' && String(log.outcome || '').toLowerCase() !== outcome) return false
      if (cutoff && new Date(log.created_at).getTime() < cutoff) return false
      if (q && !searchBlobOf(log).includes(q)) return false
      return true
    })
  }, [logs, query, level, outcome, range, now])

  const stats = useMemo(() => ({
    total: filtered.length,
    errors: filtered.filter((l) => String(l.level).toLowerCase() === 'error').length,
    warnings: filtered.filter((l) => String(l.level).toLowerCase() === 'warning').length,
    last24h: filtered.filter((l) => now - new Date(l.created_at).getTime() < 86_400_000).length,
  }), [filtered, now])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  useEffect(() => { setPage(1) }, [query, level, outcome, range, pageSize])
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const exportCsv = () => {
    if (filtered.length === 0) return
    const lines = ['created_at,level,event,route,outcome,status_code,user_id,target_user_id,message,reason']
    for (const log of filtered) {
      lines.push([
        csvCell(log.created_at), csvCell(log.level), csvCell(log.event), csvCell(log.route),
        csvCell(log.outcome), csvCell(log.status_code), csvCell(log.user_id), csvCell(log.target_user_id),
        csvCell(messageOf(log)), csvCell(log.reason),
      ].join(','))
    }
    downloadCsv(`lazarflow-logs-${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\n'))
  }

  const copyDetail = async (log) => {
    const text = JSON.stringify(log, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(log.id)
      setTimeout(() => setCopiedId(null), 1600)
    } catch {
      setCopiedId(null)
    }
  }

  return (
    <div className="logs-page">
      <section className="log-hero" aria-labelledby="log-title">
        <header className="log-hero-head">
          <div>
            <span className="log-eyebrow"><ScrollText size={12} /> System activity</span>
            <h1 id="log-title" className="log-title">Logs</h1>
            <p className="log-subtitle">
              Every event the backend records — logins, request failures, bot traffic and more.
            </p>
          </div>
          <div className="log-head-actions">
            <span className={`log-live ${refreshing ? 'is-refreshing' : ''}`}>
              <span className="log-live-dot" aria-hidden="true" />
              {refreshing ? 'Refreshing…' : updatedAt ? `Live · ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live'}
            </span>
            <label className="log-auto">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              Auto-refresh (30s)
            </label>
            <button type="button" className="log-action" onClick={exportCsv} disabled={loading || filtered.length === 0}>
              <Download size={14} /> Export CSV
            </button>
            <button type="button" className="log-action" onClick={() => setRetryToken((t) => t + 1)}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </header>

        {loading ? (
          <div className="log-kpi-grid" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="log-kpi log-kpi-skeleton">
                <span className="log-sk log-sk-label" />
                <span className="log-sk log-sk-value" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="log-error" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button type="button" className="log-retry" onClick={() => setRetryToken((t) => t + 1)}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : (
          <div className="log-kpi-grid" aria-live="polite">
            <div className="log-kpi" title="Events matching the current filters">
              <span className="log-kpi-label">Events</span>
              <span className="log-kpi-value">{stats.total.toLocaleString('en-IN')}</span>
              <span className="log-kpi-meta">{truncatedRef.current ? `showing latest ${LOG_LIMIT}` : 'complete history'}</span>
            </div>
            <div className="log-kpi" title="Events with level = warning">
              <span className="log-kpi-label">Warnings</span>
              <span className="log-kpi-value warn">{stats.warnings.toLocaleString('en-IN')}</span>
              <span className="log-kpi-meta">level = warning</span>
            </div>
            <div className="log-kpi" title="Events with level = error">
              <span className="log-kpi-label">Errors</span>
              <span className={`log-kpi-value ${stats.errors ? 'error' : ''}`}>{stats.errors.toLocaleString('en-IN')}</span>
              <span className="log-kpi-meta">level = error</span>
            </div>
            <div className="log-kpi" title="Events from the last 24 hours">
              <span className="log-kpi-label">Last 24 hours</span>
              <span className="log-kpi-value">{stats.last24h.toLocaleString('en-IN')}</span>
              <span className="log-kpi-meta">recent activity</span>
            </div>
          </div>
        )}
      </section>

      <section className="log-panel">
        <div className="log-toolbar">
          <div className="log-search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search event, route, message, user id…"
              aria-label="Search logs"
            />
          </div>
          <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter by level">
            {LEVELS.map((l) => <option key={l} value={l}>{l === 'all' ? 'All levels' : `Level: ${l}`}</option>)}
          </select>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Filter by outcome">
            {OUTCOMES.map((o) => <option key={o} value={o}>{o === 'all' ? 'All outcomes' : `Outcome: ${o}`}</option>)}
          </select>
          <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Filter by date range">
            {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="log-rows" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="log-row log-row-skeleton">
                <span className="log-sk" style={{ width: 64 }} />
                <span className="log-sk" style={{ width: 90 }} />
                <span className="log-sk" style={{ width: 180 }} />
                <span className="log-sk" style={{ flex: 1 }} />
              </div>
            ))}
          </div>
        ) : pageRows.length === 0 ? (
          <p className="log-empty">
            {logs.length === 0
              ? 'No logs recorded yet — the backend writes them as requests come in.'
              : 'No logs match the current filters.'}
          </p>
        ) : (
          <div className="log-rows">
            {pageRows.map((log) => {
              const tone = levelTone(log.level)
              const msg = messageOf(log)
              const expanded = expandedId === log.id
              return (
                <div key={log.id} className={`log-row ${expanded ? 'expanded' : ''}`}>
                  <button
                    type="button"
                    className="log-row-main"
                    onClick={() => setExpandedId(expanded ? null : log.id)}
                    aria-expanded={expanded}
                  >
                    <span className="log-cell-time" title={fullDate(log.created_at)}>
                      {relative(log.created_at, now)}
                    </span>
                    <span className={`log-pill ${tone}`}>{log.level || 'info'}</span>
                    <span className="log-cell-event" title={log.event}>{log.event || '—'}</span>
                    <span className="log-cell-route" title={log.route || ''}>{log.route || '—'}</span>
                    <span className="log-cell-outcome">
                      {log.outcome && (
                        <span className={`log-outcome ${log.outcome}`}>{log.outcome}{log.status_code ? ` · ${log.status_code}` : ''}</span>
                      )}
                    </span>
                    <span className="log-cell-msg" title={msg || ''}>{msg || '—'}</span>
                    <span className="log-cell-caret">{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                  </button>

                  {expanded && (
                    <div className="log-detail">
                      <div className="log-detail-grid">
                        <div>
                          <span className="log-detail-label">Created</span>
                          <span>{fullDate(log.created_at)}</span>
                        </div>
                        <div>
                          <span className="log-detail-label">Logger</span>
                          <span>{loggerOf(log) || '—'}</span>
                        </div>
                        <div>
                          <span className="log-detail-label">Reason</span>
                          <span>{log.reason || '—'}</span>
                        </div>
                        <div>
                          <span className="log-detail-label">Status code</span>
                          <span>{log.status_code ?? '—'}</span>
                        </div>
                      </div>

                      {(log.user_id || log.target_user_id) && (
                        <div className="log-actors">
                          {log.user_id && (
                            <div className="log-actor">
                              <span className="log-detail-label">Actor</span>
                              <span className="log-uuid" title={log.user_id}>{log.user_id}</span>
                              {onOpenUser && (
                                <button type="button" className="log-open-user" onClick={() => onOpenUser(log.user_id)}>
                                  <UserIcon size={12} /> Open in Users
                                </button>
                              )}
                            </div>
                          )}
                          {log.target_user_id && (
                            <div className="log-actor">
                              <span className="log-detail-label">Target</span>
                              <span className="log-uuid" title={log.target_user_id}>{log.target_user_id}</span>
                              {onOpenUser && (
                                <button type="button" className="log-open-user" onClick={() => onOpenUser(log.target_user_id)}>
                                  <UserIcon size={12} /> Open in Users
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="log-json-wrap">
                        <div className="log-json-head">
                          <span className="log-detail-label">Full record</span>
                          <button type="button" className="log-copy" onClick={() => copyDetail(log)}>
                            {copiedId === log.id ? <Check size={12} /> : <Copy size={12} />}
                            {copiedId === log.id ? 'Copied' : 'Copy JSON'}
                          </button>
                        </div>
                        <pre className="log-json">{JSON.stringify(log, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <footer className="log-footer">
            <span className="log-range">
              {rangeStartLabel(safePage, pageSize, filtered.length)}
            </span>
            <div className="log-pager">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Rows per page"
              >
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} / page</option>)}
              </select>
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Prev</button>
              <span className="log-page-ind">{safePage} / {pageCount}</span>
              <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>Next</button>
            </div>
          </footer>
        )}
      </section>
    </div>
  )
}

const rangeStartLabel = (page, pageSize, total) => {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return `${start}–${end} of ${total.toLocaleString('en-IN')} events`
}

export default LogsView

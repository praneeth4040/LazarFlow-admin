import { useMemo, useState } from 'react'
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown,
  Search, UserRound, X,
} from 'lucide-react'
import { relativeTime, sortOrganizerRows } from './lobbiesUtils'

const COLUMNS = [
  { key: 'organizer', label: 'Organizer' },
  { key: 'lobbies', label: 'Lobbies' },
  { key: 'teams', label: 'Teams' },
  { key: 'players', label: 'Players' },
  { key: 'avg', label: 'Avg teams' },
  { key: 'last', label: 'Last created' },
]

const SortIcon = ({ column, sort }) => {
  if (sort.key !== column) return <ChevronsUpDown size={11} className="lob-sort-idle" />
  return sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
}

const OrganizersPanel = ({ rows = [], loading = false, now, onFilterOrganizer }) => {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: 'lobbies', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) => row.search.includes(needle))
  }, [rows, query])

  const sorted = useMemo(() => sortOrganizerRows(filtered, sort), [filtered, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  )

  const stats = useMemo(() => {
    const lobbies = rows.reduce((sum, row) => sum + row.lobbies, 0)
    const top = rows.reduce((best, row) => (!best || row.lobbies > best.lobbies ? row : best), null)
    return {
      lobbies,
      avg: rows.length ? (lobbies / rows.length).toFixed(1) : '0',
      top,
    }
  }, [rows])

  const toggleSort = (key) => {
    setSort((current) => (
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'organizer' ? 'asc' : 'desc' }
    ))
    setPage(1)
  }

  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeEnd = Math.min(safePage * pageSize, sorted.length)

  return (
    <div className="lob-tab-body">
      <div className="lob-mini-stats">
        <div className="lob-mini-stat">
          <span className="lob-mini-stat-label">Organizers</span>
          <strong className="lob-mini-stat-value">{loading ? '—' : rows.length.toLocaleString('en-IN')}</strong>
        </div>
        <div className="lob-mini-stat">
          <span className="lob-mini-stat-label">Lobbies created</span>
          <strong className="lob-mini-stat-value">{loading ? '—' : stats.lobbies.toLocaleString('en-IN')}</strong>
        </div>
        <div className="lob-mini-stat">
          <span className="lob-mini-stat-label">Avg per organizer</span>
          <strong className="lob-mini-stat-value">{loading ? '—' : stats.avg}</strong>
        </div>
        <div className="lob-mini-stat">
          <span className="lob-mini-stat-label">Most active</span>
          <strong className="lob-mini-stat-value lob-mini-stat-text">
            {loading ? '—' : stats.top?.label || '—'}
          </strong>
          <span className="lob-mini-stat-sub">{stats.top ? `${stats.top.lobbies} lobbies` : 'no data'}</span>
        </div>
      </div>

      <div className="lob-toolbar">
        <div className="lob-search">
          <Search size={15} className="lob-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1) }}
            placeholder="Search organizer, email or lobby name…"
            aria-label="Search organizers"
          />
          {query && (
            <button type="button" className="lob-search-clear" onClick={() => { setQuery(''); setPage(1) }} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>
        <span className="lob-toolbar-hint">
          Select an organizer to filter the directory.
        </span>
      </div>

      <section className="lob-table-panel" role="table" aria-label="Lobby organizers">
        <div className="lob-table-head lob-org-head" role="row">
          {COLUMNS.map((column) => (
            <button
              key={column.key}
              type="button"
              className={`lob-cell lob-sort-btn lob-org-h-${column.key}${sort.key === column.key ? ' is-active' : ''}`}
              onClick={() => toggleSort(column.key)}
              role="columnheader"
              aria-sort={sort.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              {column.label}
              <SortIcon column={column.key} sort={sort} />
            </button>
          ))}
          <span className="lob-cell lob-org-actions" role="columnheader">
            <span className="lob-sr-only">Filter</span>
          </span>
        </div>

        {loading ? (
          <div className="lob-table-body">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div className="lob-row lob-org-row lob-skeleton" key={index} aria-hidden="true">
                <span className="lob-sk lob-sk-line" />
                <span className="lob-sk lob-sk-pill" />
                <span className="lob-sk lob-sk-line" />
                <span className="lob-sk lob-sk-line" />
              </div>
            ))}
          </div>
        ) : pageRows.length === 0 ? (
          <div className="lob-empty">
            <span className="lob-empty-icon"><UserRound size={26} /></span>
            <strong>No organizers found</strong>
            <p>Try a different search term.</p>
            {query && (
              <button type="button" className="lob-link-btn" onClick={() => setQuery('')}>Clear search</button>
            )}
          </div>
        ) : (
          <div className="lob-table-body" role="rowgroup">
            {pageRows.map((row) => (
              <div
                key={row.id}
                className="lob-row lob-org-row"
                role="row"
                tabIndex={0}
                onClick={() => onFilterOrganizer(row)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onFilterOrganizer(row)
                  }
                }}
                aria-label={`Filter directory by ${row.label}`}
              >
                <span className="lob-cell lob-org-organizer" role="cell" data-label="Organizer">
                  <span className="lob-name" title={row.email || row.label}>{row.label}</span>
                  <span className="lob-sub">{row.name || row.email || '—'}</span>
                </span>
                <span className="lob-cell lob-org-lobbies" role="cell" data-label="Lobbies">
                  <strong className="lob-strong">{row.lobbies}</strong>
                  <span className="lob-sub">{row.active} active</span>
                </span>
                <span className="lob-cell lob-org-teams" role="cell" data-label="Teams">{row.teams}</span>
                <span className="lob-cell lob-org-players" role="cell" data-label="Players">{row.players}</span>
                <span className="lob-cell lob-org-avg" role="cell" data-label="Avg teams">{row.avgTeams.toFixed(1)}</span>
                <span className="lob-cell lob-org-last" role="cell" data-label="Last created">
                  {relativeTime(new Date(row.lastTs).toISOString(), now)}
                </span>
                <span className="lob-cell lob-org-actions" role="cell" aria-hidden="true">
                  <ChevronRight size={14} />
                </span>
              </div>
            ))}
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <footer className="lob-table-foot">
            <span className="lob-range">
              Showing <strong>{rangeStart}–{rangeEnd}</strong> of <strong>{sorted.length}</strong>
            </span>
            <div className="lob-foot-controls">
              <label className="lob-page-size">
                <span>Rows</span>
                <select
                  value={pageSize}
                  onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}
                  aria-label="Rows per page"
                >
                  {[25, 50, 100].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
              <div className="lob-pager">
                <button
                  type="button"
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="lob-page-label">Page {safePage} of {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= pageCount}
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </footer>
        )}
      </section>
    </div>
  )
}

export default OrganizersPanel

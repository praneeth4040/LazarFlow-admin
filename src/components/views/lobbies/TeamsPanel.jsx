import { useMemo, useState } from 'react'
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown,
  Search, Users, X,
} from 'lucide-react'
import {
  DEFAULT_TEAM_FILTERS, filterTeamRows, relativeTime, ROSTER_SIZE, sortTeamRows,
} from './lobbiesUtils'

const COLUMNS = [
  { key: 'team', label: 'Team' },
  { key: 'lobby', label: 'Lobby' },
  { key: 'members', label: 'Members' },
  { key: 'wins', label: 'W' },
  { key: 'kills', label: 'K' },
  { key: 'total', label: 'Score' },
  { key: 'created', label: 'Created' },
]

const SortIcon = ({ column, sort }) => {
  if (sort.key !== column) return <ChevronsUpDown size={11} className="lob-sort-idle" />
  return sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
}

const ROSTER_TONE = {
  full: 'ok',
  partial: 'warn',
  empty: 'danger',
}

const TeamsPanel = ({ rows = [], loading = false, now, onOpenLobby }) => {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(DEFAULT_TEAM_FILTERS)
  const [sort, setSort] = useState({ key: 'total', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const gameOptions = useMemo(() => {
    const map = new Map()
    for (const row of rows) map.set(row.gameKey, row.gameLabel)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = useMemo(
    () => filterTeamRows(rows, { query, filters }),
    [rows, query, filters],
  )

  const sorted = useMemo(() => sortTeamRows(filtered, sort), [filtered, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  )

  const stats = useMemo(() => {
    let players = 0
    let full = 0
    let empty = 0
    for (const row of rows) {
      players += row.memberCount
      if (row.rosterState === 'full') full += 1
      if (row.rosterState === 'empty') empty += 1
    }
    return { players, full, empty }
  }, [rows])

  const hasFilters = Boolean(query.trim())
    || filters.game !== 'all' || filters.roster !== 'all' || filters.status !== 'all'

  const clearFilters = () => {
    setQuery('')
    setFilters(DEFAULT_TEAM_FILTERS)
    setPage(1)
  }

  const patchFilters = (patch) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(1)
  }

  const toggleSort = (key) => {
    setSort((current) => (
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'team' || key === 'lobby' ? 'asc' : 'desc' }
    ))
    setPage(1)
  }

  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeEnd = Math.min(safePage * pageSize, sorted.length)

  return (
    <div className="lob-tab-body">
      <div className="lob-mini-stats">
        <div className="lob-mini-stat">
          <span className="lob-mini-stat-label">Teams</span>
          <strong className="lob-mini-stat-value">{loading ? '—' : rows.length.toLocaleString('en-IN')}</strong>
        </div>
        <div className="lob-mini-stat">
          <span className="lob-mini-stat-label">Player slots</span>
          <strong className="lob-mini-stat-value">{loading ? '—' : stats.players.toLocaleString('en-IN')}</strong>
        </div>
        <div className="lob-mini-stat ok">
          <span className="lob-mini-stat-label">Complete rosters</span>
          <strong className="lob-mini-stat-value">{loading ? '—' : stats.full.toLocaleString('en-IN')}</strong>
          <span className="lob-mini-stat-sub">{ROSTER_SIZE} members</span>
        </div>
        <div className="lob-mini-stat danger">
          <span className="lob-mini-stat-label">Empty rosters</span>
          <strong className="lob-mini-stat-value">{loading ? '—' : stats.empty.toLocaleString('en-IN')}</strong>
          <span className="lob-mini-stat-sub">no members</span>
        </div>
      </div>

      <div className="lob-toolbar">
        <div className="lob-search">
          <Search size={15} className="lob-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1) }}
            placeholder="Search team, player, lobby or ID…"
            aria-label="Search teams"
          />
          {query && (
            <button type="button" className="lob-search-clear" onClick={() => { setQuery(''); setPage(1) }} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="lob-filters">
          <select
            value={filters.game}
            onChange={(event) => patchFilters({ game: event.target.value })}
            aria-label="Filter by game"
          >
            <option value="all">All games</option>
            {gameOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            value={filters.roster}
            onChange={(event) => patchFilters({ roster: event.target.value })}
            aria-label="Filter by roster"
          >
            <option value="all">Any roster</option>
            <option value="full">Complete ({ROSTER_SIZE})</option>
            <option value="partial">Partial</option>
            <option value="empty">Empty</option>
          </select>

          <select
            value={filters.status}
            onChange={(event) => patchFilters({ status: event.target.value })}
            aria-label="Filter by lobby status"
          >
            <option value="all">Any lobby status</option>
            <option value="active">Active lobbies</option>
            <option value="setup">Setup lobbies</option>
            <option value="completed">Completed lobbies</option>
          </select>

          {hasFilters && (
            <button type="button" className="lob-link-btn" onClick={clearFilters}>Clear filters</button>
          )}
        </div>
      </div>

      <section className="lob-table-panel" role="table" aria-label="Teams across all lobbies">
        <div className="lob-table-head lob-team-head" role="row">
          {COLUMNS.map((column) => (
            <button
              key={column.key}
              type="button"
              className={`lob-cell lob-sort-btn lob-team-h-${column.key}${sort.key === column.key ? ' is-active' : ''}`}
              onClick={() => toggleSort(column.key)}
              role="columnheader"
              aria-sort={sort.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              {column.label}
              <SortIcon column={column.key} sort={sort} />
            </button>
          ))}
          <span className="lob-cell lob-team-actions" role="columnheader">
            <span className="lob-sr-only">Open</span>
          </span>
        </div>

        {loading ? (
          <div className="lob-table-body">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div className="lob-row lob-team-row-skel lob-skeleton" key={index} aria-hidden="true">
                <span className="lob-sk lob-sk-line" />
                <span className="lob-sk lob-sk-line" />
                <span className="lob-sk lob-sk-pill" />
                <span className="lob-sk lob-sk-line" />
              </div>
            ))}
          </div>
        ) : pageRows.length === 0 ? (
          <div className="lob-empty">
            <span className="lob-empty-icon"><Users size={26} /></span>
            <strong>No teams found</strong>
            <p>Try a different search term or reset the filters.</p>
            {hasFilters && (
              <button type="button" className="lob-link-btn" onClick={clearFilters}>Clear all filters</button>
            )}
          </div>
        ) : (
          <div className="lob-table-body" role="rowgroup">
            {pageRows.map((row) => (
              <div
                key={row.id}
                className="lob-row lob-team-row"
                role="row"
                tabIndex={0}
                onClick={() => onOpenLobby(row)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpenLobby(row)
                  }
                }}
                aria-label={`Open lobby ${row.lobbyName}`}
              >
                <span className="lob-cell lob-team-team" role="cell" data-label="Team">
                  <span className="lob-name" title={row.team_name}>{row.team_name || 'Unnamed team'}</span>
                  <span className="lob-sub">{row.gameLabel}</span>
                </span>

                <span className="lob-cell lob-team-lobby" role="cell" data-label="Lobby">
                  <span className="lob-org" title={row.lobbyName}>{row.lobbyName}</span>
                  <span className="lob-sub">
                    <span className={`lob-dot-inline ${row.lobbyStatus.tone}`} aria-hidden="true" />
                    {row.lobbyStatus.label}
                    {row.slot ? ` · slot ${row.slot}` : ''}
                  </span>
                </span>

                <span className="lob-cell lob-team-members" role="cell" data-label="Members">
                  <span className={`lob-roster-badge ${ROSTER_TONE[row.rosterState]}`}>
                    {row.memberCount}/{ROSTER_SIZE}
                  </span>
                </span>

                <span className="lob-cell lob-team-wins" role="cell" data-label="Wins">{row.parts.wins}</span>
                <span className="lob-cell lob-team-kills" role="cell" data-label="Kills">{row.parts.kills}</span>
                <span className="lob-cell lob-team-total" role="cell" data-label="Score">
                  <strong>{row.total}</strong>
                </span>
                <span className="lob-cell lob-team-created" role="cell" data-label="Created">
                  {relativeTime(row.created_at, now)}
                </span>
                <span className="lob-cell lob-team-actions" role="cell" aria-hidden="true">
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

export default TeamsPanel

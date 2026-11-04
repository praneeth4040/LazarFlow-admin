import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown,
  Copy, Gamepad2, SlidersHorizontal,
} from 'lucide-react'
import { relativeTime, statusDetail } from './lobbiesUtils'

const COLUMNS = [
  { key: 'name', label: 'Lobby' },
  { key: 'organizer', label: 'Organizer' },
  { key: 'status', label: 'Status' },
  { key: 'teams', label: 'Teams' },
  { key: 'roster', label: 'Roster' },
  { key: 'created', label: 'Created' },
]

const SortIcon = ({ column, sort }) => {
  if (sort.key !== column) return <ChevronsUpDown size={11} className="lob-sort-idle" />
  return sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
}

const SkeletonRow = () => (
  <div className="lob-row lob-dir-row lob-skeleton" aria-hidden="true">
    <span className="lob-cell lob-check"><span className="lob-sk lob-sk-box" /></span>
    <span className="lob-cell lob-lobby">
      <span className="lob-sk-stack">
        <span className="lob-sk lob-sk-line" />
        <span className="lob-sk lob-sk-sub" />
      </span>
    </span>
    <span className="lob-cell lob-organizer"><span className="lob-sk lob-sk-line" /></span>
    <span className="lob-cell lob-status"><span className="lob-sk lob-sk-pill" /></span>
    <span className="lob-cell lob-teams"><span className="lob-sk lob-sk-line" /></span>
    <span className="lob-cell lob-roster"><span className="lob-sk lob-sk-line" /></span>
    <span className="lob-cell lob-created"><span className="lob-sk lob-sk-line" /></span>
    <span className="lob-cell lob-actions"><span className="lob-sk lob-sk-box" /></span>
  </div>
)

const RosterBar = ({ filled, total }) => {
  const pct = total ? Math.round((filled / total) * 100) : 0
  const tone = total === 0 ? 'empty' : pct === 100 ? 'ok' : pct >= 50 ? 'warn' : 'danger'
  return (
    <span className="lob-roster-wrap">
      <span className={`lob-roster-bar ${tone}`} aria-hidden="true">
        <span className="lob-roster-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="lob-roster-text">{total ? `${filled}/${total}` : '—'}</span>
    </span>
  )
}

const LobbyTable = ({
  rows = [],
  loading = false,
  sort,
  onSort,
  selected = [],
  allPageSelected = false,
  somePageSelected = false,
  onToggleRow,
  onTogglePage,
  onOpen,
  onStatus,
  onCopy,
  page = 1,
  pageCount = 1,
  pageSize = 25,
  total = 0,
  rangeStart = 0,
  rangeEnd = 0,
  onPageChange,
  onPageSizeChange,
  onClearFilters,
  hasFilters = false,
  emptyTitle = 'No lobbies found',
  emptyHint = 'Try a different search or reset the filters.',
  now,
}) => {
  const selectedSet = new Set(selected)

  return (
    <section className="lob-table-panel" role="table" aria-label="Lobby directory">
      <div className="lob-table-head lob-dir-head" role="row">
        <span className="lob-cell lob-check" role="columnheader">
          <input
            type="checkbox"
            checked={allPageSelected}
            ref={(node) => {
              if (node) node.indeterminate = !allPageSelected && somePageSelected
            }}
            onChange={onTogglePage}
            aria-label="Select all lobbies on this page"
          />
        </span>

        {COLUMNS.map((column) => (
          <button
            key={column.key}
            type="button"
            className={`lob-cell lob-sort-btn lob-h-${column.key}${sort.key === column.key ? ' is-active' : ''}`}
            onClick={() => onSort(column.key)}
            role="columnheader"
            aria-sort={sort.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            {column.label}
            <SortIcon column={column.key} sort={sort} />
          </button>
        ))}

        <span className="lob-cell lob-actions" role="columnheader">
          <span className="lob-sr-only">Actions</span>
        </span>
      </div>

      {loading ? (
        <div className="lob-table-body">
          {[0, 1, 2, 3, 4, 5, 6].map((index) => <SkeletonRow key={index} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="lob-empty">
          <span className="lob-empty-icon"><Gamepad2 size={26} /></span>
          <strong>{emptyTitle}</strong>
          <p>{emptyHint}</p>
          {hasFilters && (
            <button type="button" className="lob-link-btn" onClick={onClearFilters}>
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="lob-table-body" role="rowgroup">
          {rows.map((row) => {
            const isSelected = selectedSet.has(row.id)
            const needsAttention = row.health.length > 0

            return (
              <div
                key={row.id}
                className={`lob-row lob-dir-row${isSelected ? ' is-selected' : ''}${needsAttention ? ' is-flagged' : ''}`}
                role="row"
                tabIndex={0}
                onClick={() => onOpen(row)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpen(row)
                  }
                }}
                aria-label={`Open ${row.name || 'lobby'}`}
              >
                <span
                  className="lob-cell lob-check"
                  role="cell"
                  data-label="Select"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleRow(row.id)}
                    aria-label={`Select ${row.name || 'lobby'}`}
                  />
                </span>

                <span className="lob-cell lob-lobby" role="cell" data-label="Lobby">
                  <span className="lob-name" title={row.name}>{row.name || 'Untitled lobby'}</span>
                  <span className="lob-sub">
                    {row.gameLabel}
                    {needsAttention && <span className="lob-flag-dot" title="Needs attention" />}
                  </span>
                </span>

                <span className="lob-meta">
                  <span className="lob-cell lob-organizer" role="cell" data-label="Organizer">
                    <span className="lob-org" title={row.creator.email || row.creator.label}>
                      {row.creator.label}
                    </span>
                    <span className="lob-sub lob-org-name">{row.creator.name || '—'}</span>
                  </span>

                  <span className="lob-cell lob-status" role="cell" data-label="Status">
                    <span className={`lob-pill ${row.status.tone}`}>
                      <span className="lob-pill-dot" aria-hidden="true" />
                      {row.status.label}
                    </span>
                    <span className="lob-sub">{statusDetail(row)}</span>
                  </span>

                  <span className="lob-cell lob-teams" role="cell" data-label="Teams">
                    <span className="lob-strong">{row.teamCount}</span>
                    <span className="lob-sub">{row.playerCount} players</span>
                  </span>

                  <span className="lob-cell lob-roster" role="cell" data-label="Roster">
                    <RosterBar filled={row.rosterTeams} total={row.teamCount} />
                    <span className="lob-sub">
                      {row.teamCount === 0
                        ? 'no teams'
                        : row.emptyRosterTeams === 0
                          ? 'complete'
                          : `${row.emptyRosterTeams} empty`}
                    </span>
                  </span>

                  <span className="lob-cell lob-created" role="cell" data-label="Created">
                    {relativeTime(row.created_at, now)}
                  </span>
                </span>

                <span
                  className="lob-cell lob-actions"
                  role="cell"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="lob-icon-btn"
                    title="Change status"
                    aria-label={`Change status for ${row.name || 'lobby'}`}
                    onClick={() => onStatus(row)}
                  >
                    <SlidersHorizontal size={14} />
                  </button>
                  <button
                    type="button"
                    className="lob-icon-btn"
                    title="Copy lobby ID"
                    aria-label={`Copy ID for ${row.name || 'lobby'}`}
                    onClick={() => onCopy(row)}
                  >
                    <Copy size={14} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {!loading && total > 0 && (
        <footer className="lob-table-foot">
          <span className="lob-range">
            Showing <strong>{rangeStart}–{rangeEnd}</strong> of <strong>{total}</strong>
          </span>

          <div className="lob-foot-controls">
            <label className="lob-page-size">
              <span>Rows</span>
              <select
                value={pageSize}
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
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
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="lob-page-label">Page {page} of {pageCount}</span>
              <button
                type="button"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= pageCount}
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </footer>
      )}
    </section>
  )
}

export default LobbyTable

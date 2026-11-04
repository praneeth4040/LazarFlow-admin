import {
  ArrowDown, ArrowUp, Ban, Bell, ChevronLeft, ChevronRight,
  ChevronsUpDown, Crown, Search, UserCheck, Users, Zap,
} from 'lucide-react'
import {
  avatarTone, displayEmail, displayHandle, formatDate, initials,
  relativeTime,
} from './usersUtils'

const COLUMNS = [
  { key: 'user', label: 'User' },
  { key: 'plan', label: 'Plan' },
  { key: 'credits', label: 'Credits' },
  { key: 'lobbies', label: 'Lobbies' },
  { key: 'lastActive', label: 'Last activity' },
  { key: 'joined', label: 'Joined' },
]

const SortIcon = ({ column, sort }) => {
  if (sort.key !== column) return <ChevronsUpDown size={11} className="usr-sort-idle" />
  return sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
}

const SkeletonRow = () => (
  <div className="usr-row usr-skeleton" aria-hidden="true">
    <span className="usr-cell usr-check"><span className="usr-sk usr-sk-box" /></span>
    <span className="usr-cell usr-user">
      <span className="usr-sk usr-sk-avatar" />
      <span className="usr-sk-stack">
        <span className="usr-sk usr-sk-line" />
        <span className="usr-sk usr-sk-sub" />
      </span>
    </span>
    <span className="usr-cell usr-plan"><span className="usr-sk usr-sk-pill" /></span>
    <span className="usr-meta">
      <span className="usr-cell usr-credits"><span className="usr-sk usr-sk-line" /></span>
      <span className="usr-cell usr-lobbies"><span className="usr-sk usr-sk-line" /></span>
      <span className="usr-cell usr-last"><span className="usr-sk usr-sk-line" /></span>
    </span>
    <span className="usr-cell usr-joined"><span className="usr-sk usr-sk-line" /></span>
    <span className="usr-cell usr-actions"><span className="usr-sk usr-sk-box" /></span>
  </div>
)

const UserTable = ({
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
  onAction,
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
  emptyTitle = 'No users found',
  emptyHint = 'Try a different search or reset the filters.',
  now,
}) => {
  const selectedSet = new Set(selected)

  return (
    <section className="usr-table-panel" role="table" aria-label="Users directory">
      <div className="usr-table-head" role="row">
        <span className="usr-cell usr-check" role="columnheader">
          <input
            type="checkbox"
            checked={allPageSelected}
            ref={(node) => {
              if (node) node.indeterminate = !allPageSelected && somePageSelected
            }}
            onChange={onTogglePage}
            aria-label="Select all users on this page"
          />
        </span>

        {COLUMNS.map((column) => (
          <button
            key={column.key}
            type="button"
            className={`usr-cell usr-sort-btn usr-${column.key}${sort.key === column.key ? ' is-active' : ''}`}
            onClick={() => onSort(column.key)}
            role="columnheader"
            aria-sort={sort.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            {column.label}
            <SortIcon column={column.key} sort={sort} />
          </button>
        ))}

        <span className="usr-cell usr-actions" role="columnheader">
          <span className="usr-sr-only">Actions</span>
        </span>
      </div>

      {loading ? (
        <div className="usr-table-body">
          {[0, 1, 2, 3, 4, 5, 6].map((index) => <SkeletonRow key={index} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="usr-empty">
          <span className="usr-empty-icon"><Users size={26} /></span>
          <strong>{emptyTitle}</strong>
          <p>{emptyHint}</p>
          {hasFilters && (
            <button type="button" className="usr-link-btn" onClick={onClearFilters}>
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="usr-table-body" role="rowgroup">
          {rows.map((row) => {
            const isSelected = selectedSet.has(row.id)
            const expiry = row.sub.key === 'active' || row.sub.key === 'trialing'
              ? formatDate(row.subscription_expires_at, now)
              : null

            return (
              <div
                key={row.id}
                className={`usr-row${isSelected ? ' is-selected' : ''}${row.banned ? ' is-banned' : ''}`}
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
                aria-label={`Open ${displayEmail(row)}`}
              >
                <span
                  className="usr-cell usr-check"
                  role="cell"
                  data-label="Select"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleRow(row.id)}
                    aria-label={`Select ${displayEmail(row)}`}
                  />
                </span>

                <span className="usr-cell usr-user" role="cell" data-label="User">
                  <span className={`usr-avatar ${avatarTone(row.id)}`} aria-hidden="true">
                    {initials(row)}
                  </span>
                  <span className="usr-user-text">
                    <span className="usr-email" title={displayEmail(row)}>{displayEmail(row)}</span>
                    <span className="usr-user-sub">
                      {displayHandle(row) || row.display_name || 'No handle'}
                      {row.is_admin && <span className="usr-mini admin">Admin</span>}
                      {row.banned && <span className="usr-mini banned">Banned</span>}
                    </span>
                  </span>
                </span>

                <span className="usr-cell usr-plan" role="cell" data-label="Plan">
                  <span className={`usr-pill ${row.plan.tone}`}>{row.plan.label}</span>
                  <span className={`usr-cell-sub tone-${row.sub.tone}`}>
                    {row.sub.label}{expiry ? ` · ${expiry}` : ''}
                  </span>
                </span>

                <span className="usr-meta">
                  <span className="usr-cell usr-credits" role="cell" data-label="Credits">
                    <Zap size={12} className="usr-credit-icon" />
                    <span className="usr-strong">{row.balance.toLocaleString('en-IN')}</span>
                  </span>

                  <span className="usr-cell usr-lobbies" role="cell" data-label="Lobbies">
                    <span className="usr-strong">{row.lobbyCount}</span>
                    <span className="usr-cell-sub">{row.activeLobbyCount} active</span>
                  </span>

                  <span className="usr-cell usr-last" role="cell" data-label="Last activity">
                    {relativeTime(row.lastActiveTs ? new Date(row.lastActiveTs).toISOString() : null, now)}
                  </span>
                </span>

                <span className="usr-cell usr-joined" role="cell" data-label="Joined">
                  {formatDate(row.created_at, now)}
                </span>

                <span
                  className="usr-cell usr-actions"
                  role="cell"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="usr-icon-btn"
                    title="Adjust credits"
                    aria-label={`Adjust credits for ${displayEmail(row)}`}
                    onClick={() => onAction('credits', row)}
                  >
                    <Zap size={14} />
                  </button>
                  <button
                    type="button"
                    className="usr-icon-btn"
                    title="Manage subscription"
                    aria-label={`Manage subscription for ${displayEmail(row)}`}
                    onClick={() => onAction('subscription', row)}
                  >
                    <Crown size={14} />
                  </button>
                  <button
                    type="button"
                    className="usr-icon-btn"
                    title="Send notification"
                    aria-label={`Send notification to ${displayEmail(row)}`}
                    onClick={() => onAction('notify', row)}
                  >
                    <Bell size={14} />
                  </button>
                  <button
                    type="button"
                    className={`usr-icon-btn${row.banned ? ' is-danger' : ''}`}
                    title={row.is_admin ? 'Admins cannot be banned' : row.banned ? 'Unban user' : 'Ban user'}
                    aria-label={`${row.banned ? 'Unban' : 'Ban'} ${displayEmail(row)}`}
                    disabled={row.is_admin}
                    onClick={() => onAction(row.banned ? 'unban' : 'ban', row)}
                  >
                    {row.banned ? <UserCheck size={14} /> : <Ban size={14} />}
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {!loading && total > 0 && (
        <footer className="usr-table-foot">
          <span className="usr-range">
            Showing <strong>{rangeStart}–{rangeEnd}</strong> of <strong>{total}</strong>
          </span>

          <div className="usr-foot-controls">
            <label className="usr-page-size">
              <span>Rows</span>
              <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>

            <div className="usr-pager">
              <button
                type="button"
                className="usr-icon-btn"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="usr-page-label">Page {page} of {pageCount}</span>
              <button
                type="button"
                className="usr-icon-btn"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= pageCount}
                aria-label="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </footer>
      )}

      {!loading && total === 0 && hasFilters && (
        <footer className="usr-table-foot usr-table-foot-empty">
          <span className="usr-range"><Search size={12} /> No matching users</span>
        </footer>
      )}
    </section>
  )
}

export default UserTable

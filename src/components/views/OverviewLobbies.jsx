import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Trophy, Search, X, ChevronDown, ArrowUp, ArrowDown,
  ChevronsUpDown, ArrowUpRight,
} from 'lucide-react'
import { titleCase, shortDate, fullDate, relative } from './overviewUtils'
import './OverviewLobbies.css'

const STATUS_STYLES = {
  active: { label: 'Active', tone: 'ok' },
  setup: { label: 'Setup', tone: 'warn' },
  completed: { label: 'Completed', tone: 'info' },
}

const GAME_LABELS = {
  freefire: 'Free Fire',
  bgmi: 'BGMI',
  other: 'Other',
}

const gameLabel = (game) => GAME_LABELS[String(game || '').toLowerCase()] || titleCase(game)

const statusState = (status) => {
  const key = String(status || '').toLowerCase()
  return { key, ...(STATUS_STYLES[key] || { label: titleCase(key), tone: 'muted' }) }
}

const ordinal = (value) => {
  const n = Number(value) || 0
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffix[(v - 20) % 10] || suffix[v] || suffix[0]}`
}

const formatPointsSystem = (points) => {
  if (!Array.isArray(points) || points.length === 0) return 'Not configured'
  return points
    .slice()
    .sort((a, b) => (Number(a.placement) || 0) - (Number(b.placement) || 0))
    .map((entry) => `${ordinal(entry.placement)} ${Number(entry.points) || 0}`)
    .join(' · ')
}

const SortIcon = ({ column, sort }) => {
  if (sort.key !== column) return <ChevronsUpDown size={11} className="ovl-sort-idle" />
  return sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
}

const Field = ({ label, value, mono = false }) => (
  <div className="ovl-field">
    <span className="ovl-field-label">{label}</span>
    <span className={`ovl-field-value${mono ? ' is-mono' : ''}`}>{value}</span>
  </div>
)

const OverviewLobbies = ({
  lobbies = [], lobbyTeams = [], profiles = [], loading = false, asOf = 0,
  onNavigate, onOpenLobby,
}) => {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [game, setGame] = useState('all')
  const [teams, setTeams] = useState('all')
  const [created, setCreated] = useState('all')
  const [sort, setSort] = useState({ key: 'created', dir: 'desc' })
  const [expanded, setExpanded] = useState(null)

  const now = asOf || 0

  const rows = useMemo(() => {
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))

    const teamMap = new Map()
    for (const team of lobbyTeams) {
      const entry = teamMap.get(team.lobby_id) || { teams: 0, players: 0 }
      entry.teams += 1
      entry.players += Array.isArray(team.members) ? team.members.length : 0
      teamMap.set(team.lobby_id, entry)
    }

    return lobbies.map((lobby) => {
      const creator = profileMap.get(lobby.user_id)
      const team = teamMap.get(lobby.id) || { teams: 0, players: 0 }
      const gameName = gameLabel(lobby.game)

      return {
        ...lobby,
        gameLabel: gameName,
        status: statusState(lobby.status),
        creatorEmail: creator?.emails || '',
        creatorHandle: creator?.username || '',
        creatorName: creator?.display_name || '',
        teamCount: team.teams,
        playerCount: team.players,
        createdTs: new Date(lobby.created_at || 0).getTime() || 0,
        search: [
          lobby.name, lobby.game, gameName, lobby.id,
          creator?.emails, creator?.username, creator?.display_name,
        ].join(' ').toLowerCase(),
      }
    })
  }, [lobbies, lobbyTeams, profiles])

  const statusOptions = useMemo(() => {
    const map = new Map()
    for (const row of rows) map.set(row.status.key, row.status.label)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const gameOptions = useMemo(() => {
    const map = new Map()
    for (const row of rows) map.set(row.game, row.gameLabel)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const weekAgo = now - 7 * 86_400_000
    const monthAgo = now - 30 * 86_400_000
    const monthStart = new Date(now)
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const filtered = rows.filter((row) => {
      if (needle && !row.search.includes(needle)) return false
      if (status !== 'all' && row.status.key !== status) return false
      if (game !== 'all' && row.game !== game) return false
      if (teams === 'with' && row.teamCount === 0) return false
      if (teams === 'none' && row.teamCount > 0) return false
      if (created === '7d' && row.createdTs < weekAgo) return false
      if (created === '30d' && row.createdTs < monthAgo) return false
      if (created === 'month' && row.createdTs < monthStart.getTime()) return false
      return true
    })

    const direction = sort.dir === 'asc' ? 1 : -1
    filtered.sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return a.name.localeCompare(b.name) * direction
        case 'creator':
          return (a.creatorEmail || '').localeCompare(b.creatorEmail || '') * direction
        case 'status':
          return a.status.label.localeCompare(b.status.label) * direction
        case 'created':
        default:
          return (a.createdTs - b.createdTs) * direction
      }
    })

    return filtered
  }, [rows, query, status, game, teams, created, sort, now])

  const latest = rows.reduce((max, row) => (row.createdTs > max ? row.createdTs : max), 0)

  const hasFilters = Boolean(query.trim()) || status !== 'all' || game !== 'all'
    || teams !== 'all' || created !== 'all'

  const clearFilters = () => {
    setQuery('')
    setStatus('all')
    setGame('all')
    setTeams('all')
    setCreated('all')
  }

  const toggleSort = (key) => {
    setSort((current) => (
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' || key === 'creator' ? 'asc' : 'desc' }
    ))
  }

  // Keep the opened detail visible inside the scrollable list.
  useEffect(() => {
    if (!expanded) return
    const node = document.getElementById(`ovl-detail-${expanded}`)
    if (node) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [expanded])

  return (
    <section className="ovl-panel" aria-labelledby="ovl-title">
      <header className="ovl-head">
        <div className="ovl-head-title">
          <span className="ovl-head-icon"><Trophy size={16} /></span>
          <div>
            <h2 id="ovl-title">Lobbies</h2>
            <p>Latest lobbies, creators and status</p>
          </div>
        </div>
        <button type="button" className="ovl-open" onClick={() => onNavigate?.('lobbies')}>
          Open Lobbies <ArrowUpRight size={13} />
        </button>
      </header>

      <div className="ovl-toolbar">
        <div className="ovl-search">
          <Search size={14} className="ovl-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search lobby, game, creator or ID…"
            aria-label="Search lobbies"
          />
          {query && (
            <button type="button" className="ovl-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="ovl-filters">
          <select className="ovl-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            <option value="all">All statuses</option>
            {statusOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select className="ovl-select" value={game} onChange={(event) => setGame(event.target.value)} aria-label="Filter by game">
            <option value="all">All games</option>
            {gameOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select className="ovl-select" value={teams} onChange={(event) => setTeams(event.target.value)} aria-label="Filter by teams">
            <option value="all">Any teams</option>
            <option value="with">Has teams</option>
            <option value="none">No teams</option>
          </select>

          <select className="ovl-select" value={created} onChange={(event) => setCreated(event.target.value)} aria-label="Filter by creation date">
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="month">This month</option>
          </select>
        </div>
      </div>

      <div className="ovl-summary">
        <span>
          <strong>{loading ? '—' : visible.length}</strong> of {rows.length} lobbies
        </span>
        {hasFilters ? (
          <button type="button" className="ovl-clear" onClick={clearFilters}>Clear filters</button>
        ) : (
          <span className="ovl-hint">Latest {relative(latest, now)}</span>
        )}
      </div>

      <div className="ovl-list-head" role="row">
        <button type="button" className={`ovl-sort${sort.key === 'name' ? ' is-active' : ''}`} onClick={() => toggleSort('name')}>
          Lobby <SortIcon column="name" sort={sort} />
        </button>
        <button type="button" className={`ovl-sort${sort.key === 'creator' ? ' is-active' : ''}`} onClick={() => toggleSort('creator')}>
          Creator <SortIcon column="creator" sort={sort} />
        </button>
        <button type="button" className={`ovl-sort${sort.key === 'status' ? ' is-active' : ''}`} onClick={() => toggleSort('status')}>
          Status <SortIcon column="status" sort={sort} />
        </button>
        <button type="button" className={`ovl-sort${sort.key === 'created' ? ' is-active' : ''}`} onClick={() => toggleSort('created')}>
          Created <SortIcon column="created" sort={sort} />
        </button>
        <span aria-hidden="true" />
      </div>

      {loading ? (
        <div className="ovl-scroll" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div className="ovl-row ovl-skeleton" key={index}>
              <span className="ovl-sk-main">
                <span className="ovl-sk ovl-sk-line" />
                <span className="ovl-sk ovl-sk-sub" />
              </span>
              <span className="ovl-sk ovl-sk-creator" />
              <span className="ovl-sk ovl-sk-pill" />
              <span className="ovl-sk ovl-sk-date" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="ovl-empty">
          <Trophy size={26} />
          <strong>No lobbies match these filters</strong>
          <p>Try a different search term or reset the filters.</p>
          <button type="button" className="ovl-clear" onClick={clearFilters}>Clear filters</button>
        </div>
      ) : (
        <div className={`ovl-scroll${expanded ? ' has-open' : ''}`}>
          {visible.map((row) => {
            const open = expanded === row.id
            return (
              <Fragment key={row.id}>
                <button
                  type="button"
                  className={`ovl-row${open ? ' is-open' : ''}`}
                  onClick={() => setExpanded(open ? null : row.id)}
                  aria-expanded={open}
                  aria-controls={open ? `ovl-detail-${row.id}` : undefined}
                >
                  <span className="ovl-main">
                    <span className="ovl-name" title={row.name}>{row.name}</span>
                    <span className="ovl-game">{row.gameLabel}</span>
                  </span>

                  <span className="ovl-creator" title={row.creatorEmail || 'Unknown creator'}>
                    {row.creatorHandle ? `@${row.creatorHandle}` : row.creatorEmail || 'Unknown'}
                  </span>

                  <span className={`ovl-status ${row.status.tone}`}>
                    <span className="ovl-dot" aria-hidden="true" />
                    {row.status.label}
                  </span>

                  <span className="ovl-created" title={fullDate(row.created_at)}>
                    {relative(row.created_at, now)}
                  </span>

                  <ChevronDown size={15} className="ovl-chevron" aria-hidden="true" />
                </button>

                {open && (
                  <div className="ovl-detail" id={`ovl-detail-${row.id}`}>
                    <div className="ovl-detail-grid">
                      <Field label="Lobby name" value={row.name || 'Untitled'} />
                      <Field label="Game" value={row.gameLabel} />
                      <Field label="Status" value={row.status.label} />
                      <Field label="Created" value={fullDate(row.created_at)} />
                      <Field label="Last updated" value={`${relative(row.updated_at, now)} · ${shortDate(row.updated_at)}`} />
                      <Field label="Creator email" value={row.creatorEmail || '—'} />
                      <Field label="Creator username" value={row.creatorHandle ? `@${row.creatorHandle}` : '—'} />
                      <Field label="Creator name" value={row.creatorName || '—'} />
                      <Field label="Teams" value={row.teamCount} />
                      <Field label="Players" value={row.playerCount} />
                      <Field label="Kill points" value={row.kill_points ?? '—'} />
                      <Field label="Promoted" value={row.is_promoted ? 'Yes' : 'No'} />
                      <Field label="Setup completed" value={row.metadata?.setup_completed ? 'Yes' : 'No'} />
                      <Field
                        label="Final standings"
                        value={Array.isArray(row.final_standings) && row.final_standings.length
                          ? `${row.final_standings.length} entries`
                          : 'Empty'}
                      />
                      <Field
                        label="Form data"
                        value={row.form_data && Object.keys(row.form_data).length
                          ? Object.keys(row.form_data).join(', ')
                          : 'Empty'}
                      />
                      <Field label="Points system" value={formatPointsSystem(row.points_system)} />
                      <Field label="Lobby ID" value={row.id} mono />
                      <Field label="Creator ID" value={row.user_id} mono />
                    </div>

                    <div className="ovl-detail-foot">
                      <span className="ovl-detail-hint">
                        {row.teamCount} teams · {row.playerCount} players
                      </span>
                      <button
                        type="button"
                        className="ovl-detail-open"
                        onClick={() => (onOpenLobby ? onOpenLobby(row) : onNavigate?.('lobbies'))}
                      >
                        Open lobby <ArrowUpRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default OverviewLobbies

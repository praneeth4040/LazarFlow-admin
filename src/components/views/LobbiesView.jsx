import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Download, Gamepad2, RefreshCcw,
  Search, ShieldCheck, SlidersHorizontal, UserMinus, Users, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import LobbyTable from './lobbies/LobbyTable'
import LobbyDetailPanel from './lobbies/LobbyDetailPanel'
import TeamsPanel from './lobbies/TeamsPanel'
import HealthPanel from './lobbies/HealthPanel'
import OrganizersPanel from './lobbies/OrganizersPanel'
import { StatusModal } from './lobbies/LobbyModals'
import {
  attentionCount, buildHealthBuckets, buildLobbyRows, buildOrganizerRows,
  buildTeamRows, DEFAULT_FILTERS, downloadCsv, filterLobbyRows, HEALTH_BUCKETS,
  lobbiesToCsv, sortLobbyRows, teamsToCsv,
} from './lobbies/lobbiesUtils'
import './LobbiesView.css'

const TABS = [
  { key: 'directory', label: 'Directory' },
  { key: 'teams', label: 'Teams' },
  { key: 'health', label: 'Health' },
  { key: 'organizers', label: 'Organizers' },
]

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'setup', label: 'Setup' },
  { value: 'completed', label: 'Completed' },
]

const StatTile = ({ icon: Icon, label, value, sub, tone = 'blue' }) => (
  <div className={`lob-stat ${tone}`}>
    <span className="lob-stat-top">
      <span className="lob-stat-icon">{Icon && <Icon size={18} />}</span>
      <span className="lob-stat-label">{label}</span>
    </span>
    <strong className="lob-stat-value">{value}</strong>
    <span className="lob-stat-sub">{sub}</span>
  </div>
)

const LobbiesView = ({ focusLobbyId = null, onOpenUser, externalRefreshKey = 0 }) => {
  const [lobbies, setLobbies] = useState([])
  const [teams, setTeams] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [now, setNow] = useState(Date.now())

  const [view, setView] = useState('directory')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [sort, setSort] = useState({ key: 'created', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selected, setSelected] = useState([])
  const [detailId, setDetailId] = useState(() => focusLobbyId || null)
  const [focusTeamId, setFocusTeamId] = useState(null)

  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const showToast = (message, tone = 'ok') => {
    setToast({ message, tone })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4500)
  }

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [lobbiesRes, teamsRes, profilesRes] = await Promise.all([
          supabase.from('lobbies').select(
            'id, user_id, name, game, points_system, kill_points, status, created_at, updated_at, ' +
            'final_standings, metadata, is_promoted, form_data',
          ).order('created_at', { ascending: false }),
          supabase.from('lobby_teams').select(
            'id, lobby_id, team_name, members, total_points, respective_slotlist_postion, created_at, updated_at',
          ).order('created_at', { ascending: false }),
          supabase.from('profiles').select('id, username, display_name, emails'),
        ])

        if (lobbiesRes.error) throw lobbiesRes.error
        if (teamsRes.error) throw teamsRes.error
        if (profilesRes.error) throw profilesRes.error
        if (cancelled) return

        setLobbies(lobbiesRes.data || [])
        setTeams(teamsRes.data || [])
        setProfiles(profilesRes.data || [])
        setNow(Date.now())
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load lobbies')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey, externalRefreshKey])

  const rows = useMemo(
    () => buildLobbyRows({ lobbies, teams, profiles, now }),
    [lobbies, teams, profiles, now],
  )

  const teamRows = useMemo(
    () => buildTeamRows({ teams, lobbyRows: rows }),
    [teams, rows],
  )

  const organizerRows = useMemo(
    () => buildOrganizerRows({ lobbyRows: rows, profiles }),
    [rows, profiles],
  )

  const buckets = useMemo(() => buildHealthBuckets(rows), [rows])
  const attention = useMemo(() => attentionCount(rows), [rows])

  const stats = useMemo(() => {
    const monthStart = new Date(now)
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    let active = 0
    let stale = 0
    let noTeams = 0
    let emptyRosterTeams = 0
    let gapLobbies = 0
    let playerSlots = 0
    let thisMonth = 0

    for (const row of rows) {
      if (row.status.key === 'active') active += 1
      if (row.flags.stale) stale += 1
      if (row.teamCount === 0) noTeams += 1
      if (row.emptyRosterTeams > 0) {
        gapLobbies += 1
        emptyRosterTeams += row.emptyRosterTeams
      }
      playerSlots += row.playerCount
      if (row.createdTs >= monthStart.getTime()) thisMonth += 1
    }

    return { active, stale, noTeams, emptyRosterTeams, gapLobbies, playerSlots, thisMonth }
  }, [rows, now])

  const filtered = useMemo(
    () => filterLobbyRows(rows, { query, filters, now }),
    [rows, query, filters, now],
  )

  const sorted = useMemo(() => sortLobbyRows(filtered, sort), [filtered, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  )

  const pageIds = pageRows.map((row) => row.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id))
  const somePageSelected = pageIds.some((id) => selected.includes(id))
  const selectedRows = useMemo(() => rows.filter((row) => selected.includes(row.id)), [rows, selected])
  const detailRow = useMemo(() => rows.find((row) => row.id === detailId) || null, [rows, detailId])

  const hasFilters = Boolean(query.trim())
    || Object.entries(filters).some(([, value]) => value !== 'all')

  const healthFilterLabel = filters.health === 'all'
    ? null
    : HEALTH_BUCKETS.find((bucket) => bucket.key === filters.health)?.label || filters.health

  const organizerFilterLabel = filters.organizer === 'all'
    ? null
    : organizerRows.find((row) => row.id === filters.organizer)?.label || 'Selected organizer'

  const clearFilters = () => {
    setQuery('')
    setFilters(DEFAULT_FILTERS)
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
        : { key, dir: key === 'name' || key === 'organizer' ? 'asc' : 'desc' }
    ))
    setPage(1)
  }

  const toggleRow = (id) => {
    setSelected((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ))
  }

  const togglePage = () => {
    setSelected((current) => {
      if (allPageSelected) return current.filter((id) => !pageIds.includes(id))
      return [...new Set([...current, ...pageIds])]
    })
  }

  const switchView = (next) => {
    setView(next)
    setSelected([])
    setDetailId(null)
    setFocusTeamId(null)
  }

  const reviewHealth = (key) => {
    setFilters({ ...DEFAULT_FILTERS, health: key })
    setQuery('')
    setPage(1)
    switchView('directory')
  }

  const filterByOrganizer = (organizer) => {
    setFilters({ ...DEFAULT_FILTERS, organizer: organizer.id })
    setQuery('')
    setPage(1)
    switchView('directory')
  }

  const openStatus = (row) => setModal({ type: 'status', targets: [row] })

  const openBulkStatus = () => {
    if (selectedRows.length === 0) return
    setModal({ type: 'status', targets: selectedRows })
  }

  const handleStatus = async ({ status }) => {
    if (!modal?.targets?.length) return
    setBusy(true)
    try {
      const ids = modal.targets.map((target) => target.id)
      const { data, error: updateError } = await supabase
        .from('lobbies')
        .update({ status, updated_at: new Date().toISOString() })
        .in('id', ids)
        .select('id, status, updated_at')

      if (updateError) throw updateError

      const updated = new Map((data || []).map((row) => [row.id, row]))
      setLobbies((current) => current.map((lobby) => (
        updated.has(lobby.id) ? { ...lobby, ...updated.get(lobby.id) } : lobby
      )))

      const label = status.charAt(0).toUpperCase() + status.slice(1)
      showToast(`${ids.length} lobb${ids.length === 1 ? 'y' : 'ies'} set to ${label}`)
      setModal(null)
      setSelected([])
    } catch (err) {
      showToast(err?.message || 'Could not update lobby status', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const copyText = async (text, message) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(message)
    } catch {
      showToast('Clipboard is unavailable in this browser', 'danger')
    }
  }

  const copyLobbyId = (row) => copyText(row.id, 'Lobby ID copied')

  const handleExport = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    if (view === 'teams') {
      if (teamRows.length === 0) {
        showToast('Nothing to export', 'warn')
        return
      }
      downloadCsv(`lazarflow-lobby-teams-${stamp}.csv`, teamsToCsv(teamRows))
      showToast(`Exported ${teamRows.length} teams`)
      return
    }

    const exportRows = view === 'directory' ? sorted : rows
    if (exportRows.length === 0) {
      showToast('Nothing to export', 'warn')
      return
    }
    downloadCsv(`lazarflow-lobbies-${stamp}.csv`, lobbiesToCsv(exportRows))
    showToast(`Exported ${exportRows.length} lobbies`)
  }

  const refresh = () => {
    setRefreshKey((key) => key + 1)
    showToast('Refreshing lobbies…', 'info')
  }

  const tabCount = (key) => {
    if (key === 'directory') return rows.length
    if (key === 'teams') return teamRows.length
    if (key === 'health') return attention
    if (key === 'organizers') return organizerRows.length
    return 0
  }

  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeEnd = Math.min(safePage * pageSize, sorted.length)

  return (
    <div className="lob-view">
      <section className="lob-hero" aria-labelledby="lob-title">
        <header className="lob-hero-head">
          <div>
            <span className="lob-eyebrow"><Gamepad2 size={12} /> Tournaments</span>
            <h1 id="lob-title" className="lob-title">Lobbies</h1>
            <p className="lob-subtitle">
              Inspect every lobby, its teams, rosters and operational health.
            </p>
          </div>
          <div className="lob-hero-actions">
            <span className={`lob-live ${loading ? 'is-refreshing' : ''}`}>
              <span className="lob-live-dot" aria-hidden="true" />
              {loading ? 'Refreshing…' : `Live · ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </span>
            <button type="button" className="lob-btn" onClick={refresh} disabled={loading}>
              <RefreshCcw size={14} className={loading ? 'lob-spin' : ''} /> Refresh
            </button>
            <button type="button" className="lob-btn" onClick={handleExport}>
              <Download size={14} /> Export CSV
            </button>
            <button
              type="button"
              className={`lob-btn ${attention > 0 ? 'lob-btn-primary' : 'lob-btn-ok'}`}
              onClick={() => switchView('health')}
              disabled={loading}
            >
              {attention > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              {attention > 0 ? `Review health (${attention})` : 'All healthy'}
            </button>
          </div>
        </header>

        {error && (
          <div className="lob-banner danger lob-hero-banner">
            <AlertTriangle size={16} />
            <div>
              <strong>Could not load lobbies</strong>
              <p>{error}</p>
            </div>
            <button type="button" className="lob-btn lob-btn-sm" onClick={refresh}>Retry</button>
          </div>
        )}

        <div className="lob-stats" aria-live="polite">
          <StatTile
            icon={Gamepad2}
            tone="amber"
            label="Total lobbies"
            value={loading ? '—' : rows.length.toLocaleString('en-IN')}
            sub={loading ? 'Loading…' : `${stats.thisMonth} created this month`}
          />
          <StatTile
            icon={ShieldCheck}
            tone={stats.stale ? 'amber' : 'green'}
            label="Active"
            value={loading ? '—' : stats.active.toLocaleString('en-IN')}
            sub={loading ? 'Loading…' : stats.stale ? `${stats.stale} stale 7+ days` : 'All recently updated'}
          />
          <StatTile
            icon={Users}
            tone="blue"
            label="Teams"
            value={loading ? '—' : teamRows.length.toLocaleString('en-IN')}
            sub={loading ? 'Loading…' : `${stats.playerSlots} player slots`}
          />
          <StatTile
            icon={UserMinus}
            tone={stats.emptyRosterTeams ? 'amber' : 'teal'}
            label="Empty rosters"
            value={loading ? '—' : stats.emptyRosterTeams.toLocaleString('en-IN')}
            sub={loading ? 'Loading…' : `across ${stats.gapLobbies} lobbies`}
          />
          <StatTile
            icon={AlertTriangle}
            tone={attention ? 'red' : 'green'}
            label="Needs attention"
            value={loading ? '—' : attention.toLocaleString('en-IN')}
            sub={loading ? 'Loading…' : `${stats.noTeams} with no teams`}
          />
        </div>
      </section>

      <nav className="lob-tabs" aria-label="Lobby sections">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`lob-tab${view === tab.key ? ' active' : ''}`}
            onClick={() => switchView(tab.key)}
          >
            {tab.label}
            <span className="lob-tab-count">{tabCount(tab.key)}</span>
          </button>
        ))}
      </nav>

      {view === 'teams' ? (
        <TeamsPanel
          rows={teamRows}
          loading={loading}
          now={now}
          onOpenLobby={(team) => {
            setDetailId(team.lobbyId)
            setFocusTeamId(team.id)
          }}
        />
      ) : view === 'health' ? (
        <HealthPanel
          buckets={buckets}
          totalLobbies={rows.length}
          loading={loading}
          onReview={reviewHealth}
        />
      ) : view === 'organizers' ? (
        <OrganizersPanel
          rows={organizerRows}
          loading={loading}
          now={now}
          onFilterOrganizer={filterByOrganizer}
        />
      ) : (
        <>
          <div className="lob-context">
            <SlidersHorizontal size={14} />
            <span>
              Every lobby with its organizer, status, team count and roster coverage.
              Open a row for teams, scores and the points system.
            </span>
          </div>

          {(healthFilterLabel || organizerFilterLabel) && (
            <div className="lob-chip-row">
              {healthFilterLabel && (
                <span className="lob-chip">
                  Health: {healthFilterLabel}
                  <button
                    type="button"
                    onClick={() => patchFilters({ health: 'all' })}
                    aria-label="Clear health filter"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              {organizerFilterLabel && (
                <span className="lob-chip">
                  Organizer: {organizerFilterLabel}
                  <button
                    type="button"
                    onClick={() => patchFilters({ organizer: 'all' })}
                    aria-label="Clear organizer filter"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
            </div>
          )}

          <div className="lob-toolbar">
            <div className="lob-search">
              <Search size={15} className="lob-search-icon" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1) }}
                placeholder="Search lobby, organizer, team or ID…"
                aria-label="Search lobbies"
              />
              {query && (
                <button type="button" className="lob-search-clear" onClick={() => { setQuery(''); setPage(1) }} aria-label="Clear search">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="lob-filters">
              <select
                value={filters.status}
                onChange={(event) => patchFilters({ status: event.target.value })}
                aria-label="Filter by status"
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <select
                value={filters.game}
                onChange={(event) => patchFilters({ game: event.target.value })}
                aria-label="Filter by game"
              >
                <option value="all">All games</option>
                <option value="freefire">Free Fire</option>
                <option value="bgmi">BGMI</option>
                <option value="other">Other</option>
              </select>

              <select
                value={filters.teams}
                onChange={(event) => patchFilters({ teams: event.target.value })}
                aria-label="Filter by teams"
              >
                <option value="all">Any teams</option>
                <option value="with">Has teams</option>
                <option value="none">No teams</option>
              </select>

              <select
                value={filters.roster}
                onChange={(event) => patchFilters({ roster: event.target.value })}
                aria-label="Filter by roster"
              >
                <option value="all">Any roster</option>
                <option value="complete">Complete rosters</option>
                <option value="gap">Has roster gaps</option>
                <option value="empty">No teams</option>
              </select>

              <select
                value={filters.created}
                onChange={(event) => patchFilters({ created: event.target.value })}
                aria-label="Filter by creation date"
              >
                <option value="all">All time</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="month">This month</option>
                <option value="older">Older than 30 days</option>
              </select>

              {hasFilters && (
                <button type="button" className="lob-link-btn" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {selectedRows.length > 0 && (
            <div className="lob-bulk">
              <span className="lob-bulk-count"><strong>{selectedRows.length}</strong> selected</span>
              <div className="lob-bulk-actions">
                <button type="button" onClick={openBulkStatus}>
                  <SlidersHorizontal size={13} /> Set status
                </button>
              </div>
              <button type="button" className="lob-bulk-clear" onClick={() => setSelected([])}>
                <X size={13} /> Clear
              </button>
            </div>
          )}

          <LobbyTable
            rows={pageRows}
            loading={loading}
            sort={sort}
            onSort={toggleSort}
            selected={selected}
            allPageSelected={allPageSelected}
            somePageSelected={somePageSelected}
            onToggleRow={toggleRow}
            onTogglePage={togglePage}
            onOpen={(row) => { setDetailId(row.id); setFocusTeamId(null) }}
            onStatus={openStatus}
            onCopy={copyLobbyId}
            page={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            total={sorted.length}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
            onClearFilters={clearFilters}
            hasFilters={hasFilters}
            emptyTitle="No lobbies match these filters"
            emptyHint="Try a different search term or reset the filters."
            now={now}
          />
        </>
      )}

      {detailRow && (
        <LobbyDetailPanel
          key={detailRow.id}
          row={detailRow}
          now={now}
          focusTeamId={focusTeamId}
          suspended={Boolean(modal)}
          onClose={() => { setDetailId(null); setFocusTeamId(null) }}
          onStatus={openStatus}
          onCopy={copyLobbyId}
          onOpenOrganizer={(creator) => {
            setDetailId(null)
            setFocusTeamId(null)
            onOpenUser?.(creator)
          }}
        />
      )}

      {modal?.type === 'status' && (
        <StatusModal
          targets={modal.targets}
          onClose={() => !busy && setModal(null)}
          onSubmit={handleStatus}
          busy={busy}
        />
      )}

      {toast && (
        <div className={`lob-toast ${toast.tone}`} role="status" aria-live="polite">
          {toast.tone === 'danger' || toast.tone === 'warn'
            ? <AlertTriangle size={15} />
            : <ShieldCheck size={15} />}
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

export default LobbiesView

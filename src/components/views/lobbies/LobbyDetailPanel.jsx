import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, Copy, Crown, Gamepad2,
  Layers, ListOrdered, Settings2, ShieldCheck, Swords, Trophy, User, Users, X,
} from 'lucide-react'
import {
  formatDate, formatDateTime, lockBodyScroll, memberKills, memberMatches,
  memberName, memberWins, ordinal, pointsSystem, relativeTime, rosterLabel,
} from './lobbiesUtils'

const Field = ({ label, value, mono = false }) => (
  <div className="lob-field">
    <span className="lob-field-label">{label}</span>
    <span className={`lob-field-value${mono ? ' is-mono' : ''}`}>
      {value === null || value === undefined || value === '' ? '—' : value}
    </span>
  </div>
)

const DetailStat = ({ icon: Icon, label, value, sub, tone = '' }) => (
  <div className={`lob-detail-stat ${tone}`}>
    <span className="lob-detail-stat-icon">{Icon && <Icon size={15} />}</span>
    <strong className="lob-detail-stat-value">{value}</strong>
    <span className="lob-detail-stat-label">{label}</span>
    {sub && <span className="lob-detail-stat-sub">{sub}</span>}
  </div>
)

const SIGNAL_LABELS = {
  stale: 'Active but stale',
  stuck: 'Stuck in setup',
  noTeams: 'No teams',
  rosterGap: 'Roster gaps',
  mismatch: 'Setup flag mismatch',
  anomaly: 'Data anomaly',
}

const TEAM_SORTS = [
  { value: 'total', label: 'Score' },
  { value: 'slot', label: 'Slot' },
  { value: 'name', label: 'Name' },
  { value: 'members', label: 'Members' },
]

const LobbyDetailPanel = ({
  row,
  now,
  focusTeamId = null,
  suspended = false,
  onClose,
  onStatus,
  onCopy,
  onOpenOrganizer,
}) => {
  const [expandedTeam, setExpandedTeam] = useState(() => focusTeamId)
  const [teamSort, setTeamSort] = useState(focusTeamId ? 'slot' : 'total')

  useEffect(() => {
    if (suspended) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, suspended])

  useEffect(() => lockBodyScroll(), [])

  useEffect(() => {
    if (!expandedTeam) return
    const node = document.getElementById(`lob-team-${expandedTeam}`)
    if (node) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [expandedTeam])

  const teams = useMemo(() => {
    const list = (row?.lobbyTeams || []).slice()
    if (teamSort === 'name') {
      return list.sort((a, b) => String(a.team_name || '').localeCompare(String(b.team_name || '')))
    }
    if (teamSort === 'members') {
      return list.sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0))
    }
    if (teamSort === 'slot') {
      return list.sort((a, b) => (Number(a.respective_slotlist_postion) || 999) - (Number(b.respective_slotlist_postion) || 999))
    }
    return list.sort((a, b) => {
      const pa = (Number(a.total_points?.kill_points) || 0) + (Number(a.total_points?.placement_points) || 0)
      const pb = (Number(b.total_points?.kill_points) || 0) + (Number(b.total_points?.placement_points) || 0)
      return pb - pa
    })
  }, [row, teamSort])

  if (!row) return null

  const points = pointsSystem(row)
  const rosterPct = Math.round(row.rosterFill * 100)
  const signals = row.health

  return (
    <div
      className="lob-drawer-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside className="lob-drawer" role="dialog" aria-modal="true" aria-labelledby="lob-drawer-title">
        <header className="lob-drawer-head">
          <div className="lob-drawer-identity">
            <span className={`lob-drawer-mark ${row.status.tone}`} aria-hidden="true">
              <Gamepad2 size={19} />
            </span>
            <div className="lob-drawer-id">
              <h2 id="lob-drawer-title" title={row.name}>{row.name || 'Untitled lobby'}</h2>
              <p>{row.gameLabel} · {row.creator.label}</p>
              <div className="lob-badge-row">
                <span className={`lob-pill ${row.status.tone}`}>
                  <span className="lob-pill-dot" aria-hidden="true" />
                  {row.status.label}
                </span>
                {row.is_promoted && <span className="lob-pill violet">Promoted</span>}
                {signals.length > 0 && (
                  <span className="lob-pill warn">{signals.length} signal{signals.length === 1 ? '' : 's'}</span>
                )}
              </div>
            </div>
          </div>
          <button type="button" className="lob-icon-btn lob-close" onClick={onClose} aria-label="Close lobby details">
            <X size={18} />
          </button>
        </header>

        <div className="lob-drawer-actions">
          <button type="button" className="lob-btn" onClick={() => onStatus(row)}>
            <Settings2 size={14} /> Change status
          </button>
          <button type="button" className="lob-btn" onClick={() => onCopy(row)}>
            <Copy size={14} /> Copy ID
          </button>
          <button type="button" className="lob-btn" onClick={() => onOpenOrganizer(row.creator)}>
            <User size={14} /> View organizer
          </button>
        </div>

        <div className="lob-drawer-body">
          <div className="lob-detail-stats">
            <DetailStat icon={Users} label="Teams" value={row.teamCount} sub={`${row.playerCount} players`} />
            <DetailStat icon={Layers} label="Roster fill" value={`${rosterPct}%`} sub={rosterLabel(row)} tone={rosterPct === 100 ? 'ok' : ''} />
            <DetailStat
              icon={Trophy}
              label="Top score"
              value={row.topTeam ? row.topTeam.total : '—'}
              sub={row.topTeam?.name || 'No teams'}
            />
            <DetailStat
              icon={Swords}
              label="Total kills"
              value={row.totals.kills}
              sub={`${row.totals.placement} placement pts`}
            />
          </div>

          {signals.length > 0 && (
            <section className="lob-detail-card lob-signals">
              <header className="lob-detail-card-head">
                <h3><AlertTriangle size={15} /> Signals</h3>
              </header>
              <ul className="lob-signal-list">
                {signals.map((key) => (
                  <li key={key} className={key === 'anomaly' ? 'danger' : 'warn'}>
                    {SIGNAL_LABELS[key] || key}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="lob-detail-card">
            <header className="lob-detail-card-head">
              <h3><Users size={15} /> Teams</h3>
              <div className="lob-detail-head-tools">
                <span className="lob-detail-count">{teams.length}</span>
                <select
                  className="lob-mini-select"
                  value={teamSort}
                  onChange={(event) => setTeamSort(event.target.value)}
                  aria-label="Sort teams"
                >
                  {TEAM_SORTS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </header>

            {teams.length === 0 ? (
              <p className="lob-empty-mini">No teams have registered for this lobby.</p>
            ) : (
              <div className="lob-dt-list">
                {teams.map((team) => {
                  const members = Array.isArray(team.members) ? team.members : []
                  const wins = Number(team.total_points?.wins) || 0
                  const kills = Number(team.total_points?.kill_points) || 0
                  const placement = Number(team.total_points?.placement_points) || 0
                  const total = kills + placement
                  const slot = Number(team.respective_slotlist_postion) || 0
                  const open = expandedTeam === team.id

                  return (
                    <div
                      key={team.id}
                      id={`lob-team-${team.id}`}
                      className={`lob-dt-team${open ? ' is-open' : ''}${focusTeamId === team.id ? ' is-focus' : ''}`}
                    >
                      <button
                        type="button"
                        className="lob-dt-row"
                        onClick={() => setExpandedTeam(open ? null : team.id)}
                        aria-expanded={open}
                      >
                        <span className="lob-dt-slot">{slot ? ordinal(slot) : '—'}</span>
                        <span className="lob-dt-main">
                          <span className="lob-dt-name" title={team.team_name}>{team.team_name || 'Unnamed team'}</span>
                          <span className="lob-dt-sub">
                            {members.length} member{members.length === 1 ? '' : 's'}
                            {' · '}
                            {Number(team.total_points?.matches_played) || 0} matches
                          </span>
                        </span>
                        <span className="lob-dt-metric" title="Wins (WWCD)">W {wins}</span>
                        <span className="lob-dt-metric" title="Kill points">K {kills}</span>
                        <span className="lob-dt-metric" title="Placement points">P {placement}</span>
                        <span className="lob-dt-total" title="Total score = kills + placement">{total}</span>
                        <ChevronDown size={14} className="lob-dt-chevron" aria-hidden="true" />
                      </button>

                      {open && (
                        <div className="lob-dt-members">
                          {members.length === 0 ? (
                            <p className="lob-empty-mini">This team has no roster on record.</p>
                          ) : (
                            <ul className="lob-dt-member-list">
                              {members.map((member, index) => (
                                <li key={`${team.id}-${index}`} className="lob-dt-member">
                                  <span className="lob-dt-member-name">{memberName(member)}</span>
                                  <span className="lob-dt-member-stats">
                                    {memberKills(member)} kills · {memberWins(member)} WWCD · {memberMatches(member)} matches
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="lob-detail-card">
            <header className="lob-detail-card-head">
              <h3><ListOrdered size={15} /> Points system</h3>
              <span className="lob-detail-count">{points.length} placements</span>
            </header>
            {points.length === 0 ? (
              <p className="lob-empty-mini">No points system configured.</p>
            ) : (
              <div className="lob-points-grid">
                {points.map((entry) => (
                  <span key={entry.placement} className="lob-point-chip">
                    <span className="lob-point-place">{ordinal(entry.placement)}</span>
                    <span className="lob-point-value">{entry.points}</span>
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="lob-detail-card">
            <header className="lob-detail-card-head">
              <h3><ShieldCheck size={15} /> Lobby details</h3>
            </header>
            <div className="lob-field-grid">
              <Field label="Created" value={formatDateTime(row.created_at)} />
              <Field label="Updated" value={formatDateTime(row.updated_at)} />
              <Field label="Age" value={`${Math.floor(row.ageDays)} days`} />
              <Field label="Idle" value={`${Math.floor(row.idleDays)} days`} />
              <Field label="Kill points" value={row.killPoints ?? 'Invalid'} />
              <Field label="Setup completed" value={row.setupCompleted ? 'Yes' : 'No'} />
              <Field label="Promoted" value={row.is_promoted ? 'Yes' : 'No'} />
              <Field
                label="Final standings"
                value={row.standings.length ? `${row.standings.length} entries` : 'Empty'}
              />
              <Field
                label="Form data"
                value={row.form_data && Object.keys(row.form_data).length
                  ? Object.keys(row.form_data).join(', ')
                  : 'Empty'}
              />
              <Field label="Lobby ID" value={row.id} mono />
            </div>
          </section>

          <section className="lob-detail-card">
            <header className="lob-detail-card-head">
              <h3><Crown size={15} /> Organizer</h3>
              <button type="button" className="lob-link-btn" onClick={() => onOpenOrganizer(row.creator)}>
                Open in Users
              </button>
            </header>
            <div className="lob-field-grid">
              <Field label="Username" value={row.creator.handle ? `@${row.creator.handle}` : '—'} />
              <Field label="Email" value={row.creator.email || '—'} />
              <Field label="Display name" value={row.creator.name || '—'} />
              <Field label="User ID" value={row.creator.id} mono />
            </div>
            <p className="lob-detail-note">
              <CheckCircle2 size={12} />
              Last lobby created {relativeTime(row.created_at, now)} · {formatDate(row.created_at)}
            </p>
          </section>
        </div>
      </aside>
    </div>
  )
}

export default LobbyDetailPanel

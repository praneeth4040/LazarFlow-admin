import {
  compactNumber, csvCell, downloadCsv, fullDate, lockBodyScroll, relative, shortDate, titleCase,
} from '../overviewUtils'

// ── Constants ──────────────────────────────────────────────────────────────

export const STALE_DAYS = 7
export const STUCK_DAYS = 1
export const ROSTER_SIZE = 4

export const STATUS_META = {
  active: { key: 'active', label: 'Active', tone: 'ok' },
  setup: { key: 'setup', label: 'Setup', tone: 'warn' },
  completed: { key: 'completed', label: 'Completed', tone: 'info' },
}

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', hint: 'Open for registration and scoring.' },
  { value: 'setup', label: 'Setup', hint: 'Still being configured by the organizer.' },
  { value: 'completed', label: 'Completed', hint: 'Closed. Scores are frozen as recorded.' },
]

const GAME_LABELS = {
  freefire: 'Free Fire',
  bgmi: 'BGMI',
  other: 'Other',
}

export const statusMeta = (status) => {
  const key = String(status || 'unknown').toLowerCase()
  return STATUS_META[key] || { key, label: titleCase(key), tone: 'muted' }
}

export const gameKey = (game) => String(game || 'other').toLowerCase()

export const gameLabel = (game) => {
  const key = gameKey(game)
  return GAME_LABELS[key] || titleCase(game)
}

// ── Team + member helpers ──────────────────────────────────────────────────

export const teamMembers = (team) => (Array.isArray(team?.members) ? team.members : [])

export const teamScoreParts = (team) => {
  const points = team?.total_points || {}
  return {
    wins: Number(points.wins) || 0,
    kills: Number(points.kill_points) || 0,
    placement: Number(points.placement_points) || 0,
    matches: Number(points.matches_played) || 0,
  }
}

// `wins` is a count of WWCDs, not a point value. The recorded score is the sum
// of kill points and placement points, which already account for a win.
export const teamTotal = (team) => {
  const parts = teamScoreParts(team)
  return parts.kills + parts.placement
}

export const memberName = (member) => member?.name || member?.playerName || 'Unknown player'
export const memberKills = (member) => Number(member?.kills) || 0
export const memberWins = (member) => Number(member?.wwcd) || 0
export const memberMatches = (member) => Number(member?.matches_played) || 0

// ── Row models ─────────────────────────────────────────────────────────────

const isSetupComplete = (metadata) => (
  metadata?.setup_completed === true || metadata?.setup_completed === 'true'
)

const HEALTH_KEYS = ['stale', 'stuck', 'noTeams', 'rosterGap', 'mismatch', 'anomaly']

export const buildLobbyRows = ({ lobbies = [], teams = [], profiles = [], now = Date.now() }) => {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))

  const teamsByLobby = new Map()
  for (const team of teams) {
    const list = teamsByLobby.get(team.lobby_id)
    if (list) list.push(team)
    else teamsByLobby.set(team.lobby_id, [team])
  }

  return lobbies.map((lobby) => {
    const creator = profileMap.get(lobby.user_id) || null
    const lobbyTeams = teamsByLobby.get(lobby.id) || []
    const teamCount = lobbyTeams.length

    let playerCount = 0
    let rosterTeams = 0
    const totals = { kills: 0, placement: 0, wins: 0 }

    for (const team of lobbyTeams) {
      const members = teamMembers(team)
      playerCount += members.length
      if (members.length > 0) rosterTeams += 1
      const parts = teamScoreParts(team)
      totals.kills += parts.kills
      totals.placement += parts.placement
      totals.wins += parts.wins
    }

    const emptyRosterTeams = teamCount - rosterTeams
    const rosterFill = teamCount ? rosterTeams / teamCount : 0

    let topTeam = null
    for (const team of lobbyTeams) {
      const total = teamTotal(team)
      if (!topTeam || total > topTeam.total) {
        topTeam = { id: team.id, name: team.team_name, total }
      }
    }

    const createdTs = new Date(lobby.created_at || 0).getTime() || 0
    const updatedTs = new Date(lobby.updated_at || lobby.created_at || 0).getTime() || 0
    const ageDays = createdTs ? Math.max(0, (now - createdTs) / 86_400_000) : 0
    const idleDays = updatedTs ? Math.max(0, (now - updatedTs) / 86_400_000) : 0

    const status = statusMeta(lobby.status)
    const setupCompleted = isSetupComplete(lobby.metadata)
    const rawKillPoints = Number(lobby.kill_points)
    const killPoints = Number.isFinite(rawKillPoints) ? rawKillPoints : null
    const standings = Array.isArray(lobby.final_standings) ? lobby.final_standings : []

    const flags = {
      stale: status.key === 'active' && idleDays > STALE_DAYS,
      stuck: status.key === 'setup' && ageDays > STUCK_DAYS,
      noTeams: teamCount === 0,
      rosterGap: emptyRosterTeams > 0,
      mismatch: status.key === 'setup' && setupCompleted,
      badKillPoints: killPoints === null || killPoints < 0 || killPoints > 100,
      emptyStandings: status.key === 'completed' && standings.length === 0,
    }
    flags.anomaly = flags.badKillPoints || flags.emptyStandings

    const creatorLabel = creator?.username
      ? `@${creator.username}`
      : creator?.emails || 'Unknown organizer'

    const search = [
      lobby.name,
      lobby.game,
      gameLabel(lobby.game),
      lobby.id,
      creator?.emails,
      creator?.username,
      creator?.display_name,
      ...lobbyTeams.map((team) => team.team_name),
    ].filter(Boolean).join(' ').toLowerCase()

    return {
      ...lobby,
      status,
      gameKey: gameKey(lobby.game),
      gameLabel: gameLabel(lobby.game),
      creator: {
        id: lobby.user_id,
        email: creator?.emails || '',
        handle: creator?.username || '',
        name: creator?.display_name || '',
        label: creatorLabel,
      },
      lobbyTeams,
      teamCount,
      playerCount,
      rosterTeams,
      emptyRosterTeams,
      rosterFill,
      totals,
      topTeam,
      killPoints,
      setupCompleted,
      standings,
      createdTs,
      updatedTs,
      ageDays,
      idleDays,
      flags,
      health: HEALTH_KEYS.filter((key) => flags[key]),
      search,
    }
  })
}

export const buildTeamRows = ({ teams = [], lobbyRows = [] }) => {
  const lobbyMap = new Map(lobbyRows.map((lobby) => [lobby.id, lobby]))

  return teams.map((team) => {
    const lobby = lobbyMap.get(team.lobby_id) || null
    const members = teamMembers(team)
    const parts = teamScoreParts(team)
    const total = parts.kills + parts.placement
    const slot = Number(team.respective_slotlist_postion) || 0
    const createdTs = new Date(team.created_at || 0).getTime() || 0
    const rosterState = members.length === 0
      ? 'empty'
      : members.length >= ROSTER_SIZE ? 'full' : 'partial'

    return {
      ...team,
      members,
      memberCount: members.length,
      rosterState,
      parts,
      total,
      slot,
      createdTs,
      lobbyName: lobby?.name || 'Unknown lobby',
      lobbyId: team.lobby_id,
      lobbyStatus: lobby?.status || statusMeta('unknown'),
      lobbyCreator: lobby?.creator?.label || '',
      gameKey: lobby?.gameKey || 'other',
      gameLabel: lobby?.gameLabel || 'Unknown',
      search: [
        team.team_name,
        team.id,
        lobby?.name,
        lobby?.creator?.email,
        lobby?.creator?.handle,
        ...members.map(memberName),
      ].filter(Boolean).join(' ').toLowerCase(),
    }
  })
}

export const buildOrganizerRows = ({ lobbyRows = [], profiles = [] }) => {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
  const map = new Map()

  for (const lobby of lobbyRows) {
    const entry = map.get(lobby.user_id) || {
      id: lobby.user_id,
      lobbies: 0,
      active: 0,
      setup: 0,
      completed: 0,
      teams: 0,
      players: 0,
      emptyRosterTeams: 0,
      createdTs: 0,
      lastTs: 0,
      lobbyNames: [],
    }

    entry.lobbies += 1
    if (lobby.status.key === 'active') entry.active += 1
    else if (lobby.status.key === 'setup') entry.setup += 1
    else if (lobby.status.key === 'completed') entry.completed += 1
    entry.teams += lobby.teamCount
    entry.players += lobby.playerCount
    entry.emptyRosterTeams += lobby.emptyRosterTeams
    entry.createdTs = entry.createdTs ? Math.min(entry.createdTs, lobby.createdTs) : lobby.createdTs
    entry.lastTs = Math.max(entry.lastTs, lobby.createdTs)
    entry.lobbyNames.push(lobby.name)

    map.set(lobby.user_id, entry)
  }

  return [...map.values()].map((entry) => {
    const profile = profileMap.get(entry.id) || null
    const label = profile?.username
      ? `@${profile.username}`
      : profile?.emails || 'Unknown organizer'

    return {
      ...entry,
      profile,
      email: profile?.emails || '',
      handle: profile?.username || '',
      name: profile?.display_name || '',
      label,
      avgTeams: entry.lobbies ? entry.teams / entry.lobbies : 0,
      avgPlayers: entry.lobbies ? entry.players / entry.lobbies : 0,
      search: [
        profile?.emails,
        profile?.username,
        profile?.display_name,
        entry.id,
        ...entry.lobbyNames,
      ].filter(Boolean).join(' ').toLowerCase(),
    }
  })
}

// ── Filtering + sorting ────────────────────────────────────────────────────

export const DEFAULT_FILTERS = {
  status: 'all',
  game: 'all',
  teams: 'all',
  roster: 'all',
  created: 'all',
  health: 'all',
  organizer: 'all',
}

export const filterLobbyRows = (rows, { query = '', filters = DEFAULT_FILTERS, now = Date.now() } = {}) => {
  const needle = query.trim().toLowerCase()
  const weekAgo = now - 7 * 86_400_000
  const monthAgo = now - 30 * 86_400_000
  const monthStart = new Date(now)
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  return rows.filter((row) => {
    if (needle && !row.search.includes(needle)) return false
    if (filters.status !== 'all' && row.status.key !== filters.status) return false
    if (filters.game !== 'all' && row.gameKey !== filters.game) return false
    if (filters.teams === 'with' && row.teamCount === 0) return false
    if (filters.teams === 'none' && row.teamCount > 0) return false
    if (filters.roster === 'complete' && (row.teamCount === 0 || row.emptyRosterTeams > 0)) return false
    if (filters.roster === 'gap' && row.emptyRosterTeams === 0) return false
    if (filters.roster === 'empty' && row.teamCount !== 0) return false
    if (filters.created === '7d' && row.createdTs < weekAgo) return false
    if (filters.created === '30d' && row.createdTs < monthAgo) return false
    if (filters.created === 'month' && row.createdTs < monthStart.getTime()) return false
    if (filters.created === 'older' && row.createdTs >= monthAgo) return false
    if (filters.organizer !== 'all' && row.user_id !== filters.organizer) return false
    if (filters.health !== 'all' && !row.health.includes(filters.health)) return false
    return true
  })
}

export const sortLobbyRows = (rows, sort) => {
  const direction = sort.dir === 'asc' ? 1 : -1
  return rows.slice().sort((a, b) => {
    switch (sort.key) {
      case 'name':
        return String(a.name || '').localeCompare(String(b.name || '')) * direction
      case 'organizer':
        return a.creator.label.localeCompare(b.creator.label) * direction
      case 'status':
        return a.status.label.localeCompare(b.status.label) * direction
      case 'teams':
        return (a.teamCount - b.teamCount) * direction
      case 'players':
        return (a.playerCount - b.playerCount) * direction
      case 'roster':
        return (a.rosterFill - b.rosterFill) * direction
      case 'created':
      default:
        return (a.createdTs - b.createdTs) * direction
    }
  })
}

export const DEFAULT_TEAM_FILTERS = { game: 'all', roster: 'all', status: 'all' }

export const filterTeamRows = (rows, { query = '', filters = DEFAULT_TEAM_FILTERS } = {}) => {
  const needle = query.trim().toLowerCase()
  return rows.filter((row) => {
    if (needle && !row.search.includes(needle)) return false
    if (filters.game !== 'all' && row.gameKey !== filters.game) return false
    if (filters.roster !== 'all' && row.rosterState !== filters.roster) return false
    if (filters.status !== 'all' && row.lobbyStatus.key !== filters.status) return false
    return true
  })
}

export const sortTeamRows = (rows, sort) => {
  const direction = sort.dir === 'asc' ? 1 : -1
  return rows.slice().sort((a, b) => {
    switch (sort.key) {
      case 'team':
        return String(a.team_name || '').localeCompare(String(b.team_name || '')) * direction
      case 'lobby':
        return a.lobbyName.localeCompare(b.lobbyName) * direction
      case 'members':
        return (a.memberCount - b.memberCount) * direction
      case 'wins':
        return (a.parts.wins - b.parts.wins) * direction
      case 'kills':
        return (a.parts.kills - b.parts.kills) * direction
      case 'total':
        return (a.total - b.total) * direction
      case 'created':
      default:
        return (a.createdTs - b.createdTs) * direction
    }
  })
}

export const sortOrganizerRows = (rows, sort) => {
  const direction = sort.dir === 'asc' ? 1 : -1
  return rows.slice().sort((a, b) => {
    switch (sort.key) {
      case 'organizer':
        return a.label.localeCompare(b.label) * direction
      case 'teams':
        return (a.teams - b.teams) * direction
      case 'players':
        return (a.players - b.players) * direction
      case 'avg':
        return (a.avgTeams - b.avgTeams) * direction
      case 'last':
        return (a.lastTs - b.lastTs) * direction
      case 'lobbies':
      default:
        return (a.lobbies - b.lobbies) * direction
    }
  })
}

// ── Health ─────────────────────────────────────────────────────────────────

export const HEALTH_BUCKETS = [
  {
    key: 'stale',
    label: 'Active but stale',
    tone: 'warn',
    description: `Active lobbies with no update for ${STALE_DAYS}+ days.`,
    advice: 'Close them or ask the organizer to finish the event.',
  },
  {
    key: 'stuck',
    label: 'Stuck in setup',
    tone: 'warn',
    description: `Setup lobbies created more than ${STUCK_DAYS} day ago.`,
    advice: 'Usually abandoned drafts. Review before cleaning up.',
  },
  {
    key: 'noTeams',
    label: 'No teams',
    tone: 'info',
    description: 'Lobbies with zero registered teams.',
    advice: 'No organizer or player activity has reached these lobbies.',
  },
  {
    key: 'rosterGap',
    label: 'Roster gaps',
    tone: 'warn',
    description: 'Lobbies with at least one team that has no members.',
    advice: 'Scoring works, but the team roster is incomplete.',
  },
  {
    key: 'mismatch',
    label: 'Setup flag mismatch',
    tone: 'info',
    description: 'Status is setup while metadata.setup_completed is true.',
    advice: 'Two sources of truth disagree. Pick the correct status.',
  },
  {
    key: 'anomaly',
    label: 'Data anomalies',
    tone: 'danger',
    description: 'Invalid kill points, or a completed lobby with no standings.',
    advice: 'Inspect the raw values before trusting scores.',
  },
]

export const buildHealthBuckets = (rows) => HEALTH_BUCKETS.map((bucket) => {
  const affected = rows.filter((row) => row.flags[bucket.key])
  return {
    ...bucket,
    count: affected.length,
    rows: affected,
    examples: affected.slice(0, 3),
  }
})

export const attentionCount = (rows) => rows.filter((row) => row.health.length > 0).length

// ── CSV export ─────────────────────────────────────────────────────────────

export const lobbiesToCsv = (rows) => {
  const header = [
    'Lobby ID', 'Name', 'Game', 'Status', 'Organizer email', 'Organizer username',
    'Organizer name', 'Teams', 'Players', 'Roster fill (%)', 'Kill points',
    'Total kills', 'Placement points', 'Wins', 'Top team', 'Top team score',
    'Created', 'Updated', 'Setup completed', 'Promoted', 'Stale', 'Stuck in setup',
  ]

  const lines = rows.map((row) => [
    row.id,
    row.name,
    row.gameLabel,
    row.status.label,
    row.creator.email,
    row.creator.handle,
    row.creator.name,
    row.teamCount,
    row.playerCount,
    Math.round(row.rosterFill * 100),
    row.killPoints ?? '',
    row.totals.kills,
    row.totals.placement,
    row.totals.wins,
    row.topTeam?.name || '',
    row.topTeam?.total ?? '',
    shortDate(row.created_at),
    shortDate(row.updated_at),
    row.setupCompleted ? 'Yes' : 'No',
    row.is_promoted ? 'Yes' : 'No',
    row.flags.stale ? 'Yes' : 'No',
    row.flags.stuck ? 'Yes' : 'No',
  ].map(csvCell).join(','))

  return [header.join(','), ...lines].join('\n')
}

export const teamsToCsv = (rows) => {
  const header = [
    'Team ID', 'Team', 'Lobby', 'Game', 'Lobby status', 'Slot', 'Members',
    'Matches', 'Wins', 'Kill points', 'Placement points', 'Total score', 'Created',
  ]

  const lines = rows.map((row) => [
    row.id,
    row.team_name,
    row.lobbyName,
    row.gameLabel,
    row.lobbyStatus.label,
    row.slot || '',
    row.memberCount,
    row.parts.matches,
    row.parts.wins,
    row.parts.kills,
    row.parts.placement,
    row.total,
    shortDate(row.created_at),
  ].map(csvCell).join(','))

  return [header.join(','), ...lines].join('\n')
}

// ── Formatters ─────────────────────────────────────────────────────────────

export const relativeTime = (iso, now) => (iso ? relative(iso, now) : '—')
export const formatDate = (iso) => shortDate(iso)
export const formatDateTime = (iso) => fullDate(iso)

export const pointsSystem = (lobby) => {
  const list = Array.isArray(lobby?.points_system) ? lobby.points_system : []
  return list
    .slice()
    .sort((a, b) => (Number(a.placement) || 0) - (Number(b.placement) || 0))
    .map((entry) => ({
      placement: Number(entry.placement) || 0,
      points: Number(entry.points) || 0,
    }))
}

export const ordinal = (value) => {
  const n = Number(value) || 0
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffix[(v - 20) % 10] || suffix[v] || suffix[0]}`
}

export const rosterLabel = (row) => {
  if (!row.teamCount) return 'No teams'
  return `${row.rosterTeams}/${row.teamCount} teams`
}

export const statusDetail = (row) => {
  if (row.status.key === 'active') return `${Math.floor(row.idleDays)}d idle`
  if (row.status.key === 'setup') return `${Math.floor(row.ageDays)}d old`
  return `${Math.floor(row.ageDays)}d old`
}

export { compactNumber, downloadCsv, lockBodyScroll }

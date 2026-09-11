import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  Users, Trophy, LayoutDashboard, Bell, Palette,
  LogOut, CheckCircle2, XCircle, Search, ChevronRight,
  Shield, Settings, User as UserIcon, Home, Sliders,
  FileSearch, CornerDownLeft, RefreshCcw,
} from 'lucide-react'

import StatsView from './views/DashboardHome'
import { UserListView, UserDetailView } from './views/UsersView'
import { GlobalTournamentListView, TournamentTeamsView } from './views/TournamentsView'
import NotificationsView from './views/NotificationsView'
import ThemeBuilderView from './theme-builder/ThemeBuilderView'

import './Dashboard.css'

const SUBSCRIPTION_TIERS = ['free', 'ranked', 'competitive', 'premier', 'developer']

const NAV_ITEMS = [
  { key: 'overview',      icon: Home,            label: 'Overview',       shortcut: 'G O' },
  { key: 'users',         icon: Users,           label: 'Users',          shortcut: 'G U' },
  { key: 'tournaments',   icon: Trophy,          label: 'Tournaments',    shortcut: 'G T' },
  { key: 'notifications', icon: Bell,            label: 'Notifications',  shortcut: 'G N' },
  { key: 'themes',        icon: Palette,         label: 'Themes',         shortcut: 'G M' },
]

const CommandPalette = ({ open, onClose, onNavigate, onRefresh }) => {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)

  const commands = useMemo(() => {
    const nav = NAV_ITEMS.map(item => ({
      id: `nav-${item.key}`,
      type: 'nav',
      label: `Go to ${item.label}`,
      sub: `Navigate to the ${item.label} section`,
      icon: item.icon,
      shortcut: item.shortcut,
      action: () => onNavigate(item.key),
    }))
    const actions = [
      {
        id: 'refresh', type: 'action',
        label: 'Refresh Dashboard',
        sub: 'Reload users, tournaments and statistics',
        icon: RefreshCcw, shortcut: 'R',
        action: () => onRefresh(),
      },
    ]
    return [...nav, ...actions]
  }, [onNavigate, onRefresh])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.sub.toLowerCase().includes(q)
    )
  }, [query, commands])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => { setSelectedIdx(0) }, [query])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIdx]) {
      e.preventDefault()
      filtered[selectedIdx].action()
      onClose()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div className="cmd-palette-dialog" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="cmd-palette-input-row">
          <Search size={18} className="cmd-palette-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search…"
            className="cmd-palette-input"
          />
          <kbd className="kbd kbd-sm">ESC</kbd>
        </div>
        <div className="cmd-palette-list">
          {filtered.length === 0 ? (
            <div className="cmd-palette-empty">No commands found</div>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon
              return (
                <button
                  key={cmd.id}
                  className={`cmd-palette-item ${idx === selectedIdx ? 'selected' : ''}`}
                  onClick={() => { cmd.action(); onClose() }}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <span className={`cmd-item-icon cmd-item-${cmd.type}`}><Icon size={16} /></span>
                  <span className="cmd-item-text">
                    <span className="cmd-item-label">{cmd.label}</span>
                    <span className="cmd-item-sub">{cmd.sub}</span>
                  </span>
                  {cmd.shortcut && (
                    <span className="cmd-item-shortcut">
                      {cmd.shortcut.split(' ').map((s, i) => (
                        <kbd key={i} className="kbd kbd-xs">{s}</kbd>
                      ))}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
        <div className="cmd-palette-footer">
          <span><kbd className="kbd kbd-xs">↑</kbd><kbd className="kbd kbd-xs">↓</kbd> Navigate</span>
          <span><kbd className="kbd kbd-xs">↵</kbd> Run</span>
          <span><kbd className="kbd kbd-xs">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  )
}

const Dashboard = ({ user, onLogout }) => {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [filteredUsers, setFilteredUsers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [updating, setUpdating] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [userTournaments, setUserTournaments] = useState([])
  const [loadingTournaments, setLoadingTournaments] = useState(false)
  const [selectedTournament, setSelectedTournament] = useState(null)
  const [tournamentTeams, setTournamentTeams] = useState([])
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [activityLogs, setActivityLogs] = useState([])
  const [allTournaments, setAllTournaments] = useState([])
  const [loadingAllTournaments, setLoadingAllTournaments] = useState(false)
  const [stats, setStats] = useState({ totalUsers: 0, totalTournaments: 0, activeTournaments: 0, tierDistribution: {} })
  const [loadingStats, setLoadingStats] = useState(false)

  const [profileOpen, setProfileOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const profileRef = useRef(null)

  const addLog = (type, message, details = null) => {
    setActivityLogs(prev => [{
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type, message, details,
    }, ...prev].slice(0, 50))
  }

  const refreshAll = () => {
    fetchUsers()
    fetchStats()
    fetchAllTournaments()
    fetchProfile()
    setSuccess('Dashboard refreshed')
    setTimeout(() => setSuccess(''), 2000)
  }

  useEffect(() => {
    fetchProfile()
    fetchUsers()
    fetchStats()
    fetchAllTournaments()
  }, [user])

  useEffect(() => { filterUsers() }, [searchQuery, users])

  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen(o => !o)
      }
      if (meta && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        const wait = setTimeout(() => {}, 0)
        let next = null
        const sub = (ev) => {
          const k = ev.key.toLowerCase()
          if (k === 'o') next = 'overview'
          else if (k === 'u') next = 'users'
          else if (k === 't') next = 'tournaments'
          else if (k === 'n') next = 'notifications'
          else if (k === 'm') next = 'themes'
          if (next) { setActiveTab(next); setSelectedUser(null); setSelectedTournament(null) }
          window.removeEventListener('keydown', sub)
          clearTimeout(wait)
        }
        window.addEventListener('keydown', sub, { once: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!error) setProfile(data)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setUsers(data || [])
      setFilteredUsers(data || [])
    } catch (err) {
      setError('Failed to load users: ' + err.message)
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchStats = async () => {
    setLoadingStats(true)
    try {
      const { count: usersCount, error: usersErr } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
      if (usersErr) console.warn('[stats] users count failed:', usersErr.message)

      const { count: lobbiesCount, error: lobErr } = await supabase.from('lobbies').select('*', { count: 'exact', head: true })
      if (lobErr) console.warn('[stats] lobbies count failed:', lobErr.message)

      const { count: activeLobbiesCount, error: actErr } = await supabase.from('lobbies').select('*', { count: 'exact', head: true }).eq('status', 'active')
      if (actErr) console.warn('[stats] active lobbies count failed:', actErr.message)

      // Try subscription_tier; fall back to free-only distribution if column missing
      let tierDistribution = { free: usersCount || 0 }
      try {
        const { data: profiles, error: tierErr } = await supabase.from('profiles').select('id, subscription_tier')
        if (!tierErr && Array.isArray(profiles)) {
          tierDistribution = profiles.reduce((acc, p) => {
            const tier = p.subscription_tier || 'free'
            acc[tier] = (acc[tier] || 0) + 1
            return acc
          }, {})
        }
        // Silently ignore column-not-found (400) errors — tierDistribution stays as fallback
      } catch (_subErr) {
        // swallow — tierDistribution already holds fallback
      }

      setStats({
        totalUsers: usersCount || 0,
        totalTournaments: lobbiesCount || 0,
        activeTournaments: activeLobbiesCount || 0,
        tierDistribution,
      })
    } catch (err) {
      console.error('[stats] top-level error:', err.message)
      setError('Failed to load dashboard statistics')
    } finally {
      setLoadingStats(false)
    }
  }

  const fetchAllTournaments = async () => {
    setLoadingAllTournaments(true)
    try {
      const { data: lobbies, error: lobbiesError } = await supabase.from('lobbies').select('*').order('created_at', { ascending: false })
      if (lobbiesError) throw lobbiesError
      if (!lobbies || lobbies.length === 0) { setAllTournaments([]); return }

      const userIds = [...new Set(lobbies.map(l => l.user_id).filter(Boolean))]
      const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', userIds)
      const profileMap = (profiles || []).reduce((acc, p) => { acc[p.id] = p; return acc }, {})

      const lobbiesWithDetails = await Promise.all(
        lobbies.map(async (lobby) => {
          const { count: teamCount } = await supabase
            .from('lobby_teams').select('*', { count: 'exact', head: true }).eq('lobby_id', lobby.id)
          return { ...lobby, teams_count: teamCount || 0, profiles: profileMap[lobby.user_id] || null }
        })
      )
      setAllTournaments(lobbiesWithDetails)
    } catch (err) {
      setError('Failed to load global lobbies')
    } finally {
      setLoadingAllTournaments(false)
    }
  }

  const filterUsers = () => {
    if (!searchQuery.trim()) { setFilteredUsers(users); return }
    const q = searchQuery.toLowerCase()
    setFilteredUsers(users.filter(u =>
      u.emails?.toLowerCase().includes(q) ||
      u.display_name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q)
    ))
  }

  const updateSubscriptionTier = async (userId, newTier) => {
    setUpdating(userId); setError(''); setSuccess('')
    try {
      const { error } = await supabase.from('profiles').update({ subscription_tier: newTier }).eq('id', userId)
      if (error) { setError(`Failed to update subscription: ${error.message}`) }
      else {
        setSuccess('Subscription tier updated successfully')
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, subscription_tier: newTier } : u))
        fetchStats()
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setUpdating(null)
    }
  }

  const fetchUserTournaments = async (userId) => {
    setLoadingTournaments(true); setError('')
    try {
      const { data: lobbies, error: lobbiesError } = await supabase
        .from('lobbies').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      if (lobbiesError) { setError('Failed to load user lobbies'); setLoadingTournaments(false); return }
      const lobbiesWithTeams = await Promise.all((lobbies || []).map(async (lobby) => {
        const { count: teamCount } = await supabase
          .from('lobby_teams').select('*', { count: 'exact', head: true }).eq('lobby_id', lobby.id)
        return { ...lobby, teams_count: teamCount || 0 }
      }))
      setUserTournaments(lobbiesWithTeams)
    } catch (err) {
      setError('Failed to load user lobbies')
    } finally {
      setLoadingTournaments(false)
    }
  }

  const fetchTournamentTeams = async (tournamentId) => {
    setLoadingTeams(true); setError('')
    try {
      const { data: teams, error: teamsError } = await supabase
        .from('lobby_teams').select('*').eq('lobby_id', tournamentId).order('created_at', { ascending: false })
      if (teamsError) { setError('Failed to load lobby teams'); setLoadingTeams(false); return }
      setTournamentTeams(teams || [])
      return teams || []
    } catch (err) {
      setError('Failed to load lobby teams')
    } finally {
      setLoadingTeams(false)
    }
  }

  const handleNavigate = (key) => {
    setActiveTab(key)
    setSelectedUser(null)
    setSelectedTournament(null)
  }

  const handleViewUserDetails = async (u) => { setSelectedUser(u); await fetchUserTournaments(u.id) }
  const handleViewTournamentTeams = async (t) => { setSelectedTournament(t); await fetchTournamentTeams(t.id) }
  const handleBackToUsers = () => { setSelectedUser(null); setUserTournaments([]) }
  const handleBackToTournaments = () => { setSelectedTournament(null); setTournamentTeams([]) }
  const handleLogout = async () => { await supabase.auth.signOut(); onLogout() }

  const currentNav = NAV_ITEMS.find(n => n.key === activeTab)

  const breadcrumbs = useMemo(() => {
    const crumbs = [{ label: 'Admin', onClick: () => handleNavigate('overview') }]
    if (currentNav) crumbs.push({ label: currentNav.label, key: currentNav.key })
    if (selectedUser) {
      if (currentNav?.key !== 'users') crumbs.splice(1, 1, { label: 'Users', key: 'users' })
      crumbs.push({
        label: selectedUser.display_name || selectedUser.username || selectedUser.emails || 'User',
        key: 'user-detail',
      })
    }
    if (selectedTournament) {
      if (crumbs[crumbs.length - 1].key !== 'tournaments') {
        const hasTourneys = crumbs.some(c => c.key === 'tournaments')
        if (!hasTourneys) crumbs.splice(1, 0, { label: 'Tournaments', key: 'tournaments' })
      }
      crumbs.push({ label: selectedTournament.name || 'Lobby', key: 'tournament-detail' })
    }
    return crumbs
  }, [currentNav, selectedUser, selectedTournament])

  const initials = (profile?.display_name || profile?.username || user.email || 'A')
    .split(/\s|@/)[0]
    .slice(0, 2)
    .toUpperCase()

  const pendingThemesCount = null

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="dashboard-shell">
      {/* ── Left Icon Rail ── */}
      <aside className="icon-rail" aria-label="Primary navigation">
        <div className="rail-brand" title="LazarFlow Admin">
          <div className="rail-brand-mark">
            <LayoutDashboard size={18} />
          </div>
        </div>
        <nav className="rail-nav">
          {NAV_ITEMS.map(({ key, icon: Icon, label, shortcut }) => {
            const isActive = activeTab === key && !selectedUser && !selectedTournament
            const badge =
              key === 'notifications' ? 3 :
              key === 'themes' ? pendingThemesCount :
              key === 'users' ? (stats.totalUsers > 999 ? '999+' : stats.totalUsers || null) :
              null
            return (
              <button
                key={key}
                onClick={() => handleNavigate(key)}
                className={`rail-item ${isActive ? 'active' : ''}`}
                title={`${label}${shortcut ? `  (${shortcut})` : ''}`}
                aria-label={label}
              >
                <div className="rail-item-icon">
                  <Icon size={20} strokeWidth={2} />
                  {badge !== null && <span className="rail-badge">{badge}</span>}
                </div>
                <span className="rail-item-tooltip">{label}</span>
              </button>
            )
          })}
        </nav>
        <div className="rail-footer">
          <button
            onClick={handleLogout}
            className="rail-item"
            title="Sign out"
            aria-label="Sign out"
          >
            <div className="rail-item-icon">
              <LogOut size={20} strokeWidth={2} />
            </div>
            <span className="rail-item-tooltip">Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Workspace ── */}
      <div className="workspace">
        {/* ── Top Navigation Bar ── */}
        <header className="top-bar">
          <div className="top-bar-left">
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, idx) => {
                const last = idx === breadcrumbs.length - 1
                return (
                  <span key={`${crumb.label}-${idx}`} className="crumb-wrap">
                    <button
                      type="button"
                      className={`crumb ${last ? 'crumb-current' : ''}`}
                      onClick={!last && crumb.onClick ? crumb.onClick : undefined}
                      disabled={last}
                    >
                      {idx === 0 && <Sliders size={14} className="crumb-icon" />}
                      {crumb.label}
                    </button>
                    {!last && <ChevronRight size={14} className="crumb-sep" />}
                  </span>
                )
              })}
            </nav>
          </div>
          <div className="top-bar-right">
            <button
              type="button"
              className="search-chip"
              onClick={() => setCmdOpen(true)}
            >
              <Search size={16} className="search-chip-icon" />
              <span className="search-chip-label">Search or command…</span>
              <span className="search-chip-kbds">
                <kbd className="kbd kbd-xs">⌘</kbd>
                <kbd className="kbd kbd-xs">K</kbd>
              </span>
            </button>
            <button
              type="button"
              onClick={refreshAll}
              className="icon-button"
              title="Refresh"
              aria-label="Refresh dashboard"
            >
              <RefreshCcw size={18} />
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('notifications')}
              className="icon-button notif-button"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span className="notif-dot" aria-hidden="true"></span>
            </button>
            <div className="profile-menu-wrap" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen(o => !o)}
                className="profile-trigger"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                <span className="avatar avatar-sm" aria-hidden="true">{initials}</span>
              </button>
              {profileOpen && (
                <div className="profile-menu" role="menu">
                  <div className="profile-menu-header">
                    <span className="avatar avatar-md" aria-hidden="true">{initials}</span>
                    <div className="profile-menu-info">
                      <div className="profile-menu-name">
                        {profile?.display_name || profile?.username || user.email}
                      </div>
                      <div className="profile-menu-email">{profile?.emails || user.email}</div>
                      {profile?.is_admin && (
                        <div className="profile-menu-admin">
                          <Shield size={11} /> Admin
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="profile-menu-divider" />
                  <button className="profile-menu-item" role="menuitem">
                    <UserIcon size={16} /> My Profile
                  </button>
                  <button className="profile-menu-item" role="menuitem">
                    <Settings size={16} /> Settings
                  </button>
                  <div className="profile-menu-divider" />
                  <button className="profile-menu-item profile-menu-danger" onClick={handleLogout} role="menuitem">
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Content Area ── */}
        <main className="content-area">
          {error && <div className="alert alert-error"><XCircle size={16} /> {error}</div>}
          {success && <div className="alert alert-success"><CheckCircle2 size={16} /> {success}</div>}

          {/* View Routing */}
          {selectedTournament ? (
            <TournamentTeamsView
              tournament={selectedTournament} teams={tournamentTeams}
              loadingTeams={loadingTeams} onBack={handleBackToTournaments}
            />
          ) : selectedUser ? (
            <UserDetailView
              user={selectedUser} tournaments={userTournaments}
              loadingTournaments={loadingTournaments}
              onBack={handleBackToUsers} onViewTeams={handleViewTournamentTeams}
            />
          ) : activeTab === 'overview' ? (
            <StatsView stats={stats} loading={loadingStats} />
          ) : activeTab === 'tournaments' ? (
            <GlobalTournamentListView
              tournaments={allTournaments} loading={loadingAllTournaments}
              onViewTeams={handleViewTournamentTeams}
            />
          ) : activeTab === 'notifications' ? (
            <NotificationsView />
          ) : activeTab === 'themes' ? (
            <ThemeBuilderView addLog={addLog} />
          ) : (
            <UserListView
              users={users} filteredUsers={filteredUsers}
              searchQuery={searchQuery} setSearchQuery={setSearchQuery}
              updating={updating} SUBSCRIPTION_TIERS={SUBSCRIPTION_TIERS}
              updateSubscriptionTier={updateSubscriptionTier}
              onViewUserDetails={handleViewUserDetails}
              loading={loadingUsers}
            />
          )}
        </main>
      </div>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={handleNavigate}
        onRefresh={refreshAll}
      />
    </div>
  )
}

export default Dashboard

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Users, Trophy, LayoutDashboard, Bell, Palette,
  LogOut, CheckCircle2, XCircle, RefreshCcw, Eye,
} from 'lucide-react'

// Views
import StatsView from './views/DashboardHome'
import { UserListView, UserDetailView } from './views/UsersView'
import { GlobalTournamentListView, TournamentTeamsView } from './views/TournamentsView'
import NotificationsView from './views/NotificationsView'
import ThemeBuilderView from './theme-builder/ThemeBuilderView'

// Assets
import logoImg from '../assets/logo.jpeg'

// Styles
import './Dashboard.css'

const SUBSCRIPTION_TIERS = ['free', 'ranked', 'competitive', 'premier', 'developer']

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

  const addLog = (type, message, details = null) => {
    setActivityLogs(prev => [{
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type, message, details,
    }, ...prev].slice(0, 50))
  }

  useEffect(() => {
    fetchProfile()
    fetchUsers()
    fetchStats()
    fetchAllTournaments()
  }, [user])

  useEffect(() => { filterUsers() }, [searchQuery, users])

  // ── Data Fetchers ─────────────────────────────────────────────────────────

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
      const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
      const { count: lobbiesCount } = await supabase.from('lobbies').select('*', { count: 'exact', head: true })
      const { count: activeLobbiesCount } = await supabase.from('lobbies').select('*', { count: 'exact', head: true }).eq('status', 'active')
      const { data: profiles } = await supabase.from('profiles').select('subscription_tier')
      const tierDistribution = (profiles || []).reduce((acc, p) => {
        const tier = p.subscription_tier || 'free'
        acc[tier] = (acc[tier] || 0) + 1
        return acc
      }, {})
      setStats({ totalUsers: usersCount || 0, totalTournaments: lobbiesCount || 0, activeTournaments: activeLobbiesCount || 0, tierDistribution })
    } catch (err) {
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
      const { data: profiles } = await supabase.from('profiles').select('id, username, emails').in('id', userIds)
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

  const handleViewUserDetails = async (u) => { setSelectedUser(u); await fetchUserTournaments(u.id) }
  const handleViewTournamentTeams = async (t) => { setSelectedTournament(t); await fetchTournamentTeams(t.id) }
  const handleBackToUsers = () => { setSelectedUser(null); setUserTournaments([]) }
  const handleBackToTournaments = () => { setSelectedTournament(null); setTournamentTeams([]) }
  const handleLogout = async () => { await supabase.auth.signOut(); onLogout() }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="logo-section">
            <img src={logoImg} alt="LazarFlow" className="header-logo" />
            <h1>LazarFlow Admin</h1>
          </div>
          <div className="header-actions">
            <span className="welcome-text">{profile?.display_name || user.email}</span>
            <button onClick={handleLogout} className="logout-button">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        {error && <div className="alert alert-error"><XCircle size={16} /> {error}</div>}
        {success && <div className="alert alert-success"><CheckCircle2 size={16} /> {success}</div>}

        {/* Tab Navigation */}
        {!selectedTournament && !selectedUser && (
          <div className="tab-navigation">
            {[
              { key: 'overview',      icon: <LayoutDashboard size={16} />, label: 'Overview' },
              { key: 'users',         icon: <Users size={16} />,          label: 'Users' },
              { key: 'tournaments',   icon: <Trophy size={16} />,         label: 'Tournaments' },
              { key: 'notifications', icon: <Bell size={16} />,           label: 'Notifications' },
              { key: 'themes',        icon: <Palette size={16} />,        label: 'Themes' },
            ].map(({ key, icon, label }) => (
              <button
                key={key}
                className={`tab-button ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        )}

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
  )
}

export default Dashboard
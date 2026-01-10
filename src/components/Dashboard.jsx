import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './Dashboard.css'

const TournamentTeamsView = ({ tournament, teams, loadingTeams, onBack }) => (
  <div className="tournament-teams-view">
    <div className="teams-header">
      <button className="back-button" onClick={onBack}>
        ← Back to Tournaments
      </button>
      <h2>Teams in "{tournament.name}"</h2>
    </div>

    <div className="tournament-info-card">
      <div className="tournament-info-row">
        <span className="info-label">Tournament:</span>
        <span className="info-value">{tournament.name}</span>
      </div>
      <div className="tournament-info-row">
        <span className="info-label">Game:</span>
        <span className="info-value">{tournament.game}</span>
      </div>
      <div className="tournament-info-row">
        <span className="info-label">Status:</span>
        <span className={`info-value status-${tournament.status}`}>
          {tournament.status}
        </span>
      </div>
      <div className="tournament-info-row">
        <span className="info-label">Created:</span>
        <span className="info-value">
          {new Date(tournament.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>

    <div className="teams-section">
      <div className="section-header">
        <h3>Registered Teams ({teams.length})</h3>
      </div>

      {loadingTeams ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading teams...</p>
        </div>
      ) : teams.length === 0 ? (
        <div className="empty-state">
          <p>No teams have registered for this tournament yet.</p>
        </div>
      ) : (
        <div className="teams-list">
          {teams.map(team => (
            <div key={team.id} className="team-card">
              <div className="team-header">
                <h4>{team.team_name}</h4>
                <span className="team-id">ID: {team.id.substring(0, 8)}...</span>
              </div>
              <div className="team-details">
                <div className="detail-item">
                  <span className="detail-label">Members:</span>
                  <span className="detail-value">
                    {Array.isArray(team.members) ? team.members.length : 0} players
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Wins:</span>
                  <span className="detail-value">
                    {team.total_points?.wins || 0}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Kill Points:</span>
                  <span className="detail-value">
                    {team.total_points?.kill_points || 0}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Placement Points:</span>
                  <span className="detail-value">
                    {team.total_points?.placement_points || 0}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Total Points:</span>
                  <span className="detail-value">
                    {(team.total_points?.wins || 0) + 
                     (team.total_points?.kill_points || 0) + 
                     (team.total_points?.placement_points || 0)}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Registered:</span>
                  <span className="detail-value">
                    {new Date(team.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              {Array.isArray(team.members) && team.members.length > 0 && (
                <div className="members-section">
                  <h5>Team Members:</h5>
                  <ul className="members-list">
                    {team.members.map((member, index) => (
                      <li key={index} className="member-item">
                        <span className="member-name">{member.name || member.playerName || 'Unknown Player'}</span>
                        <span className="member-id">{member.id || member.playerId || ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

const UserListView = ({ 
  users, 
  filteredUsers, 
  searchQuery, 
  setSearchQuery, 
  updating, 
  SUBSCRIPTION_TIERS, 
  updateSubscriptionTier,
  onViewUserDetails
}) => (
  <div className="user-management">
    <div className="user-management-header">
      <h2>User Management</h2>
      <div className="user-stats">
        <span className="stat-badge">
          Total Users: <strong>{users.length}</strong>
        </span>
        <span className="stat-badge">
          Showing: <strong>{filteredUsers.length}</strong>
        </span>
      </div>
    </div>

    {/* Search Bar */}
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search by email or username..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="search-input"
      />
      {searchQuery && (
        <button 
          className="clear-search"
          onClick={() => setSearchQuery('')}
        >
          ✕
        </button>
      )}
    </div>

    {/* Users Table */}
    <div className="users-table-container">
      {filteredUsers.length === 0 ? (
        <div className="empty-state">
          <p>{searchQuery ? 'No users found matching your search' : 'No users available'}</p>
        </div>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Username</th>
              <th>Full Name</th>
              <th>Subscription Tier</th>
              <th>Admin</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id}>
                <td className="email-cell" onClick={() => onViewUserDetails(u)} style={{cursor: 'pointer', textDecoration: 'underline'}}>
                  {u.emails || u.email || 'N/A'}
                </td>
                <td>{u.username || 'N/A'}</td>
                <td>{u.full_name || 'N/A'}</td>
                <td>
                  <span className={`tier-badge tier-${u.subscription_tier || 'free'}`}>
                    {u.subscription_tier || 'free'}
                  </span>
                </td>
                <td>
                  <span className={`admin-badge ${u.is_admin ? 'admin-yes' : 'admin-no'}`}>
                    {u.is_admin ? 'Yes' : 'No'}
                  </span>
                </td>
                <td>
                  <select
                    className="tier-select"
                    value={u.subscription_tier || 'free'}
                    onChange={(e) => updateSubscriptionTier(u.id, e.target.value)}
                    disabled={updating === u.id}
                  >
                    {SUBSCRIPTION_TIERS.map(tier => (
                      <option key={tier} value={tier}>
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </div>
);

const UserDetailView = ({ user, tournaments, loadingTournaments, onBack, onViewTeams }) => (
  <div className="user-detail-view">
    <div className="user-detail-header">
      <button className="back-button" onClick={onBack}>
        ← Back to Users
      </button>
      <h2>User Details: {user.username || user.emails || user.email}</h2>
    </div>

    <div className="user-info-card">
      <div className="user-info-row">
        <span className="info-label">Email:</span>
        <span className="info-value">{user.emails || user.email || 'N/A'}</span>
      </div>
      <div className="user-info-row">
        <span className="info-label">Username:</span>
        <span className="info-value">{user.username || 'N/A'}</span>
      </div>
      <div className="user-info-row">
        <span className="info-label">Full Name:</span>
        <span className="info-value">{user.full_name || 'N/A'}</span>
      </div>
      <div className="user-info-row">
        <span className="info-label">Subscription Tier:</span>
        <span className={`info-value tier-badge tier-${user.subscription_tier || 'free'}`}>
          {user.subscription_tier || 'free'}
        </span>
      </div>
      <div className="user-info-row">
        <span className="info-label">Admin:</span>
        <span className={`info-value admin-badge ${user.is_admin ? 'admin-yes' : 'admin-no'}`}>
          {user.is_admin ? 'Yes' : 'No'}
        </span>
      </div>
      <div className="user-info-row">
        <span className="info-label">Tournaments Created:</span>
        <span className="info-value">{user.tournaments_created_count || 0}</span>
      </div>
    </div>

    <div className="tournaments-section">
      <div className="section-header">
        <h3>Tournaments Created</h3>
        <button className="refresh-button" onClick={() => onViewTeams(user.id)}>
          Refresh
        </button>
      </div>

      {loadingTournaments ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading tournaments...</p>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="empty-state">
          <p>This user hasn't created any tournaments yet.</p>
        </div>
      ) : (
        <div className="tournaments-grid">
          {tournaments.map(tournament => (
            <div key={tournament.id} className="tournament-card">
              <h4>{tournament.name}</h4>
              <div className="tournament-details">
                <div className="detail-item">
                  <span className="detail-label">Game:</span>
                  <span className="detail-value">{tournament.game}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Status:</span>
                  <span className={`detail-value status-${tournament.status}`}>
                    {tournament.status}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Teams:</span>
                  <span className="detail-value">{tournament.teams_count}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Created:</span>
                  <span className="detail-value">
                    {new Date(tournament.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Public:</span>
                  <span className="detail-value">
                    {tournament.is_public ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
              <button className="view-teams-button" onClick={() => onViewTeams(tournament)}>
                View Teams ({tournament.teams_count})
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

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

  const SUBSCRIPTION_TIERS = ['free', 'ranked', 'competitive', 'premier', 'developer']

  useEffect(() => {
    fetchProfile()
    fetchUsers()
  }, [user])

  useEffect(() => {
    console.log('Users updated:', users);
    filterUsers()
  }, [searchQuery, users])

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Error fetching profile:', error)
      } else {
        setProfile(data)
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching users:', error)
        setError('Failed to load users: ' + error.message)
        return
      }

      setUsers(data || [])
      setFilteredUsers(data || [])
    } catch (err) {
      console.error('Error:', err)
      setError('Failed to load users: ' + err.message)
    }
  }

  const filterUsers = () => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = users.filter(u => 
      u.emails?.toLowerCase().includes(query) ||
      u.email?.toLowerCase().includes(query) ||
      u.full_name?.toLowerCase().includes(query) ||
      u.username?.toLowerCase().includes(query)
    )
    setFilteredUsers(filtered)
  }

  const updateSubscriptionTier = async (userId, newTier) => {
    setUpdating(userId)
    setError('')
    setSuccess('')

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ subscription_tier: newTier })
        .eq('id', userId)

      if (error) {
        console.error('Error updating subscription:', error)
        setError(`Failed to update subscription: ${error.message}`)
      } else {
        setSuccess('Subscription tier updated successfully')
        // Update local state
        setUsers(prev => prev.map(u => 
          u.id === userId ? { ...u, subscription_tier: newTier } : u
        ))
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err) {
      console.error('Error:', err)
      setError('An unexpected error occurred')
    } finally {
      setUpdating(null)
    }
  }

  const fetchUserTournaments = async (userId) => {
    setLoadingTournaments(true)
    setError('')
    
    try {
      // Fetch tournaments created by this user
      const { data: tournaments, error: tournamentsError } = await supabase
        .from('tournaments')
        .select(`
          id,
          name,
          game,
          status,
          created_at,
          is_public
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (tournamentsError) {
        console.error('Error fetching tournaments:', tournamentsError)
        setError('Failed to load user tournaments')
        setLoadingTournaments(false)
        return
      }

      // For each tournament, get the team count
      const tournamentsWithTeams = await Promise.all(
        tournaments.map(async (tournament) => {
          const { count: teamCount, error: teamsError } = await supabase
            .from('tournament_teams')
            .select('*', { count: 'exact', head: true })
            .eq('tournament_id', tournament.id)
          
          return {
            ...tournament,
            teams_count: teamCount || 0
          }
        })
      )

      setUserTournaments(tournamentsWithTeams)
    } catch (err) {
      console.error('Error:', err)
      setError('Failed to load user tournaments')
    } finally {
      setLoadingTournaments(false)
    }
  }

  const fetchTournamentTeams = async (tournamentId) => {
    setLoadingTeams(true)
    setError('')
    
    try {
      const { data: teams, error: teamsError } = await supabase
        .from('tournament_teams')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: false })

      if (teamsError) {
        console.error('Error fetching teams:', teamsError)
        setError('Failed to load tournament teams')
        setLoadingTeams(false)
        return
      }

      setTournamentTeams(teams || [])
      return teams || []
    } catch (err) {
      console.error('Error:', err)
      setError('Failed to load tournament teams')
    } finally {
      setLoadingTeams(false)
    }
  }

  const handleViewUserDetails = async (user) => {
    setSelectedUser(user)
    await fetchUserTournaments(user.id)
  }

  const handleViewTournamentTeams = async (tournament) => {
    setSelectedTournament(tournament)
    await fetchTournamentTeams(tournament.id)
  }

  const handleBackToUsers = () => {
    setSelectedUser(null)
    setUserTournaments([])
  }

  const handleBackToTournaments = () => {
    setSelectedTournament(null)
    setTournamentTeams([])
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    onLogout()
  }

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
          <h1>LazarFlow Admin Dashboard</h1>
          <div className="header-actions">
            <span className="welcome-text">
              Welcome, {profile?.full_name || user.email}
            </span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        {/* Status Messages */}
        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success">
            {success}
          </div>
        )}

        {selectedTournament ? (
          <TournamentTeamsView 
            tournament={selectedTournament} 
            teams={tournamentTeams} 
            loadingTeams={loadingTeams}
            onBack={handleBackToTournaments}
          />
        ) : selectedUser ? (
          <UserDetailView 
            user={selectedUser} 
            tournaments={userTournaments} 
            loadingTournaments={loadingTournaments}
            onBack={handleBackToUsers}
            onViewTeams={handleViewTournamentTeams}
          />
        ) : (
          <UserListView 
            users={users}
            filteredUsers={filteredUsers}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            updating={updating}
            SUBSCRIPTION_TIERS={SUBSCRIPTION_TIERS}
            updateSubscriptionTier={updateSubscriptionTier}
            onViewUserDetails={handleViewUserDetails}
          />
        )}
      </main>
    </div>
  )
}

export default Dashboard
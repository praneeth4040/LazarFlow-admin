import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { 
  Users, 
  Trophy, 
  Gamepad2, 
  Search, 
  LogOut, 
  ChevronLeft, 
  RefreshCcw, 
  CheckCircle2, 
  XCircle,
  LayoutDashboard,
  Eye,
  Info,
  User,
  Mail,
  Calendar,
  Globe,
  Shield,
  Target,
  Hash,
  Bell,
  Send,
  Palette,
  Image as ImageIcon,
  Save,
  Play,
  Square,
  Circle,
  MousePointer2,
  FileJson,
  LayoutGrid,
  PlusSquare,
  MinusSquare,
  Braces,
  List
} from 'lucide-react'
import './Dashboard.css'

const JsonTreeNode = ({ label, value, depth = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(depth < 1)
  const isObject = value !== null && typeof value === 'object'
  const isArray = Array.isArray(value)

  const toggleExpand = (e) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  if (!isObject) {
    return (
      <div className="json-tree-node leaf">
        <span className="json-key">{label}:</span>
        <span className={`json-value ${typeof value}`}>
          {typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </div>
    )
  }

  return (
    <div className="json-tree-node branch">
      <div className="json-node-header" onClick={toggleExpand}>
        <span className="expand-icon">
          {isExpanded ? <MinusSquare size={14} /> : <PlusSquare size={14} />}
        </span>
        <span className="node-icon">
          {isArray ? <List size={14} /> : <Braces size={14} />}
        </span>
        <span className="json-key">{label}</span>
        <span className="node-summary">
          {isArray ? `[${value.length}]` : '{...}'}
        </span>
      </div>
      {isExpanded && (
        <div className="json-node-children">
          {Object.entries(value).map(([key, val]) => (
            <JsonTreeNode key={key} label={key} value={val} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

const StatsView = ({ stats, loading }) => (
  <div className="stats-overview">
    <div className="stats-header">
      <h2><LayoutDashboard size={20} /> System Overview</h2>
    </div>
    
    {loading ? (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Calculating statistics...</p>
      </div>
    ) : (
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon users-icon"><Users size={24} /></div>
          <div className="stat-info">
            <span className="stat-label">Total Users</span>
            <span className="stat-value">{stats.totalUsers}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon tournaments-icon"><Trophy size={24} /></div>
          <div className="stat-info">
            <span className="stat-label">Total Lobbies</span>
            <span className="stat-value">{stats.totalTournaments}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon active-icon"><Gamepad2 size={24} /></div>
          <div className="stat-info">
            <span className="stat-label">Active Lobbies</span>
            <span className="stat-value">{stats.activeTournaments}</span>
          </div>
        </div>
      </div>
    )}

    {!loading && (
      <div className="stats-details-grid">
        <div className="stats-section-card">
          <h3><Info size={18} /> User Tier Distribution</h3>
          <div className="tier-distribution">
            {Object.entries(stats.tierDistribution).map(([tier, count]) => (
              <div key={tier} className="tier-stat-row">
                <span className={`tier-badge tier-${tier}`}>{tier}</span>
                <div className="tier-progress-bar">
                  <div 
                    className={`tier-progress-fill tier-fill-${tier}`}
                    style={{ width: `${(count / stats.totalUsers) * 100}%` }}
                  ></div>
                </div>
                <span className="tier-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
  </div>
);

const GlobalTournamentListView = ({ tournaments, loading, onViewTeams }) => (
  <div className="global-tournaments">
    <div className="section-header">
      <h2><Trophy size={20} /> Global Lobbies ({tournaments.length})</h2>
    </div>

    {loading ? (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading all lobbies...</p>
      </div>
    ) : tournaments.length === 0 ? (
      <div className="empty-state">
        <p>No lobbies found in the system.</p>
      </div>
    ) : (
      <div className="tournaments-grid">
        {tournaments.map(tournament => (
          <div key={tournament.id} className="tournament-card">
            <div className="tournament-card-header">
              <h4>{tournament.name}</h4>
              <span className={`status-badge status-${tournament.status}`}>
                {tournament.status}
              </span>
            </div>
            <div className="tournament-details">
              <div className="detail-item">
                <span className="detail-label"><Gamepad2 size={14} /> Game:</span>
                <span className="detail-value">{tournament.game}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label"><User size={14} /> Organizer:</span>
                <span className="detail-value">
                  {tournament.profiles?.username || tournament.profiles?.emails || 'Unknown'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label"><Users size={14} /> Teams:</span>
                <span className="detail-value">{tournament.teams_count}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label"><Calendar size={14} /> Created:</span>
                <span className="detail-value">
                  {new Date(tournament.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label"><Globe size={14} /> Public:</span>
                <span className="detail-value">
                  {tournament.is_public ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
            <button className="view-teams-button" onClick={() => onViewTeams(tournament)}>
              <Eye size={16} /> View Teams ({tournament.teams_count})
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
);

const TournamentTeamsView = ({ tournament, teams, loadingTeams, onBack }) => (
  <div className="tournament-teams-view">
    <div className="teams-header">
      <button className="back-button" onClick={onBack}>
        <ChevronLeft size={16} /> Back to Lobbies
      </button>
      <h2>Teams in "{tournament.name}"</h2>
    </div>

    <div className="tournament-info-card">
      <div className="tournament-info-row">
        <span className="info-label"><Trophy size={14} /> Lobby:</span>
        <span className="info-value">{tournament.name}</span>
      </div>
      <div className="tournament-info-row">
        <span className="info-label"><Gamepad2 size={14} /> Game:</span>
        <span className="info-value">{tournament.game}</span>
      </div>
      <div className="tournament-info-row">
        <span className="info-label"><Target size={14} /> Status:</span>
        <span className={`status-badge status-${tournament.status}`}>
          {tournament.status}
        </span>
      </div>
      <div className="tournament-info-row">
        <span className="info-label"><Calendar size={14} /> Created:</span>
        <span className="info-value">
          {new Date(tournament.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>

    <div className="tournaments-section">
      <div className="section-header">
        <h3><Users size={18} /> Registered Teams ({teams.length})</h3>
      </div>

      {loadingTeams ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading teams...</p>
        </div>
      ) : teams.length === 0 ? (
        <div className="empty-state">
          <p>No teams have registered for this lobby yet.</p>
        </div>
      ) : (
        <div className="teams-list">
          {teams.map(team => (
            <div key={team.id} className="team-card">
              <div className="team-header">
                <h4>{team.team_name}</h4>
                <span className="team-id"><Hash size={10} /> {team.id.substring(0, 8)}</span>
              </div>
              <div className="team-details">
                <div className="detail-item">
                  <span className="detail-label"><Users size={14} /> Members:</span>
                  <span className="detail-value">
                    {Array.isArray(team.members) ? team.members.length : 0} players
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><Target size={14} /> Wins:</span>
                  <span className="detail-value">
                    {team.total_points?.wins || 0}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><Gamepad2 size={14} /> Kill Points:</span>
                  <span className="detail-value">
                    {team.total_points?.kill_points || 0}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><LayoutDashboard size={14} /> Placement:</span>
                  <span className="detail-value">
                    {team.total_points?.placement_points || 0}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><Info size={14} /> Total Points:</span>
                  <span className="detail-value">
                    {(team.total_points?.wins || 0) + 
                     (team.total_points?.kill_points || 0) + 
                     (team.total_points?.placement_points || 0)}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><Calendar size={14} /> Registered:</span>
                  <span className="detail-value">
                    {new Date(team.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              {Array.isArray(team.members) && team.members.length > 0 && (
                <div className="members-section">
                  <h5>Team Members:</h5>
                  <div className="members-list">
                    {team.members.map((member, index) => (
                      <div key={index} className="member-item">
                        <span className="member-name"><User size={12} /> {member.name || member.playerName || 'Unknown Player'}</span>
                        <span className="member-id">{member.id || member.playerId || ''}</span>
                      </div>
                    ))}
                  </div>
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
  onViewUserDetails,
  loading
}) => (
  <div className="user-management">
    <div className="user-management-header">
      <h2><Users size={20} /> User Management</h2>
      {!loading && (
        <div className="user-stats">
          <span className="stat-badge">
            Total Users: <strong>{users.length}</strong>
          </span>
          <span className="stat-badge">
            Showing: <strong>{filteredUsers.length}</strong>
          </span>
        </div>
      )}
    </div>

    {/* Search Bar */}
    <div className="search-bar">
      <div className="search-icon-wrapper">
        <Search size={18} />
      </div>
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
          <XCircle size={18} />
        </button>
      )}
    </div>

    {/* Users Table */}
    <div className="users-table-container">
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading users...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="empty-state">
          <p>{searchQuery ? 'No users found matching your search' : 'No users available'}</p>
        </div>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Username</th>
              <th>Display Name</th>
              <th>Subscription Tier</th>
              <th>Admin</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id}>
                <td className="email-cell" onClick={() => onViewUserDetails(u)}>
                  {u.emails || u.email || 'N/A'}
                </td>
                <td>{u.username || 'N/A'}</td>
                <td>{u.display_name || 'N/A'}</td>
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
        <ChevronLeft size={16} /> Back to Users
      </button>
      <h2>User Details: {user.username || user.emails || user.email}</h2>
    </div>

    <div className="user-info-card">
      <div className="user-info-row">
        <span className="info-label"><Mail size={14} /> Email:</span>
        <span className="info-value">{user.emails || user.email || 'N/A'}</span>
      </div>
      <div className="user-info-row">
        <span className="info-label"><User size={14} /> Username:</span>
        <span className="info-value">{user.username || 'N/A'}</span>
      </div>
      <div className="user-info-row">
        <span className="info-label"><Info size={14} /> Display Name:</span>
        <span className="info-value">{user.display_name || 'N/A'}</span>
      </div>
      <div className="user-info-row">
        <span className="info-label"><Shield size={14} /> Subscription:</span>
        <span className={`info-value tier-badge tier-${user.subscription_tier || 'free'}`}>
          {user.subscription_tier || 'free'}
        </span>
      </div>
      <div className="user-info-row">
        <span className="info-label"><Shield size={14} /> Admin Status:</span>
        <span className={`info-value admin-badge ${user.is_admin ? 'admin-yes' : 'admin-no'}`}>
          {user.is_admin ? 'Yes' : 'No'}
        </span>
      </div>
      <div className="user-info-row">
        <span className="info-label"><Trophy size={14} /> Lobbies:</span>
        <span className="info-value">{user.lobbies_created_count || 0} created</span>
      </div>
    </div>

    <div className="tournaments-section">
      <div className="section-header">
        <h3><Trophy size={20} /> Lobbies Created</h3>
        <button className="refresh-button" onClick={() => onViewTeams(user.id)}>
          <RefreshCcw size={14} /> Refresh
        </button>
      </div>

      {loadingTournaments ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading lobbies...</p>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="empty-state">
          <p>This user hasn't created any lobbies yet.</p>
        </div>
      ) : (
        <div className="tournaments-grid">
          {tournaments.map(tournament => (
            <div key={tournament.id} className="tournament-card">
              <h4>{tournament.name}</h4>
              <div className="tournament-details">
                <div className="detail-item">
                  <span className="detail-label"><Gamepad2 size={14} /> Game:</span>
                  <span className="detail-value">{tournament.game}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><Target size={14} /> Status:</span>
                  <span className={`status-badge status-${tournament.status}`}>
                    {tournament.status}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><Users size={14} /> Teams:</span>
                  <span className="detail-value">{tournament.teams_count}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><Calendar size={14} /> Created:</span>
                  <span className="detail-value">
                    {new Date(tournament.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><Globe size={14} /> Public:</span>
                  <span className="detail-value">
                    {tournament.is_public ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
              <button className="view-teams-button" onClick={() => onViewTeams(tournament)}>
                <Eye size={16} /> View Teams ({tournament.teams_count})
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

const NotificationView = () => {
  const [users, setUsers] = useState({ org: [], teams: [] })
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [recipientType, setRecipientType] = useState('all') // 'all' or 'specific'
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState({ type: '', message: '' })
  const [isUsingFallback, setIsUsingFallback] = useState(false)
  const [activityLogs, setActivityLogs] = useState([])

  const addLog = (type, message, details = null) => {
    const newLog = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type, // 'info', 'success', 'error', 'request', 'response'
      message,
      details
    }
    setActivityLogs(prev => [newLog, ...prev].slice(0, 50)) // Keep last 50 logs
    console.log(`[${newLog.timestamp}] ${type.toUpperCase()}: ${message}`, details || '')
  }

  useEffect(() => {
    fetchNotificationUsers()
  }, [])

  const fetchNotificationUsers = async () => {
    setLoadingUsers(true)
    setIsUsingFallback(false)
    addLog('info', 'Fetching recipients from Supabase...')
    
    try {
      // Fetch both profiles and team_profiles in parallel from Supabase
      const [{ data: profiles, error: pError }, { data: teams, error: tError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .order('username', { ascending: true }),
        supabase
          .from('team_profiles')
          .select('*')
          .order('name', { ascending: true })
      ])

      if (pError) {
        addLog('error', 'Failed to fetch profiles from Supabase', pError.message)
      }
      if (tError) {
        addLog('error', 'Failed to fetch team profiles from Supabase', tError.message)
      }

      const formattedProfiles = (profiles || []).map(u => ({ 
        ...u, 
        id: u.id,
        display_name: u.display_name || u.username || u.emails || 'Unknown User',
        is_team: false 
      }))
      const formattedTeams = (teams || []).map(t => ({
        id: t.id,
        display_name: t.name || 'Unnamed Team',
        is_team: true
      }))

      addLog('success', `Fetched ${formattedProfiles.length} users and ${formattedTeams.length} teams from Supabase`)
      setUsers({ org: formattedProfiles, teams: formattedTeams })

      // Optional: still try to fetch from API in background if needed, 
      // but we already have the primary data from Supabase as requested
      /* 
      try {
        const response = await fetch('/get-users')
        if (response.ok) {
          const apiData = await response.json()
          // Update if API has more data...
        }
      } catch (e) {
        // Ignore API errors for recipient list since we have Supabase data
      }
      */

    } catch (err) {
      addLog('error', `Failed to fetch recipients: ${err.message}`)
      console.error('Error fetching notification users:', err)
      setStatus({ type: 'error', message: `Recipient list error: ${err.message}` })
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!message.trim()) {
      setStatus({ type: 'error', message: 'Message body is required' })
      return
    }

    if (recipientType === 'specific' && selectedUserIds.length === 0) {
      setStatus({ type: 'error', message: 'Please select at least one recipient' })
      return
    }

    if (recipientType === 'all_org' && users.org.length === 0) {
      setStatus({ type: 'error', message: 'No users found in Org section' })
      return
    }

    if (recipientType === 'all_teams' && users.teams.length === 0) {
      setStatus({ type: 'error', message: 'No teams found in Teams section' })
      return
    }

    setSending(true)
    setStatus({ type: '', message: '' })

    try {
      let finalUserIds = []
      if (recipientType === 'all') {
        finalUserIds = 'all'
      } else if (recipientType === 'all_org') {
        finalUserIds = users.org.map(u => u.id)
      } else if (recipientType === 'all_teams') {
        finalUserIds = users.teams.map(t => t.id)
      } else {
        finalUserIds = selectedUserIds
      }

      const payload = {
        user_ids: finalUserIds,
        title: title.trim() || undefined,
        message: message.trim()
      }

      addLog('request', 'POST /api/notifications/send-test', payload)

      const response = await fetch('/api/notifications/send-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).catch(err => {
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
          addLog('error', 'Connection failed: Backend server not reachable')
          throw new Error('Connection failed: Backend server not reachable. Please check if your API server is running.')
        }
        throw err
      })

      // Get the response text first to handle empty or non-JSON responses
      const responseText = await response.text()
      addLog('response', `POST /api/notifications/send-test returned status ${response.status}`, responseText)
      
      let data = {}
      
      try {
        if (responseText) {
          data = JSON.parse(responseText)
        }
      } catch (e) {
        addLog('error', 'Failed to parse JSON response', responseText)
        console.error('Failed to parse response as JSON:', responseText)
        // If it's an error status, the body might be HTML/text error message
        if (!response.ok) {
          throw new Error(`Server Error (${response.status}): ${responseText.substring(0, 100) || response.statusText}`)
        }
      }

      if (response.ok) {
        addLog('success', 'Notification sent successfully', data)
        setStatus({ type: 'success', message: data.message || 'Notification sent successfully!' })
        // Clear form on success
        setTitle('')
        setMessage('')
        setSelectedUserIds([])
      } else {
        addLog('error', 'Server rejected notification request', data)
        // Use the error message from JSON if available, otherwise construct one
        const errorMessage = data.error || data.message || `Failed to send (Status ${response.status})`
        throw new Error(errorMessage)
      }
    } catch (err) {
      addLog('error', `Submission error: ${err.message}`)
      console.error('Error sending notification:', err)
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSending(false)
    }
  }

  const toggleUserSelection = (userId) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId) 
        : [...prev, userId]
    )
  }

  const getPreviewAppName = () => {
    if (recipientType === 'all_teams') return 'LazarFlow Teams'
    if (recipientType === 'all_org') return 'LazarFlow'
    if (recipientType === 'all') return 'LazarFlow'

    if (recipientType === 'specific') {
      const hasTeams = selectedUserIds.some(id => users.teams.some(t => t.id === id))
      const hasOrg = selectedUserIds.some(id => users.org.some(u => u.id === id))
      
      if (hasTeams && !hasOrg) return 'LazarFlow Teams'
      if (hasOrg && !hasTeams) return 'LazarFlow'
      if (hasTeams && hasOrg) return 'LazarFlow / Teams'
    }
    
    return 'LazarFlow'
  }

  return (
    <div className="notification-management">
      <div className="notification-header">
        <h2><Bell size={20} /> Send Notifications</h2>
        <p className="subtitle">Compose and send push notifications to your users</p>
        {isUsingFallback && (
          <div className="fallback-badge">
            <Info size={12} /> Using direct database fallback (API issues)
          </div>
        )}
      </div>

      <div className="notification-container">
        <form onSubmit={handleSend} className="notification-form">
          <div className="form-section">
            <label className="form-label">Recipients</label>
            <div className="recipient-options">
              <button
                type="button"
                className={`recipient-type-btn ${recipientType === 'all' ? 'active' : ''}`}
                onClick={() => setRecipientType('all')}
              >
                All Users & Teams
              </button>
              <button
                type="button"
                className={`recipient-type-btn ${recipientType === 'all_org' ? 'active' : ''}`}
                onClick={() => setRecipientType('all_org')}
              >
                All Org (Users)
              </button>
              <button
                type="button"
                className={`recipient-type-btn ${recipientType === 'all_teams' ? 'active' : ''}`}
                onClick={() => setRecipientType('all_teams')}
              >
                All Teams
              </button>
              <button
                type="button"
                className={`recipient-type-btn ${recipientType === 'specific' ? 'active' : ''}`}
                onClick={() => setRecipientType('specific')}
              >
                Specific Selection
              </button>
            </div>
          </div>

          {recipientType === 'specific' && (
            <div className="form-section">
              <label className="form-label">Select Users ({selectedUserIds.length} selected)</label>
              <div className="user-selector">
                {loadingUsers ? (
                  <div className="loading-small">Loading recipients...</div>
                ) : (
                  <div className="selection-sections">
                    {/* Org Section */}
                    <div className="selection-section">
                      <h4 className="section-title">Org (Users)</h4>
                      <div className="user-selection-list">
                        {users.org.length === 0 ? (
                          <div className="empty-section">No users available</div>
                        ) : (
                          users.org.map(u => (
                            <div 
                              key={u.id} 
                              className={`user-selection-item ${selectedUserIds.includes(u.id) ? 'selected' : ''}`}
                              onClick={() => toggleUserSelection(u.id)}
                            >
                              <span className="user-name">
                                {u.display_name || u.username || u.email}
                              </span>
                              <span className="user-id-small">{u.id.substring(0, 8)}...</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Teams Section */}
                    <div className="selection-section">
                      <h4 className="section-title">Teams</h4>
                      <div className="user-selection-list">
                        {users.teams.length === 0 ? (
                          <div className="empty-section">No teams available</div>
                        ) : (
                          users.teams.map(u => (
                            <div 
                              key={u.id} 
                              className={`user-selection-item ${selectedUserIds.includes(u.id) ? 'selected' : ''}`}
                              onClick={() => toggleUserSelection(u.id)}
                            >
                              <span className="user-name">
                                {u.display_name}
                                <span className="team-tag">teams</span>
                              </span>
                              <span className="user-id-small">{u.id.substring(0, 8)}...</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="form-section">
            <label className="form-label" htmlFor="notif-title">Title (Optional)</label>
            <input
              id="notif-title"
              type="text"
              placeholder="e.g. Tournament Update"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="notif-input"
            />
          </div>

          <div className="form-section">
            <label className="form-label" htmlFor="notif-message">Message Body</label>
            <textarea
              id="notif-message"
              placeholder="Enter your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="notif-textarea"
              rows="4"
              required
            ></textarea>
          </div>

          {status.message && (
            <div className={`notification-status ${status.type}`}>
              {status.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              <div className="status-content">
                {status.message}
                {status.type === 'error' && status.message.includes('not reachable') && (
                  <div className="error-hint">
                    Make sure your API server is running and accessible at the same origin or configured via proxy.
                  </div>
                )}
              </div>
            </div>
          )}

          <button 
            type="submit" 
            className="send-button" 
            disabled={sending || (recipientType === 'specific' && selectedUserIds.length === 0) || !message.trim()}
          >
            {sending ? (
              <><RefreshCcw size={18} className="spin" /> Sending...</>
            ) : (
              <><Send size={18} /> Send Notification</>
            )}
          </button>
        </form>

        <div className="notification-preview">
          <h3>Live Preview</h3>
          <div className="phone-preview">
            <div className="phone-screen">
              <div className="notification-bubble">
                <div className="app-info">
                  <div className="app-icon">{getPreviewAppName() === 'LazarFlow Teams' ? 'LT' : 'LF'}</div>
                  <span className="app-name">{getPreviewAppName()}</span>
                  <span className="notif-time">now</span>
                </div>
                <div className="notif-content">
                  <div className="notif-title-preview">{title || 'Notification Title'}</div>
                  <div className="notif-message-preview">{message || 'Your message will appear here...'}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="preview-hint">
            <Info size={14} /> This is how the notification will appear on user devices.
          </div>
        </div>
      </div>

      <div className="activity-logs-section">
        <div className="logs-header">
          <h3>Recent Activity Logs</h3>
          <button className="clear-logs-btn" onClick={() => setActivityLogs([])}>
            Clear Logs
          </button>
        </div>
        <div className="logs-container">
          {activityLogs.length === 0 ? (
            <div className="empty-logs">No recent activity logs</div>
          ) : (
            activityLogs.map(log => (
              <div key={log.id} className={`log-entry log-${log.type}`}>
                <span className="log-timestamp">[{log.timestamp}]</span>
                <span className="log-type">{log.type.toUpperCase()}:</span>
                <span className="log-message">{log.message}</span>
                {log.details && (
                  <pre className="log-details">
                    {typeof log.details === 'object' 
                      ? JSON.stringify(log.details, null, 2) 
                      : log.details}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

const EMPTY_MAPPING_CONFIG = {
  "cells": Array(12).fill(null).map(() => ({
    "w": { "x": 0, "y": 0, "alignment": "center" },
    "kp": { "x": 0, "y": 0, "alignment": "center" },
    "pp": { "x": 0, "y": 0, "alignment": "center" },
    "rank": { "x": 0, "y": 0, "alignment": "center" },
    "team": { "x": 0, "y": 0, "alignment": "left" },
    "total": { "x": 0, "y": 0, "alignment": "center" }
  })),
  "scoreboard": {
    "color_rgb": [255, 255, 255],
    "font_path": "Anton-Regular.ttf",
    "font_size": 130
  },
  "extra_fields": {
    "tournament_name": {
      "x": 0,
      "y": 0,
      "alignment": "center",
      "font_size": 200,
      "color_rgb": [255, 255, 255],
      "font_path": "Anton-Regular.ttf"
    }
  }
}

const DUMMY_TEAMS = [
  { rank: "1", team: "ALPHA SQUAD", w: "1", pp: "15", kp: "22", total: "38" },
  { rank: "2", team: "BETA TEAM", w: "0", pp: "12", kp: "18", total: "30" },
  { rank: "3", team: "GAMMA FORCE", w: "0", pp: "10", kp: "15", total: "25" },
  { rank: "4", team: "DELTA OPS", w: "0", pp: "8", kp: "12", total: "20" },
  { rank: "5", team: "EPSILON V", w: "0", pp: "7", kp: "10", total: "17" },
  { rank: "6", team: "ZETA PRIME", w: "0", pp: "6", kp: "8", total: "14" },
  { rank: "7", team: "ETA RIDERS", w: "0", pp: "5", kp: "6", total: "11" },
  { rank: "8", team: "THETA X", w: "0", pp: "4", kp: "5", total: "9" },
  { rank: "9", team: "IOTA GANG", w: "0", pp: "3", kp: "4", total: "7" },
  { rank: "10", team: "KAPPA CLAN", w: "0", pp: "2", kp: "3", total: "5" },
  { rank: "11", team: "LAMBDA L", w: "0", pp: "1", kp: "2", total: "3" },
  { rank: "12", team: "MU RAIDERS", w: "0", pp: "0", kp: "1", total: "1" }
]

const ClientPreviewOverlay = ({ config, imageRef, imageUrl, selectedCellIdx }) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;

    const updateDimensions = () => {
      const rect = img.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    // If the image is already loaded, update immediately
    if (img.complete) {
      updateDimensions();
    }
    
    // Add load event listener to capture dimensions once image loads
    img.addEventListener('load', updateDimensions);
    window.addEventListener('resize', updateDimensions);
    
    // Check periodically for a few seconds as fallback (sometimes rects are tricky)
    const interval = setInterval(updateDimensions, 500);
    
    return () => {
      img.removeEventListener('load', updateDimensions);
      window.removeEventListener('resize', updateDimensions);
      clearInterval(interval);
    };
  }, [imageRef, imageUrl]);

  if (!imageRef.current || !config || !config.cells || dimensions.width === 0) return null;

  const naturalWidth = imageRef.current.naturalWidth;
  const naturalHeight = imageRef.current.naturalHeight;
  
  if (!naturalWidth || !naturalHeight) return null;
  
  const scaleX = dimensions.width / naturalWidth;
  const scaleY = dimensions.height / naturalHeight;

  const scoreboard = config.scoreboard || {};
  const baseColor = scoreboard.color_rgb || [255, 255, 255];
  const color = `rgb(${baseColor.join(',')})`;
  const baseFontSize = (scoreboard.font_size || 130) * scaleY;

  // Helper to map .ttf filenames to CSS font families
  const getFontFamily = (fontPath) => {
    if (!fontPath) return 'sans-serif';
    if (fontPath.includes('Anton')) return '"Anton", sans-serif';
    if (fontPath.includes('Roboto')) return '"Roboto", sans-serif';
    if (fontPath.includes('Montserrat')) return '"Montserrat", sans-serif';
    if (fontPath.includes('Bebas')) return '"Bebas Neue", sans-serif';
    return 'sans-serif';
  };

  return (
    <div 
      className="client-preview-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: dimensions.width,
        height: dimensions.height,
        pointerEvents: 'none',
        overflow: 'hidden'
      }}
    >
      {config.cells.map((cell, idx) => {
        const teamData = DUMMY_TEAMS[idx] || {};
        const isSelected = idx === selectedCellIdx;
        return (
          <div key={idx} className={`preview-row ${isSelected ? 'selected' : ''}`}>
            {Object.entries(cell).map(([field, coords]) => {
              if (field === 'id') return null;
              // Skip rendering if coordinates are both 0 (uninitialized)
              if (coords.x === 0 && coords.y === 0) return null;
              
              const value = teamData[field] || '';
              
              // Prioritize field-specific styles, fallback to scoreboard defaults
              const fieldColor = coords.color_rgb ? `rgb(${coords.color_rgb.join(',')})` : (isSelected ? '#ffeb3b' : color);
              const fieldFontSize = (coords.font_size || scoreboard.font_size || 130) * scaleY;
              const fieldFontFamily = getFontFamily(coords.font_path || scoreboard.font_path);

              return (
                <div
                  key={field}
                  style={{
                    position: 'absolute',
                    left: coords.x * scaleX,
                    top: coords.y * scaleY,
                    color: fieldColor,
                    fontSize: `${fieldFontSize}px`,
                    fontWeight: 'bold',
                    fontFamily: fieldFontFamily,
                    transform: coords.alignment === 'center' ? 'translateX(-50%)' : 'none',
                    textAlign: coords.alignment || 'left',
                    whiteSpace: 'nowrap',
                    textShadow: isSelected ? '0 0 10px rgba(0,0,0,0.8)' : '1px 1px 2px rgba(0,0,0,0.5)',
                    zIndex: isSelected ? 10 : 1
                  }}
                >
                  {value}
                </div>
              );
            })}
          </div>
        );
      })}
      
      {/* Extra Fields Rendering */}
      {config.extra_fields && Object.entries(config.extra_fields).map(([fieldName, coords]) => {
        // Skip rendering if coordinates are both 0 (uninitialized)
        if (coords.x === 0 && coords.y === 0) return null;
        
        // Dummy data for extra fields
        let value = "";
        if (fieldName === 'tournament_name') value = "GRAND TOURNAMENT 2024";
        
        const isSelected = selectedField === fieldName;
        const fieldColor = isSelected ? '#ffeb3b' : (coords.color_rgb ? `rgb(${coords.color_rgb.join(',')})` : 'rgb(255,255,255)');
        const fieldFontSize = (coords.font_size || 130) * scaleY;
        const fieldFontFamily = getFontFamily(coords.font_path || scoreboard.font_path);

        return (
          <div
            key={fieldName}
            style={{
              position: 'absolute',
              left: coords.x * scaleX,
              top: coords.y * scaleY,
              color: fieldColor,
              fontSize: `${fieldFontSize}px`,
              fontWeight: 'bold',
              fontFamily: fieldFontFamily,
              transform: coords.alignment === 'center' ? 'translateX(-50%)' : 'none',
              textAlign: coords.alignment || 'left',
              whiteSpace: 'nowrap',
              textShadow: isSelected ? '0 0 10px rgba(0,0,0,0.8)' : '1px 1px 2px rgba(0,0,0,0.5)',
              zIndex: isSelected ? 15 : 5
            }}
          >
            {value}
          </div>
        );
      })}
    </div>
  );
};

const ThemeBuilderView = ({ addLog }) => {
  const [themeName, setThemeName] = useState('Default Theme')
  const [imageUrl, setImageUrl] = useState('https://xsxwzwcfaflzynsyryzq.supabase.co/storage/v1/object/public/themes/optimized/design1_base.png?')
  const [mappingConfig, setMappingConfig] = useState(JSON.stringify(EMPTY_MAPPING_CONFIG, null, 2))
  const [previewImage, setPreviewImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState({ type: '', message: '' })
  const [imageError, setImageError] = useState(false)
  const [showJsonViewer, setShowJsonViewer] = useState(false)
  const [previewMode, setPreviewMode] = useState('image') // 'image' for picker, 'result' for rendered preview
  const [showLiveOverlay, setShowLiveOverlay] = useState(true)
  const [pendingThemes, setPendingThemes] = useState([])
  const [showPendingDropdown, setShowPendingDropdown] = useState(false)
  const [fetchingPending, setFetchingPending] = useState(false)
  
  // Update Config States
  const [selectedCellIdx, setSelectedCellIdx] = useState(0)
  const [selectedField, setSelectedField] = useState('team')
  const [tempFontSize, setTempFontSize] = useState(130)
  const [tempFontPath, setTempFontPath] = useState('Anton-Regular.ttf')
  const [tempColor, setTempColor] = useState('#ffffff')
  const CONFIG_FIELDS = ['rank', 'team', 'w', 'pp', 'kp', 'total', 'tournament_name']
  const FONT_OPTIONS = ['Anton-Regular.ttf', 'Roboto-Bold.ttf', 'Montserrat-Bold.ttf', 'BebasNeue-Regular.ttf']
  
  // Coordinate Picker States
  const [clickedCoord, setClickedCoord] = useState(null)
  const [selectionMode, setSelectionMode] = useState('point') // 'point', 'rect', 'circle'
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPos, setStartPos] = useState(null)
  const [currentPos, setCurrentPos] = useState(null)
  const imageRef = useRef(null)

  const fetchPendingThemes = async () => {
    // Toggle the dropdown
    const willOpen = !showPendingDropdown;
    setShowPendingDropdown(willOpen);
    
    if (willOpen) {
      setFetchingPending(true)
      try {
        // Fetch themes to find those without config or empty config
        const { data, error } = await supabase
          .from('themes')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error
        
        // Filter themes that are truly "pending" (null config, or config missing cells)
        const pending = (data || []).filter(t => {
          if (!t.mapping_config) return true;
          const config = t.mapping_config;
          return !config.cells || config.cells.length === 0;
        })
        
        setPendingThemes(pending)
        addLog('info', `Fetched ${pending.length} pending themes out of ${data?.length || 0} total`)
      } catch (err) {
        console.error('Error fetching themes:', err)
        addLog('error', 'Failed to fetch themes', err.message)
      } finally {
        setFetchingPending(false)
      }
    }
  }

  // Fetch themes on component mount
  useEffect(() => {
    fetchPendingThemes()
  }, [])

  const handleSelectPendingTheme = (theme) => {
     setImageUrl(theme.url)
     setThemeName(theme.name || 'Default Theme')
     
     // Use existing config if it has cells, otherwise use empty template
     if (theme.mapping_config && theme.mapping_config.cells && theme.mapping_config.cells.length > 0) {
       setMappingConfig(JSON.stringify(theme.mapping_config, null, 2))
       addLog('info', `Loaded existing config for: ${theme.name || theme.url}`)
     } else {
       setMappingConfig(JSON.stringify(EMPTY_MAPPING_CONFIG, null, 2))
       addLog('info', `Loaded empty template for: ${theme.name || theme.url}`)
     }
     
     setShowPendingDropdown(false)
     setImageError(false)
   }

  const handleUpdateMappingConfig = () => {
    if (!clickedCoord) return
    
    try {
      const config = JSON.parse(mappingConfig)
      if (!config.cells || !config.cells[selectedCellIdx]) {
        throw new Error(`Cell ${selectedCellIdx + 1} not found in config`)
      }

      const newX = clickedCoord.type && clickedCoord.type !== 'point' ? clickedCoord.centerX : clickedCoord.x
      const newY = clickedCoord.type && clickedCoord.type !== 'point' ? clickedCoord.centerY : clickedCoord.y
      
      const updatedConfig = { ...config }
      
      // Convert hex to [R, G, B]
      const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16)
        ] : [255, 255, 255];
      };
      const rgb = hexToRgb(tempColor);

      if (selectedField === 'tournament_name') {
        if (!updatedConfig.extra_fields) updatedConfig.extra_fields = {};
        updatedConfig.extra_fields.tournament_name = {
          ...updatedConfig.extra_fields.tournament_name,
          x: newX,
          y: newY,
          alignment: "center", // Forced center for tournament name
          font_size: tempFontSize,
          color_rgb: rgb,
          font_path: tempFontPath
        };
      } else {
        if (!updatedConfig.cells || !updatedConfig.cells[selectedCellIdx]) {
          throw new Error(`Cell ${selectedCellIdx + 1} not found in config`)
        }
        const currentCell = { ...updatedConfig.cells[selectedCellIdx] }
        currentCell[selectedField] = {
          ...currentCell[selectedField],
          x: newX,
          y: newY,
          alignment: selectedField === 'team' ? "left" : "center", // Auto-alignment based on field
          font_size: tempFontSize,
          color_rgb: rgb,
          font_path: tempFontPath
        }
        updatedConfig.cells[selectedCellIdx] = currentCell
      }
      
      const finalAlign = selectedField === 'tournament_name' || selectedField !== 'team' ? "center" : "left";
      
      setMappingConfig(JSON.stringify(updatedConfig, null, 2))
      addLog('success', `Updated ${selectedField === 'tournament_name' ? 'Extra' : 'Row ' + (selectedCellIdx + 1)} -> ${selectedField} to X:${newX}, Y:${newY}, Size:${tempFontSize}, Align:${finalAlign}`)
    } catch (e) {
      addLog('error', `Update failed: ${e.message}`)
      setStatus({ type: 'error', message: `Update failed: ${e.message}` })
    }
  }

  const handleFormatJson = () => {
    try {
      const obj = JSON.parse(mappingConfig)
      setMappingConfig(JSON.stringify(obj, null, 2))
      addLog('success', 'JSON formatted successfully')
    } catch (e) {
      addLog('error', 'Cannot format: Invalid JSON')
      setStatus({ type: 'error', message: 'Cannot format: Invalid JSON in editor' })
    }
  }

  const getRelativePos = (e) => {
    if (!imageRef.current) return null
    const rect = imageRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    // Scale to original image size
    const scaleX = imageRef.current.naturalWidth / rect.width
    const scaleY = imageRef.current.naturalHeight / rect.height
    
    return {
      x: Math.round(x * scaleX),
      y: Math.round(y * scaleY),
      screenX: x,
      screenY: y
    }
  }

  const handleMouseDown = (e) => {
    if (selectionMode === 'point') {
      const pos = getRelativePos(e)
      if (pos) {
        setClickedCoord({ x: pos.x, y: pos.y, type: 'point' })
        addLog('info', `Picked coordinate: X:${pos.x}, Y:${pos.y}`)
      }
      return
    }

    const pos = getRelativePos(e)
    if (pos) {
      setIsDrawing(true)
      setStartPos(pos)
      setCurrentPos(pos)
    }
  }

  const handleMouseMove = (e) => {
    if (!isDrawing) return
    const pos = getRelativePos(e)
    if (pos) {
      setCurrentPos(pos)
    }
  }

  const handleMouseUp = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    
    if (startPos && currentPos) {
      const width = Math.abs(currentPos.x - startPos.x)
      const height = Math.abs(currentPos.y - startPos.y)
      const centerX = Math.round((startPos.x + currentPos.x) / 2)
      const centerY = Math.round((startPos.y + currentPos.y) / 2)
      
      const selectionInfo = {
        type: selectionMode,
        x: Math.min(startPos.x, currentPos.x),
        y: Math.min(startPos.y, currentPos.y),
        width,
        height,
        centerX,
        centerY
      }
      
      setClickedCoord(selectionInfo)
      addLog('info', `Area selected (${selectionMode}): X:${selectionInfo.x}, Y:${selectionInfo.y}, W:${width}, H:${height}, Center:${centerX},${centerY}`)
    }
  }

  const handleGeneratePreview = async () => {
    if (!imageUrl || !mappingConfig) {
      setStatus({ type: 'error', message: 'Image URL and Mapping Config are required' })
      return
    }

    setLoading(true)
    setStatus({ type: '', message: '' })
    setPreviewImage(null)

    try {
      const configToRender = JSON.parse(mappingConfig);
      
      // Clean up the config: remove fields that have x:0 and y:0
       if (configToRender.cells) {
         configToRender.cells = configToRender.cells.map(cell => {
           const cleanedCell = { ...cell };
           Object.keys(cleanedCell).forEach(field => {
             if (field !== 'id' && cleanedCell[field] && cleanedCell[field].x === 0 && cleanedCell[field].y === 0) {
               delete cleanedCell[field];
             }
           });
           return cleanedCell;
         });
       }
       
       if (configToRender.extra_fields) {
         Object.keys(configToRender.extra_fields).forEach(field => {
           if (configToRender.extra_fields[field].x === 0 && configToRender.extra_fields[field].y === 0) {
             delete configToRender.extra_fields[field];
           }
         });
       }

      const payload = {
        imageUrl: imageUrl,
        mappingConfig: configToRender
      }

      console.log('--- GENERATING PREVIEW ---')
      console.log('Payload:', payload)
      addLog('request', 'POST /api/render/preview-render', payload)

      const response = await fetch('http://localhost:10000/api/render/preview-render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'image/png'
        },
        body: JSON.stringify(payload),
      })

      console.log('Response Status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Preview error details:', errorText)
        throw new Error(`Server Error (${response.status}): ${errorText}`)
      }

      const blob = await response.blob()
      console.log('Blob size:', blob.size)
      const objectUrl = URL.createObjectURL(blob)
      setPreviewImage(objectUrl)
      setPreviewMode('result') // Automatically switch to result view
      addLog('success', 'Preview generated successfully')
    } catch (err) {
      console.error('Full catch error:', err)
      setStatus({ type: 'error', message: err.message })
      addLog('error', 'Preview failed', err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!imageUrl || !mappingConfig) {
      setStatus({ type: 'error', message: 'Image URL and Mapping Config are required to update' })
      return
    }

    setSaving(true)
    setStatus({ type: '', message: '' })

    const cleanConfig = (configObj) => {
      const cleaned = JSON.parse(JSON.stringify(configObj)); // Deep clone
      const Y_OFFSET = 25; // Adjusting 25px up for server alignment
      
      if (cleaned.cells) {
        cleaned.cells = cleaned.cells.map(cell => {
          const cleanedCell = { ...cell };
          Object.keys(cleanedCell).forEach(field => {
            if (field !== 'id' && cleanedCell[field] && (cleanedCell[field].x !== 0 || cleanedCell[field].y !== 0)) {
              // Apply Y offset for server-side vertical alignment
              cleanedCell[field].y = Math.max(0, cleanedCell[field].y - Y_OFFSET);
            } else if (field !== 'id' && cleanedCell[field] && cleanedCell[field].x === 0 && cleanedCell[field].y === 0) {
              delete cleanedCell[field];
            }
          });
          return cleanedCell;
        });
      }
      
      if (cleaned.extra_fields) {
        Object.keys(cleaned.extra_fields).forEach(field => {
          if (cleaned.extra_fields[field].x !== 0 || cleaned.extra_fields[field].y !== 0) {
            // Apply Y offset for extra fields as well
            cleaned.extra_fields[field].y = Math.max(0, cleaned.extra_fields[field].y - Y_OFFSET);
          } else {
            delete cleaned.extra_fields[field];
          }
        });
        // Remove extra_fields if it's now empty
        if (Object.keys(cleaned.extra_fields).length === 0) {
          delete cleaned.extra_fields;
        }
      }
      
      return cleaned;
    };

    try {
      let config;
      try {
        config = cleanConfig(JSON.parse(mappingConfig));
      } catch (e) {
        throw new Error('Invalid JSON in Mapping Config')
      }

      // Update existing theme where URL matches
      const { data, error } = await supabase
        .from('themes')
        .update({
          mapping_config: config,
          status: 'verified', // Mark as verified upon saving
          updated_at: new Date().toISOString()
        })
        .eq('url', imageUrl)
        .select()

      if (error) throw error

      if (!data || data.length === 0) {
        throw new Error('No theme found with this Image URL. Make sure the URL matches exactly.')
      }

      setStatus({ type: 'success', message: 'Theme config updated successfully!' })
      addLog('success', 'Theme updated in database', data)
      
    } catch (err) {
      console.error('Update error:', err)
      setStatus({ type: 'error', message: err.message })
      addLog('error', 'Update failed', err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="theme-builder">
      <div className="section-header">
        <div className="header-title-group">
          <h2><Palette size={20} /> Theme Builder</h2>
          <p className="subtitle">Design and verify custom leaderboard themes</p>
        </div>
        
        <div className="header-actions-group">
          <div className="pending-themes-container">
            <button 
              type="button"
              className={`pending-themes-btn ${showPendingDropdown ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                fetchPendingThemes();
              }}
              disabled={fetchingPending}
              title="View themes with missing configuration"
            >
              {fetchingPending ? <RefreshCcw size={16} className="spin" /> : <List size={16} />}
              Pending Themes
              {pendingThemes.length > 0 && <span className="pending-count">{pendingThemes.length}</span>}
            </button>
            
            {showPendingDropdown && (
              <div className="pending-dropdown">
                <div className="dropdown-header">
                  <span>Pending Themes</span>
                  <button onClick={() => setShowPendingDropdown(false)}><XCircle size={14} /></button>
                </div>
                <div className="dropdown-list">
                  {pendingThemes.length === 0 ? (
                    <div className="dropdown-empty">No pending themes found</div>
                  ) : (
                    pendingThemes.map(theme => (
                      <div 
                        key={theme.id} 
                        className="dropdown-item"
                        onClick={() => handleSelectPendingTheme(theme)}
                      >
                        <div className="item-info">
                          <span className="item-name">{theme.name || 'Unnamed Theme'}</span>
                          <span className="item-url">{theme.url}</span>
                        </div>
                        <ChevronLeft size={14} className="item-arrow" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="builder-container">
        <div className="builder-form">
          <div className="form-section">
            <label className="form-label">Theme Name</label>
            <input
              type="text"
              placeholder="e.g. Modern Dark Tournament"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              className="builder-input"
            />
          </div>

          <div className="form-section">
            <label className="form-label">Background Image URL</label>
            <div className="input-with-icon">
              <ImageIcon size={16} className="input-icon" />
              <input
                type="text"
                placeholder="https://example.com/theme.png"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="builder-input"
              />
            </div>
          </div>

          <div className="form-section">
            <div className="label-with-actions">
              <label className="form-label">Mapping Config (JSON)</label>
              <div className="json-actions">
                <button 
                  className={`json-view-toggle ${!showJsonViewer ? 'active' : ''}`}
                  onClick={() => setShowJsonViewer(false)}
                  title="Editor Mode"
                >
                  Edit
                </button>
                <button 
                  className={`json-view-toggle ${showJsonViewer ? 'active' : ''}`}
                  onClick={() => setShowJsonViewer(true)}
                  title="Viewer Mode"
                >
                  <FileJson size={14} /> View
                </button>
                <button 
                  className="json-action-btn"
                  onClick={handleFormatJson}
                  title="Auto Format JSON"
                >
                  <LayoutGrid size={14} /> Format
                </button>
              </div>
            </div>

            {showJsonViewer ? (
              <div className="json-viewer-container">
                {(() => {
                  try {
                    const parsed = JSON.parse(mappingConfig);
                    return (
                      <div className="json-tree-root">
                        <JsonTreeNode label="JSON" value={parsed} />
                      </div>
                    );
                  } catch (e) {
                    return (
                      <div className="json-error">
                        <XCircle size={16} />
                        <span>Invalid JSON - please switch back to edit mode to fix it.</span>
                      </div>
                    );
                  }
                })()}
              </div>
            ) : (
              <textarea
                placeholder="Enter JSON mapping config..."
                value={mappingConfig}
                onChange={(e) => setMappingConfig(e.target.value)}
                className="builder-textarea large-editor"
                rows="35"
              ></textarea>
            )}
          </div>

          {status.message && (
            <div className={`notification-status ${status.type}`}>
              {status.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              <div className="status-content">{status.message}</div>
            </div>
          )}

          <div className="builder-actions">
            <button 
              className="preview-btn" 
              onClick={handleGeneratePreview}
              disabled={loading}
            >
              {loading ? <RefreshCcw size={18} className="spin" /> : <Play size={18} />}
              Generate Live Preview
            </button>
            <button 
              className="save-btn" 
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <RefreshCcw size={18} className="spin" /> : <Save size={18} />}
              Verify & Save
            </button>
          </div>
        </div>

        <div className="builder-preview">
          <div className="preview-header-with-toggle">
            <h3>Live Preview</h3>
            <div className="preview-mode-toggle">
              <button 
                className={`mode-toggle-btn ${previewMode === 'image' ? 'active' : ''}`}
                onClick={() => setPreviewMode('image')}
              >
                <ImageIcon size={14} /> Background / Picker
              </button>
              <button 
                className={`mode-toggle-btn ${previewMode === 'client' ? 'active' : ''}`}
                onClick={() => setPreviewMode('client')}
              >
                <Eye size={14} /> Client Preview
              </button>
              <button 
                className={`mode-toggle-btn ${previewMode === 'result' ? 'active' : ''}`}
                onClick={() => setPreviewMode('result')}
                disabled={!previewImage}
              >
                <Play size={14} /> Server Result
              </button>
            </div>
          </div>
          
          {previewMode === 'image' && (
            <>
              <div className="selection-toolbar">
                <button 
                  className={`toolbar-btn ${selectionMode === 'point' ? 'active' : ''}`}
                  onClick={() => setSelectionMode('point')}
                  title="Pick Point"
                >
                  <MousePointer2 size={16} /> Point
                </button>
                <button 
                  className={`toolbar-btn ${selectionMode === 'rect' ? 'active' : ''}`}
                  onClick={() => setSelectionMode('rect')}
                  title="Draw Rectangle"
                >
                  <Square size={16} /> Rectangle
                </button>
                <button 
                  className={`toolbar-btn ${selectionMode === 'circle' ? 'active' : ''}`}
                  onClick={() => setSelectionMode('circle')}
                  title="Draw Circle"
                >
                  <Circle size={16} /> Circle
                </button>
                
                <div className="toolbar-divider" />
                
                <button 
                  className={`toolbar-btn overlay-toggle ${showLiveOverlay ? 'active' : ''}`}
                  onClick={() => setShowLiveOverlay(!showLiveOverlay)}
                  title="Toggle Instant Visibility"
                >
                  <Eye size={16} /> {showLiveOverlay ? 'Overlay: ON' : 'Overlay: OFF'}
                </button>
              </div>

              {clickedCoord && (
                <div className="coordinate-display">
                  <div className="coord-info">
                    {clickedCoord.type && clickedCoord.type !== 'point' ? (
                      <div className="shape-info">
                        <span><strong>{clickedCoord.type.toUpperCase()}</strong> Area:</span>
                        <span>X: {clickedCoord.x}, Y: {clickedCoord.y}</span>
                        <span>W: {clickedCoord.width}, H: {clickedCoord.height}</span>
                        <span>Center: <strong>{clickedCoord.centerX}, {clickedCoord.centerY}</strong></span>
                      </div>
                    ) : (
                      <span>Last Click: <strong>X: {clickedCoord.x}, Y: {clickedCoord.y}</strong></span>
                    )}
                  </div>

                  <div className="coord-implement-section">
                    <div className="selector-group">
                      {selectedField !== 'tournament_name' && (
                        <select 
                          value={selectedCellIdx} 
                          onChange={(e) => {
                            const newIdx = parseInt(e.target.value);
                            setSelectedCellIdx(newIdx);
                            // Auto-load current settings for this field
                            try {
                              const config = JSON.parse(mappingConfig);
                              const cell = config.cells?.[newIdx];
                              const fieldData = cell?.[selectedField];
                              if (fieldData) {
                                if (fieldData.font_size) setTempFontSize(fieldData.font_size);
                                if (fieldData.alignment) setTempAlignment(fieldData.alignment);
                                if (fieldData.color_rgb) {
                                  const hex = '#' + fieldData.color_rgb.map(x => x.toString(16).padStart(2, '0')).join('');
                                  setTempColor(hex);
                                }
                              }
                            } catch (e) {}
                          }}
                          className="coord-selector"
                          title="Select Row"
                        >
                          {(() => {
                            try {
                              const config = JSON.parse(mappingConfig);
                              const cells = config.cells || [];
                              return cells.map((_, idx) => (
                                <option key={idx} value={idx}>Row {idx + 1}</option>
                              ));
                            } catch (e) {
                              return <option value={0}>Row 1</option>;
                            }
                          })()}
                        </select>
                      )}
                      <select 
                        value={selectedField} 
                        onChange={(e) => {
                          const newField = e.target.value;
                          setSelectedField(newField);
                          // Auto-load current settings for this field
                          try {
                            const config = JSON.parse(mappingConfig);
                            let fieldData;
                            if (newField === 'tournament_name') {
                              fieldData = config.extra_fields?.tournament_name;
                            } else {
                              fieldData = config.cells?.[selectedCellIdx]?.[newField];
                            }
                            
                            if (fieldData) {
                              if (fieldData.font_size) setTempFontSize(fieldData.font_size);
                              if (fieldData.font_path) setTempFontPath(fieldData.font_path);
                              if (fieldData.color_rgb) {
                                const hex = '#' + fieldData.color_rgb.map(x => x.toString(16).padStart(2, '0')).join('');
                                setTempColor(hex);
                              }
                            }
                          } catch (e) {}
                        }}
                        className="coord-selector"
                        title="Select Field"
                      >
                        {CONFIG_FIELDS.map(field => (
                          <option key={field} value={field}>{field.toUpperCase()}</option>
                        ))}
                      </select>
                      <select 
                        value={tempFontPath} 
                        onChange={(e) => setTempFontPath(e.target.value)}
                        className="coord-selector"
                        title="Select Font"
                      >
                        {FONT_OPTIONS.map(font => (
                          <option key={font} value={font}>{font.split('-')[0]}</option>
                        ))}
                      </select>
                      <input 
                          type="number" 
                          value={tempFontSize} 
                          onChange={(e) => setTempFontSize(parseInt(e.target.value))}
                          className="coord-selector font-size-input"
                          style={{ width: '70px' }}
                          title="Font Size for this field (px)"
                        />
                        <div className="color-picker-container" title="Pick Color">
                          <div 
                            className="color-preview" 
                            style={{ backgroundColor: tempColor }}
                            onClick={() => document.getElementById('hidden-color-picker').click()}
                          >
                            <Palette size={14} style={{ color: tempColor === '#ffffff' ? '#000' : '#fff' }} />
                          </div>
                          <input 
                            id="hidden-color-picker"
                            type="color" 
                            value={tempColor} 
                            onChange={(e) => setTempColor(e.target.value)}
                            className="hidden-color-input"
                          />
                        </div>
                      </div>
                      <button className="implement-btn" onClick={handleUpdateMappingConfig}>
                        <Save size={14} /> Update Config
                      </button>
                  </div>

                  <div className="coord-actions">
                    <button className="copy-coord-btn" onClick={() => {
                      const textToCopy = clickedCoord.type && clickedCoord.type !== 'point'
                        ? `"x": ${clickedCoord.centerX}, "y": ${clickedCoord.centerY}, "width": ${clickedCoord.width}, "height": ${clickedCoord.height}`
                        : `"x": ${clickedCoord.x}, "y": ${clickedCoord.y}`;
                      navigator.clipboard.writeText(textToCopy)
                      addLog('info', 'Coordinates copied to clipboard')
                    }}>
                      Copy JSON
                    </button>
                    <button className="clear-coord-btn" onClick={() => {
                      setClickedCoord(null)
                      setStartPos(null)
                      setCurrentPos(null)
                    }}>
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <div 
            className="image-preview-area"
            onMouseMove={previewMode === 'image' ? handleMouseMove : undefined}
            onMouseUp={previewMode === 'image' ? handleMouseUp : undefined}
            onMouseLeave={() => setIsDrawing(false)}
          >
            {previewMode === 'result' && previewImage ? (
              <img src={previewImage} alt="Theme Preview" className="preview-rendered-img" />
            ) : (imageUrl && !imageError) ? (
              <div className="preview-relative-container" style={{ position: 'relative', display: 'inline-block' }}>
                <img 
                  ref={imageRef}
                  src={imageUrl} 
                  alt="Background Preview" 
                  className={`preview-rendered-img raw-bg ${previewMode === 'image' ? (selectionMode !== 'point' ? 'drawing-active' : 'picker-active') : ''}`} 
                  onMouseDown={previewMode === 'image' ? handleMouseDown : undefined}
                  draggable="false"
                  onError={() => {
                    setImageError(true)
                    addLog('error', 'Failed to load background image from URL', imageUrl)
                  }}
                />
                
                {/* Client-Side Preview Overlay (Integrated & Separate) */}
                {((previewMode === 'image' && showLiveOverlay) || previewMode === 'client') && (
                    <ClientPreviewOverlay 
                    config={(() => {
                      try {
                        return JSON.parse(mappingConfig);
                      } catch (e) {
                        return null;
                      }
                    })()} 
                    imageRef={imageRef}
                    imageUrl={imageUrl}
                    selectedCellIdx={selectedCellIdx}
                  />
                )}
                
                {/* Drawing Overlay */}
                {previewMode === 'image' && isDrawing && startPos && currentPos && (
                  <div 
                    className={`selection-overlay ${selectionMode}`}
                    style={{
                      position: 'absolute',
                      left: Math.min(startPos.screenX, currentPos.screenX),
                      top: Math.min(startPos.screenY, currentPos.screenY),
                      width: Math.abs(currentPos.screenX - startPos.screenX),
                      height: Math.abs(currentPos.screenY - startPos.screenY),
                      pointerEvents: 'none',
                      border: '2px solid var(--primary)',
                      background: 'rgba(99, 102, 241, 0.2)',
                      borderRadius: selectionMode === 'circle' ? '50%' : '4px'
                    }}
                  />
                )}
                
                {/* Persistent Selection Highlight */}
                {previewMode === 'image' && !isDrawing && clickedCoord && imageRef.current && (
                  clickedCoord.type === 'point' ? (
                    <div 
                      className="selection-highlight point"
                      style={{
                        position: 'absolute',
                        left: (clickedCoord.x / imageRef.current.naturalWidth) * imageRef.current.clientWidth,
                        top: (clickedCoord.y / imageRef.current.naturalHeight) * imageRef.current.clientHeight,
                        width: '12px',
                        height: '12px',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                        border: '2px solid #ffeb3b',
                        borderRadius: '50%',
                        background: 'rgba(255, 235, 59, 0.5)',
                        boxShadow: '0 0 10px rgba(0,0,0,0.5)',
                        zIndex: 20
                      }}
                    >
                      {/* Crosshair lines for the point */}
                      <div style={{ position: 'absolute', top: '50%', left: '-5px', width: '22px', height: '1px', background: '#ffeb3b', transform: 'translateY(-50%)' }} />
                      <div style={{ position: 'absolute', left: '50%', top: '-5px', width: '1px', height: '22px', background: '#ffeb3b', transform: 'translateX(-50%)' }} />
                    </div>
                  ) : (
                    <div 
                      className={`selection-highlight ${clickedCoord.type}`}
                      style={{
                        position: 'absolute',
                        left: (clickedCoord.x / imageRef.current.naturalWidth) * imageRef.current.clientWidth,
                        top: (clickedCoord.y / imageRef.current.naturalHeight) * imageRef.current.clientHeight,
                        width: (clickedCoord.width / imageRef.current.naturalWidth) * imageRef.current.clientWidth,
                        height: (clickedCoord.height / imageRef.current.naturalHeight) * imageRef.current.clientHeight,
                        pointerEvents: 'none',
                        border: '2px dashed var(--primary)',
                        background: 'rgba(99, 102, 241, 0.1)',
                        borderRadius: clickedCoord.type === 'circle' ? '50%' : '4px'
                      }}
                    />
                  )
                )}
              </div>
            ) : (
              <div className="preview-placeholder">
                <ImageIcon size={48} />
                <p>{imageError ? 'Invalid Image URL or Access Denied' : 'Enter an image URL and click "Generate Live Preview"'}</p>
              </div>
            )}
          </div>
          <div className="preview-hint">
            <Info size={14} /> 
            {previewMode === 'result' ? 'Showing rendered preview with dummy data.' : 
             selectionMode === 'point' ? 'Interactive Mode: Click anywhere on the background image to get X and Y coordinates.' :
             `Interactive Mode: Click and drag on the image to draw a ${selectionMode}.`}
          </div>
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
  const [activeTab, setActiveTab] = useState('overview') // 'overview', 'users', 'tournaments', 'notifications', 'themes'
  const [activityLogs, setActivityLogs] = useState([])

  const addLog = (type, message, details = null) => {
    const newLog = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      details
    }
    setActivityLogs(prev => [newLog, ...prev].slice(0, 50))
  }
  const [allTournaments, setAllTournaments] = useState([])
  const [loadingAllTournaments, setLoadingAllTournaments] = useState(false)
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTournaments: 0,
    activeTournaments: 0,
    tierDistribution: {}
  })
  const [loadingStats, setLoadingStats] = useState(false)

  const SUBSCRIPTION_TIERS = ['free', 'ranked', 'competitive', 'premier', 'developer']

  useEffect(() => {
    fetchProfile()
    fetchUsers()
    fetchStats()
    fetchAllTournaments()
  }, [user])

  useEffect(() => {
    console.log('Users updated:', users);
    filterUsers()
  }, [searchQuery, users])

  const fetchAllTournaments = async () => {
    setLoadingAllTournaments(true)
    try {
      // Use 'lobbies' table as requested. Note: If this returns empty, please check RLS policies.
      const { data: lobbies, error: lobbiesError } = await supabase
        .from('lobbies')
        .select('*')
        .order('created_at', { ascending: false })

      if (lobbiesError) throw lobbiesError

      if (!lobbies || lobbies.length === 0) {
        setAllTournaments([])
        return
      }

      // Fetch unique profiles for these lobbies
      const userIds = [...new Set(lobbies.map(l => l.user_id).filter(Boolean))]
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, emails')
        .in('id', userIds)

      if (profilesError) console.error('Error fetching profiles for lobbies:', profilesError)

      const profileMap = (profiles || []).reduce((acc, p) => {
        acc[p.id] = p
        return acc
      }, {})

      const lobbiesWithDetails = await Promise.all(
        lobbies.map(async (lobby) => {
          // Get team count from 'lobby_teams'
          const { count: teamCount } = await supabase
            .from('lobby_teams')
            .select('*', { count: 'exact', head: true })
            .eq('lobby_id', lobby.id)
          
          return {
            ...lobby,
            teams_count: teamCount || 0,
            profiles: profileMap[lobby.user_id] || null
          }
        })
      )

      setAllTournaments(lobbiesWithDetails)
    } catch (err) {
      console.error('Error fetching all lobbies:', err)
      setError('Failed to load global lobbies')
    } finally {
      setLoadingAllTournaments(false)
    }
  }

  const fetchStats = async () => {
    setLoadingStats(true)
    try {
      // Use 'lobbies' table for stats. Note: If counts are 0, please check RLS policies.
      const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
      const { count: lobbiesCount } = await supabase.from('lobbies').select('*', { count: 'exact', head: true })
      const { count: activeLobbiesCount } = await supabase.from('lobbies').select('*', { count: 'exact', head: true }).eq('status', 'active')

      const { data: profiles } = await supabase.from('profiles').select('subscription_tier')
      const tierDistribution = (profiles || []).reduce((acc, p) => {
        const tier = p.subscription_tier || 'free'
        acc[tier] = (acc[tier] || 0) + 1
        return acc
      }, {})

      setStats({
        totalUsers: usersCount || 0,
        totalTournaments: lobbiesCount || 0,
        activeTournaments: activeLobbiesCount || 0,
        tierDistribution
      })
    } catch (err) {
      console.error('Error fetching stats:', err)
      setError('Failed to load dashboard statistics')
    } finally {
      setLoadingStats(false)
    }
  }

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
    setLoadingUsers(true)
    try {
      const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    setUsers(data || [])
    setFilteredUsers(data || [])
  } catch (err) {
    console.error('Error fetching users:', err)
    setError('Failed to load users: ' + err.message)
  } finally {
    setLoadingUsers(false)
  }
}

const addActivityLog = (type, message, details = null) => {
  const newLog = {
    id: Date.now(),
    timestamp: new Date().toLocaleTimeString(),
    type,
    message,
    details
  }
  // This is a helper to pass to components that need to log
  // We'll define the actual state in the Dashboard component
}

  const filterUsers = () => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = users.filter(u => 
        u.emails?.toLowerCase().includes(query) ||
        u.display_name?.toLowerCase().includes(query) ||
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
        fetchStats() // Refresh distribution stats
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
      // Use 'lobbies' table as requested. Note: If this returns empty, please check RLS policies.
      const { data: lobbies, error: lobbiesError } = await supabase
        .from('lobbies')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (lobbiesError) {
        console.error('Error fetching lobbies:', lobbiesError)
        setError('Failed to load user lobbies')
        setLoadingTournaments(false)
        return
      }

      const lobbiesWithTeams = await Promise.all(
        (lobbies || []).map(async (lobby) => {
          // Get team count from 'lobby_teams'
          const { count: teamCount } = await supabase
            .from('lobby_teams')
            .select('*', { count: 'exact', head: true })
            .eq('lobby_id', lobby.id)
          
          return {
            ...lobby,
            teams_count: teamCount || 0
          }
        })
      )

      setUserTournaments(lobbiesWithTeams)
    } catch (err) {
      console.error('Error fetching user lobbies:', err)
      setError('Failed to load user lobbies')
    } finally {
      setLoadingTournaments(false)
    }
  }

  const fetchTournamentTeams = async (tournamentId) => {
    setLoadingTeams(true)
    setError('')
    
    try {
      // Use 'lobby_teams' table as requested. Note: If this returns empty, please check RLS policies.
      const { data: teams, error: teamsError } = await supabase
        .from('lobby_teams')
        .select('*')
        .eq('lobby_id', tournamentId)
        .order('created_at', { ascending: false })

      if (teamsError) {
        console.error('Error fetching lobby teams:', teamsError)
        setError('Failed to load lobby teams')
        setLoadingTeams(false)
        return
      }

      setTournamentTeams(teams || [])
      return teams || []
    } catch (err) {
      console.error('Error fetching lobby teams:', err)
      setError('Failed to load lobby teams')
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
          <div className="logo-section">
            <LayoutDashboard className="logo-icon" size={24} />
            <h1>LazarFlow Admin</h1>
          </div>
          <div className="header-actions">
            <span className="welcome-text">
              {profile?.display_name || user.email}
            </span>
            <button onClick={handleLogout} className="logout-button">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        {/* Status Messages */}
        {error && (
          <div className="alert alert-error">
            <XCircle size={16} /> {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success">
            <CheckCircle2 size={16} /> {success}
          </div>
        )}

        {/* Tab Navigation */}
        {!selectedTournament && !selectedUser && (
          <div className="tab-navigation">
            <button 
              className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <LayoutDashboard size={16} /> Overview
            </button>
            <button 
              className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <Users size={16} /> Users
            </button>
            <button 
              className={`tab-button ${activeTab === 'tournaments' ? 'active' : ''}`}
              onClick={() => setActiveTab('tournaments')}
            >
              <Trophy size={16} /> Tournaments
            </button>
            <button 
              className={`tab-button ${activeTab === 'notifications' ? 'active' : ''}`}
              onClick={() => setActiveTab('notifications')}
            >
              <Bell size={16} /> Notifications
            </button>
            <button 
              className={`tab-button ${activeTab === 'themes' ? 'active' : ''}`}
              onClick={() => setActiveTab('themes')}
            >
              <Palette size={16} /> Themes
            </button>
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
        ) : activeTab === 'overview' ? (
          <StatsView stats={stats} loading={loadingStats} />
        ) : activeTab === 'tournaments' ? (
          <GlobalTournamentListView 
            tournaments={allTournaments} 
            loading={loadingAllTournaments}
            onViewTeams={handleViewTournamentTeams}
          />
        ) : activeTab === 'notifications' ? (
          <NotificationView />
        ) : activeTab === 'themes' ? (
          <ThemeBuilderView addLog={addLog} />
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
            loading={loadingUsers}
          />
        )}
      </main>
    </div>
  )
}

export default Dashboard
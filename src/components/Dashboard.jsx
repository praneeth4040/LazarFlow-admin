import { useState, useEffect } from 'react'
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
  Send
} from 'lucide-react'
import './Dashboard.css'

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
  const [users, setUsers] = useState([])
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
    addLog('info', 'Fetching recipient list...')
    try {
      const response = await fetch('/get-users').catch(err => {
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
          addLog('error', 'Connection failed: Backend server not reachable')
          throw new Error('Backend server not reachable')
        }
        throw err
      })
      
      addLog('response', `GET /get-users returned status ${response.status}`)
      const responseText = await response.text()
      
      if (!response.ok) {
        addLog('error', `API error (${response.status})`, responseText)
        // Fallback to direct Supabase query if backend API fails
        console.warn(`Backend /get-users failed with ${response.status}. Attempting direct Supabase fallback.`);
        setIsUsingFallback(true)
        addLog('info', 'Attempting direct Supabase fallback for user list...')
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name')
          .order('username', { ascending: true })
        
        if (error) {
          addLog('error', 'Supabase fallback failed', error.message)
          throw new Error(`API failed (${response.status}) and Supabase fallback failed: ${error.message}`)
        }
        addLog('success', `Fetched ${data?.length || 0} users via Supabase fallback`)
        setUsers(data || [])
        return
      }

      if (!responseText) {
        addLog('info', 'Recipient list is empty')
        setUsers([])
        return
      }
      
      const data = JSON.parse(responseText)
      addLog('success', `Fetched ${Array.isArray(data) ? data.length : 0} users via API`)
      setUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      addLog('error', `Failed to fetch recipients: ${err.message}`)
      console.error('Error fetching notification users:', err)
      
      // Try one last direct Supabase fallback if fetch failed entirely
      try {
        setIsUsingFallback(true)
        addLog('info', 'Final Supabase fallback attempt...')
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name')
        if (!error && data) {
          addLog('success', `Recovered ${data.length} users via fallback`)
          setUsers(data)
          return
        }
      } catch (fErr) {
        addLog('error', 'All recipient fetch attempts failed')
      }

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

    setSending(true)
    setStatus({ type: '', message: '' })

    try {
      const payload = {
        user_ids: recipientType === 'all' ? 'all' : selectedUserIds,
        title: title.trim() || undefined,
        message: message.trim()
      }

      addLog('request', 'POST /send-notification', payload)

      const response = await fetch('/send-notification', {
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
      addLog('response', `POST /send-notification returned status ${response.status}`, responseText)
      
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
                All Users
              </button>
              <button
                type="button"
                className={`recipient-type-btn ${recipientType === 'specific' ? 'active' : ''}`}
                onClick={() => setRecipientType('specific')}
              >
                Specific Users
              </button>
            </div>
          </div>

          {recipientType === 'specific' && (
            <div className="form-section">
              <label className="form-label">Select Users ({selectedUserIds.length} selected)</label>
              <div className="user-selector">
                {loadingUsers ? (
                  <div className="loading-small">Loading users...</div>
                ) : (
                  <div className="user-selection-list">
                    {users.map(u => (
                      <div 
                        key={u.id} 
                        className={`user-selection-item ${selectedUserIds.includes(u.id) ? 'selected' : ''}`}
                        onClick={() => toggleUserSelection(u.id)}
                      >
                        <span className="user-name">{u.display_name || u.username || u.email}</span>
                        <span className="user-id-small">{u.id.substring(0, 8)}...</span>
                      </div>
                    ))}
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
                  <div className="app-icon">LF</div>
                  <span className="app-name">LazarFlow</span>
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
  const [activeTab, setActiveTab] = useState('overview') // 'overview', 'users', 'tournaments', 'notifications'
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

  const filterUsers = () => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = users.filter(u => 
        u.emails?.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query) ||
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
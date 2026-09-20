import { useState, useMemo } from 'react'
import {
  Users, Trophy, Gamepad2, Eye,
  User, Calendar, Globe, Target, Hash, Info,
  ChevronLeft, RefreshCcw, Shield, Mail,
  Search, XCircle, Zap, Film, PlusCircle, Check, Edit3,
  UserCheck, UserPlus, UserX, Clock, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'

const formatLastActive = (iso) => {
  if (!iso) return 'Never'
  const time = new Date(iso).getTime()
  if (isNaN(time)) return 'Never'

  const diffMs = Date.now() - time
  const diffHours = Math.floor(diffMs / (3600 * 1000))
  const diffDays = Math.floor(diffMs / (86400 * 1000))

  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const getUserActivityStatus = (u, todayStart, sevenDaysAgo, thirtyDaysAgo) => {
  const createdTime = new Date(u.created_at || 0).getTime()
  const updatedTime = new Date(u.updated_at || u.created_at || 0).getTime()
  const adTime = u.last_ad_watched_at ? new Date(u.last_ad_watched_at).getTime() : 0
  const lastActiveTime = Math.max(updatedTime, adTime)

  if (createdTime >= sevenDaysAgo) return { label: 'New Join', type: 'new', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' }
  if (lastActiveTime >= todayStart) return { label: 'Active Today', type: 'today', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' }
  if (lastActiveTime >= sevenDaysAgo) return { label: 'Active (7D)', type: 'active', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' }
  if (lastActiveTime >= thirtyDaysAgo) return { label: 'Active (30D)', type: 'recent', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' }
  return { label: 'Inactive / Left', type: 'inactive', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' }
}

// ── User List ──────────────────────────────────────────────────────────────
export const UserListView = ({
  users, filteredUsers, searchQuery, setSearchQuery,
  updating, updateFluxBalance,
  onViewUserDetails, loading,
}) => {
  const [editingUserId, setEditingUserId] = useState(null)
  const [creditInput, setCreditInput] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all') // 'all' | 'active' | 'new' | 'inactive' | 'credits' | 'admins'
  const [datePreset, setDatePreset] = useState('all') // 'all' | 'today' | '7d' | '30d' | 'custom'
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const sevenDaysAgo = now.getTime() - 7 * 86400 * 1000
  const thirtyDaysAgo = now.getTime() - 30 * 86400 * 1000

  // ── Executive User Metrics ──
  const userStats = useMemo(() => {
    let activeToday = 0
    let active7D = 0
    let active30D = 0
    let joinedToday = 0
    let joined7D = 0
    let joined30D = 0
    let inactive30D = 0

    users.forEach((u) => {
      const createdTime = new Date(u.created_at || 0).getTime()
      const updatedTime = new Date(u.updated_at || u.created_at || 0).getTime()
      const adTime = u.last_ad_watched_at ? new Date(u.last_ad_watched_at).getTime() : 0
      const lastActiveTime = Math.max(updatedTime, adTime)

      if (createdTime >= todayStart) joinedToday++
      if (createdTime >= sevenDaysAgo) joined7D++
      if (createdTime >= thirtyDaysAgo) joined30D++

      if (lastActiveTime >= todayStart) activeToday++
      if (lastActiveTime >= sevenDaysAgo) active7D++
      if (lastActiveTime >= thirtyDaysAgo) active30D++

      if (lastActiveTime < thirtyDaysAgo && createdTime < thirtyDaysAgo) {
        inactive30D++
      }
    })

    return {
      total: users.length,
      activeToday,
      active7D,
      active30D,
      joinedToday,
      joined7D,
      joined30D,
      inactive30D,
      activePct: users.length > 0 ? Math.round((active7D / users.length) * 100) : 0,
      inactivePct: users.length > 0 ? Math.round((inactive30D / users.length) * 100) : 0,
    }
  }, [users, todayStart, sevenDaysAgo, thirtyDaysAgo])

  // ── Advanced User Filtering ──
  const displayableUsers = useMemo(() => {
    return filteredUsers.filter((u) => {
      const status = getUserActivityStatus(u, todayStart, sevenDaysAgo, thirtyDaysAgo)

      // Category filter
      if (categoryFilter === 'active' && !(status.type === 'today' || status.type === 'active')) return false
      if (categoryFilter === 'new' && status.type !== 'new') return false
      if (categoryFilter === 'inactive' && status.type !== 'inactive') return false
      if (categoryFilter === 'credits' && parseFloat(u.flux_balance || 0) <= 0) return false
      if (categoryFilter === 'admins' && !u.is_admin) return false

      // Date preset filter (based on join date)
      const createdTime = new Date(u.created_at || 0).getTime()
      if (datePreset === 'today' && createdTime < todayStart) return false
      if (datePreset === '7d' && createdTime < sevenDaysAgo) return false
      if (datePreset === '30d' && createdTime < thirtyDaysAgo) return false
      if (datePreset === 'custom') {
        if (customStart && createdTime < new Date(customStart).getTime()) return false
        if (customEnd && createdTime > new Date(customEnd).getTime() + 86400000) return false
      }

      return true
    })
  }, [filteredUsers, categoryFilter, datePreset, customStart, customEnd, todayStart, sevenDaysAgo, thirtyDaysAgo])

  const handleStartEdit = (u) => {
    setEditingUserId(u.id)
    setCreditInput(String(u.flux_balance || 0))
  }

  const handleSaveCredit = async (userId) => {
    const val = parseFloat(creditInput)
    if (!isNaN(val)) {
      await updateFluxBalance(userId, val)
    }
    setEditingUserId(null)
  }

  const handleQuickAdd = async (userId, currentBalance, amountToAdd) => {
    const newBal = (parseFloat(currentBalance) || 0) + amountToAdd
    await updateFluxBalance(userId, newBal)
  }

  return (
    <div className="user-management">

      {/* ── Header Title ── */}
      <div className="user-management-header">
        <div className="um-header-left">
          <div className="um-header-icon">
            <Users size={22} />
          </div>
          <div>
            <h2>User Analytics & Engagement</h2>
            <p className="user-management-sub">Monitor user retention, active app sessions, onboarding trends, and credit balances.</p>
          </div>
        </div>
      </div>

      {/* ── Executive Analytics Overview Cards ── */}
      <div className="user-analytics-cards-grid">
        <div className="user-analytics-card">
          <div className="u-card-header">
            <span className="u-card-title">Total Users</span>
            <div className="u-icon-badge blue"><Users size={16} /></div>
          </div>
          <div className="u-card-value">{userStats.total.toLocaleString()}</div>
          <div className="u-card-sub">
            <span>Showing: <strong>{displayableUsers.length}</strong> matching</span>
          </div>
        </div>

        <div className="user-analytics-card highlight-card">
          <div className="u-card-header">
            <span className="u-card-title">App Opened / Active (7D)</span>
            <div className="u-icon-badge green"><UserCheck size={16} /></div>
          </div>
          <div className="u-card-value">{userStats.active7D.toLocaleString()}</div>
          <div className="u-card-sub">
            <span className="trend-up"><ArrowUpRight size={13} /> {userStats.activePct}% active userbase</span>
            <span className="today-badge">Today: {userStats.activeToday}</span>
          </div>
        </div>

        <div className="user-analytics-card">
          <div className="u-card-header">
            <span className="u-card-title">New Joined Users</span>
            <div className="u-icon-badge purple"><UserPlus size={16} /></div>
          </div>
          <div className="u-card-value">
            {userStats.joined7D.toLocaleString()} <span className="value-unit">in 7d</span>
          </div>
          <div className="u-card-sub">
            <span>Today: <strong className="txt-purple">+{userStats.joinedToday}</strong></span>
            <span>30 Days: <strong>+{userStats.joined30D}</strong></span>
          </div>
        </div>

        <div className="user-analytics-card">
          <div className="u-card-header">
            <span className="u-card-title">Inactive / Left Users (30D+)</span>
            <div className="u-icon-badge red"><UserX size={16} /></div>
          </div>
          <div className="u-card-value">{userStats.inactive30D.toLocaleString()}</div>
          <div className="u-card-sub">
            <span className="trend-down"><ArrowDownRight size={13} /> {userStats.inactivePct}% dormant / left</span>
          </div>
        </div>
      </div>

      {/* ── Category & Time Filter Toolbar ── */}
      <div className="user-filters-toolbar">
        {/* Search */}
        <div className="search-bar user-search-bar">
          <div className="search-icon-wrapper"><Search size={16} /></div>
          <input
            type="text"
            placeholder="Search email, username, or display name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              <XCircle size={16} />
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="user-category-pills">
          <button className={`user-cat-pill ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>
            All ({userStats.total})
          </button>
          <button className={`user-cat-pill green ${categoryFilter === 'active' ? 'active' : ''}`} onClick={() => setCategoryFilter('active')}>
            <UserCheck size={13} /> Active 7D ({userStats.active7D})
          </button>
          <button className={`user-cat-pill purple ${categoryFilter === 'new' ? 'active' : ''}`} onClick={() => setCategoryFilter('new')}>
            <UserPlus size={13} /> New Joined ({userStats.joined7D})
          </button>
          <button className={`user-cat-pill red ${categoryFilter === 'inactive' ? 'active' : ''}`} onClick={() => setCategoryFilter('inactive')}>
            <UserX size={13} /> Inactive 30D+ ({userStats.inactive30D})
          </button>
          <button className={`user-cat-pill amber ${categoryFilter === 'credits' ? 'active' : ''}`} onClick={() => setCategoryFilter('credits')}>
            <Zap size={13} /> Credit Holders
          </button>
          <button className={`user-cat-pill blue ${categoryFilter === 'admins' ? 'active' : ''}`} onClick={() => setCategoryFilter('admins')}>
            <Shield size={13} /> Admins
          </button>
        </div>
      </div>

      {/* ── Date Range Presets ── */}
      <div className="user-date-presets-bar">
        <span className="preset-lbl"><Calendar size={13} /> Filter Join Date:</span>
        <div className="preset-buttons-group">
          {['all', 'today', '7d', '30d', 'custom'].map((p) => (
            <button
              key={p}
              className={`date-preset-btn ${datePreset === p ? 'active' : ''}`}
              onClick={() => setDatePreset(p)}
            >
              {p === 'all' && 'All Time'}
              {p === 'today' && 'Today'}
              {p === '7d' && 'Last 7 Days'}
              {p === '30d' && 'Last 30 Days'}
              {p === 'custom' && 'Custom Range'}
            </button>
          ))}
        </div>

        {datePreset === 'custom' && (
          <div className="custom-date-inputs">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="date-input" />
            <span>to</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="date-input" />
          </div>
        )}
      </div>

      {/* ── Users Table ── */}
      <div className="users-table-container">
        {loading ? (
          <div className="loading-container user-loading">
            <div className="loading-spinner"></div>
            <p>Loading user analytics & engagement metrics...</p>
          </div>
        ) : displayableUsers.length === 0 ? (
          <div className="empty-state user-empty-state">
            <Users size={36} className="empty-icon" />
            <h3>No Users Found</h3>
            <p>{searchQuery ? `No users matching "${searchQuery}"` : 'No users match the selected category & join date filters.'}</p>
          </div>
        ) : (
          <table className="users-table credit-table">
            <thead>
              <tr>
                <th>User Identity</th>
                <th>Activity Status</th>
                <th>Last Active</th>
                <th>Joined Date</th>
                <th>Flux Balance (⚡)</th>
                <th title="Ad count in current reward cycle (resets to 0 once reward is granted)">Ad Progress (🎬)</th>
                <th>Role</th>
                <th style={{ textAlign: 'right' }}>Credit Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayableUsers.map((u) => {
                const balance = parseFloat(u.flux_balance || 0)
                const isEditing = editingUserId === u.id
                const isUpdatingThisUser = updating === u.id
                const activityStatus = getUserActivityStatus(u, todayStart, sevenDaysAgo, thirtyDaysAgo)
                const lastActiveStr = formatLastActive(u.last_ad_watched_at || u.updated_at || u.created_at)
                const emailStr = u.emails || u.email || 'N/A'
                const initialChar = emailStr.charAt(0).toUpperCase()

                return (
                  <tr key={u.id} className="user-table-row">
                    <td className="email-cell" onClick={() => onViewUserDetails(u)}>
                      <div className="user-identity-cell">
                        <div className="u-avatar-badge" style={{ background: activityStatus.color }}>
                          {initialChar}
                        </div>
                        <div className="user-id-box">
                          <span className="u-email">{emailStr}</span>
                          {(u.username || u.display_name) && (
                            <span className="u-subname">@{u.username || u.display_name}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="user-activity-status-pill" style={{ color: activityStatus.color, background: activityStatus.bg, border: `1px solid ${activityStatus.color}35` }}>
                        <span className="status-dot" style={{ background: activityStatus.color }} />
                        {activityStatus.label}
                      </span>
                    </td>
                    <td>
                      <span className="last-active-txt"><Clock size={12} /> {lastActiveStr}</span>
                    </td>
                    <td>
                      <span className="joined-date-txt">{new Date(u.created_at || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </td>
                    <td>
                      <span className={`credit-badge ${balance > 0 ? 'has-credits' : 'zero-credits'}`}>
                        <Zap size={12} /> {balance.toLocaleString()} Flux
                      </span>
                    </td>
                    <td>
                      <span className="ads-watched-pill" title="Current cycle ad count (resets to 0 upon reward)">
                        <Film size={12} /> {u.ads_watched_count || 0} <span className="cycle-tag">cycle</span>
                      </span>
                    </td>
                    <td>
                      <span className={`admin-badge ${u.is_admin ? 'admin-yes' : 'admin-no'}`}>
                        {u.is_admin ? <><Shield size={11} /> Admin</> : 'User'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="credit-action-cell" style={{ justifyContent: 'flex-end' }}>
                        {isEditing ? (
                          <div className="inline-credit-edit">
                            <input
                              type="number"
                              className="credit-number-input"
                              value={creditInput}
                              onChange={(e) => setCreditInput(e.target.value)}
                              placeholder="0"
                              disabled={isUpdatingThisUser}
                              autoFocus
                            />
                            <button
                              className="save-credit-btn"
                              onClick={() => handleSaveCredit(u.id)}
                              disabled={isUpdatingThisUser}
                              title="Save Balance"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              className="cancel-credit-btn"
                              onClick={() => setEditingUserId(null)}
                              disabled={isUpdatingThisUser}
                            >
                              <XCircle size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="quick-credit-buttons">
                            <button
                              className="edit-credit-btn"
                              onClick={() => handleStartEdit(u)}
                              disabled={isUpdatingThisUser}
                              title="Set Exact Balance"
                            >
                              <Edit3 size={13} /> Edit
                            </button>
                            <button
                              className="quick-add-btn"
                              onClick={() => handleQuickAdd(u.id, balance, 50)}
                              disabled={isUpdatingThisUser}
                              title="Add +50 Credits"
                            >
                              +50
                            </button>
                            <button
                              className="quick-add-btn"
                              onClick={() => handleQuickAdd(u.id, balance, 100)}
                              disabled={isUpdatingThisUser}
                              title="Add +100 Credits"
                            >
                              +100
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── User Detail ────────────────────────────────────────────────────────────
export const UserDetailView = ({ user, tournaments, loadingTournaments, onBack, onViewTeams }) => (
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
        <span className="info-label"><Zap size={14} /> Flux Credit Balance:</span>
        <span className={`info-value credit-badge ${(user.flux_balance || 0) > 0 ? 'has-credits' : 'zero-credits'}`}>
          <Zap size={13} /> {parseFloat(user.flux_balance || 0).toLocaleString()} Flux Credits
        </span>
      </div>
      <div className="user-info-row">
        <span className="info-label"><Film size={14} /> Ad Reward Progress:</span>
        <span className="info-value">{user.ads_watched_count || 0} ads <small style={{ opacity: 0.75, fontSize: '0.82em' }}>(resets to 0 upon reward)</small></span>
      </div>
      {user.last_ad_watched_at && (
        <div className="user-info-row">
          <span className="info-label"><Calendar size={14} /> Last Ad Watched:</span>
          <span className="info-value">{new Date(user.last_ad_watched_at).toLocaleString()}</span>
        </div>
      )}
      <div className="user-info-row">
        <span className="info-label"><Shield size={14} /> Admin Status:</span>
        <span className={`info-value admin-badge ${user.is_admin ? 'admin-yes' : 'admin-no'}`}>
          {user.is_admin ? 'Yes' : 'No'}
        </span>
      </div>
      <div className="user-info-row">
        <span className="info-label"><Trophy size={14} /> Lobbies Created:</span>
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
                  <span className={`status-badge status-${tournament.status}`}>{tournament.status}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><Users size={14} /> Teams:</span>
                  <span className="detail-value">{tournament.teams_count}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><Calendar size={14} /> Created:</span>
                  <span className="detail-value">{new Date(tournament.created_at).toLocaleDateString()}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><Globe size={14} /> Public:</span>
                  <span className="detail-value">{tournament.is_public ? 'Yes' : 'No'}</span>
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
)

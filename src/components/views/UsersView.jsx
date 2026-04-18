import {
  Users, Trophy, Gamepad2, Eye,
  User, Calendar, Globe, Target, Hash, Info,
  ChevronLeft, RefreshCcw, Shield, Mail,
  Search, XCircle,
} from 'lucide-react'

// ── User List ──────────────────────────────────────────────────────────────
export const UserListView = ({
  users, filteredUsers, searchQuery, setSearchQuery,
  updating, SUBSCRIPTION_TIERS, updateSubscriptionTier,
  onViewUserDetails, loading,
}) => (
  <div className="user-management">
    <div className="user-management-header">
      <h2><Users size={20} /> User Management</h2>
      {!loading && (
        <div className="user-stats">
          <span className="stat-badge">Total Users: <strong>{users.length}</strong></span>
          <span className="stat-badge">Showing: <strong>{filteredUsers.length}</strong></span>
        </div>
      )}
    </div>

    <div className="search-bar">
      <div className="search-icon-wrapper"><Search size={18} /></div>
      <input
        type="text"
        placeholder="Search by email or username..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="search-input"
      />
      {searchQuery && (
        <button className="clear-search" onClick={() => setSearchQuery('')}>
          <XCircle size={18} />
        </button>
      )}
    </div>

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
              <th>Email</th><th>Username</th><th>Display Name</th>
              <th>Subscription Tier</th><th>Admin</th><th>Actions</th>
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
)

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

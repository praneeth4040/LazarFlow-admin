import { LayoutDashboard, Users, Trophy, Gamepad2, Info } from 'lucide-react'

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
)

export default StatsView

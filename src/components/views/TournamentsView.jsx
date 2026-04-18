import { Trophy, Gamepad2, Eye, User, Calendar, Globe, Target, Hash, Info, Users, ChevronLeft, LayoutDashboard } from 'lucide-react'

// ── Global Tournament List ─────────────────────────────────────────────────
export const GlobalTournamentListView = ({ tournaments, loading, onViewTeams }) => (
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
      <div className="empty-state"><p>No lobbies found in the system.</p></div>
    ) : (
      <div className="tournaments-grid">
        {tournaments.map(tournament => (
          <div key={tournament.id} className="tournament-card">
            <div className="tournament-card-header">
              <h4>{tournament.name}</h4>
              <span className={`status-badge status-${tournament.status}`}>{tournament.status}</span>
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
)

// ── Tournament Teams ───────────────────────────────────────────────────────
export const TournamentTeamsView = ({ tournament, teams, loadingTeams, onBack }) => (
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
        <span className={`status-badge status-${tournament.status}`}>{tournament.status}</span>
      </div>
      <div className="tournament-info-row">
        <span className="info-label"><Calendar size={14} /> Created:</span>
        <span className="info-value">{new Date(tournament.created_at).toLocaleDateString()}</span>
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
        <div className="empty-state"><p>No teams have registered for this lobby yet.</p></div>
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
                  <span className="detail-value">{team.total_points?.wins || 0}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><Gamepad2 size={14} /> Kill Points:</span>
                  <span className="detail-value">{team.total_points?.kill_points || 0}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label"><LayoutDashboard size={14} /> Placement:</span>
                  <span className="detail-value">{team.total_points?.placement_points || 0}</span>
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
                  <span className="detail-value">{new Date(team.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              {Array.isArray(team.members) && team.members.length > 0 && (
                <div className="members-section">
                  <h5>Team Members:</h5>
                  <div className="members-list">
                    {team.members.map((member, index) => (
                      <div key={index} className="member-item">
                        <span className="member-name">
                          <User size={12} /> {member.name || member.playerName || 'Unknown Player'}
                        </span>
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
)

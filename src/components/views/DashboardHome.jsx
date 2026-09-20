import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  LayoutDashboard, Users, Trophy, Gamepad2, Info,
  Cpu, FileText, CheckCircle2, AlertTriangle, Clock,
  ArrowDownRight, ArrowUpRight, DollarSign, Coins,
  Sparkles, ShieldCheck, Zap, Activity, ChevronRight,
  TrendingUp, Bell, Palette, Layers, Calendar, UserCheck,
} from 'lucide-react'

// Helper to calculate job cost in USD
const calculateJobCostUSD = (tokenUsage) => {
  if (!tokenUsage) return 0
  if (tokenUsage.cost_usd && tokenUsage.cost_usd > 0) return tokenUsage.cost_usd

  const input = tokenUsage.input_tokens || 0
  const output = tokenUsage.output_tokens || 0

  // Qwen 3 VL rates ($0.13/1M input, $0.52/1M output)
  const inputCost = (input / 1_000_000) * 0.13
  const outputCost = (output / 1_000_000) * 0.52

  return inputCost + outputCost
}

const StatsView = ({ stats, loading: statsLoading, onNavigate }) => {
  const [overviewData, setOverviewData] = useState({
    recentLobbies: [],
    recentJobs: [],
    teamProfilesCount: 0,
    promotedLobbiesCount: 0,
    ocrStats: {
      totalJobs: 0,
      doneJobs: 0,
      failedJobs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCostUSD: 0,
    },
    inrRate: 95.94,
    loading: true,
  })

  useEffect(() => {
    fetchOverviewDetails()
  }, [])

  const fetchOverviewDetails = async () => {
    try {
      // 1. Fetch live INR exchange rate
      let inrRate = 95.94
      try {
        const erRes = await fetch('https://open.er-api.com/v6/latest/USD')
        const erJson = await erRes.json()
        if (erJson?.rates?.INR) inrRate = parseFloat(erJson.rates.INR)
      } catch (e) {}

      // 2. Fetch recent lobbies
      const { data: lobbies } = await supabase
        .from('lobbies')
        .select('id, name, game, status, created_at, user_id, is_promoted')
        .order('created_at', { ascending: false })
        .limit(5)

      // 3. Fetch count of promoted lobbies
      const { count: promotedCount } = await supabase
        .from('lobbies')
        .select('*', { count: 'exact', head: true })
        .eq('is_promoted', true)

      // 4. Fetch count of team profiles
      const { count: teamProfilesCount } = await supabase
        .from('team_profiles')
        .select('*', { count: 'exact', head: true })

      // 5. Fetch OCR jobs summary & recent jobs
      const { data: ocrJobs } = await supabase
        .from('ocr_jobs')
        .select('*')
        .order('created_at', { ascending: false })

      let totalJobs = 0
      let doneJobs = 0
      let failedJobs = 0
      let inputTokens = 0
      let outputTokens = 0
      let totalCostUSD = 0

      if (ocrJobs) {
        totalJobs = ocrJobs.length
        ocrJobs.forEach(j => {
          if (j.status === 'done') doneJobs += 1
          if (j.status === 'failed') failedJobs += 1
          if (j.token_usage) {
            inputTokens += j.token_usage.input_tokens || 0
            outputTokens += j.token_usage.output_tokens || 0
            totalCostUSD += calculateJobCostUSD(j.token_usage)
          }
        })
      }

      setOverviewData({
        recentLobbies: lobbies || [],
        recentJobs: (ocrJobs || []).slice(0, 5),
        teamProfilesCount: teamProfilesCount || 0,
        promotedLobbiesCount: promotedCount || 0,
        ocrStats: {
          totalJobs,
          doneJobs,
          failedJobs,
          inputTokens,
          outputTokens,
          totalCostUSD,
        },
        inrRate,
        loading: false,
      })
    } catch (err) {
      console.error('Error fetching overview details:', err)
      setOverviewData(prev => ({ ...prev, loading: false }))
    }
  }

  const { ocrStats, inrRate, recentLobbies, recentJobs, teamProfilesCount, promotedLobbiesCount } = overviewData
  const totalCostINR = ocrStats.totalCostUSD * inrRate
  const ocrSuccessRate = ocrStats.totalJobs > 0 ? Math.round((ocrStats.doneJobs / ocrStats.totalJobs) * 100) : 0

  return (
    <div className="stats-overview overview-dashboard">
      {/* Overview Header Banner */}
      <div className="overview-hero-banner">
        <div className="banner-text">
          <h2><LayoutDashboard size={24} /> Platform Command Center</h2>
          <p>Real-time system health, user distribution, tournament metrics, and OpenRouter AI cost tracking</p>
        </div>
        <div className="banner-badge">
          <ShieldCheck size={16} /> Admin Operational
        </div>
      </div>

      {/* Main Stats Executive Row */}
      {statsLoading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Calculating live platform metrics...</p>
        </div>
      ) : (
        <div className="stats-grid overview-grid">
          <div className="stat-card ov-card clickable" onClick={() => onNavigate && onNavigate('users')}>
            <div className="stat-icon users-icon"><Users size={24} /></div>
            <div className="stat-info">
              <span className="stat-label">Total Registered Users</span>
              <span className="stat-value">{stats.totalUsers}</span>
              <span className="stat-meta"><UserCheck size={12} /> {teamProfilesCount} Team Profiles</span>
            </div>
            <ChevronRight size={18} className="card-arrow" />
          </div>

          <div className="stat-card ov-card clickable" onClick={() => onNavigate && onNavigate('tournaments')}>
            <div className="stat-icon tournaments-icon"><Trophy size={24} /></div>
            <div className="stat-info">
              <span className="stat-label">Total Lobbies</span>
              <span className="stat-value">{stats.totalTournaments}</span>
              <span className="stat-meta"><Gamepad2 size={12} /> {stats.activeTournaments} Active • {promotedLobbiesCount} Promoted</span>
            </div>
            <ChevronRight size={18} className="card-arrow" />
          </div>

          <div className="stat-card ov-card clickable" onClick={() => onNavigate && onNavigate('jobs')}>
            <div className="stat-icon ocr-icon"><Cpu size={24} /></div>
            <div className="stat-info">
              <span className="stat-label">Total OCR & Processing Jobs</span>
              <span className="stat-value">{ocrStats.totalJobs}</span>
              <span className="stat-meta"><CheckCircle2 size={12} /> {ocrSuccessRate}% Success ({ocrStats.doneJobs} ok / {ocrStats.failedJobs} fail)</span>
            </div>
            <ChevronRight size={18} className="card-arrow" />
          </div>

          <div className="stat-card ov-card hero-cost-card clickable" onClick={() => onNavigate && onNavigate('jobs')}>
            <div className="stat-icon cost-icon"><Coins size={24} /></div>
            <div className="stat-info">
              <span className="stat-label">Total AI Cost (INR)</span>
              <span className="stat-value cost-highlight">₹{totalCostINR.toFixed(2)}</span>
              <span className="stat-meta"><Sparkles size={12} /> OpenRouter (${ocrStats.totalCostUSD.toFixed(3)} USD)</span>
            </div>
            <ChevronRight size={18} className="card-arrow" />
          </div>
        </div>
      )}

      {/* System Quick Actions & Status Strip */}
      <div className="quick-actions-bar">
        <div className="actions-bar-label">
          <Zap size={16} /> Quick Actions:
        </div>
        <div className="actions-buttons-grid">
          <button className="quick-act-btn" onClick={() => onNavigate && onNavigate('users')}>
            <Users size={14} /> Manage Users <kbd className="kbd kbd-xs">G U</kbd>
          </button>
          <button className="quick-act-btn" onClick={() => onNavigate && onNavigate('tournaments')}>
            <Trophy size={14} /> Global Lobbies <kbd className="kbd kbd-xs">G T</kbd>
          </button>
          <button className="quick-act-btn" onClick={() => onNavigate && onNavigate('jobs')}>
            <Cpu size={14} /> OCR & Process Jobs <kbd className="kbd kbd-xs">G P</kbd>
          </button>
          <button className="quick-act-btn" onClick={() => onNavigate && onNavigate('notifications')}>
            <Bell size={14} /> Send Notifications <kbd className="kbd kbd-xs">G N</kbd>
          </button>
          <button className="quick-act-btn" onClick={() => onNavigate && onNavigate('themes')}>
            <Palette size={14} /> Theme Builder <kbd className="kbd kbd-xs">G M</kbd>
          </button>
        </div>
      </div>

      {/* Overview Analytics Grid */}
      <div className="stats-details-grid overview-sections-grid">
        {/* User Credit Balance Distribution */}
        <div className="stats-section-card tier-card">
          <h3><Zap size={18} /> User Credit Balance Distribution</h3>
          <div className="tier-distribution">
            {Object.entries(stats.creditDistribution || { '0 Credits': stats.totalUsers || 0 }).map(([range, count]) => {
              const pct = stats.totalUsers > 0 ? Math.round((count / stats.totalUsers) * 100) : 0
              return (
                <div key={range} className="tier-stat-row">
                  <div className="tier-label-group">
                    <span className="tier-badge credit-range-badge">{range}</span>
                    <span className="tier-pct">{pct}%</span>
                  </div>
                  <div className="tier-progress-bar">
                    <div
                      className="tier-progress-fill credit-fill"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                  <span className="tier-count">{count} users</span>
                </div>
              )
            })}
          </div>
          <div className="credit-summary-footer">
            <span>⚡ System Credits: <strong>{(stats.totalSystemCredits || 0).toLocaleString()} Flux</strong></span>
            <span title="Sum of current unrewarded ad progress across all users (resets upon reward claim)">🎬 Active Ad Progress: <strong>{(stats.totalAdsWatched || 0).toLocaleString()}</strong></span>
          </div>
        </div>

        {/* AI Tokens & OpenRouter Financials */}
        <div className="stats-section-card token-summary-card">
          <h3><Sparkles size={18} /> AI Token & Cost Breakdown</h3>
          <div className="token-overview-metrics">
            <div className="token-ov-item">
              <span className="label"><ArrowDownRight size={14} /> Total Input Tokens</span>
              <span className="val color-input">{(ocrStats.inputTokens / 1000).toFixed(1)}k</span>
            </div>
            <div className="token-ov-item">
              <span className="label"><ArrowUpRight size={14} /> Total Output Tokens</span>
              <span className="val color-output">{(ocrStats.outputTokens / 1000).toFixed(1)}k</span>
            </div>
            <div className="token-ov-item">
              <span className="label"><Layers size={14} /> Combined Tokens</span>
              <span className="val">{((ocrStats.inputTokens + ocrStats.outputTokens) / 1000).toFixed(1)}k</span>
            </div>
            <div className="token-ov-item highlight-item">
              <span className="label"><Coins size={14} /> OpenRouter Cost (₹ INR)</span>
              <span className="val cost-val">₹{totalCostINR.toFixed(2)}</span>
            </div>
          </div>
          <div className="token-model-note">
            <Info size={13} /> Rate: Qwen 3 VL (₹12.47 / 1M Input • ₹49.89 / 1M Output) • USD Exchange Rate: ₹{inrRate.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Live Activity Stream (Recent Lobbies & Recent Jobs) */}
      <div className="activity-streams-grid">
        {/* Recent Lobbies */}
        <div className="stats-section-card stream-card">
          <div className="stream-header">
            <h3><Trophy size={18} /> Recent Lobbies Created</h3>
            <button className="link-btn" onClick={() => onNavigate && onNavigate('tournaments')}>
              View All <ChevronRight size={14} />
            </button>
          </div>
          {recentLobbies.length === 0 ? (
            <div className="empty-state sm"><p>No lobbies recorded.</p></div>
          ) : (
            <div className="recent-list">
              {recentLobbies.map(lobby => (
                <div key={lobby.id} className="recent-item" onClick={() => onNavigate && onNavigate('tournaments')}>
                  <div className="item-icon lobby-ic"><Trophy size={16} /></div>
                  <div className="item-details">
                    <span className="item-title">{lobby.name}</span>
                    <span className="item-sub">Game: {lobby.game} • Status: {lobby.status}</span>
                  </div>
                  <span className="item-date">
                    {new Date(lobby.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent OCR Jobs */}
        <div className="stats-section-card stream-card">
          <div className="stream-header">
            <h3><Cpu size={18} /> Recent OCR Extraction Jobs</h3>
            <button className="link-btn" onClick={() => onNavigate && onNavigate('jobs')}>
              View All <ChevronRight size={14} />
            </button>
          </div>
          {recentJobs.length === 0 ? (
            <div className="empty-state sm"><p>No OCR jobs recorded.</p></div>
          ) : (
            <div className="recent-list">
              {recentJobs.map(job => (
                <div key={job.id} className="recent-item" onClick={() => onNavigate && onNavigate('jobs')}>
                  <div className={`item-icon ${job.status === 'done' ? 'job-ok' : 'job-err'}`}>
                    {job.job_type === 'extract_results' ? <FileText size={16} /> : <Cpu size={16} />}
                  </div>
                  <div className="item-details">
                    <span className="item-title">{job.job_type}</span>
                    <span className="item-sub">
                      Status: <strong className={job.status}>{job.status}</strong> • {job.token_usage?.total_tokens || 0} tokens
                    </span>
                  </div>
                  <span className="item-date">
                    {new Date(job.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default StatsView

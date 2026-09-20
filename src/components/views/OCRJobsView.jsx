import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Cpu, FileText, CheckCircle2, AlertTriangle, Clock,
  Search, XCircle, RefreshCcw, Eye, Layers, DollarSign,
  Image as ImageIcon, ArrowDownRight, ArrowUpRight, Copy,
  ChevronRight, User, Trophy, Info, Sparkles, Server, Coins,
  Calendar, Filter, TrendingUp, Award, BarChart3, ChevronDown, ChevronUp,
} from 'lucide-react'

// Popular OpenRouter OCR/Vision model pricing presets (per 1 Million tokens in USD)
export const OPENROUTER_MODELS = [
  { id: 'qwen/qwen3-vl-30b-a3b-instruct', name: 'Qwen 3 VL 30B A3B Instruct (Default)', inputRate: 0.13, outputRate: 0.52 },
  { id: 'qwen/qwen3-vl-32b-instruct', name: 'Qwen 3 VL 32B Instruct', inputRate: 0.104, outputRate: 0.416 },
  { id: 'qwen/qwen2.5-vl-72b-instruct', name: 'Qwen 2.5 VL 72B Instruct', inputRate: 0.80, outputRate: 1.00 },
  { id: 'openai/gpt-4o-mini', name: 'OpenAI GPT-4o Mini', inputRate: 0.15, outputRate: 0.60 },
  { id: 'google/gemini-2.0-flash-001', name: 'Google Gemini 2.0 Flash', inputRate: 0.10, outputRate: 0.40 },
  { id: 'google/gemini-flash-1.5', name: 'Google Gemini 1.5 Flash', inputRate: 0.075, outputRate: 0.30 },
  { id: 'meta-llama/llama-3.2-11b-vision-instruct', name: 'Meta Llama 3.2 11B Vision', inputRate: 0.055, outputRate: 0.055 },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Anthropic Claude 3.5 Sonnet', inputRate: 3.00, outputRate: 15.00 },
]

// Helper to calculate job cost in USD
const calculateJobCostUSD = (tokenUsage, modelConfig) => {
  if (!tokenUsage) return 0
  if (tokenUsage.cost_usd && tokenUsage.cost_usd > 0) return tokenUsage.cost_usd

  const input = tokenUsage.input_tokens || 0
  const output = tokenUsage.output_tokens || 0

  const inputRate = modelConfig?.inputRate ?? 0.13
  const outputRate = modelConfig?.outputRate ?? 0.52

  const inputCost = (input / 1_000_000) * inputRate
  const outputCost = (output / 1_000_000) * outputRate

  return inputCost + outputCost
}

const OCRJobsView = ({ addLog }) => {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [jobTypeFilter, setJobTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedJob, setSelectedJob] = useState(null)
  const [profilesMap, setProfilesMap] = useState({})
  const [lobbiesMap, setLobbiesMap] = useState({})
  const [copied, setCopied] = useState(false)

  // Date Filter State
  const [dateFilter, setDateFilter] = useState('all') // 'all', 'today', 'yesterday', '7days', '30days', 'this_month', 'custom'
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Currency & OpenRouter Model Selection (Defaulting to INR ₹ & Qwen 3 VL)
  const [currency, setCurrency] = useState('INR') // 'INR' or 'USD'
  const [inrRate, setInrRate] = useState(87.0)
  const [selectedModelId, setSelectedModelId] = useState('qwen/qwen3-vl-30b-a3b-instruct')
  const [openRouterModels, setOpenRouterModels] = useState(OPENROUTER_MODELS)
  const [livePricingLoaded, setLivePricingLoaded] = useState(false)

  // UI state for active tab section
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState('top_users') // 'top_users', 'top_lobbies', 'job_types', 'daily_ledger'

  useEffect(() => {
    fetchJobs()
    fetchOpenRouterPricing()
    fetchInrExchangeRate()
  }, [])

  // Fetch live USD to INR exchange rate
  const fetchInrExchangeRate = async () => {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD')
      const data = await res.json()
      if (data && data.rates && data.rates.INR) {
        setInrRate(parseFloat(data.rates.INR))
      }
    } catch (err) {
      console.warn('Could not fetch live INR exchange rate, using fallback 87.0:', err)
    }
  }

  // Fetch live OpenRouter model pricing from OpenRouter public API
  const fetchOpenRouterPricing = async () => {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models')
      const json = await res.json()
      if (json && Array.isArray(json.data)) {
        const liveMap = {}
        json.data.forEach(m => {
          if (m.pricing) {
            liveMap[m.id] = {
              prompt: parseFloat(m.pricing.prompt || 0) * 1_000_000,
              completion: parseFloat(m.pricing.completion || 0) * 1_000_000,
            }
          }
        })

        // Update presets with exact live pricing from OpenRouter
        setOpenRouterModels(prev => prev.map(m => {
          const live = liveMap[m.id]
          if (live) {
            return { ...m, inputRate: live.prompt, outputRate: live.completion }
          }
          return m
        }))
        setLivePricingLoaded(true)
      }
    } catch (err) {
      console.warn('Could not fetch live OpenRouter pricing API, using preconfigured rates:', err)
    }
  }

  const currentModelConfig = useMemo(() => {
    return openRouterModels.find(m => m.id === selectedModelId) || openRouterModels[0]
  }, [openRouterModels, selectedModelId])

  const formatCost = (usdAmount) => {
    if (currency === 'INR') {
      const inr = usdAmount * inrRate
      if (inr > 0 && inr < 0.01) return `₹${inr.toFixed(4)}`
      return `₹${inr.toFixed(2)}`
    }
    return `$${usdAmount.toFixed(4)}`
  }

  const formatRate = (usdRatePerMillion) => {
    if (currency === 'INR') {
      const inr = usdRatePerMillion * inrRate
      return `₹${inr.toFixed(2)}`
    }
    return `$${usdRatePerMillion.toFixed(3)}`
  }

  const fetchJobs = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: jobsErr } = await supabase
        .from('ocr_jobs')
        .select('*')
        .order('created_at', { ascending: false })

      if (jobsErr) throw jobsErr

      const jobList = data || []
      setJobs(jobList)

      // Collect user_ids & lobby_ids to fetch names
      const userIds = [...new Set(jobList.map(j => j.user_id).filter(Boolean))]
      const lobbyIds = [...new Set(jobList.map(j => j.lobby_id).filter(Boolean))]

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, emails')
          .in('id', userIds)
        if (profiles) {
          const pMap = profiles.reduce((acc, p) => { acc[p.id] = p; return acc }, {})
          setProfilesMap(pMap)
        }
      }

      if (lobbyIds.length > 0) {
        const { data: lobbies } = await supabase
          .from('lobbies')
          .select('id, name, game')
          .in('id', lobbyIds)
        if (lobbies) {
          const lMap = lobbies.reduce((acc, l) => { acc[l.id] = l; return acc }, {})
          setLobbiesMap(lMap)
        }
      }

      if (addLog) addLog('success', `Loaded ${jobList.length} OCR & Process Lobby jobs`)
    } catch (err) {
      console.error('Failed to load ocr_jobs:', err)
      setError('Failed to fetch OCR jobs: ' + err.message)
      if (addLog) addLog('error', 'Error fetching OCR jobs', err.message)
    } finally {
      setLoading(false)
    }
  }

  // Filter jobs based on Date range, Job Type, Status, and Search Query
  const filteredJobs = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    const sevenDaysAgo = new Date(todayStart)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const thirtyDaysAgo = new Date(todayStart)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    return jobs.filter(job => {
      // 1. Date Filter
      if (dateFilter !== 'all') {
        const jobDate = new Date(job.created_at)
        if (dateFilter === 'today' && jobDate < todayStart) return false
        if (dateFilter === 'yesterday' && (jobDate < yesterdayStart || jobDate >= todayStart)) return false
        if (dateFilter === '7days' && jobDate < sevenDaysAgo) return false
        if (dateFilter === '30days' && jobDate < thirtyDaysAgo) return false
        if (dateFilter === 'this_month' && jobDate < monthStart) return false
        if (dateFilter === 'custom') {
          if (customStartDate && jobDate < new Date(customStartDate)) return false
          if (customEndDate) {
            const end = new Date(customEndDate)
            end.setHours(23, 59, 59, 999)
            if (jobDate > end) return false
          }
        }
      }

      // 2. Job Type Filter
      if (jobTypeFilter !== 'all' && job.job_type !== jobTypeFilter) return false

      // 3. Status Filter
      if (statusFilter !== 'all' && job.status !== statusFilter) return false

      // 4. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const profile = profilesMap[job.user_id]
        const lobby = lobbiesMap[job.lobby_id]
        const text = [
          job.id,
          job.job_type,
          job.status,
          job.error,
          profile?.username,
          profile?.display_name,
          profile?.emails,
          lobby?.name,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    })
  }, [jobs, dateFilter, customStartDate, customEndDate, jobTypeFilter, statusFilter, searchQuery, profilesMap, lobbiesMap])

  // Aggregate stats based on filtered jobs
  const stats = useMemo(() => {
    const total = filteredJobs.length
    const extractResultsCount = filteredJobs.filter(j => j.job_type === 'extract_results').length
    const processLobbyCount = filteredJobs.filter(j => j.job_type === 'process_lobby').length
    const doneCount = filteredJobs.filter(j => j.status === 'done').length
    const failedCount = filteredJobs.filter(j => j.status === 'failed').length
    const successRate = total > 0 ? Math.round((doneCount / total) * 100) : 0

    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCostUSD = 0

    filteredJobs.forEach(j => {
      if (j.token_usage) {
        const inp = j.token_usage.input_tokens || 0
        const out = j.token_usage.output_tokens || 0
        totalInputTokens += inp
        totalOutputTokens += out
        totalCostUSD += calculateJobCostUSD(j.token_usage, currentModelConfig)
      }
    })

    return {
      total,
      extractResultsCount,
      processLobbyCount,
      doneCount,
      failedCount,
      successRate,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalCostUSD,
    }
  }, [filteredJobs, currentModelConfig])

  // Top 4 Users Aggregation
  const top4Users = useMemo(() => {
    const map = {}
    filteredJobs.forEach(j => {
      const uid = j.user_id || 'unknown'
      if (!map[uid]) {
        map[uid] = {
          userId: uid,
          profile: profilesMap[uid] || null,
          jobCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCostUSD: 0,
        }
      }
      map[uid].jobCount += 1
      if (j.token_usage) {
        map[uid].inputTokens += j.token_usage.input_tokens || 0
        map[uid].outputTokens += j.token_usage.output_tokens || 0
        map[uid].totalCostUSD += calculateJobCostUSD(j.token_usage, currentModelConfig)
      }
    })

    return Object.values(map)
      .sort((a, b) => b.totalCostUSD - a.totalCostUSD)
      .slice(0, 4)
  }, [filteredJobs, profilesMap, currentModelConfig])

  // Top 4 Lobbies Aggregation
  const top4Lobbies = useMemo(() => {
    const map = {}
    filteredJobs.forEach(j => {
      const lid = j.lobby_id || 'unknown'
      if (!map[lid]) {
        map[lid] = {
          lobbyId: lid,
          lobby: lobbiesMap[lid] || null,
          jobCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCostUSD: 0,
        }
      }
      map[lid].jobCount += 1
      if (j.token_usage) {
        map[lid].inputTokens += j.token_usage.input_tokens || 0
        map[lid].outputTokens += j.token_usage.output_tokens || 0
        map[lid].totalCostUSD += calculateJobCostUSD(j.token_usage, currentModelConfig)
      }
    })

    return Object.values(map)
      .sort((a, b) => b.totalCostUSD - a.totalCostUSD)
      .slice(0, 4)
  }, [filteredJobs, lobbiesMap, currentModelConfig])

  // Job Type Breakdown Split
  const jobTypeSplit = useMemo(() => {
    const extract = { type: 'extract_results', label: 'Extract Results', jobs: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 }
    const process = { type: 'process_lobby', label: 'Process Lobby', jobs: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 }

    filteredJobs.forEach(j => {
      const target = j.job_type === 'extract_results' ? extract : process
      target.jobs += 1
      if (j.token_usage) {
        target.inputTokens += j.token_usage.input_tokens || 0
        target.outputTokens += j.token_usage.output_tokens || 0
        target.costUSD += calculateJobCostUSD(j.token_usage, currentModelConfig)
      }
    })

    return [extract, process]
  }, [filteredJobs, currentModelConfig])

  // Daily Cost Ledger Aggregation
  const dailyCostLedger = useMemo(() => {
    const map = {}
    filteredJobs.forEach(j => {
      if (!j.created_at) return
      const dateKey = j.created_at.slice(0, 10) // YYYY-MM-DD
      if (!map[dateKey]) {
        map[dateKey] = {
          date: dateKey,
          jobsCount: 0,
          doneCount: 0,
          failedCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCostUSD: 0,
        }
      }
      map[dateKey].jobsCount += 1
      if (j.status === 'done') map[dateKey].doneCount += 1
      if (j.status === 'failed') map[dateKey].failedCount += 1

      if (j.token_usage) {
        map[dateKey].inputTokens += j.token_usage.input_tokens || 0
        map[dateKey].outputTokens += j.token_usage.output_tokens || 0
        map[dateKey].totalCostUSD += calculateJobCostUSD(j.token_usage, currentModelConfig)
      }
    })

    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date))
  }, [filteredJobs, currentModelConfig])

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatJSON = (val) => {
    try {
      return JSON.stringify(val, null, 2)
    } catch {
      return String(val)
    }
  }

  return (
    <div className="ocr-jobs-view">
      {/* Top Header */}
      <div className="section-header">
        <div className="header-title-group">
          <h2><Cpu size={22} /> Extraction & Lobby Processing Hub</h2>
          <span className="subtitle">Real-time log tracking, OpenRouter cost reporting in INR (₹), and date-wise analytics</span>
        </div>
        <div className="header-actions">
          {/* Currency Switcher */}
          <button
            className="currency-toggle-btn"
            onClick={() => setCurrency(c => c === 'INR' ? 'USD' : 'INR')}
            title="Switch Currency"
          >
            <Coins size={14} /> Currency: <strong>{currency === 'INR' ? '₹ INR' : '$ USD'}</strong>
          </button>
          <button className="icon-button" onClick={fetchJobs} title="Refresh Jobs">
            <RefreshCcw size={18} />
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error"><XCircle size={16} /> {error}</div>}

      {/* Date Range Quick Filter Pills */}
      <div className="date-filter-section">
        <div className="date-filter-header">
          <Calendar size={16} className="date-icon" />
          <span className="date-label">Date Filter:</span>
        </div>
        <div className="date-pills">
          {[
            { key: 'all', label: 'All Time' },
            { key: 'today', label: 'Today' },
            { key: 'yesterday', label: 'Yesterday' },
            { key: '7days', label: 'Last 7 Days' },
            { key: '30days', label: 'Last 30 Days' },
            { key: 'this_month', label: 'This Month' },
            { key: 'custom', label: 'Custom Range' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setDateFilter(p.key)}
              className={`date-pill ${dateFilter === p.key ? 'active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {dateFilter === 'custom' && (
          <div className="custom-date-inputs">
            <div className="date-input-group">
              <label>From:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="date-input"
              />
            </div>
            <div className="date-input-group">
              <label>To:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="date-input"
              />
            </div>
          </div>
        )}
      </div>

      {/* Analytics Metric Cards */}
      <div className="ocr-stats-grid">
        <div className="stat-card">
          <div className="stat-icon jobs-icon"><Layers size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">Total Filtered Jobs</span>
            <span className="stat-value">{stats.total}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success-icon"><CheckCircle2 size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">Success Rate</span>
            <span className="stat-value">{stats.successRate}% <span className="stat-sub">({stats.doneCount} ok / {stats.failedCount} fail)</span></span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon input-token-icon"><ArrowDownRight size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">Input Tokens</span>
            <span className="stat-value">{(stats.totalInputTokens / 1000).toFixed(1)}k</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon output-token-icon"><ArrowUpRight size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">Output Tokens</span>
            <span className="stat-value">{(stats.totalOutputTokens / 1000).toFixed(1)}k</span>
          </div>
        </div>
        <div className="stat-card hero-cost-card">
          <div className="stat-icon cost-icon"><Coins size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">Total AI Cost ({currency})</span>
            <span className="stat-value cost-highlight">{formatCost(stats.totalCostUSD)}</span>
          </div>
        </div>
      </div>

      {/* Top 4 Analytics & Daily Cost Ledger Section */}
      <div className="top4-analytics-section">
        <div className="analytics-tabs-header">
          <button
            className={`analytics-tab ${activeAnalyticsTab === 'top_users' ? 'active' : ''}`}
            onClick={() => setActiveAnalyticsTab('top_users')}
          >
            <User size={15} /> Top 4 Users by Cost
          </button>
          <button
            className={`analytics-tab ${activeAnalyticsTab === 'top_lobbies' ? 'active' : ''}`}
            onClick={() => setActiveAnalyticsTab('top_lobbies')}
          >
            <Trophy size={15} /> Top 4 Lobbies by Cost
          </button>
          <button
            className={`analytics-tab ${activeAnalyticsTab === 'job_types' ? 'active' : ''}`}
            onClick={() => setActiveAnalyticsTab('job_types')}
          >
            <BarChart3 size={15} /> Job Type Split
          </button>
          <button
            className={`analytics-tab ${activeAnalyticsTab === 'daily_ledger' ? 'active' : ''}`}
            onClick={() => setActiveAnalyticsTab('daily_ledger')}
          >
            <Calendar size={15} /> Daily Cost Ledger ({dailyCostLedger.length} days)
          </button>
        </div>

        <div className="analytics-tab-content">
          {/* Top 4 Users */}
          {activeAnalyticsTab === 'top_users' && (
            <div className="top4-grid">
              {top4Users.length === 0 ? (
                <div className="empty-state"><p>No user cost records for this filter period.</p></div>
              ) : (
                top4Users.map((item, idx) => (
                  <div key={item.userId} className={`top4-card rank-${idx + 1}`}>
                    <div className="rank-badge">#{idx + 1}</div>
                    <div className="top4-card-header">
                      <span className="top4-user-name">
                        {item.profile?.display_name || item.profile?.username || 'Unknown User'}
                      </span>
                      <span className="top4-user-email">{item.profile?.emails || item.userId.slice(0, 8)}</span>
                    </div>
                    <div className="top4-card-metrics">
                      <div className="metric-row">
                        <span className="lbl"><Layers size={13} /> Jobs Executed:</span>
                        <span className="val">{item.jobCount}</span>
                      </div>
                      <div className="metric-row">
                        <span className="lbl"><ArrowDownRight size={13} /> Input Tokens:</span>
                        <span className="val">{item.inputTokens.toLocaleString()}</span>
                      </div>
                      <div className="metric-row">
                        <span className="lbl"><ArrowUpRight size={13} /> Output Tokens:</span>
                        <span className="val">{item.outputTokens.toLocaleString()}</span>
                      </div>
                      <div className="metric-row cost-row">
                        <span className="lbl"><Coins size={13} /> Total Cost ({currency}):</span>
                        <span className="val cost-val">{formatCost(item.totalCostUSD)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Top 4 Lobbies */}
          {activeAnalyticsTab === 'top_lobbies' && (
            <div className="top4-grid">
              {top4Lobbies.length === 0 ? (
                <div className="empty-state"><p>No lobby cost records for this filter period.</p></div>
              ) : (
                top4Lobbies.map((item, idx) => (
                  <div key={item.lobbyId} className={`top4-card rank-${idx + 1}`}>
                    <div className="rank-badge">#{idx + 1}</div>
                    <div className="top4-card-header">
                      <span className="top4-user-name">
                        {item.lobby?.name || 'Unnamed Lobby'}
                      </span>
                      <span className="top4-user-email">Game: {item.lobby?.game || 'N/A'} • ID: {item.lobbyId.slice(0, 8)}</span>
                    </div>
                    <div className="top4-card-metrics">
                      <div className="metric-row">
                        <span className="lbl"><Layers size={13} /> OCR Requests:</span>
                        <span className="val">{item.jobCount}</span>
                      </div>
                      <div className="metric-row">
                        <span className="lbl"><ArrowDownRight size={13} /> Input Tokens:</span>
                        <span className="val">{item.inputTokens.toLocaleString()}</span>
                      </div>
                      <div className="metric-row">
                        <span className="lbl"><ArrowUpRight size={13} /> Output Tokens:</span>
                        <span className="val">{item.outputTokens.toLocaleString()}</span>
                      </div>
                      <div className="metric-row cost-row">
                        <span className="lbl"><Coins size={13} /> Lobby AI Cost ({currency}):</span>
                        <span className="val cost-val">{formatCost(item.totalCostUSD)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Job Type Split */}
          {activeAnalyticsTab === 'job_types' && (
            <div className="job-types-split-grid">
              {jobTypeSplit.map(split => (
                <div key={split.type} className={`split-card type-${split.type}`}>
                  <div className="split-header">
                    {split.type === 'extract_results' ? <FileText size={20} /> : <Cpu size={20} />}
                    <h4>{split.label}</h4>
                  </div>
                  <div className="split-metrics">
                    <div className="split-metric">
                      <span className="label">Executions</span>
                      <span className="value">{split.jobs}</span>
                    </div>
                    <div className="split-metric">
                      <span className="label">Input Tokens</span>
                      <span className="value">{(split.inputTokens / 1000).toFixed(1)}k</span>
                    </div>
                    <div className="split-metric">
                      <span className="label">Output Tokens</span>
                      <span className="value">{(split.outputTokens / 1000).toFixed(1)}k</span>
                    </div>
                    <div className="split-metric highlight">
                      <span className="label">Total Cost ({currency})</span>
                      <span className="value cost">{formatCost(split.costUSD)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Daily Cost Ledger */}
          {activeAnalyticsTab === 'daily_ledger' && (
            <div className="daily-ledger-container">
              {dailyCostLedger.length === 0 ? (
                <div className="empty-state"><p>No daily cost entries for this filter period.</p></div>
              ) : (
                <table className="users-table ledger-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Jobs Run</th>
                      <th>Success / Failed</th>
                      <th>Input Tokens</th>
                      <th>Output Tokens</th>
                      <th>Total Cost ({currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyCostLedger.map(day => (
                      <tr key={day.date}>
                        <td className="date-cell">
                          <Calendar size={13} /> {new Date(day.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>
                        <td><strong>{day.jobsCount}</strong> jobs</td>
                        <td>
                          <span className="status-pill ok"><CheckCircle2 size={11} /> {day.doneCount}</span>
                          {day.failedCount > 0 && <span className="status-pill err"><XCircle size={11} /> {day.failedCount}</span>}
                        </td>
                        <td>{day.inputTokens.toLocaleString()} in</td>
                        <td>{day.outputTokens.toLocaleString()} out</td>
                        <td className="cost-cell">{formatCost(day.totalCostUSD)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filter Controls & OpenRouter Model Selector */}
      <div className="ocr-filter-bar">
        <div className="search-bar flex-1">
          <div className="search-icon-wrapper"><Search size={18} /></div>
          <input
            type="text"
            placeholder="Search by Job ID, Lobby ID, User, or Error..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              <XCircle size={18} />
            </button>
          )}
        </div>

        {/* OpenRouter Model Selection Preset */}
        <div className="filter-group openrouter-preset">
          <label className="filter-label"><Server size={14} /> OpenRouter Model Rate:</label>
          <select
            className="filter-select openrouter-select"
            value={selectedModelId}
            onChange={e => setSelectedModelId(e.target.value)}
          >
            {openRouterModels.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} ({formatRate(m.inputRate)} in / {formatRate(m.outputRate)} out per 1M)
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Job Type:</label>
          <select
            className="filter-select"
            value={jobTypeFilter}
            onChange={e => setJobTypeFilter(e.target.value)}
          >
            <option value="all">All Types ({jobs.length})</option>
            <option value="extract_results">extract_results ({stats.extractResultsCount})</option>
            <option value="process_lobby">process_lobby ({stats.processLobbyCount})</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Status:</label>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="done">Done ({stats.doneCount})</option>
            <option value="failed">Failed ({stats.failedCount})</option>
          </select>
        </div>
      </div>

      {/* Active Model Indicator Banner */}
      <div className="openrouter-active-banner">
        <Sparkles size={14} />
        <span>Calculated in <strong>{currency === 'INR' ? 'INR (₹)' : 'USD ($)'}</strong> via OpenRouter ({currentModelConfig.name}): {formatRate(currentModelConfig.inputRate)} / 1M Input Tokens • {formatRate(currentModelConfig.outputRate)} / 1M Output Tokens {currency === 'INR' ? `• (Exchange rate: ₹${inrRate.toFixed(2)} per $1 USD)` : ''}</span>
      </div>

      {/* Jobs Table with Explicit Input/Output Tokens & Cost Columns */}
      <div className="jobs-table-container">
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading OCR jobs...</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="empty-state">
            <p>{searchQuery || jobTypeFilter !== 'all' || statusFilter !== 'all' || dateFilter !== 'all' ? 'No jobs match your search/filter criteria' : 'No OCR jobs recorded yet'}</p>
          </div>
        ) : (
          <table className="users-table ocr-table">
            <thead>
              <tr>
                <th>Job Type</th>
                <th>Status</th>
                <th>Lobby</th>
                <th>User / Organizer</th>
                <th>Input Tokens</th>
                <th>Output Tokens</th>
                <th>Cost ({currency === 'INR' ? '₹' : '$'})</th>
                <th>Created At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map(job => {
                const profile = profilesMap[job.user_id]
                const lobby = lobbiesMap[job.lobby_id]
                const isFailed = job.status === 'failed'
                const imagesCount = Array.isArray(job.image_urls) ? job.image_urls.length : 0

                const inputTokens = job.token_usage?.input_tokens || 0
                const outputTokens = job.token_usage?.output_tokens || 0
                const jobCostUSD = calculateJobCostUSD(job.token_usage, currentModelConfig)

                return (
                  <tr key={job.id} className={isFailed ? 'row-failed' : ''}>
                    <td>
                      <span className={`job-type-chip chip-${job.job_type}`}>
                        {job.job_type === 'extract_results' ? <FileText size={13} /> : <Cpu size={13} />}
                        {job.job_type}
                      </span>
                    </td>
                    <td>
                      <span className={`job-status-chip status-${job.status}`}>
                        {job.status === 'done' && <CheckCircle2 size={13} />}
                        {job.status === 'failed' && <AlertTriangle size={13} />}
                        {job.status === 'processing' && <Clock size={13} />}
                        {job.status}
                      </span>
                    </td>
                    <td>
                      <div className="cell-lobby">
                        <span className="lobby-name">{lobby?.name || 'Unnamed Lobby'}</span>
                        <span className="cell-sub"><Trophy size={11} /> {job.lobby_id ? job.lobby_id.slice(0, 8) + '...' : 'N/A'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-user">
                        <span className="user-name">{profile?.display_name || profile?.username || 'Unknown User'}</span>
                        <span className="cell-sub">{profile?.emails || (job.user_id ? job.user_id.slice(0, 8) + '...' : 'N/A')}</span>
                      </div>
                    </td>
                    <td>
                      <span className="token-pill pill-input">
                        <ArrowDownRight size={11} /> {inputTokens.toLocaleString()} in
                      </span>
                    </td>
                    <td>
                      <span className="token-pill pill-output">
                        <ArrowUpRight size={11} /> {outputTokens.toLocaleString()} out
                      </span>
                    </td>
                    <td>
                      <span className="token-pill pill-cost">
                        {formatCost(jobCostUSD)}
                      </span>
                    </td>
                    <td className="cell-time">
                      {new Date(job.created_at).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                      })}
                    </td>
                    <td>
                      <button
                        className="view-job-button"
                        onClick={() => setSelectedJob(job)}
                      >
                        <Eye size={15} /> Inspect
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Inspector for Selected Job */}
      {selectedJob && (
        <div className="modal-overlay" onClick={() => setSelectedJob(null)}>
          <div className="modal-dialog ocr-job-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <span className={`job-type-chip chip-${selectedJob.job_type}`}>
                  {selectedJob.job_type === 'extract_results' ? <FileText size={14} /> : <Cpu size={14} />}
                  {selectedJob.job_type}
                </span>
                <h3>Job Details</h3>
                <span className={`job-status-chip status-${selectedJob.status}`}>
                  {selectedJob.status}
                </span>
              </div>
              <button className="close-button" onClick={() => setSelectedJob(null)}>
                <XCircle size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* Meta Grid */}
              <div className="job-meta-grid">
                <div className="meta-item">
                  <span className="meta-label">Job ID</span>
                  <span className="meta-value code-font">{selectedJob.id}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Lobby ID</span>
                  <span className="meta-value code-font">
                    {lobbiesMap[selectedJob.lobby_id]?.name ? `${lobbiesMap[selectedJob.lobby_id].name} (${selectedJob.lobby_id})` : selectedJob.lobby_id || 'N/A'}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">User ID</span>
                  <span className="meta-value code-font">
                    {profilesMap[selectedJob.user_id]?.display_name ? `${profilesMap[selectedJob.user_id].display_name} (${selectedJob.user_id})` : selectedJob.user_id || 'N/A'}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Created At</span>
                  <span className="meta-value">{new Date(selectedJob.created_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Error Traceback Block */}
              {selectedJob.error && (
                <div className="job-error-block">
                  <div className="error-header">
                    <span><AlertTriangle size={16} /> Error Execution Stack</span>
                    <button
                      className="copy-btn"
                      onClick={() => copyToClipboard(selectedJob.error)}
                    >
                      <Copy size={13} /> {copied ? 'Copied!' : 'Copy Error'}
                    </button>
                  </div>
                  <pre className="error-code">{selectedJob.error}</pre>
                </div>
              )}

              {/* Explicit Token Usage & Cost Breakdown Card in INR */}
              <div className="token-usage-card">
                <h4><Coins size={16} /> Token Consumption & OpenRouter Cost Breakdown ({currency})</h4>
                <div className="token-stats-row">
                  <div className="token-stat">
                    <span className="lbl"><ArrowDownRight size={12} /> Input Tokens</span>
                    <span className="val color-input">{(selectedJob.token_usage?.input_tokens || 0).toLocaleString()}</span>
                  </div>
                  <div className="token-stat">
                    <span className="lbl"><ArrowUpRight size={12} /> Output Tokens</span>
                    <span className="val color-output">{(selectedJob.token_usage?.output_tokens || 0).toLocaleString()}</span>
                  </div>
                  <div className="token-stat">
                    <span className="lbl"><Layers size={12} /> Total Tokens</span>
                    <span className="val">{(selectedJob.token_usage?.total_tokens || ((selectedJob.token_usage?.input_tokens || 0) + (selectedJob.token_usage?.output_tokens || 0))).toLocaleString()}</span>
                  </div>
                  <div className="token-stat">
                    <span className="lbl"><Coins size={12} /> Total Cost ({currency})</span>
                    <span className="val color-cost">{formatCost(calculateJobCostUSD(selectedJob.token_usage, currentModelConfig))}</span>
                  </div>
                </div>
                <div className="token-rate-note">
                  <Info size={12} /> OpenRouter Model ({currentModelConfig.name}): {formatRate(currentModelConfig.inputRate)} / 1M Input • {formatRate(currentModelConfig.outputRate)} / 1M Output {currency === 'INR' ? `(Exchange rate: ₹${inrRate.toFixed(2)} per $1 USD)` : ''}
                </div>
              </div>

              {/* Image URLs Gallery */}
              {Array.isArray(selectedJob.image_urls) && selectedJob.image_urls.length > 0 && (
                <div className="job-images-section">
                  <h4><ImageIcon size={16} /> Submitted Scoreboard Screenshots ({selectedJob.image_urls.length})</h4>
                  <div className="image-urls-grid">
                    {selectedJob.image_urls.map((imgUrl, idx) => (
                      <a
                        key={idx}
                        href={imgUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="image-url-card"
                      >
                        <ImageIcon size={16} />
                        <span className="url-text">{imgUrl}</span>
                        <ChevronRight size={14} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Result JSON Payload */}
              <div className="job-payload-section">
                <div className="payload-header">
                  <h4><Layers size={16} /> Extracted Result Payload</h4>
                  <button
                    className="copy-btn"
                    onClick={() => copyToClipboard(formatJSON(selectedJob.result))}
                  >
                    <Copy size={13} /> Copy JSON
                  </button>
                </div>
                <pre className="json-pre">{formatJSON(selectedJob.result || {})}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OCRJobsView

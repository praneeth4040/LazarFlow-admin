import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Cpu, FileText, CheckCircle2, AlertTriangle, Clock,
  Search, XCircle, RefreshCcw, Eye, Layers, Coins,
  Image as ImageIcon, ArrowDownRight, ArrowUpRight, Copy,
  ChevronRight, User, Trophy, Info, Server, Calendar,
  BarChart3, X,
} from 'lucide-react'
import './OCRJobsView.css'

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

// All job_type values the backend writes to ocr_jobs (routes/ocr.py):
// the two v3 async pipelines, their legacy sync counterparts, and extract_teams.
export const JOB_TYPES = [
  { type: 'extract_results_v3', label: 'Extract Results v3', family: 'extract' },
  { type: 'extract_results',    label: 'Extract Results (legacy)', family: 'extract' },
  { type: 'process_lobby_v3',   label: 'Process Lobby v3', family: 'lobby' },
  { type: 'process_lobby',      label: 'Process Lobby (legacy)', family: 'lobby' },
  { type: 'extract_teams',      label: 'Extract Teams', family: 'teams' },
]
const jobTypeLabel = (t) => JOB_TYPES.find(j => j.type === t)?.label || t

// Statuses the backend actually writes (database_service/ocr_jobs.py)
const JOB_STATUSES = ['done', 'failed', 'running', 'pending']

// Helper to calculate job cost in USD.
// Ground truth first: the engine-stamped cost_usd. Then the job's OWN model
// priced from the live OpenRouter rate map. The admin-selected model is only
// the last-resort estimate for legacy rows that carry no model stamp.
const calculateJobCostUSD = (tokenUsage, modelConfig, modelRates = {}) => {
  if (!tokenUsage) return 0
  if (tokenUsage.cost_usd && tokenUsage.cost_usd > 0) return tokenUsage.cost_usd

  const input = tokenUsage.input_tokens || 0
  const output = tokenUsage.output_tokens || 0

  const rates = modelRates[tokenUsage.model] || modelConfig || {}
  const inputRate = rates.inputRate ?? 0.13
  const outputRate = rates.outputRate ?? 0.52

  return (input / 1_000_000) * inputRate + (output / 1_000_000) * outputRate
}

const kTokens = (value) => `${(value / 1000).toFixed(1)}k`

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
  // id → {inputRate, outputRate} for EVERY model OpenRouter lists — lets us
  // price each job at its own stamped model instead of the admin-selected one
  const [modelRates, setModelRates] = useState({})

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
        setModelRates(liveMap)
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
    // Families mirror the backend's real job_type values (all 5 of them)
    const extractResultsCount = filteredJobs.filter(j => j.job_type?.startsWith('extract_results')).length
    const processLobbyCount = filteredJobs.filter(j => j.job_type?.startsWith('process_lobby')).length
    const extractTeamsCount = filteredJobs.filter(j => j.job_type === 'extract_teams').length
    const doneCount = filteredJobs.filter(j => j.status === 'done').length
    const failedCount = filteredJobs.filter(j => j.status === 'failed').length
    const runningCount = filteredJobs.filter(j => j.status === 'running').length
    const pendingCount = filteredJobs.filter(j => j.status === 'pending').length
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
        totalCostUSD += calculateJobCostUSD(j.token_usage, currentModelConfig, modelRates)
      }
    })

    return {
      total,
      extractResultsCount,
      processLobbyCount,
      extractTeamsCount,
      doneCount,
      failedCount,
      runningCount,
      pendingCount,
      successRate,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalCostUSD,
    }
  }, [filteredJobs, currentModelConfig, modelRates])

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
        map[uid].totalCostUSD += calculateJobCostUSD(j.token_usage, currentModelConfig, modelRates)
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
        map[lid].totalCostUSD += calculateJobCostUSD(j.token_usage, currentModelConfig, modelRates)
      }
    })

    return Object.values(map)
      .sort((a, b) => b.totalCostUSD - a.totalCostUSD)
      .slice(0, 4)
  }, [filteredJobs, lobbiesMap, currentModelConfig])

  // Job Type Breakdown Split — one bucket per job_type the backend actually
  // writes (extract_results_v3 / extract_results / process_lobby_v3 /
  // process_lobby / extract_teams), unknown types included rather than
  // silently folded into another bucket.
  const jobTypeSplit = useMemo(() => {
    const map = new Map()
    filteredJobs.forEach(j => {
      const type = j.job_type || 'unknown'
      if (!map.has(type)) {
        map.set(type, { type, label: jobTypeLabel(type), jobs: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 })
      }
      const target = map.get(type)
      target.jobs += 1
      if (j.token_usage) {
        target.inputTokens += j.token_usage.input_tokens || 0
        target.outputTokens += j.token_usage.output_tokens || 0
        target.costUSD += calculateJobCostUSD(j.token_usage, currentModelConfig, modelRates)
      }
    })
    const known = JOB_TYPES.map(j => j.type)
    return [...map.values()].sort(
      (a, b) => (known.indexOf(a.type) + 1 || 99) - (known.indexOf(b.type) + 1 || 99)
    )
  }, [filteredJobs, currentModelConfig, modelRates])

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
        map[dateKey].totalCostUSD += calculateJobCostUSD(j.token_usage, currentModelConfig, modelRates)
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

  const cards = [
    {
      key: 'total',
      label: 'Filtered jobs',
      value: stats.total.toLocaleString('en-IN'),
      meta: `${stats.extractResultsCount} extract · ${stats.processLobbyCount} lobby · ${stats.extractTeamsCount} teams`,
      icon: Layers,
      tone: 'violet',
    },
    {
      key: 'success',
      label: 'Success rate',
      value: `${stats.successRate}%`,
      meta: `${stats.doneCount} ok · ${stats.failedCount} failed`,
      icon: CheckCircle2,
      tone: 'green',
    },
    {
      key: 'input',
      label: 'Input tokens',
      value: kTokens(stats.totalInputTokens),
      meta: 'Prompt tokens across all jobs',
      icon: ArrowDownRight,
      tone: 'blue',
    },
    {
      key: 'output',
      label: 'Output tokens',
      value: kTokens(stats.totalOutputTokens),
      meta: 'Completion tokens returned',
      icon: ArrowUpRight,
      tone: 'teal',
    },
    {
      key: 'cost',
      label: `Total AI cost (${currency})`,
      value: formatCost(stats.totalCostUSD),
      meta: `${currentModelConfig.name.split('(')[0].trim()}`,
      icon: Coins,
      tone: 'amber',
      title: `Estimated with ${currentModelConfig.name}: ${formatRate(currentModelConfig.inputRate)} per 1M input, ${formatRate(currentModelConfig.outputRate)} per 1M output${currency === 'INR' ? ` · exchange rate ₹${inrRate.toFixed(2)}/USD` : ''}.`,
    },
  ]

  const ANALYTICS_TABS = [
    { key: 'top_users', label: 'Top 4 Users', icon: User },
    { key: 'top_lobbies', label: 'Top 4 Lobbies', icon: Trophy },
    { key: 'job_types', label: 'Job Type Split', icon: BarChart3 },
    { key: 'daily_ledger', label: `Daily Ledger (${dailyCostLedger.length})`, icon: Calendar },
  ]

  return (
    <div className="job-page">
      {/* ── Hero ── */}
      <section className="job-hero" aria-labelledby="job-title">
        <header className="job-hero-head">
          <div>
            <span className="job-eyebrow"><Cpu size={12} /> AI compute</span>
            <h1 id="job-title" className="job-title">OCR Jobs</h1>
            <p className="job-subtitle">
              Extraction and lobby-processing runs, token usage and OpenRouter cost reporting.
            </p>
          </div>
          <div className="job-head-actions">
            <span className={`job-live ${loading ? 'is-refreshing' : ''}`}>
              <span className="job-live-dot" aria-hidden="true" />
              {loading ? 'Syncing…' : `${jobs.length.toLocaleString('en-IN')} jobs indexed`}
            </span>
            <button type="button" className="job-action" onClick={() => setCurrency(c => c === 'INR' ? 'USD' : 'INR')} title="Switch currency">
              <Coins size={14} /> {currency === 'INR' ? '₹ INR' : '$ USD'}
            </button>
            <button type="button" className="job-action" onClick={fetchJobs} disabled={loading}>
              <RefreshCcw size={14} className={loading ? 'job-spin' : ''} /> Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="job-error" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button type="button" className="job-retry" onClick={fetchJobs}>
              <RefreshCcw size={13} /> Retry
            </button>
          </div>
        )}

        <div className="job-kpi-grid" aria-live="polite">
          {cards.map(({ key, label, value, meta, icon, tone, title }) => {
            const Icon = icon
            return (
              <div key={key} className="job-kpi" title={title}>
                <span className="job-kpi-top">
                  <span className={`job-kpi-icon ${tone}`}><Icon size={18} /></span>
                  <span className="job-kpi-label">{label}</span>
                </span>
                <span className="job-kpi-value">{value}</span>
                <span className="job-kpi-meta">{meta}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Date range ── */}
      <section className="job-panel" aria-label="Date filter">
        <header className="job-panel-head">
          <h2 className="job-panel-title"><Calendar size={14} /> Date range</h2>
          {dateFilter === 'custom' && (
            <div className="job-custom-dates">
              <label>
                <span>From</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="job-date-input"
                />
              </label>
              <label>
                <span>To</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="job-date-input"
                />
              </label>
            </div>
          )}
        </header>
        <div className="job-date-pills">
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
              type="button"
              onClick={() => setDateFilter(p.key)}
              className={`job-date-pill ${dateFilter === p.key ? 'active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Analytics ── */}
      <section className="job-panel" aria-label="Cost analytics">
        <header className="job-panel-head">
          <h2 className="job-panel-title"><BarChart3 size={14} /> Cost analytics</h2>
          <nav className="job-tabs" aria-label="Analytics sections">
            {ANALYTICS_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                className={`job-tab ${activeAnalyticsTab === key ? 'active' : ''}`}
                onClick={() => setActiveAnalyticsTab(key)}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </nav>
        </header>

        <div className="job-tab-body">
          {/* Top 4 Users */}
          {activeAnalyticsTab === 'top_users' && (
            <div className="job-rank-grid">
              {top4Users.length === 0 ? (
                <p className="job-empty">No user cost records for this filter period.</p>
              ) : (
                top4Users.map((item, idx) => (
                  <div key={item.userId} className={`job-rank-card rank-${idx + 1}`}>
                    <div className="job-rank-head">
                      <span className="job-rank-badge">#{idx + 1}</span>
                      <div className="job-rank-name-wrap">
                        <span className="job-rank-name">
                          {item.profile?.display_name || item.profile?.username || 'Unknown User'}
                        </span>
                        <span className="job-rank-sub">{item.profile?.emails || item.userId.slice(0, 8)}</span>
                      </div>
                      <span className="job-rank-cost">{formatCost(item.totalCostUSD)}</span>
                    </div>
                    <div className="job-rank-metrics">
                      <span><Layers size={12} /> {item.jobCount} jobs</span>
                      <span><ArrowDownRight size={12} /> {item.inputTokens.toLocaleString()} in</span>
                      <span><ArrowUpRight size={12} /> {item.outputTokens.toLocaleString()} out</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Top 4 Lobbies */}
          {activeAnalyticsTab === 'top_lobbies' && (
            <div className="job-rank-grid">
              {top4Lobbies.length === 0 ? (
                <p className="job-empty">No lobby cost records for this filter period.</p>
              ) : (
                top4Lobbies.map((item, idx) => (
                  <div key={item.lobbyId} className={`job-rank-card rank-${idx + 1}`}>
                    <div className="job-rank-head">
                      <span className="job-rank-badge">#{idx + 1}</span>
                      <div className="job-rank-name-wrap">
                        <span className="job-rank-name">{item.lobby?.name || 'Unnamed Lobby'}</span>
                        <span className="job-rank-sub">{item.lobby?.game || 'N/A'} · {item.lobbyId.slice(0, 8)}</span>
                      </div>
                      <span className="job-rank-cost">{formatCost(item.totalCostUSD)}</span>
                    </div>
                    <div className="job-rank-metrics">
                      <span><Layers size={12} /> {item.jobCount} OCR requests</span>
                      <span><ArrowDownRight size={12} /> {item.inputTokens.toLocaleString()} in</span>
                      <span><ArrowUpRight size={12} /> {item.outputTokens.toLocaleString()} out</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Job Type Split */}
          {activeAnalyticsTab === 'job_types' && (
            <div className="job-split-grid">
              {jobTypeSplit.map(split => (
                <div key={split.type} className="job-split-card">
                  <div className="job-split-head">
                    <span className="job-split-icon">
                      {split.type.startsWith('extract') ? <FileText size={16} /> : <Cpu size={16} />}
                    </span>
                    <div>
                      <h4>{split.label}</h4>
                      <span className="job-split-sub">{split.type}</span>
                    </div>
                    <span className="job-rank-cost">{formatCost(split.costUSD)}</span>
                  </div>
                  <div className="job-split-metrics">
                    <div className="job-split-metric">
                      <span>Executions</span>
                      <strong>{split.jobs}</strong>
                    </div>
                    <div className="job-split-metric">
                      <span>Input tokens</span>
                      <strong>{kTokens(split.inputTokens)}</strong>
                    </div>
                    <div className="job-split-metric">
                      <span>Output tokens</span>
                      <strong>{kTokens(split.outputTokens)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Daily Cost Ledger */}
          {activeAnalyticsTab === 'daily_ledger' && (
            <div className="job-ledger">
              {dailyCostLedger.length === 0 ? (
                <p className="job-empty">No daily cost entries for this filter period.</p>
              ) : (
                <table className="users-table job-ledger-table">
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
                        <td className="job-date-cell">
                          <Calendar size={13} /> {new Date(day.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>
                        <td><strong>{day.jobsCount}</strong></td>
                        <td>
                          <span className="job-mini-pill ok"><CheckCircle2 size={11} /> {day.doneCount}</span>
                          {day.failedCount > 0 && <span className="job-mini-pill err"><XCircle size={11} /> {day.failedCount}</span>}
                        </td>
                        <td>{day.inputTokens.toLocaleString()}</td>
                        <td>{day.outputTokens.toLocaleString()}</td>
                        <td className="job-cost-cell">{formatCost(day.totalCostUSD)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Jobs table ── */}
      <section className="job-panel" aria-label="OCR jobs">
        <header className="job-panel-head">
          <h2 className="job-panel-title"><Layers size={14} /> Job log</h2>
          <span className="job-panel-hint">{filteredJobs.length.toLocaleString('en-IN')} of {jobs.length.toLocaleString('en-IN')} jobs</span>
        </header>

        <div className="job-filter-bar">
          <div className="job-search">
            <Search size={15} className="job-search-icon" />
            <input
              type="text"
              placeholder="Search by job ID, lobby ID, user, or error…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" className="job-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="job-filter-group">
            <label className="job-filter-label"><Server size={12} /> Model rate</label>
            <select
              className="job-select"
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

          <div className="job-filter-group">
            <label className="job-filter-label">Job type</label>
            <select
              className="job-select"
              value={jobTypeFilter}
              onChange={e => setJobTypeFilter(e.target.value)}
            >
              <option value="all">All types ({jobs.length})</option>
              {JOB_TYPES.map(jt => (
                <option key={jt.type} value={jt.type}>
                  {jt.type} ({jobs.filter(j => j.job_type === jt.type).length})
                </option>
              ))}
            </select>
          </div>

          <div className="job-filter-group">
            <label className="job-filter-label">Status</label>
            <select
              className="job-select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              {JOB_STATUSES.map(s => (
                <option key={s} value={s}>{s} ({jobs.filter(j => j.status === s).length})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="job-model-note">
          <Info size={13} />
          <span>
            Calculated in <strong>{currency === 'INR' ? 'INR (₹)' : 'USD ($)'}</strong> via OpenRouter ({currentModelConfig.name}):
            {' '}{formatRate(currentModelConfig.inputRate)} / 1M input · {formatRate(currentModelConfig.outputRate)} / 1M output
            {currency === 'INR' ? ` · exchange rate ₹${inrRate.toFixed(2)} per $1 USD` : ''}
            {livePricingLoaded ? ' · live pricing' : ''}
          </span>
        </div>

        {loading ? (
          <div className="job-loading">
            <div className="job-spinner" />
            <p>Loading OCR jobs…</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <p className="job-empty">
            {searchQuery || jobTypeFilter !== 'all' || statusFilter !== 'all' || dateFilter !== 'all'
              ? 'No jobs match your search/filter criteria'
              : 'No OCR jobs recorded yet'}
          </p>
        ) : (
          <div className="job-table-wrap">
            <table className="users-table job-table">
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

                  const inputTokens = job.token_usage?.input_tokens || 0
                  const outputTokens = job.token_usage?.output_tokens || 0
                  const jobCostUSD = calculateJobCostUSD(job.token_usage, currentModelConfig)

                  return (
                    <tr key={job.id} className={isFailed ? 'row-failed' : ''}>
                      <td>
                        <span className={`job-type-chip chip-${job.job_type}`}>
                          {job.job_type === 'extract_results' ? <FileText size={12} /> : <Cpu size={12} />}
                          {job.job_type}
                        </span>
                      </td>
                      <td>
                        <span className={`job-status-chip status-${job.status}`}>
                          {job.status === 'done' && <CheckCircle2 size={12} />}
                          {job.status === 'failed' && <AlertTriangle size={12} />}
                          {(job.status === 'running' || job.status === 'pending') && <Clock size={12} />}
                          {job.status}
                        </span>
                      </td>
                      <td>
                        <div className="job-cell-stack">
                          <span className="job-cell-name">{lobby?.name || 'Unnamed Lobby'}</span>
                          <span className="job-cell-sub">{job.lobby_id ? job.lobby_id.slice(0, 8) + '…' : 'N/A'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="job-cell-stack">
                          <span className="job-cell-name">{profile?.display_name || profile?.username || 'Unknown User'}</span>
                          <span className="job-cell-sub">{profile?.emails || (job.user_id ? job.user_id.slice(0, 8) + '…' : 'N/A')}</span>
                        </div>
                      </td>
                      <td>
                        <span className="job-token-pill in"><ArrowDownRight size={11} /> {inputTokens.toLocaleString()}</span>
                      </td>
                      <td>
                        <span className="job-token-pill out"><ArrowUpRight size={11} /> {outputTokens.toLocaleString()}</span>
                      </td>
                      <td>
                        <span className="job-token-pill cost">{formatCost(jobCostUSD)}</span>
                      </td>
                      <td className="job-time-cell">
                        {new Date(job.created_at).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                        })}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="job-inspect-btn"
                          onClick={() => setSelectedJob(job)}
                        >
                          <Eye size={14} /> Inspect
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Modal Inspector for Selected Job ── */}
      {selectedJob && (
        <div className="modal-overlay" onClick={() => setSelectedJob(null)}>
          <div className="job-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="job-modal-head">
              <div className="job-modal-title">
                <span className={`job-type-chip chip-${selectedJob.job_type}`}>
                  {selectedJob.job_type === 'extract_results' ? <FileText size={12} /> : <Cpu size={12} />}
                  {selectedJob.job_type}
                </span>
                <h3>Job details</h3>
                <span className={`job-status-chip status-${selectedJob.status}`}>
                  {selectedJob.status}
                </span>
              </div>
              <button type="button" className="job-modal-close" onClick={() => setSelectedJob(null)} aria-label="Close job details">
                <X size={18} />
              </button>
            </div>

            <div className="job-modal-body">
              {/* Meta Grid */}
              <div className="job-meta-grid">
                <div className="job-meta-item">
                  <span>Job ID</span>
                  <strong className="is-mono">{selectedJob.id}</strong>
                </div>
                <div className="job-meta-item">
                  <span>Lobby ID</span>
                  <strong className="is-mono">
                    {lobbiesMap[selectedJob.lobby_id]?.name ? `${lobbiesMap[selectedJob.lobby_id].name} (${selectedJob.lobby_id})` : selectedJob.lobby_id || 'N/A'}
                  </strong>
                </div>
                <div className="job-meta-item">
                  <span>User ID</span>
                  <strong className="is-mono">
                    {profilesMap[selectedJob.user_id]?.display_name ? `${profilesMap[selectedJob.user_id].display_name} (${selectedJob.user_id})` : selectedJob.user_id || 'N/A'}
                  </strong>
                </div>
                <div className="job-meta-item">
                  <span>Created At</span>
                  <strong>{new Date(selectedJob.created_at).toLocaleString()}</strong>
                </div>
              </div>

              {/* Error Traceback Block */}
              {selectedJob.error && (
                <div className="job-error-block">
                  <div className="job-error-head">
                    <span><AlertTriangle size={14} /> Error execution stack</span>
                    <button type="button" className="job-copy-btn" onClick={() => copyToClipboard(selectedJob.error)}>
                      <Copy size={12} /> {copied ? 'Copied!' : 'Copy error'}
                    </button>
                  </div>
                  <pre>{selectedJob.error}</pre>
                </div>
              )}

              {/* Token Usage & Cost Breakdown */}
              <div className="job-usage-card">
                <h4><Coins size={14} /> Token consumption &amp; cost breakdown ({currency})</h4>
                <div className="job-usage-stats">
                  <div className="job-usage-stat">
                    <span><ArrowDownRight size={12} /> Input</span>
                    <strong className="tone-in">{(selectedJob.token_usage?.input_tokens || 0).toLocaleString()}</strong>
                  </div>
                  <div className="job-usage-stat">
                    <span><ArrowUpRight size={12} /> Output</span>
                    <strong className="tone-out">{(selectedJob.token_usage?.output_tokens || 0).toLocaleString()}</strong>
                  </div>
                  <div className="job-usage-stat">
                    <span><Layers size={12} /> Total</span>
                    <strong>{(selectedJob.token_usage?.total_tokens || ((selectedJob.token_usage?.input_tokens || 0) + (selectedJob.token_usage?.output_tokens || 0))).toLocaleString()}</strong>
                  </div>
                  <div className="job-usage-stat">
                    <span><Coins size={12} /> Cost</span>
                    <strong className="tone-cost">{formatCost(calculateJobCostUSD(selectedJob.token_usage, currentModelConfig, modelRates))}</strong>
                  </div>
                </div>
                <div className="job-usage-note">
                  <Info size={12} />
                  <span>
                    {selectedJob.token_usage?.cost_usd > 0
                      ? <>Engine-stamped cost from OpenRouter{selectedJob.token_usage?.model ? <> (model <strong>{selectedJob.token_usage.model}</strong>)</> : null}</>
                      : <>
                          Estimated{selectedJob.token_usage?.model
                            ? <> at <strong>{selectedJob.token_usage.model}</strong>'s live rate{modelRates[selectedJob.token_usage.model] ? '' : ' (rate unavailable — shown at selected model)'}</>
                            : <> at the selected model's rate (job carries no model stamp)</>}
                          : {currentModelConfig.name}: {formatRate(currentModelConfig.inputRate)} / 1M input · {formatRate(currentModelConfig.outputRate)} / 1M output
                        </>
                    }
                    {currency === 'INR' ? ` (₹${inrRate.toFixed(2)}/USD)` : ''}
                  </span>
                </div>
              </div>

              {/* Image URLs Gallery */}
              {Array.isArray(selectedJob.image_urls) && selectedJob.image_urls.length > 0 && (
                <div className="job-modal-section">
                  <h4><ImageIcon size={14} /> Submitted scoreboard screenshots ({selectedJob.image_urls.length})</h4>
                  <div className="job-images">
                    {selectedJob.image_urls.map((imgUrl, idx) => (
                      <a
                        key={idx}
                        href={imgUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="job-image-link"
                      >
                        <ImageIcon size={14} />
                        <span>{imgUrl}</span>
                        <ChevronRight size={13} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Result JSON Payload */}
              <div className="job-modal-section">
                <div className="job-modal-section-head">
                  <h4><Layers size={14} /> Extracted result payload</h4>
                  <button type="button" className="job-copy-btn" onClick={() => copyToClipboard(formatJSON(selectedJob.result))}>
                    <Copy size={12} /> Copy JSON
                  </button>
                </div>
                <pre className="job-json">{formatJSON(selectedJob.result || {})}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OCRJobsView

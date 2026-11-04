import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import {
  Users, Gamepad2, Bell, Palette,
  LogOut, CheckCircle2, Search, ChevronRight,
  Shield, Settings, User as UserIcon, Home, Sliders,
  RefreshCcw, Cpu, Activity, IndianRupee, ScrollText,
} from 'lucide-react'
import logoImg from '../assets/logo.jpeg'

import OverviewView from './views/OverviewView'
import RevenueView from './views/RevenueView'
import UsersView from './views/UsersView'
import LobbiesView from './views/LobbiesView'
import NotificationsView from './views/NotificationsView'
import OCRJobsView from './views/OCRJobsView'
import LogsView from './views/LogsView'
import ThemeBuilderView from './theme-builder/ThemeBuilderView'
import ServicesView from './views/ServicesView'

import './Dashboard.css'

const NAV_ITEMS = [
  { key: 'overview',      icon: Home,        label: 'Overview',      shortcut: 'G O', group: 'Platform' },
  { key: 'revenue',       icon: IndianRupee, label: 'Revenue',       shortcut: 'G R', group: 'Platform' },
  { key: 'users',         icon: Users,       label: 'Users',         shortcut: 'G U', group: 'Platform' },
  { key: 'lobbies',       icon: Gamepad2,    label: 'Lobbies',       shortcut: 'G L', group: 'Platform' },
  { key: 'services',      icon: Activity,    label: 'Services',      shortcut: 'G S', group: 'Operations' },
  { key: 'notifications', icon: Bell,        label: 'Notifications', shortcut: 'G N', group: 'Operations' },
  { key: 'jobs',          icon: Cpu,         label: 'OCR Jobs',      shortcut: 'G P', group: 'Operations' },
  { key: 'logs',          icon: ScrollText,  label: 'Logs',          shortcut: 'G G', group: 'Operations' },
  { key: 'themes',        icon: Palette,     label: 'Themes',        shortcut: 'G M', group: 'Studio' },
]

const CommandPalette = ({ open, onClose, onNavigate, onRefresh }) => {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)

  const commands = useMemo(() => {
    const nav = NAV_ITEMS.map(item => ({
      id: `nav-${item.key}`,
      type: 'nav',
      label: `Go to ${item.label}`,
      sub: `Navigate to the ${item.label} section`,
      icon: item.icon,
      shortcut: item.shortcut,
      action: () => onNavigate(item.key),
    }))
    const actions = [
      {
        id: 'refresh', type: 'action',
        label: 'Refresh Dashboard',
        sub: 'Reload dashboard data',
        icon: RefreshCcw, shortcut: 'R',
        action: () => onRefresh(),
      },
    ]
    return [...nav, ...actions]
  }, [onNavigate, onRefresh])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.sub.toLowerCase().includes(q)
    )
  }, [query, commands])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => { setSelectedIdx(0) }, [query])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIdx]) {
      e.preventDefault()
      filtered[selectedIdx].action()
      onClose()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div className="cmd-palette-dialog" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="cmd-palette-input-row">
          <Search size={18} className="cmd-palette-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search…"
            className="cmd-palette-input"
          />
          <kbd className="kbd kbd-sm">ESC</kbd>
        </div>
        <div className="cmd-palette-list">
          {filtered.length === 0 ? (
            <div className="cmd-palette-empty">No commands found</div>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon
              return (
                <button
                  key={cmd.id}
                  className={`cmd-palette-item ${idx === selectedIdx ? 'selected' : ''}`}
                  onClick={() => { cmd.action(); onClose() }}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <span className={`cmd-item-icon cmd-item-${cmd.type}`}><Icon size={16} /></span>
                  <span className="cmd-item-text">
                    <span className="cmd-item-label">{cmd.label}</span>
                    <span className="cmd-item-sub">{cmd.sub}</span>
                  </span>
                  {cmd.shortcut && (
                    <span className="cmd-item-shortcut">
                      {cmd.shortcut.split(' ').map((s, i) => (
                        <kbd key={i} className="kbd kbd-xs">{s}</kbd>
                      ))}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
        <div className="cmd-palette-footer">
          <span><kbd className="kbd kbd-xs">↑</kbd><kbd className="kbd kbd-xs">↓</kbd> Navigate</span>
          <span><kbd className="kbd kbd-xs">↵</kbd> Run</span>
          <span><kbd className="kbd kbd-xs">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  )
}

const Dashboard = ({ user, onLogout }) => {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [activityLogs, setActivityLogs] = useState([])
  const [lobbyFocusId, setLobbyFocusId] = useState(null)
  const [userQuery, setUserQuery] = useState('')

  const [profileOpen, setProfileOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0)
  const [dataRefreshKey, setDataRefreshKey] = useState(0)
  const profileRef = useRef(null)

  const addLog = (type, message, details = null) => {
    setActivityLogs(prev => [{
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type, message, details,
    }, ...prev].slice(0, 50))
  }

  const refreshAll = () => {
    fetchProfile()
    setOverviewRefreshKey(k => k + 1)
    setDataRefreshKey(k => k + 1)
    setSuccess('Dashboard refreshed')
    setTimeout(() => setSuccess(''), 2000)
  }

  useEffect(() => {
    fetchProfile()
  }, [user])

  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen(o => !o)
      }
      if (meta && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        const wait = setTimeout(() => {}, 0)
        let next = null
        const sub = (ev) => {
          const k = ev.key.toLowerCase()
          if (k === 'o') next = 'overview'
          else if (k === 'r') next = 'revenue'
          else if (k === 'g') next = 'logs'
          else if (k === 'u') next = 'users'
          else if (k === 'l') next = 'lobbies'
          else if (k === 'n') next = 'notifications'
          else if (k === 'p') next = 'jobs'
          else if (k === 'm') next = 'themes'
          if (next) {
            setActiveTab(next)
            setLobbyFocusId(null)
            setUserQuery('')
          }
          window.removeEventListener('keydown', sub)
          clearTimeout(wait)
        }
        window.addEventListener('keydown', sub, { once: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!error) setProfile(data)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleNavigate = (key) => {
    setActiveTab(key)
    setLobbyFocusId(null)
    setUserQuery('')
  }

  const handleOpenLobbyFromOverview = (lobby) => {
    setLobbyFocusId(lobby?.id || null)
    setActiveTab('lobbies')
  }

  const handleOpenUser = (creator) => {
    setUserQuery(creator?.email || creator?.handle || '')
    setActiveTab('users')
  }

  // Logs reference users by raw uuid; the Users search accepts ids too.
  const handleOpenUserById = (userId) => {
    if (!userId) return
    setUserQuery(userId)
    setActiveTab('users')
  }

  const handleLogout = async () => { await supabase.auth.signOut(); onLogout() }

  const currentNav = NAV_ITEMS.find(n => n.key === activeTab)

  const breadcrumbs = useMemo(() => {
    const crumbs = [{ label: 'Admin', onClick: () => handleNavigate('overview') }]
    if (currentNav) crumbs.push({ label: currentNav.label, key: currentNav.key })
    return crumbs
  }, [currentNav])

  const initials = (profile?.display_name || profile?.username || user.email || 'A')
    .split(/\s|@/)[0]
    .slice(0, 2)
    .toUpperCase()

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="dashboard-shell">
      {/* ── Left Icon Rail ── */}
      <aside className="icon-rail" aria-label="Primary navigation">
        <button
          type="button"
          className="rail-brand"
          onClick={() => handleNavigate('overview')}
          title="LazarFlow Admin"
          aria-label="LazarFlow Admin — go to Overview"
        >
          <img src={logoImg} alt="" className="rail-logo" draggable="false" />
        </button>
        <nav className="rail-nav">
          {NAV_ITEMS.map((item, idx) => {
            const { key, label, shortcut, group } = item
            const Icon = item.icon
            const isActive = activeTab === key
            const startsGroup = idx > 0 && NAV_ITEMS[idx - 1].group !== group
            return (
              <Fragment key={key}>
                {startsGroup && <div className="rail-divider" role="separator" aria-label={group} title={group} />}
                <button
                  type="button"
                  onClick={() => handleNavigate(key)}
                  className={`rail-item ${isActive ? 'active' : ''}`}
                  aria-label={label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div className="rail-item-icon">
                    <Icon size={20} strokeWidth={2} />
                  </div>
                  <span className="rail-item-tooltip">
                    {label}
                    {shortcut && <kbd className="rail-tip-kbd">{shortcut}</kbd>}
                  </span>
                </button>
              </Fragment>
            )
          })}
        </nav>
        <div className="rail-footer">
          <button
            onClick={handleLogout}
            className="rail-item"
            title="Sign out"
            aria-label="Sign out"
          >
            <div className="rail-item-icon">
              <LogOut size={20} strokeWidth={2} />
            </div>
            <span className="rail-item-tooltip">Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Workspace ── */}
      <div className="workspace">
        {/* ── Top Navigation Bar ── */}
        <header className="top-bar">
          <div className="top-bar-left">
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, idx) => {
                const last = idx === breadcrumbs.length - 1
                return (
                  <span key={`${crumb.label}-${idx}`} className="crumb-wrap">
                    <button
                      type="button"
                      className={`crumb ${last ? 'crumb-current' : ''}`}
                      onClick={!last && crumb.onClick ? crumb.onClick : undefined}
                      disabled={last}
                    >
                      {idx === 0 && <Sliders size={14} className="crumb-icon" />}
                      {crumb.label}
                    </button>
                    {!last && <ChevronRight size={14} className="crumb-sep" />}
                  </span>
                )
              })}
            </nav>
          </div>
          <div className="top-bar-right">
            <button
              type="button"
              className="search-chip"
              onClick={() => setCmdOpen(true)}
            >
              <Search size={16} className="search-chip-icon" />
              <span className="search-chip-label">Search or command…</span>
              <span className="search-chip-kbds">
                <kbd className="kbd kbd-xs">⌘</kbd>
                <kbd className="kbd kbd-xs">K</kbd>
              </span>
            </button>
            <button
              type="button"
              onClick={refreshAll}
              className="icon-button"
              title="Refresh"
              aria-label="Refresh dashboard"
            >
              <RefreshCcw size={18} />
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('notifications')}
              className="icon-button notif-button"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span className="notif-dot" aria-hidden="true"></span>
            </button>
            <div className="profile-menu-wrap" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen(o => !o)}
                className="profile-trigger"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                <span className="avatar avatar-sm" aria-hidden="true">{initials}</span>
              </button>
              {profileOpen && (
                <div className="profile-menu" role="menu">
                  <div className="profile-menu-header">
                    <span className="avatar avatar-md" aria-hidden="true">{initials}</span>
                    <div className="profile-menu-info">
                      <div className="profile-menu-name">
                        {profile?.display_name || profile?.username || user.email}
                      </div>
                      <div className="profile-menu-email">{profile?.emails || user.email}</div>
                      {profile?.is_admin && (
                        <div className="profile-menu-admin">
                          <Shield size={11} /> Admin
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="profile-menu-divider" />
                  <button className="profile-menu-item" role="menuitem">
                    <UserIcon size={16} /> My Profile
                  </button>
                  <button className="profile-menu-item" role="menuitem">
                    <Settings size={16} /> Settings
                  </button>
                  <div className="profile-menu-divider" />
                  <button className="profile-menu-item profile-menu-danger" onClick={handleLogout} role="menuitem">
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Content Area ── */}
        <main className="content-area">
          {success && <div className="alert alert-success"><CheckCircle2 size={16} /> {success}</div>}

          {/* View Routing */}
          {activeTab === 'overview' ? (
            <OverviewView
              onNavigate={handleNavigate}
              onOpenLobby={handleOpenLobbyFromOverview}
              refreshKey={overviewRefreshKey}
            />
          ) : activeTab === 'revenue' ? (
            <RevenueView
              externalRefreshKey={dataRefreshKey}
              onOpenUser={handleOpenUser}
            />
          ) : activeTab === 'services' ? (
            <ServicesView />
          ) : activeTab === 'lobbies' ? (
            <LobbiesView
              key={lobbyFocusId || 'lobbies'}
              focusLobbyId={lobbyFocusId}
              onOpenUser={handleOpenUser}
              externalRefreshKey={dataRefreshKey}
            />
          ) : activeTab === 'notifications' ? (
            <NotificationsView />
          ) : activeTab === 'jobs' ? (
            <OCRJobsView addLog={addLog} />
          ) : activeTab === 'logs' ? (
            <LogsView
              externalRefreshKey={dataRefreshKey}
              onOpenUser={handleOpenUserById}
            />
          ) : activeTab === 'themes' ? (
            <ThemeBuilderView addLog={addLog} />
          ) : activeTab === 'users' ? (
            <UsersView
              key={userQuery || 'users'}
              initialQuery={userQuery}
              externalRefreshKey={dataRefreshKey}
              admin={profile ? {
                id: profile.id,
                display_name: profile.display_name,
                username: profile.username,
                emails: profile.emails,
              } : null}
            />
          ) : null}
        </main>
      </div>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={handleNavigate}
        onRefresh={refreshAll}
      />
    </div>
  )
}

export default Dashboard

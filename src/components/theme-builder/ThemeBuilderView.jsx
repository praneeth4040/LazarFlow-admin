import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Palette, CheckCircle2, Clock, AlertCircle,
  Image as ImageIcon, Loader2, X, User, Calendar,
  Link as LinkIcon, Hash, Layers, Eye, ChevronRight,
  ExternalLink, Play, Trophy, SlidersHorizontal,
  Download, RefreshCcw, ChevronDown, Pencil, Trash2,
  Copy, CopyCheck, ShieldCheck, Save, Ban, GitMerge,
  Globe, Lock, Users, ArrowUpRight, Crosshair, Plus, Upload,
} from 'lucide-react'
import ThemeMappingEditor from './ThemeMappingEditor'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const THEME_STATUS = { VERIFIED: 'verified', IN_PROGRESS: 'in_progress', PENDING: 'pending' }
const DB_STATUSES  = ['pending', 'verified', 'rejected']

// Theme ownership type — derived from user_id
const THEME_TYPE = { COMMUNITY: 'community', CUSTOM: 'custom' }
const getThemeType = (theme) => (!theme.user_id ? THEME_TYPE.COMMUNITY : THEME_TYPE.CUSTOM)

const TYPE_META = {
  [THEME_TYPE.COMMUNITY]: {
    label: 'Community',
    Icon: Globe,
    accent: '#7c3aed',        // purple
    bg: 'rgba(124,58,237,0.08)',
    description: 'Available to all users',
    chipClass: 'type-chip-community',
  },
  [THEME_TYPE.CUSTOM]: {
    label: 'Custom',
    Icon: Lock,
    accent: '#0891b2',        // cyan
    bg: 'rgba(8,145,178,0.08)',
    description: 'Private — uploaded by a specific user',
    chipClass: 'type-chip-custom',
  },
}

const classifyTheme = (theme) => {
  const hasCells =
    theme.mapping_config &&
    Array.isArray(theme.mapping_config.cells) &&
    theme.mapping_config.cells.length > 0 &&
    theme.mapping_config.cells.some(
      (c) => Object.values(c).some((f) => f && (f.x || f.y || f.font_size))
    )
  if (theme.status === THEME_STATUS.VERIFIED && hasCells) return THEME_STATUS.VERIFIED
  if (hasCells) return THEME_STATUS.IN_PROGRESS
  return THEME_STATUS.PENDING
}

const STATUS_META = {
  [THEME_STATUS.VERIFIED]: {
    label: 'Verified', Icon: CheckCircle2,
    accent: 'var(--google-green)', bg: 'rgba(52,168,83,0.08)',
    description: 'Approved and ready to use in tournaments',
  },
  [THEME_STATUS.IN_PROGRESS]: {
    label: 'Under Verification', Icon: Clock,
    accent: 'var(--google-yellow-dark)', bg: 'rgba(251,188,5,0.10)',
    description: 'Mapping in progress — configuration started but not finalized',
  },
  [THEME_STATUS.PENDING]: {
    label: 'Pending', Icon: AlertCircle,
    accent: 'var(--google-blue)', bg: 'rgba(26,115,232,0.08)',
    description: 'New themes awaiting mapping configuration',
  },
}

const formatDate = (iso, long = false) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, long
      ? { year: 'numeric', month: 'long', day: 'numeric' }
      : { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return '—' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const AdjustmentSlider = ({ label, field, value, min, max, step, onChange }) => (
  <div className="adj-row">
    <span className="adj-label">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(field, parseFloat(e.target.value))} className="adj-slider" />
    <span className="adj-value">{value.toFixed(1)}</span>
    <button className="adj-reset" onClick={() => onChange(field, 1.0)}
      title="Reset" disabled={value === 1.0}><RefreshCcw size={11} /></button>
  </div>
)

// ─────────────────────────────────────────────────────────────────────────────
// Confirm Delete Modal
// ─────────────────────────────────────────────────────────────────────────────

const ConfirmDeleteModal = ({ count, names, onConfirm, onCancel, deleting }) => (
  <div className="confirm-overlay" onClick={onCancel}>
    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
      <div className="confirm-icon-wrap danger">
        <Trash2 size={22} />
      </div>
      <h3 className="confirm-title">
        Delete {count === 1 ? 'Theme' : `${count} Themes`}?
      </h3>
      <p className="confirm-body">
        {count === 1
          ? <>You're about to permanently delete <strong>{names[0]}</strong>. This cannot be undone.</>
          : <>You're about to permanently delete <strong>{count} themes</strong>. This cannot be undone.</>
        }
      </p>
      {count > 1 && names.length > 0 && (
        <ul className="confirm-list">
          {names.slice(0, 6).map((n, i) => <li key={i}>{n}</li>)}
          {names.length > 6 && <li>…and {names.length - 6} more</li>}
        </ul>
      )}
      <div className="confirm-actions">
        <button className="confirm-cancel-btn" onClick={onCancel} disabled={deleting}>Cancel</button>
        <button className="confirm-delete-btn" onClick={onConfirm} disabled={deleting}>
          {deleting ? <><Loader2 size={14} className="spin" /> Deleting…</> : <><Trash2 size={14} /> Delete</>}
        </button>
      </div>
    </div>
  </div>
)

// ─────────────────────────────────────────────────────────────────────────────
// Duplicates Panel (modal-style overlay)
// ─────────────────────────────────────────────────────────────────────────────

const DuplicatesPanel = ({ themes, onClose, onDeleted }) => {
  // Group by normalised URL
  const groups = themes.reduce((acc, t) => {
    const key = (t.url || '').trim().toLowerCase()
    if (!key) return acc
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  // Only groups that actually have > 1 entry
  const dupGroups = Object.values(groups).filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length)

  // Selected IDs to delete (user picks which ones to keep/remove)
  const [selected, setSelected] = useState(() => {
    // Pre-select all but the OLDEST (first created_at) in each group
    const pre = new Set()
    dupGroups.forEach((group) => {
      const sorted = [...group].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      sorted.slice(1).forEach((t) => pre.add(t.id)) // keep oldest, mark rest
    })
    return pre
  })

  const [confirm, setConfirm]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      const ids = [...selected]
      const { error: err } = await supabase.from('themes').delete().in('id', ids)
      if (err) throw err
      onDeleted(ids)
      onClose()
    } catch (e) {
      setError(e.message)
      setDeleting(false)
    }
  }

  const selectedNames = themes
    .filter((t) => selected.has(t.id))
    .map((t) => t.name || t.id.slice(0, 8))

  return (
    <div className="dup-overlay" onClick={onClose}>
      <div className="dup-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dup-header">
          <div className="dup-header-left">
            <GitMerge size={18} />
            <div>
              <h2>Duplicate Themes</h2>
              <p>{dupGroups.length} groups · {themes.filter(t => selected.has(t.id)).length} selected to delete</p>
            </div>
          </div>
          <button className="drawer-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {error && (
          <div className="dup-error"><AlertCircle size={14} />{error}</div>
        )}

        <div className="dup-body">
          {dupGroups.length === 0 ? (
            <div className="dup-empty">
              <CheckCircle2 size={32} />
              <p>No duplicates found!</p>
            </div>
          ) : (
            dupGroups.map((group) => {
              // Sort oldest first — oldest = "keep" candidate
              const sorted = [...group].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
              return (
                <div key={sorted[0].url} className="dup-group">
                  <div className="dup-group-url">
                    <LinkIcon size={12} />
                    <span title={sorted[0].url}>{sorted[0].url}</span>
                    <span className="dup-count-badge">{sorted.length} copies</span>
                  </div>
                  <div className="dup-group-items">
                    {sorted.map((t, idx) => {
                      const isSelected = selected.has(t.id)
                      const isOldest = idx === 0
                      return (
                        <label
                          key={t.id}
                          className={`dup-item ${isSelected ? 'marked' : ''} ${isOldest ? 'keep' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(t.id)}
                            className="dup-checkbox"
                          />
                          <div className="dup-item-thumb">
                            <img src={t.url} alt={t.name} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                          </div>
                          <div className="dup-item-info">
                            <span className="dup-item-name">{t.name || `Theme #${t.id.slice(-6)}`}</span>
                            <span className="dup-item-meta">
                              Created {formatDate(t.created_at)} · <span className={`status-badge status-${t.status || 'pending'}`}>{t.status || 'pending'}</span>
                            </span>
                            <span className="dup-item-id mono">{t.id}</span>
                          </div>
                          {isOldest && !isSelected && (
                            <span className="dup-keep-tag"><ShieldCheck size={11} /> Keep</span>
                          )}
                          {isSelected && (
                            <span className="dup-delete-tag"><Trash2 size={11} /> Delete</span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {dupGroups.length > 0 && (
          <div className="dup-footer">
            <span className="dup-footer-info">
              {selected.size} theme{selected.size !== 1 ? 's' : ''} selected for deletion
            </span>
            <div className="dup-footer-actions">
              <button className="dup-cancel-btn" onClick={onClose}>Cancel</button>
              <button
                className="dup-delete-btn"
                onClick={() => setConfirm(true)}
                disabled={selected.size === 0}
              >
                <Trash2 size={14} /> Delete Selected ({selected.size})
              </button>
            </div>
          </div>
        )}

        {confirm && (
          <ConfirmDeleteModal
            count={selected.size}
            names={selectedNames}
            onConfirm={handleDelete}
            onCancel={() => setConfirm(false)}
            deleting={deleting}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme Detail Drawer
// ─────────────────────────────────────────────────────────────────────────────

const ThemeDetailDrawer = ({ theme: initialTheme, onClose, onUpdated, onDeleted }) => {
  const [theme, setTheme] = useState(initialTheme)

  // ── Edit state ──
  const [editMode, setEditMode]     = useState(false)
  const [editName, setEditName]     = useState(theme.name || '')
  const [editStatus, setEditStatus] = useState(theme.status || 'pending')
  const [editUrl, setEditUrl]       = useState(theme.url || '')
  const [editType, setEditType]     = useState(() => getThemeType(theme)) // 'community' | 'custom'
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [saveOk, setSaveOk]         = useState(false)

  // ── Delete state ──
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)

  // ── Mapping editor ──
  const [mappingOpen, setMappingOpen] = useState(false)

  // ── Owner ──
  const [owner, setOwner]               = useState(null)
  const [loadingOwner, setLoadingOwner] = useState(false)

  // ── Render ──
  const [lobbies, setLobbies]                   = useState([])
  const [loadingLobbies, setLoadingLobbies]     = useState(false)
  const [lobbyOpen, setLobbyOpen]               = useState(false)
  const [selectedLobby, setSelectedLobby]       = useState(null)
  const [extraData, setExtraData]               = useState({})
  const [showAdj, setShowAdj]                   = useState(false)
  const [adjustments, setAdjustments]           = useState({ contrast: 1.0, saturation: 1.0, brightness: 1.0, sharpness: 1.0 })
  const setAdj = (field, value) => setAdjustments(prev => ({ ...prev, [field]: value }))
  const [rendering, setRendering]               = useState(false)
  const [renderError, setRenderError]           = useState('')
  const [renderedUrl, setRenderedUrl]           = useState(null)
  const lobbyRef = useRef(null)

  // ── Derived ──
  const computed    = classifyTheme(theme)
  const meta        = STATUS_META[computed]
  const StatusIcon  = meta.Icon
  const themeType   = getThemeType(theme)
  const typeMeta    = TYPE_META[themeType]
  const TypeIcon    = typeMeta.Icon
  const hasMapping  = theme.mapping_config?.cells?.some(
    (c) => Object.values(c).some((f) => f && (f.x || f.y))
  ) ?? false
  const extraFieldKeys = Object.keys(theme.mapping_config?.extra_fields ?? {})
  const adjChanged     = Object.values(adjustments).some((v) => v !== 1.0)

  // ── Effects ──

  useEffect(() => {
    if (!theme.user_id) return
    setLoadingOwner(true)
    supabase.from('profiles')
      .select('id, username, display_name, is_admin, created_at')
      .eq('id', theme.user_id).single()
      .then(({ data, error }) => { if (!error && data) setOwner(data) })
      .finally(() => setLoadingOwner(false))
  }, [theme.user_id])

  useEffect(() => {
    if (!hasMapping) return
    setLoadingLobbies(true)
    supabase.from('lobbies').select('id, name, game, status, created_at')
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setLobbies(data || []))
      .finally(() => setLoadingLobbies(false))
  }, [hasMapping])

  useEffect(() => {
    // Sync extra data keys whenever theme changes
    // lazarflow-watermark is always fixed to "lazarflow.app" — not user-editable
    setExtraData(Object.fromEntries(
      extraFieldKeys.map((k) => [k, k === 'lazarflow-watermark' ? 'lazarflow.app' : ''])
    ))
  }, [theme.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fn = (e) => {
      if (lobbyRef.current && !lobbyRef.current.contains(e.target)) setLobbyOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape' && !confirmDelete) onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose, confirmDelete])

  useEffect(() => () => { if (renderedUrl) URL.revokeObjectURL(renderedUrl) }, [renderedUrl])

  // ── Handlers ──

  const handleSave = async () => {
    setSaving(true); setSaveError(''); setSaveOk(false)
    try {
      const updates = {
        name:       editName.trim() || theme.name,
        status:     editStatus,
        url:        editUrl.trim() || theme.url,
        updated_at: new Date().toISOString(),
      }
      // Promote to community: clear user_id; demote keeps existing user_id (can't re-assign)
      if (editType === THEME_TYPE.COMMUNITY && theme.user_id) {
        updates.user_id = null
      }
      const { data, error } = await supabase
        .from('themes').update(updates).eq('id', theme.id).select().single()
      if (error) throw error
      setTheme(data)
      onUpdated?.(data)
      setEditMode(false)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 3000)
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditName(theme.name || '')
    setEditStatus(theme.status || 'pending')
    setEditUrl(theme.url || '')
    setEditType(getThemeType(theme))
    setSaveError('')
    setEditMode(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const { error } = await supabase.from('themes').delete().eq('id', theme.id)
      if (error) throw error
      onDeleted?.(theme.id)
      onClose()
    } catch (e) {
      // surface error without crashing
      console.error('Delete failed:', e.message)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const countMappedCells  = () => (theme.mapping_config?.cells ?? []).filter(c => Object.values(c).some(f => f && (f.x || f.y))).length
  const countMappedFields = () => { let n = 0; (theme.mapping_config?.cells ?? []).forEach(c => { n += Object.values(c).filter(f => f && (f.x || f.y)).length }); return n }

  // ── Render ──
  const handleRender = async () => {
    if (!selectedLobby) return
    setRendering(true); setRenderError(''); setRenderedUrl(null)
    try {
      const res = await fetch('/api/render/render-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          themeId:     theme.id,
          lobbyId:     selectedLobby.id,
          extraData,
          adjustments,
        }),
      })
      if (!res.ok) {
        let msg = `Error ${res.status}`
        try { const j = await res.json(); msg = j.error || j.message || msg } catch (_) {}
        throw new Error(msg)
      }
      const blob = await res.blob()
      setRenderedUrl(URL.createObjectURL(blob))
    } catch (e) {
      setRenderError(e.message)
    } finally {
      setRendering(false)
    }
  }

  const handleDownload = () => {
    if (!renderedUrl) return
    const a = document.createElement('a')
    a.href     = renderedUrl
    a.download = `${theme.name || theme.id}_${selectedLobby?.name || 'result'}.png`
    a.click()
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="theme-drawer-overlay" onClick={onClose}>
      <div className="theme-drawer" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={`Theme: ${theme.name}`}>

        {/* ── Header ── */}
        <div className="theme-drawer-header">
          <div className="theme-drawer-title-row">
            <div className="theme-drawer-title">
              <Palette size={18} style={{ color: meta.accent }} />
              <h2>{theme.name || `Theme #${theme.id.slice(-6)}`}</h2>
            </div>
            <div className="drawer-header-actions">
              {!editMode && (
                <>
                  <button
                    className="drawer-action-btn map"
                    onClick={() => setMappingOpen(true)}
                    title="Open mapping editor"
                  >
                    <Crosshair size={14} /> Map
                  </button>
                  <button
                    className="drawer-action-btn edit"
                    onClick={() => {
                      setEditMode(true)
                      setEditName(theme.name || '')
                      setEditStatus(theme.status || 'pending')
                      setEditUrl(theme.url || '')
                      setEditType(getThemeType(theme))
                    }}
                    title="Edit theme"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    className="drawer-action-btn delete"
                    onClick={() => setConfirmDelete(true)}
                    title="Delete theme"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
              <button className="drawer-close-btn" onClick={onClose}><X size={18} /></button>
            </div>
          </div>

          <div className="theme-drawer-status-row">
            <span className="theme-drawer-status-badge"
              style={{ background: meta.bg, color: meta.accent, border: `1px solid ${meta.accent}40` }}>
              <StatusIcon size={13} /> {meta.label}
            </span>
            {/* Theme type badge */}
            <span className="theme-type-badge" style={{ background: typeMeta.bg, color: typeMeta.accent, border: `1px solid ${typeMeta.accent}40` }}>
              <TypeIcon size={12} /> {typeMeta.label}
            </span>
            <span className="theme-drawer-id"><Hash size={11} /> {theme.id.slice(0, 8)}…</span>
            {saveOk && (
              <span className="drawer-save-toast"><CheckCircle2 size={13} /> Saved</span>
            )}
          </div>
        </div>

        <div className="theme-drawer-body">

          {/* ── EDIT PANEL ── */}
          {editMode && (
            <div className="theme-edit-panel">
              <div className="edit-panel-title"><Pencil size={14} /> Edit Theme</div>

              <div className="edit-field-group">
                <label className="edit-label">Name</label>
                <input
                  className="edit-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Theme name"
                />
              </div>

              <div className="edit-field-group">
                <label className="edit-label">Verification Status</label>
                <div className="edit-status-pills">
                  {DB_STATUSES.map((s) => (
                    <button
                      key={s}
                      className={`edit-status-pill ${editStatus === s ? 'active' : ''} status-pill-${s}`}
                      onClick={() => setEditStatus(s)}
                    >
                      {s === 'verified'  && <CheckCircle2 size={13} />}
                      {s === 'pending'   && <AlertCircle size={13} />}
                      {s === 'rejected'  && <Ban size={13} />}
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="edit-field-group">
                <label className="edit-label">Theme Type</label>
                <div className="edit-type-toggle">
                  <button
                    type="button"
                    className={`edit-type-btn ${editType === THEME_TYPE.COMMUNITY ? 'active community' : ''}`}
                    onClick={() => setEditType(THEME_TYPE.COMMUNITY)}
                  >
                    <Globe size={14} /> Community
                    <span className="edit-type-desc">Visible to all users</span>
                  </button>
                  <button
                    type="button"
                    className={`edit-type-btn ${editType === THEME_TYPE.CUSTOM ? 'active custom' : ''}`}
                    onClick={() => setEditType(THEME_TYPE.CUSTOM)}
                    disabled={themeType === THEME_TYPE.COMMUNITY}
                  >
                    <Lock size={14} /> Custom
                    <span className="edit-type-desc">Private to uploader</span>
                  </button>
                </div>
                {themeType === THEME_TYPE.COMMUNITY && editType === THEME_TYPE.CUSTOM && (
                  <p className="edit-type-note warn">
                    <AlertCircle size={12} /> Cannot convert a community theme back to custom — user_id cannot be restored.
                  </p>
                )}
                {themeType === THEME_TYPE.CUSTOM && editType === THEME_TYPE.COMMUNITY && (
                  <p className="edit-type-note promote">
                    <ArrowUpRight size={12} /> Saving will clear the owner and make this theme available to everyone.
                  </p>
                )}
              </div>

              <div className="edit-field-group">
                <label className="edit-label">Image URL</label>
                <input
                  className="edit-input mono-input"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>

              {saveError && (
                <div className="edit-error"><AlertCircle size={14} />{saveError}</div>
              )}

              <div className="edit-actions">
                <button className="edit-cancel-btn" onClick={handleCancelEdit} disabled={saving}>
                  <X size={14} /> Cancel
                </button>
                <button className="edit-save-btn" onClick={handleSave} disabled={saving}>
                  {saving ? <><Loader2 size={14} className="spin" /> Saving…</> : <><Save size={14} /> Save Changes</>}
                </button>
              </div>
            </div>
          )}

          {/* ── RENDER PANEL ── */}
          <div className="theme-drawer-render-panel">
            <div className="render-panel-header">
              <Play size={16} />
              <span>Demo Render</span>
              {!hasMapping && (
                <span className="render-no-mapping-tag"><AlertCircle size={12} /> No mapping configured</span>
              )}
            </div>

            {!hasMapping ? (
              <div className="render-blocked">
                <AlertCircle size={28} />
                <p>This theme has no mapping configuration yet.<br />Configure it first before running a render.</p>
              </div>
            ) : (
              <div className="render-controls">
                {/* Lobby picker */}
                <div className="render-field">
                  <label className="render-field-label"><Trophy size={13} /> Select Lobby</label>
                  <div className="lobby-picker" ref={lobbyRef}>
                    <button
                      className={`lobby-picker-trigger ${lobbyOpen ? 'open' : ''}`}
                      onClick={() => setLobbyOpen((v) => !v)}
                      disabled={loadingLobbies}
                    >
                      {loadingLobbies ? (
                        <><Loader2 size={14} className="spin" /> Loading lobbies…</>
                      ) : selectedLobby ? (
                        <>
                          <span className="lobby-pill-game">{selectedLobby.game}</span>
                          <span className="lobby-pill-name">{selectedLobby.name}</span>
                          <span className={`lobby-pill-status status-${selectedLobby.status}`}>{selectedLobby.status}</span>
                        </>
                      ) : (
                        <span className="lobby-picker-placeholder">Choose a lobby to render against…</span>
                      )}
                      <ChevronDown size={14} className={`picker-chevron ${lobbyOpen ? 'flipped' : ''}`} />
                    </button>
                    {lobbyOpen && (
                      <div className="lobby-dropdown">
                        {lobbies.length === 0 ? (
                          <div className="lobby-dropdown-empty">No lobbies found</div>
                        ) : lobbies.map((lb) => (
                          <button key={lb.id}
                            className={`lobby-dropdown-item ${selectedLobby?.id === lb.id ? 'selected' : ''}`}
                            onClick={() => { setSelectedLobby(lb); setLobbyOpen(false); setRenderedUrl(null); setRenderError('') }}>
                            <span className="lobby-pill-game">{lb.game}</span>
                            <span className="lobby-item-name">{lb.name}</span>
                            <span className={`lobby-pill-status status-${lb.status}`}>{lb.status}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Extra fields */}
                {extraFieldKeys.length > 0 && (
                  <div className="render-field">
                    <label className="render-field-label">
                      <Layers size={13} /> Extra Fields
                      <span className="render-field-hint">drawn as text overlays</span>
                    </label>
                    <div className="extra-fields-grid">
                      {extraFieldKeys.map((key) => {
                        // lazarflow-watermark is fixed — not user-editable
                        if (key === 'lazarflow-watermark') return (
                          <div key={key} className="extra-field-row">
                            <span className="extra-field-key">{key}</span>
                            <span className="extra-field-fixed">lazarflow.app</span>
                          </div>
                        )
                        return (
                        <div key={key} className="extra-field-row">
                          <span className="extra-field-key">{key}</span>
                          <input type="text" className="extra-field-input"
                            placeholder={key === 'tournament_name' ? 'e.g. BGMI Season 3' : `e.g. ${key}`}
                            value={extraData[key] || ''}
                            onChange={(e) => {
                              setExtraData((p) => ({ ...p, [key]: e.target.value }))
                              setRenderedUrl(null); setRenderError('')
                            }} />
                        </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Adjustments */}
                <div className="render-field">
                  <button className={`adj-toggle ${showAdj ? 'open' : ''} ${adjChanged ? 'changed' : ''}`}
                    onClick={() => setShowAdj((v) => !v)}>
                    <SlidersHorizontal size={13} /> Image Adjustments
                    {adjChanged && <span className="adj-changed-dot" />}
                    <ChevronDown size={13} className={`picker-chevron ${showAdj ? 'flipped' : ''}`} style={{ marginLeft: 'auto' }} />
                  </button>
                  {showAdj && (
                    <div className="adj-panel">
                      <AdjustmentSlider label="Contrast"   field="contrast"   value={adjustments.contrast}   min={0.1} max={3.0} step={0.1} onChange={setAdj} />
                      <AdjustmentSlider label="Saturation" field="saturation" value={adjustments.saturation} min={0.0} max={3.0} step={0.1} onChange={setAdj} />
                      <AdjustmentSlider label="Brightness" field="brightness" value={adjustments.brightness} min={0.1} max={3.0} step={0.1} onChange={setAdj} />
                      <AdjustmentSlider label="Sharpness"  field="sharpness"  value={adjustments.sharpness}  min={0.0} max={3.0} step={0.1} onChange={setAdj} />
                    </div>
                  )}
                </div>

                <button className="render-run-btn" onClick={handleRender} disabled={!selectedLobby || rendering}>
                  {rendering ? <><Loader2 size={15} className="spin" /> Rendering…</> : <><Play size={15} /> Render Results</>}
                </button>

                {renderError && (
                  <div className="render-error"><AlertCircle size={15} /><span>{renderError}</span></div>
                )}

                {renderedUrl && (
                  <div className="render-result">
                    <div className="render-result-header">
                      <span className="render-result-label"><CheckCircle2 size={14} /> Render complete</span>
                      <div className="render-result-actions">
                        <button className="render-rerun-btn" onClick={handleRender} disabled={rendering}><RefreshCcw size={13} /> Re-render</button>
                        <button className="render-download-btn" onClick={handleDownload}><Download size={13} /> Download</button>
                      </div>
                    </div>
                    <img src={renderedUrl} alt="Rendered result" className="render-result-img" />
                    <p className="render-result-meta">Lobby: <strong>{selectedLobby.name}</strong> · Theme: <strong>{theme.name}</strong></p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── INFO PANELS ── */}
          <div className="theme-drawer-info">

            {/* Original preview */}
            <section className="drawer-section">
              <h3 className="drawer-section-title"><ImageIcon size={15} /> Theme Preview</h3>
              {theme.url ? (
                <div className="drawer-theme-preview-wrap">
                  <img src={theme.url} alt={theme.name} className="drawer-theme-preview-img"
                    onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  <a href={theme.url} target="_blank" rel="noopener noreferrer" className="drawer-preview-link">
                    <ExternalLink size={13} /> Open full-res image
                  </a>
                </div>
              ) : (
                <p className="drawer-empty-note">No image URL on this theme.</p>
              )}
            </section>

            {/* Theme details */}
            <section className="drawer-section">
              <h3 className="drawer-section-title"><Layers size={15} /> Theme Details</h3>
              <div className="drawer-info-grid">
                {[
                  { label: 'Name',         value: theme.name || '—' },
                  { label: 'Status (DB)',  value: <span className={`status-badge status-${theme.status || 'pending'}`}>{theme.status || 'pending'}</span> },
                  { label: 'Computed',     value: <span className="theme-drawer-status-badge" style={{ background: meta.bg, color: meta.accent, border: `1px solid ${meta.accent}40` }}><StatusIcon size={12} />{meta.label}</span> },
                  { label: 'Created',      value: formatDate(theme.created_at, true) },
                  { label: 'Last Updated', value: formatDate(theme.updated_at || theme.created_at, true) },
                  { label: 'Theme ID',     value: <span className="mono">{theme.id}</span> },
                ].map(({ label, value }) => (
                  <div key={label} className="drawer-info-row">
                    <span className="drawer-info-label">{label}</span>
                    <span className="drawer-info-value">{value}</span>
                  </div>
                ))}
                {theme.url && (
                  <div className="drawer-info-row">
                    <span className="drawer-info-label">Image URL</span>
                    <a href={theme.url} target="_blank" rel="noopener noreferrer" className="drawer-info-link">
                      <LinkIcon size={12} /> View Image
                    </a>
                  </div>
                )}
              </div>
            </section>

            {/* Mapping config */}
            <section className="drawer-section">
              <h3 className="drawer-section-title"><ChevronRight size={15} /> Mapping Config</h3>
              {!theme.mapping_config?.cells ? (
                <p className="drawer-empty-note">No mapping configuration saved.</p>
              ) : (
                <div className="drawer-info-grid">
                  {[
                    { label: 'Cell Rows',     value: theme.mapping_config.cells.length },
                    { label: 'Mapped Rows',   value: `${countMappedCells()} / ${theme.mapping_config.cells.length}` },
                    { label: 'Mapped Fields', value: countMappedFields() },
                    ...(theme.mapping_config.scoreboard ? [
                      { label: 'Font',      value: <span className="mono">{theme.mapping_config.scoreboard.font_path || '—'}</span> },
                      { label: 'Font Size', value: theme.mapping_config.scoreboard.font_size ?? '—' },
                      ...(theme.mapping_config.scoreboard.color_rgb ? [{
                        label: 'Base Color',
                        value: <span className="drawer-color-swatch">
                          <span className="color-dot" style={{ background: `rgb(${theme.mapping_config.scoreboard.color_rgb.join(',')})` }} />
                          rgb({theme.mapping_config.scoreboard.color_rgb.join(', ')})
                        </span>,
                      }] : []),
                    ] : []),
                    ...(extraFieldKeys.length > 0 ? [{ label: 'Extra Fields', value: extraFieldKeys.join(', ') }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="drawer-info-row">
                      <span className="drawer-info-label">{label}</span>
                      <span className="drawer-info-value">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Owner */}
            <section className="drawer-section">
              <h3 className="drawer-section-title"><User size={15} /> Submitted By</h3>
              {!theme.user_id ? (
                <div className="drawer-community-note">
                  <Globe size={20} />
                  <div>
                    <div className="drawer-community-title">Community Theme</div>
                    <div className="drawer-community-desc">This theme has no owner — it's available to all users on the platform.</div>
                  </div>
                </div>
              ) : loadingOwner ? (
                <div className="drawer-owner-loading"><Loader2 size={16} className="spin" /> Loading owner…</div>
              ) : !owner ? (
                <p className="drawer-empty-note">Owner not found. <span className="mono">{theme.user_id}</span></p>
              ) : (
                <div className="drawer-owner-card">
                  <div className="drawer-owner-avatar">
                    {(owner.display_name || owner.username || owner.emails || '?').split(/\s|@/)[0].slice(0, 2).toUpperCase()}
                  </div>
                  <div className="drawer-owner-info">
                    <div className="drawer-owner-name">{owner.display_name || owner.username || '(no name)'}</div>
                    <div className="drawer-owner-meta">
                      {owner.is_admin && <span className="admin-badge admin-yes">Admin</span>}
                    </div>
                  </div>
                  <div className="drawer-owner-dates">
                    <div className="drawer-owner-date-row"><Calendar size={12} /><span>Joined {formatDate(owner.created_at, true)}</span></div>
                    <div className="drawer-owner-date-row mono"><Hash size={12} /><span>{owner.id.slice(0, 12)}…</span></div>
                  </div>
                </div>
              )}
            </section>

            {/* Danger zone */}
            <section className="drawer-section drawer-danger-zone">
              <h3 className="drawer-section-title danger-title"><Trash2 size={15} /> Danger Zone</h3>
              <div className="danger-zone-row">
                <div>
                  <div className="danger-zone-label">Delete this theme</div>
                  <div className="danger-zone-desc">Permanently removes the theme and all its data. Cannot be undone.</div>
                </div>
                <button className="danger-delete-btn" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={14} /> Delete Theme
                </button>
              </div>
            </section>

          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <ConfirmDeleteModal
          count={1}
          names={[theme.name || theme.id.slice(0, 8)]}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          deleting={deleting}
        />
      )}

      {/* Mapping editor — full-screen overlay */}
      {mappingOpen && (
        <ThemeMappingEditor
          theme={theme}
          onClose={() => setMappingOpen(false)}
          onSaved={(updated) => {
            setTheme(updated)
            onUpdated?.(updated)
            setMappingOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Community Theme Modal
// ─────────────────────────────────────────────────────────────────────────────

const CreateCommunityThemeModal = ({ onClose, onCreated }) => {
  const [name,    setName]    = useState('')
  const [url,     setUrl]     = useState('')
  const [status,  setStatus]  = useState('pending')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [preview, setPreview] = useState(false)

  const canSave = name.trim().length > 0

  const handleCreate = async () => {
    if (!canSave) return
    setSaving(true); setError('')
    try {
      const { data, error: err } = await supabase
        .from('themes')
        .insert({
          name:       name.trim(),
          url:        url.trim() || null,
          status,
          user_id:    null,   // null user_id = community theme
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (err) throw err
      onCreated(data)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="create-theme-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ctm-header">
          <div className="ctm-title">
            <Globe size={18} className="ctm-title-icon" />
            <h2>Add Community Theme</h2>
          </div>
          <button className="ctm-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="ctm-body">
          <p className="ctm-description">
            Community themes are available to all users. Only admins can create them from this panel.
          </p>

          {/* Name */}
          <div className="ctm-field">
            <label className="ctm-label">Theme Name <span className="ctm-required">*</span></label>
            <input
              className="ctm-input"
              placeholder="e.g. BGMI Pro League v2"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Image URL */}
          <div className="ctm-field">
            <label className="ctm-label">
              <LinkIcon size={12} /> Background Image URL
              <span className="ctm-optional">optional — can be added later</span>
            </label>
            <div className="ctm-url-row">
              <input
                className="ctm-input"
                placeholder="https://example.com/background.png"
                value={url}
                onChange={e => { setUrl(e.target.value); setPreview(false) }}
              />
              {url.trim() && (
                <button
                  className="ctm-preview-btn"
                  type="button"
                  onClick={() => setPreview(v => !v)}
                  title="Toggle image preview"
                >
                  <Eye size={14} /> {preview ? 'Hide' : 'Preview'}
                </button>
              )}
            </div>
            {preview && url.trim() && (
              <div className="ctm-img-preview">
                <img src={url.trim()} alt="preview"
                  onError={e => { e.currentTarget.style.display='none' }} />
              </div>
            )}
          </div>

          {/* Status */}
          <div className="ctm-field">
            <label className="ctm-label">Initial Status</label>
            <div className="ctm-status-pills">
              {['pending', 'verified'].map(s => (
                <button
                  key={s}
                  type="button"
                  className={`ctm-status-pill ${status === s ? 'active' : ''} ctm-pill-${s}`}
                  onClick={() => setStatus(s)}
                >
                  {s === 'verified' ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Community badge info */}
          <div className="ctm-info-banner">
            <Globe size={13} />
            <span>This theme will have <strong>no owner</strong> — it's shared across all users as a community design.</span>
          </div>

          {error && (
            <div className="ctm-error"><AlertCircle size={14} /> {error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="ctm-footer">
          <button className="ctm-cancel-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="ctm-create-btn"
            onClick={handleCreate}
            disabled={!canSave || saving}
          >
            {saving
              ? <><Loader2 size={14} className="spin" /> Creating…</>
              : <><Plus size={14} /> Create Community Theme</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ThemeBuilderView
// ─────────────────────────────────────────────────────────────────────────────

const ThemeBuilderView = ({ addLog }) => {
  const [themes, setThemes]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [imageErrors, setImageErrors] = useState({})
  const [activeFilter, setActiveFilter] = useState('all')   // verification status filter
  const [typeFilter, setTypeFilter]     = useState('all')   // 'all' | 'community' | 'custom'
  const [selectedTheme, setSelectedTheme] = useState(null)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  // Cache owner names for card chips (custom themes)
  const [ownerCache, setOwnerCache] = useState({}) // userId -> { display_name, username, emails }

  const fetchThemes = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('themes').select('*').order('created_at', { ascending: false })
      if (error) throw error
      const list = data || []
      setThemes(list)
      addLog?.('info', `Loaded ${list.length} themes`)

      // Batch-fetch unique owner profiles for custom themes
      const userIds = [...new Set(list.map(t => t.user_id).filter(Boolean))]
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, username')
          .in('id', userIds)
        if (profiles) {
          const map = {}
          profiles.forEach(p => { map[p.id] = p })
          setOwnerCache(map)
        }
      }
    } catch (err) {
      addLog?.('error', 'Failed to load themes', err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchThemes() }, [])

  // ── Counts ──
  const communityCount = themes.filter(t => !t.user_id).length
  const customCount    = themes.filter(t =>  t.user_id).length

  // Duplicate count (by url)
  const dupCount = (() => {
    const urlCounts = themes.reduce((acc, t) => {
      const key = (t.url || '').trim().toLowerCase()
      if (key) acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    return Object.values(urlCounts).reduce((sum, c) => sum + (c > 1 ? c - 1 : 0), 0)
  })()

  // Apply type filter first, then group by verification status
  const typeFiltered = typeFilter === 'all' ? themes
    : typeFilter === THEME_TYPE.COMMUNITY ? themes.filter(t => !t.user_id)
    : themes.filter(t => !!t.user_id)

  const groups = typeFiltered.reduce(
    (acc, t) => { const s = classifyTheme(t); acc[s].push(t); return acc },
    { verified: [], in_progress: [], pending: [] }
  )
  const statusOrder = [THEME_STATUS.VERIFIED, THEME_STATUS.IN_PROGRESS, THEME_STATUS.PENDING]
  const visibleGroups = activeFilter === 'all'
    ? statusOrder.filter((s) => groups[s].length > 0)
    : [activeFilter]

  const handleUpdated = (updated) => {
    setThemes((prev) => prev.map((t) => t.id === updated.id ? updated : t))
    if (selectedTheme?.id === updated.id) setSelectedTheme(updated)
    // If user_id changed (promote to community), keep cache as-is; entry becomes unused
  }

  const handleDeleted = (id) => {
    setThemes((prev) => prev.filter((t) => t.id !== id))
    if (selectedTheme?.id === id) setSelectedTheme(null)
  }

  const handleBulkDeleted = (ids) => {
    const idSet = new Set(ids)
    setThemes((prev) => prev.filter((t) => !idSet.has(t.id)))
    if (selectedTheme && idSet.has(selectedTheme.id)) setSelectedTheme(null)
  }

  const handleCreated = (newTheme) => {
    setThemes(prev => [newTheme, ...prev])
    setSelectedTheme(newTheme)
    addLog?.('info', `Created community theme: ${newTheme.name}`)
  }

  return (
    <div className="theme-gallery">
      <div className="gallery-header">
        <div className="gallery-header-text">
          <h2 className="gallery-title"><Palette size={22} /> Themes</h2>
          <p className="gallery-subtitle">
            Manage and organize all leaderboard themes. Click a card to view details, edit, or run a demo render.
          </p>
        </div>
        <div className="gallery-header-actions">
          {dupCount > 0 && (
            <button className="dup-alert-btn" onClick={() => setShowDuplicates(true)}>
              <Copy size={14} />
              {dupCount} duplicate{dupCount !== 1 ? 's' : ''} found
            </button>
          )}
          {dupCount === 0 && !loading && (
            <span className="no-dup-badge"><CopyCheck size={13} /> No duplicates</span>
          )}
          <button
            className="add-community-theme-btn"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={15} />
            Add Community Theme
          </button>
        </div>
      </div>

      {/* ── Type tabs ── */}
      <div className="theme-type-tabs">
        <button
          className={`theme-type-tab ${typeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setTypeFilter('all')}
        >
          <Users size={14} /> All Themes
          <span className="type-tab-count">{themes.length}</span>
        </button>
        <button
          className={`theme-type-tab ${typeFilter === THEME_TYPE.COMMUNITY ? 'active community' : ''}`}
          onClick={() => setTypeFilter(THEME_TYPE.COMMUNITY)}
        >
          <Globe size={14} /> Community
          <span className="type-tab-count">{communityCount}</span>
        </button>
        <button
          className={`theme-type-tab ${typeFilter === THEME_TYPE.CUSTOM ? 'active custom' : ''}`}
          onClick={() => setTypeFilter(THEME_TYPE.CUSTOM)}
        >
          <Lock size={14} /> Custom (User)
          <span className="type-tab-count">{customCount}</span>
        </button>
      </div>

      {/* ── Status filter chips ── */}
      <div className="gallery-filters">
        <button className={`filter-chip ${activeFilter === 'all' ? 'active' : ''}`} onClick={() => setActiveFilter('all')}>
          All <span className="filter-count">{typeFiltered.length}</span>
        </button>
        {statusOrder.map((s) => {
          const { Icon, label, accent } = STATUS_META[s]
          return (
            <button key={s}
              className={`filter-chip ${activeFilter === s ? 'active' : ''}`}
              onClick={() => setActiveFilter(s)}
              style={activeFilter === s ? { borderColor: accent, color: accent } : {}}>
              <Icon size={14} /> {label}
              <span className="filter-count">{groups[s].length}</span>
            </button>
          )
        })}
      </div>

      {/* ── Card list ── */}
      {loading ? (
        <div className="gallery-empty"><Loader2 size={28} className="spin" /><p>Loading themes…</p></div>
      ) : themes.length === 0 ? (
        <div className="gallery-empty">
          <Palette size={36} /><h3>No themes yet</h3><p>Upload or create your first leaderboard theme.</p>
        </div>
      ) : typeFiltered.length === 0 ? (
        <div className="gallery-empty">
          <Globe size={36} />
          <h3>No {typeFilter} themes</h3>
          <p>Switch to "All" or a different type filter to see themes.</p>
        </div>
      ) : (
        <div className="gallery-groups">
          {visibleGroups.length === 0 ? (
            <div className="gallery-empty"><AlertCircle size={32} /><p>No themes match this filter.</p></div>
          ) : visibleGroups.map((statusKey) => {
            const { Icon, accent, bg, description, label } = STATUS_META[statusKey]
            const items = groups[statusKey]
            return (
              <section key={statusKey} className="status-group">
                <header className="status-group-header" style={{ borderLeftColor: accent, background: bg }}>
                  <div className="status-group-title">
                    <Icon size={18} color={accent} />
                    <h3 style={{ color: accent }}>{label}<span className="status-group-count">{items.length}</span></h3>
                  </div>
                  <p className="status-group-desc">{description}</p>
                </header>
                <div className="theme-card-grid">
                  {items.map((theme) => {
                    const isBroken   = imageErrors[theme.id]
                    const cardMeta   = STATUS_META[classifyTheme(theme)]
                    const tType      = getThemeType(theme)
                    const tTypeMeta  = TYPE_META[tType]
                    const TTypeIcon  = tTypeMeta.Icon
                    const hasMapping = theme.mapping_config?.cells?.some(
                      (c) => Object.values(c).some((f) => f && (f.x || f.y))
                    )
                    const ownerProfile = theme.user_id ? ownerCache[theme.user_id] : null
                    const ownerLabel   = ownerProfile
                      ? (ownerProfile.display_name || ownerProfile.username || ownerProfile.emails || `#${theme.user_id.slice(0, 6)}`)
                      : null

                    return (
                      <article key={theme.id}
                        className={`theme-card status-${statusKey} theme-card-clickable`}
                        onClick={() => setSelectedTheme(theme)}>
                        <div className="theme-card-thumb" style={{ borderTopColor: cardMeta.accent }}>
                          {isBroken || !theme.url ? (
                            <div className="theme-card-fallback"><ImageIcon size={28} /><span>{theme.name || 'No Preview'}</span></div>
                          ) : (
                            <img src={theme.url} alt={theme.name || theme.id} loading="lazy"
                              onError={() => setImageErrors((p) => ({ ...p, [theme.id]: true }))} />
                          )}
                          <span className="theme-card-badge" style={{ background: cardMeta.accent }}>{cardMeta.label}</span>
                          {/* Type pill on thumb */}
                          <span className={`theme-card-type-pill ${tTypeMeta.chipClass}`}>
                            <TTypeIcon size={10} /> {tTypeMeta.label}
                          </span>
                          <div className="theme-card-hover-overlay"><Eye size={20} /><span>View Details</span></div>
                        </div>
                        <div className="theme-card-body">
                          <h4 className="theme-card-name">{theme.name || `Theme #${theme.id.slice(-4)}`}</h4>
                          <div className="theme-card-meta">
                            <span>Updated {formatDate(theme.updated_at || theme.created_at)}</span>
                            {/* Owner chip or community label */}
                            {tType === THEME_TYPE.COMMUNITY ? (
                              <span className="card-owner-chip community"><Globe size={10} /> Community</span>
                            ) : ownerLabel ? (
                              <span className="card-owner-chip custom" title={`Owner: ${ownerLabel}`}>
                                <User size={10} /> {ownerLabel.length > 18 ? ownerLabel.slice(0, 16) + '…' : ownerLabel}
                              </span>
                            ) : (
                              <span className="card-owner-chip custom faded"><User size={10} /> #{theme.user_id?.slice(0, 6)}</span>
                            )}
                          </div>
                          <div className="theme-card-footer-row">
                            {hasMapping
                              ? <span className="theme-card-mapping-badge mapped"><CheckCircle2 size={11} /> Mapping ready</span>
                              : <span className="theme-card-mapping-badge unmapped"><AlertCircle size={11} /> No mapping</span>}
                            <span className="theme-card-demo-hint"><Play size={11} /> Demo</span>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Drawer */}
      {selectedTheme && (
        <ThemeDetailDrawer
          theme={selectedTheme}
          onClose={() => setSelectedTheme(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}

      {/* Duplicates panel */}
      {showDuplicates && (
        <DuplicatesPanel
          themes={themes}
          onClose={() => setShowDuplicates(false)}
          onDeleted={handleBulkDeleted}
        />
      )}

      {/* Create community theme modal */}
      {showCreateModal && (
        <CreateCommunityThemeModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

export default ThemeBuilderView

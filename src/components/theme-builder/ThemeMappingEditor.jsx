import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Save, Loader2, CheckCircle2, AlertCircle, RotateCcw,
  Eye, EyeOff, ZoomIn, ZoomOut, Maximize2, Crosshair,
  Info, MousePointer2, Grid3X3,
  Layers, Type, Palette as PaletteIcon, CornerDownLeft,
  Trash2, Copy, ArrowLeft, SkipForward, Magnet,
  AlignCenter, Rows3, Wand2, RefreshCcw,
} from 'lucide-react'
import { DUMMY_TEAMS, FONT_OPTIONS, FONT_FAMILY_MAP, EMPTY_MAPPING_CONFIG, getFontFamily } from '../../constants/themeConstants'
import ClientPreviewOverlay from './ClientPreviewOverlay'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CELL_FIELDS = [
  { key: 'rank',  label: 'Rank',       color: '#4285f4', sample: '1' },
  { key: 'team',  label: 'Team Name',  color: '#188038', sample: 'ALPHA SQUAD' },
  { key: 'w',     label: 'Wins',       color: '#e37400', sample: '2' },
  { key: 'pp',    label: 'Placement',  color: '#c5221f', sample: '15' },
  { key: 'kp',    label: 'Kill Pts',   color: '#1a73e8', sample: '22' },
  { key: 'total', label: 'Total',      color: '#1765cc', sample: '38' },
  { key: 'mp',    label: 'Matches',    color: '#9334e6', sample: '6' },
]

const EXTRA_FIELDS = [
  { key: 'tournament_name',     label: 'Tournament Name',    color: '#e37400', sample: 'BGMI Grand Finals' },
  { key: 'lazarflow-watermark', label: 'LazarFlow Watermark', color: '#4a9eff', sample: 'lazarflow.app' },
]

const ALL_FIELDS = [...CELL_FIELDS, ...EXTRA_FIELDS]

// Snap tolerance in natural image pixels
const SNAP_TOLERANCE_PX = 30

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

const rgbToHex = (rgb) => {
  if (!rgb || rgb.length < 3) return '#ffffff'
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('')
}
const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]
const deepClone = (obj) => JSON.parse(JSON.stringify(obj))

// ── Schema helpers ──
// New schema: config.cells is { fieldKey: { x, y, alignment, font_size?, font_path?, color_rgb?, row_overrides?: { "0": {...} } } }
// row_overrides keys are string row indices "0".."11"

const buildInitialConfig = (existing) => {
  if (!existing) return deepClone(EMPTY_MAPPING_CONFIG)
  // Detect old array schema and migrate on-the-fly
  if (Array.isArray(existing?.cells)) {
    const migrated = deepClone(EMPTY_MAPPING_CONFIG)
    // Take field-level x/y from row 0 (most common position)
    const row0 = existing.cells[0] || {}
    CELL_FIELDS.forEach(({ key }) => {
      if (row0[key]) {
        migrated.cells[key] = {
          x:         row0[key].x         || 0,
          y:         row0[key].y         || 0,
          alignment: row0[key].alignment || 'center',
        }
        if (row0[key].font_size)  migrated.cells[key].font_size  = row0[key].font_size
        if (row0[key].font_path)  migrated.cells[key].font_path  = row0[key].font_path
        if (row0[key].color_rgb)  migrated.cells[key].color_rgb  = row0[key].color_rgb
      }
    })
    migrated.scoreboard   = existing.scoreboard   || migrated.scoreboard
    migrated.extra_fields = existing.extra_fields || migrated.extra_fields
    return migrated
  }
  // Already new schema or empty
  if (existing?.cells && typeof existing.cells === 'object') return deepClone(existing)
  return deepClone(EMPTY_MAPPING_CONFIG)
}

// Get effective value for a field at a specific row (resolves row_overrides)
const getRowValue = (fieldObj, rowIdx, key, fallback) => {
  if (!fieldObj) return fallback
  const override = fieldObj.row_overrides?.[String(rowIdx)]
  if (override && override[key] !== undefined) return override[key]
  return fieldObj[key] !== undefined ? fieldObj[key] : fallback
}

// Is a field placed (x or y is non-zero and not skipped)
const isFieldPlaced  = (f) => !!(f && !f.skipped && (f.x !== 0 || f.y !== 0))
const isFieldSkipped = (f) => f?.skipped === true
const isFieldDone    = (f) => !!(f && (f.skipped || f.x !== 0 || f.y !== 0))

// ── Google Fonts loader ──
// Injects a <link> tag for a Google Font family so the browser can render it
const loadedFamilies = new Set()
const loadGoogleFont = (family) => {
  if (!family || loadedFamilies.has(family)) return
  loadedFamilies.add(family)
  const id = `gf-${family.replace(/\s+/g, '-')}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id   = id
  link.rel  = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;600;700;800;900&display=swap`
  document.head.appendChild(link)
}

// Helper: readable display label from filename
const fontLabel = (filename) => filename.replace('.ttf', '').replace(/([A-Z])/g, ' $1').trim()

// ── FontPicker component ──
const FontPicker = ({ value, onChange }) => {
  const [search, setSearch] = useState('')
  const [open,   setOpen]   = useState(false)
  const ref = useRef(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? FONT_OPTIONS.filter(f => f.toLowerCase().includes(q)) : FONT_OPTIONS
  }, [search])

  // Load fonts for visible options
  useEffect(() => {
    filtered.slice(0, 30).forEach(f => {
      const fam = FONT_FAMILY_MAP[f]
      if (fam) loadGoogleFont(fam)
    })
  }, [filtered])

  // Load current value's font
  useEffect(() => {
    const fam = FONT_FAMILY_MAP[value]
    if (fam) loadGoogleFont(fam)
  }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  const currentFamily = FONT_FAMILY_MAP[value] || value?.replace('.ttf','').split('-')[0] || 'sans-serif'

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger button */}
      <button
        type="button"
        className="me-font-picker-trigger"
        onClick={() => setOpen(v => !v)}
        style={{ fontFamily: `"${currentFamily}", sans-serif` }}
      >
        <span className="me-font-picker-label">{fontLabel(value || FONT_OPTIONS[0])}</span>
        <span className="me-font-picker-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="me-font-picker-dropdown">
          <div className="me-font-picker-search-wrap">
            <input
              autoFocus
              className="me-font-picker-search"
              placeholder="Search fonts…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="me-font-picker-list">
            {filtered.length === 0 && (
              <div className="me-font-picker-empty">No fonts match "{search}"</div>
            )}
            {filtered.map(f => {
              const fam = FONT_FAMILY_MAP[f] || f.split('-')[0]
              return (
                <button
                  key={f}
                  type="button"
                  className={`me-font-picker-item ${f === value ? 'selected' : ''}`}
                  style={{ fontFamily: `"${fam}", sans-serif` }}
                  onClick={() => { onChange(f); setOpen(false); setSearch('') }}
                >
                  <span className="me-font-picker-item-preview" style={{ fontFamily: `"${fam}", sans-serif` }}>Aa</span>
                  <span className="me-font-picker-item-name">{fontLabel(f)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Snap / spacing helpers (new schema: cells is field-keyed object) ──
// X snap: look at other fields' x values for alignment hints
const getLockedX = (cells, fieldKey) => {
  const field = cells?.[fieldKey]
  return isFieldPlaced(field) ? field.x : null
}

// Y snap: look at other placed fields' y values — for cross-field row alignment
const getLockedRowY = (cells, _rowIdx) => {
  const ys = CELL_FIELDS
    .map(f => cells?.[f.key])
    .filter(f => isFieldPlaced(f))
    .map(f => f.y)
  if (ys.length === 0) return null
  const freq = ys.reduce((a, y) => { a[y] = (a[y] || 0) + 1; return a }, {})
  return parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0])
}

// Spacing detection is no longer per-row (positions are per-field now)
// Return null — snap still works via X/Y lock above
const detectYSpacing = () => null
const predictAllYs   = () => null

// ─────────────────────────────────────────────────────────────────────────────
// Smart snap: given a raw click coord, return snapped coord + snap info
// ─────────────────────────────────────────────────────────────────────────────

const applySnap = (rawX, rawY, cells, fieldKey, snapEnabled) => {
  if (!snapEnabled) return { x: rawX, y: rawY, snappedX: false, snappedY: false, snapXValue: null, snapYValue: null, snapYSource: null }

  const lockedX    = getLockedX(cells, fieldKey)
  const lockedRowY = getLockedRowY(cells, null)
  let snappedX = false, snappedY = false
  let finalX = rawX, finalY = rawY
  let snapYSource = null

  if (lockedX !== null && Math.abs(rawX - lockedX) <= SNAP_TOLERANCE_PX) {
    finalX = lockedX; snappedX = true
  }
  if (lockedRowY !== null && Math.abs(rawY - lockedRowY) <= SNAP_TOLERANCE_PX) {
    finalY = lockedRowY; snappedY = true; snapYSource = 'row'
  }

  return { x: finalX, y: finalY, snappedX, snappedY, snapXValue: lockedX, snapYValue: lockedRowY, snapYSource }
}

// ─────────────────────────────────────────────────────────────────────────────
// MappingOverlay
// ─────────────────────────────────────────────────────────────────────────────

const MappingOverlay = ({
  imageRef, imageUrl, config, activeField, activeRow, activeSection,
  pendingCoord, snapInfo, onImageClick, predictedYs,
}) => {
  const [dims, setDims] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const img = imageRef.current
    if (!img) return
    const update = () => {
      const r = img.getBoundingClientRect()
      if (r.width > 0) setDims({ w: r.width, h: r.height })
    }
    if (img.complete) update()
    img.addEventListener('load', update)
    window.addEventListener('resize', update)
    const t = setInterval(update, 300)
    return () => {
      img.removeEventListener('load', update)
      window.removeEventListener('resize', update)
      clearInterval(t)
    }
  }, [imageRef, imageUrl])

  const handleClick = useCallback((e) => {
    const img = imageRef.current
    if (!img) return
    const rect = img.getBoundingClientRect()
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    if (!nw || !nh) return

    // Click fraction within the displayed image (zoom-safe: both offset and
    // total width are in the same visual coordinate space, zoom cancels).
    // Save in NATURAL IMAGE pixel space — the backend draws directly on the
    // downloaded image at its original resolution with no canvas normalization.
    onImageClick({
      x: Math.round(((e.clientX - rect.left) / rect.width)  * nw),
      y: Math.round(((e.clientY - rect.top)  / rect.height) * nh),
      altKey: e.altKey,
    })
  }, [imageRef, onImageClick])

  if (!imageRef.current || dims.w === 0) return null
  const nw = imageRef.current.naturalWidth
  const nh = imageRef.current.naturalHeight
  if (!nw || !nh) return null

  // Scale from natural image pixels → display pixels.
  // Backend uses natural pixel coords directly, so we match that.
  const sx = dims.w / nw
  const sy = dims.h / nh

  // ── Placed dots (new schema: one dot per field) ──
  const dots = []
  CELL_FIELDS.forEach(({ key, color }) => {
    const c = config.cells?.[key]
    if (!isFieldPlaced(c)) return
    dots.push({
      x: c.x * sx, y: c.y * sy, color,
      label: key.toUpperCase(),
      isActive: activeField === key && activeSection === 'cells',
    })
  })
  config.extra_fields && EXTRA_FIELDS.forEach(({ key, color }) => {
    const c = config.extra_fields[key]
    if (!isFieldPlaced(c)) return
    dots.push({
      x: c.x * sx, y: c.y * sy, color,
      label: key.toUpperCase(),
      isActive: activeField === key && activeRow === -1,
    })
  })

  const activeMeta  = ALL_FIELDS.find(f => f.key === activeField)
  const activeColor = activeMeta?.color || '#4285f4'

  // ── Text preview ──
  const scoreboard    = config.scoreboard || {}
  const globalFontPx  = scoreboard.font_size || 130
  const globalFont    = scoreboard.font_path  || FONT_OPTIONS[0]
  const globalColorRgb = scoreboard.color_rgb || [255, 255, 255]
  let previewFontPx   = globalFontPx
  let previewFont     = globalFont
  let previewColorRgb = globalColorRgb
  let previewAlignment = 'center'

  if (activeRow === -1 && config.extra_fields?.[activeField]) {
    const ef = config.extra_fields[activeField]
    previewFontPx    = ef.font_size || globalFontPx
    previewFont      = ef.font_path || globalFont
    previewColorRgb  = ef.color_rgb || globalColorRgb
    previewAlignment = ef.alignment || 'center'
  } else if (activeSection === 'cells' && config.cells?.[activeField]) {
    const cf = config.cells[activeField]
    previewFontPx    = cf.font_size || globalFontPx
    previewFont      = cf.font_path || globalFont
    previewColorRgb  = cf.color_rgb || globalColorRgb
    previewAlignment = cf.alignment || 'center'
  }
  const scaledFontPx = previewFontPx * sy
  const fontFamily   = getFontFamily(previewFont)
  const textColor    = `rgba(${previewColorRgb.join(',')}, 0.92)`
  const sampleText   = activeMeta?.sample || activeField

  const crossX = pendingCoord ? pendingCoord.x * sx : null
  const crossY = pendingCoord ? pendingCoord.y * sy : null

  const placedCoord = (() => {
    if (activeRow === -1) {
      const ef = config.extra_fields?.[activeField]
      return isFieldPlaced(ef) ? ef : null
    }
    const cf = config.cells?.[activeField]
    return isFieldPlaced(cf) ? cf : null
  })()

  const textX = crossX !== null ? crossX : (placedCoord ? placedCoord.x * sx : null)
  const textY = crossY !== null ? crossY : (placedCoord ? placedCoord.y * sy : null)
  const textAlignment = (crossX === null && placedCoord)
    ? (placedCoord.alignment || previewAlignment) : previewAlignment

  // ── Snap guide: vertical line at locked X ──
  const lockedX = getLockedX(config.cells || {}, activeField)
  const snapLineX = lockedX !== null ? lockedX * sx : null

  return (
    <div
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair', zIndex: 10 }}
      onClick={handleClick}
    >
      {/* ── Column snap guide line ── */}
      {snapLineX !== null && !pendingCoord && (
        <div style={{
          position: 'absolute',
          left: snapLineX, top: 0,
          width: 1, height: '100%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none', zIndex: 8,
          background: `${activeColor}33`,
          borderLeft: `1px dashed ${activeColor}66`,
        }} />
      )}

      {/* ── Row Y guide line — removed in new schema (single position per field) ── */}

      {/* ── Ghost predictions removed — new schema has one position per field ── */}

      {/* ── Placed dots ── */}
      {dots.map((dot, i) => (
        <div key={i} style={{
          position: 'absolute', left: dot.x, top: dot.y,
          transform: 'translate(-50%, -50%)',
          zIndex: dot.isActive ? 20 : 15,
          pointerEvents: 'none',
        }}>
          <div style={{
            width: dot.isActive ? 14 : 9,
            height: dot.isActive ? 14 : 9,
            borderRadius: '50%',
            background: dot.color,
            border: `${dot.isActive ? 3 : 2}px solid rgba(255,255,255,0.95)`,
            boxShadow: dot.isActive
              ? `0 0 0 3px ${dot.color}55, 0 2px 8px rgba(0,0,0,0.5)`
              : `0 0 0 2px ${dot.color}33`,
            transition: 'all 0.15s ease',
          }} />
          <div style={{
            position: 'absolute',
            left: dot.isActive ? 18 : 12, top: dot.isActive ? -10 : -7,
            background: `${dot.color}${dot.isActive ? 'ff' : 'cc'}`,
            color: '#fff', fontSize: dot.isActive ? 10 : 9, fontWeight: 800,
            padding: dot.isActive ? '2px 8px' : '1px 5px',
            borderRadius: 4, whiteSpace: 'nowrap',
            boxShadow: dot.isActive ? '0 2px 8px rgba(0,0,0,0.4)' : 'none',
            opacity: dot.isActive ? 1 : 0.85,
          }}>{dot.label}</div>
        </div>
      ))}

      {/* ── Crosshair at pending coord ── */}
      {crossX !== null && crossY !== null && (
        <>
          {/* Vertical guide — highlight in green if X-snapped */}
          <div style={{
            position: 'absolute', left: crossX, top: 0,
            width: snapInfo?.snappedX ? 2 : 1, height: '100%',
            transform: 'translateX(-50%)', pointerEvents: 'none',
            background: snapInfo?.snappedX ? `${activeColor}cc` : 'transparent',
            backgroundImage: snapInfo?.snappedX ? 'none'
              : `repeating-linear-gradient(to bottom, ${activeColor}bb 0px, ${activeColor}bb 5px, transparent 5px, transparent 11px)`,
          }} />
          {/* Horizontal guide — highlight if Y-snapped */}
          <div style={{
            position: 'absolute', top: crossY, left: 0,
            height: snapInfo?.snappedY ? 2 : 1, width: '100%',
            transform: 'translateY(-50%)', pointerEvents: 'none',
            background: snapInfo?.snappedY ? `${activeColor}cc` : 'transparent',
            backgroundImage: snapInfo?.snappedY ? 'none'
              : `repeating-linear-gradient(to right, ${activeColor}bb 0px, ${activeColor}bb 5px, transparent 5px, transparent 11px)`,
          }} />
          {/* Center pin */}
          <div style={{
            position: 'absolute', left: crossX, top: crossY,
            width: 14, height: 14, borderRadius: '50%',
            background: activeColor, border: '2.5px solid #fff',
            transform: 'translate(-50%, -50%)', pointerEvents: 'none',
            boxShadow: `0 0 0 4px ${activeColor}44, 0 2px 12px rgba(0,0,0,0.35)`,
          }} />
          {/* Snap badges */}
          {snapInfo?.snappedX && (
            <div style={{
              position: 'absolute', left: crossX, top: 6,
              transform: 'translateX(-50%)',
              background: activeColor, color: '#fff',
              fontSize: 9, fontWeight: 800,
              padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
              pointerEvents: 'none', zIndex: 40,
            }}>⊕ X snapped</div>
          )}
          {snapInfo?.snappedY && (
            <div style={{
              position: 'absolute', left: 6, top: crossY,
              transform: 'translateY(-50%)',
              background: activeColor, color: '#fff',
              fontSize: 9, fontWeight: 800,
              padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
              pointerEvents: 'none', zIndex: 40,
            }}>⊕ {snapInfo.snapYSource === 'row' ? 'Row Y locked' : 'Y predicted'}</div>
          )}
        </>
      )}

      {/* ── Sample text ── */}
      {textX !== null && textY !== null && (
        <div style={{
          position: 'absolute', left: textX, top: textY,
          pointerEvents: 'none', zIndex: 30,
          display: 'inline-block',  // width = text width, mirrors PIL text_width
          lineHeight: 1,            // removes CSS leading, top ≈ PIL ascender anchor
          transform: textAlignment === 'center' ? 'translateX(-50%)'
            : textAlignment === 'right' ? 'translateX(-100%)' : 'none',
          fontFamily,
          fontSize: `${scaledFontPx}px`,
          fontWeight: 'bold',
          color: textColor,
          whiteSpace: 'nowrap',
          textShadow: '0 0 12px rgba(0,0,0,0.7), 1px 1px 3px rgba(0,0,0,0.8)',
          userSelect: 'none',
          WebkitTextStroke: '0.5px rgba(0,0,0,0.3)',
          opacity: crossX !== null ? 1 : 0.75,
        }}>
          {sampleText}
        </div>
      )}
    </div>
  )
}

// Need to pass activeSection down — expose as prop
// We'll just read it from the closure via the parent passing it

// ─────────────────────────────────────────────────────────────────────────────
// Main ThemeMappingEditor
// ─────────────────────────────────────────────────────────────────────────────

const ThemeMappingEditor = ({ theme, onClose, onSaved }) => {
  const [config, setConfig]   = useState(() => buildInitialConfig(theme.mapping_config))
  const [history, setHistory] = useState([])
  const [dirty, setDirty]     = useState(false)

  const [activeField,   setActiveField]   = useState(CELL_FIELDS[0].key)
  const [activeRow,     setActiveRow]     = useState(0)
  const [activeSection, setActiveSection] = useState('cells')

  const [pendingCoord, setPendingCoord] = useState(null)
  const [snapInfo,     setSnapInfo]     = useState(null) // { snappedX, snappedY }
  const [snapEnabled,  setSnapEnabled]  = useState(true) // user can toggle snap

  const [previewMode, setPreviewMode] = useState('off') // 'off' | 'client' | 'server'

  // Server-side preview render state
  const [serverPreviewUrl,     setServerPreviewUrl]     = useState(null)
  const [serverPreviewLoading, setServerPreviewLoading] = useState(false)
  const [serverPreviewError,   setServerPreviewError]   = useState('')

  const imgRef = useRef(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)

  const [saving,    setSaving]    = useState(false)
  const [saveOk,    setSaveOk]    = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── Derived ──
  const activeFieldMeta = activeSection === 'extra'
    ? EXTRA_FIELDS.find(f => f.key === activeField)
    : CELL_FIELDS.find(f => f.key === activeField)

  const currentCoords = activeSection === 'extra'
    ? (config.extra_fields?.[activeField] || { x: 0, y: 0, alignment: 'center' })
    : (config.cells?.[activeField] || { x: 0, y: 0, alignment: 'center' })

  const isPlaced  = !currentCoords.skipped && (currentCoords.x !== 0 || currentCoords.y !== 0)
  const isSkipped = currentCoords.skipped === true
  const activeColor = activeFieldMeta?.color || '#4285f4'

  // Font size — field-level (with row_overrides handled separately in the row overrides panel)
  const currentFieldFontSize = activeSection === 'extra'
    ? (config.extra_fields?.[activeField]?.font_size ?? (activeField === 'lazarflow-watermark' ? 60 : 200))
    : (config.cells?.[activeField]?.font_size ?? config.scoreboard?.font_size ?? 130)

  // Font path override for the active field (null = inherit from scoreboard)
  const currentFieldFontPath = activeSection === 'extra'
    ? (config.extra_fields?.[activeField]?.font_path ?? null)
    : (config.cells?.[activeField]?.font_path ?? null)

  // ── Smart analysis ──
  const lockedX = useMemo(() =>
    activeSection === 'cells' ? getLockedX(config.cells || {}, activeField) : null
  , [config.cells, activeField, activeSection])

  const predictedYs   = null  // removed in new schema
  const spacingDetected = null

  const placedRowCount = 0 // not applicable in new schema

  // Progress counts — new schema: one slot per field
  const totalCellSlots  = CELL_FIELDS.length
  const placedCellSlots = CELL_FIELDS.filter(f => isFieldDone(config.cells?.[f.key])).length
  const placedExtraSlots = EXTRA_FIELDS.filter(f =>
    isFieldDone(config.extra_fields?.[f.key])).length

  // ── Config updater ──
  const pushHistory = useCallback((prev) => {
    setHistory(h => [...h.slice(-29), deepClone(prev)])
  }, [])

  const updateConfig = useCallback((updater) => {
    setConfig(prev => {
      pushHistory(prev)
      const next = deepClone(prev)
      updater(next)
      setDirty(true)
      return next
    })
  }, [pushHistory])

  const handleUndo = useCallback(() => {
    if (history.length === 0) return
    setConfig(history[history.length - 1])
    setHistory(h => h.slice(0, -1))
    setDirty(true)
  }, [history])

  // ── Image click → pending coord with snap applied ──
  const handleImageClick = useCallback(({ x, y, altKey }) => {
    if (activeSection === 'extra' || altKey) {
      setPendingCoord({ x, y })
      setSnapInfo({ snappedX: false, snappedY: false, snapYSource: null, raw: { x, y }, bypassed: altKey })
      return
    }
    const result = applySnap(x, y, config.cells || {}, activeField, snapEnabled)
    setPendingCoord({ x: result.x, y: result.y })
    setSnapInfo({
      snappedX: result.snappedX,
      snappedY: result.snappedY,
      snapYSource: result.snapYSource,
      raw: { x, y },
      bypassed: false,
    })
  }, [activeSection, config.cells, activeField, snapEnabled])

  // ── Auto-advance to next unplaced field ──
  const autoAdvance = useCallback(() => {
    if (activeSection === 'extra') return
    const currentIdx = CELL_FIELDS.findIndex(f => f.key === activeField)
    for (let i = currentIdx + 1; i < CELL_FIELDS.length; i++) {
      if (!isFieldDone(config.cells?.[CELL_FIELDS[i].key])) {
        setActiveField(CELL_FIELDS[i].key); return
      }
    }
  }, [activeSection, activeField, config.cells])

  // ── Assign ──
  const handleAssign = useCallback(() => {
    if (!pendingCoord) return
    const { x, y } = pendingCoord
    updateConfig(next => {
      if (activeSection === 'extra') {
        if (!next.extra_fields) next.extra_fields = {}
        if (!next.extra_fields[activeField])
          next.extra_fields[activeField] = { x: 0, y: 0, alignment: 'center', font_size: 200 }
        next.extra_fields[activeField].x = x
        next.extra_fields[activeField].y = y
        delete next.extra_fields[activeField].skipped
      } else {
        if (!next.cells[activeField]) next.cells[activeField] = { x: 0, y: 0, alignment: 'center' }
        next.cells[activeField].x = x
        next.cells[activeField].y = y
        delete next.cells[activeField].skipped
      }
    })
    setPendingCoord(null)
    setSnapInfo(null)
    autoAdvance()
  }, [pendingCoord, activeSection, activeField, updateConfig, autoAdvance])

  // ── Skip ──
  const handleSkip = useCallback(() => {
    updateConfig(next => {
      if (activeSection === 'extra') {
        const ef = (next.extra_fields ??= {})
        ef[activeField] = ef[activeField] || { x: 0, y: 0, alignment: 'center', font_size: 200 }
        ef[activeField].skipped = true
        ef[activeField].x = 0
        ef[activeField].y = 0
      } else {
        if (!next.cells[activeField]) next.cells[activeField] = { x: 0, y: 0, alignment: 'center' }
        next.cells[activeField].skipped = true
        next.cells[activeField].x = 0
        next.cells[activeField].y = 0
      }
    })
    setPendingCoord(null)
    autoAdvance()
  }, [activeSection, activeField, updateConfig, autoAdvance])

  const handleUnskip = useCallback(() => {
    updateConfig(next => {
      const target = activeSection === 'extra'
        ? next.extra_fields?.[activeField]
        : next.cells?.[activeField]
      if (target) delete target.skipped
    })
  }, [activeSection, activeField, updateConfig])

  // ── Clear ──
  const handleClear = useCallback(() => {
    updateConfig(next => {
      const target = activeSection === 'extra'
        ? next.extra_fields?.[activeField]
        : next.cells?.[activeField]
      if (target) { target.x = 0; target.y = 0; delete target.skipped }
    })
    setPendingCoord(null)
  }, [activeSection, activeField, updateConfig])

  // ── Alignment ──
  const handleAlignmentChange = useCallback((alignment) => {
    updateConfig(next => {
      const target = activeSection === 'extra'
        ? next.extra_fields?.[activeField]
        : next.cells?.[activeField]
      if (target) target.alignment = alignment
    })
  }, [activeSection, activeField, updateConfig])

  // handleApplyAlignmentToAll — not needed in new schema (one position per field)
  const handleApplyAlignmentToAll = handleAlignmentChange

  // ── Smart tools — simplified for new schema ──
  const handleLockColumnX = useCallback(() => {}, [])
  const handleLockRowY    = useCallback(() => {}, [])
  const handleAutoFillSpacing = useCallback(() => {}, [])
  const handleInterpolate = useCallback(() => {}, [])

  // ── Per-field font size — field-level + row_overrides for per-row ──
  const handleFieldFontSizeChange = useCallback((size, rowIdx = null) => {
    if (activeSection === 'extra') {
      updateConfig(next => {
        if (!next.extra_fields?.[activeField]) return
        next.extra_fields[activeField].font_size = size
      })
    } else {
      updateConfig(next => {
        if (!next.cells[activeField]) return
        if (rowIdx === null) {
          // field-level default
          next.cells[activeField].font_size = size
        } else {
          // row override
          if (!next.cells[activeField].row_overrides) next.cells[activeField].row_overrides = {}
          if (!next.cells[activeField].row_overrides[String(rowIdx)])
            next.cells[activeField].row_overrides[String(rowIdx)] = {}
          next.cells[activeField].row_overrides[String(rowIdx)].font_size = size
        }
      })
    }
  }, [activeSection, activeField, updateConfig])

  // ── Per-field font path — field-level ──
  const handleFieldFontPathChange = useCallback((fontPath, rowIdx = null) => {
    if (activeSection === 'extra') {
      updateConfig(next => {
        if (!next.extra_fields?.[activeField]) return
        if (fontPath) next.extra_fields[activeField].font_path = fontPath
        else delete next.extra_fields[activeField].font_path
      })
    } else {
      updateConfig(next => {
        if (!next.cells[activeField]) return
        if (rowIdx === null) {
          if (fontPath) next.cells[activeField].font_path = fontPath
          else delete next.cells[activeField].font_path
        } else {
          if (!next.cells[activeField].row_overrides) next.cells[activeField].row_overrides = {}
          if (!next.cells[activeField].row_overrides[String(rowIdx)])
            next.cells[activeField].row_overrides[String(rowIdx)] = {}
          if (fontPath) next.cells[activeField].row_overrides[String(rowIdx)].font_path = fontPath
          else delete next.cells[activeField].row_overrides[String(rowIdx)].font_path
        }
      })
    }
  }, [activeSection, activeField, updateConfig])

  // ── Scoreboard ──
  const handleScoreboardChange = useCallback((key, value) => {
    updateConfig(next => {
      if (!next.scoreboard) next.scoreboard = {}
      next.scoreboard[key] = value
    })
  }, [updateConfig])

  // ── Save ──
  const handleSave = async () => {
    setSaving(true); setSaveError(''); setSaveOk(false)
    try {
      const { error } = await supabase.from('themes')
        .update({ mapping_config: config, updated_at: new Date().toISOString() })
        .eq('id', theme.id)
      if (error) throw error
      setSaveOk(true); setDirty(false)
      onSaved?.({ ...theme, mapping_config: config })
      setTimeout(() => setSaveOk(false), 3000)
    } catch (e) { setSaveError(e.message) }
    finally     { setSaving(false) }
  }

  // ── Server-side preview render ──
  const fetchServerPreview = useCallback(async () => {
    setServerPreviewLoading(true)
    setServerPreviewError('')
    if (serverPreviewUrl) { URL.revokeObjectURL(serverPreviewUrl); setServerPreviewUrl(null) }
    try {
      const res = await fetch('/api/render/preview-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeId: theme.id }),
      })
      if (!res.ok) {
        let msg = `Error ${res.status}`
        try { const j = await res.json(); msg = j.error || j.message || msg } catch (_) {}
        throw new Error(msg)
      }
      const blob = await res.blob()
      setServerPreviewUrl(URL.createObjectURL(blob))
    } catch (e) {
      setServerPreviewError(e.message)
    } finally {
      setServerPreviewLoading(false)
    }
  }, [theme.id, serverPreviewUrl])

  // Revoke blob on unmount
  useEffect(() => () => { if (serverPreviewUrl) URL.revokeObjectURL(serverPreviewUrl) }, [serverPreviewUrl])

  // Auto-fetch server preview when mode switches to 'server'
  useEffect(() => {
    if (previewMode === 'server') fetchServerPreview()
  }, [previewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const fn = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); handleUndo() }
      if (e.key === 'Enter' && pendingCoord) { e.preventDefault(); handleAssign() }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (pendingCoord) { setPendingCoord(null); setSnapInfo(null) }
        else if (previewMode !== 'off') setPreviewMode('off')
        else onClose()
      }
      if (e.key === 'p' || e.key === 'P') {
        setPreviewMode(prev => {
          if (prev === 'off')    return 'client'
          if (prev === 'client') return 'server'
          return 'off'
        })
      }
      // Arrow nudge — only in editing mode
      if (previewMode === 'off' && !pendingCoord && isPlaced && activeSection === 'cells') {
        const step = e.shiftKey ? 10 : 1
        let dx = 0, dy = 0
        if (e.key === 'ArrowLeft')  { dx = -step; e.preventDefault() }
        if (e.key === 'ArrowRight') { dx =  step; e.preventDefault() }
        if (e.key === 'ArrowUp')    { dy = -step; e.preventDefault() }
        if (e.key === 'ArrowDown')  { dy =  step; e.preventDefault() }
        if (dx !== 0 || dy !== 0) {
          updateConfig(next => {
            const f = next.cells[activeRow][activeField]
            if (f && !f.skipped) { f.x = Math.max(0, f.x + dx); f.y = Math.max(0, f.y + dy) }
          })
        }
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [handleUndo, handleAssign, pendingCoord, onClose, previewMode, isPlaced, activeSection, activeRow, activeField, updateConfig])

  // ── Helpers ──
  const isRowComplete     = (ri) => CELL_FIELDS.every(f => isFieldDone(config.cells?.[ri]?.[f.key]))
  const isFieldDoneInRow  = (ri, fk) => isFieldDone(config.cells?.[ri]?.[fk])
  const isFieldSkippedInRow = (ri, fk) => isFieldSkipped(config.cells?.[ri]?.[fk])

  // Smart status labels
  const smartStatus = useMemo(() => {
    if (activeSection !== 'cells') return null
    if (placedRowCount === 0) return { type: 'idle',    msg: 'Click row 1 to start' }
    if (placedRowCount === 1) return { type: 'hint',    msg: 'Click row 2 to detect spacing' }
    if (spacingDetected && predictedYs && placedRowCount < 12)
      return { type: 'ready',   msg: `Spacing detected (${Math.round(spacingDetected.gap)}px/row) · Auto-fill available` }
    if (placedRowCount === 12) return { type: 'done',   msg: 'All 12 rows placed' }
    return { type: 'partial', msg: `${placedRowCount}/12 rows placed` }
  }, [activeSection, placedRowCount, spacingDetected, predictedYs])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="mapping-editor-shell" onClick={onClose}>
      <div className="mapping-editor" onClick={e => e.stopPropagation()}>

        {/* ══ TOP BAR ══ */}
        <div className="me-topbar">
          <button className="me-back-btn" onClick={onClose}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="me-title">
            <Crosshair size={16} />
            <span>Mapping Editor</span>
            <span className="me-theme-name">— {theme.name || theme.id.slice(0, 8)}</span>
          </div>
          <div className="me-topbar-right">
            <span className="me-progress-text">
              {placedCellSlots}/{totalCellSlots} cells · {placedExtraSlots}/{EXTRA_FIELDS.length} extras
            </span>
            <div className="me-progress-bar">
              <div className="me-progress-fill" style={{ width: `${(placedCellSlots / totalCellSlots) * 100}%` }} />
            </div>
            <button className="me-undo-btn" onClick={handleUndo} disabled={history.length === 0} title="Undo (⌘Z)">
              <RotateCcw size={14} />
            </button>
            <button
              className={`me-preview-btn ${previewMode !== 'off' ? 'active' : ''} ${previewMode === 'server' ? 'server' : ''}`}
              onClick={() => setPreviewMode(prev =>
                prev === 'off' ? 'client' : prev === 'client' ? 'server' : 'off'
              )}
              title="Cycle preview: Off → Client overlay → Server render (P)"
            >
              {previewMode === 'off'    && <><Eye size={14} /> Preview</>}
              {previewMode === 'client' && <><EyeOff size={14} /> Client</>}
              {previewMode === 'server' && <><EyeOff size={14} /> Server</>}
            </button>
            {dirty && !saveOk && (
              <button className="me-save-btn" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={14} className="spin" /> Saving…</> : <><Save size={14} /> Save</>}
              </button>
            )}
            {saveOk && <span className="me-saved-badge"><CheckCircle2 size={13} /> Saved</span>}
          </div>
        </div>

        {saveError && <div className="me-error-bar"><AlertCircle size={14} />{saveError}</div>}

        <div className="me-body">

          {/* ══ LEFT PANEL ══ */}
          <div className="me-left">

            <div className="me-section-tabs">
              <button
                className={`me-section-tab ${activeSection === 'cells' ? 'active' : ''}`}
                onClick={() => { setActiveSection('cells'); setActiveField(CELL_FIELDS[0].key); setActiveRow(0) }}
              >
                <Grid3X3 size={13} /> Scoreboard Rows
              </button>
              <button
                className={`me-section-tab ${activeSection === 'extra' ? 'active' : ''}`}
                onClick={() => { setActiveSection('extra'); setActiveField(EXTRA_FIELDS[0].key); setActiveRow(-1) }}
              >
                <Type size={13} /> Extra Fields
              </button>
            </div>

            {activeSection === 'cells' && (
              <>
                {/* Field selector */}
                <div className="me-panel-section">
                  <div className="me-panel-label"><Layers size={12} /> Field</div>
                  <div className="me-field-grid">
                    {CELL_FIELDS.map(({ key, label, color }) => {
                      const skipped = isFieldSkippedInRow(activeRow, key)
                      const done    = isFieldDoneInRow(activeRow, key)
                      return (
                        <button
                          key={key}
                          className={`me-field-btn ${activeField === key ? 'active' : ''} ${skipped ? 'skipped' : ''}`}
                          style={activeField === key ? { borderColor: color, background: `${color}15`, color } : {}}
                          onClick={() => { setActiveField(key); setPendingCoord(null); setSnapInfo(null) }}
                        >
                          <span className="me-field-dot" style={{ background: skipped ? '#bdc1c6' : color }} />
                          <span className="me-field-btn-label">{label}</span>
                          {skipped && <span className="me-skip-indicator"><SkipForward size={9} /></span>}
                          {done && !skipped && <span className="me-done-indicator"><CheckCircle2 size={9} /></span>}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Row selector */}
                <div className="me-panel-section">
                  <div className="me-panel-label"><Grid3X3 size={12} /> Row</div>
                  <div className="me-row-grid">
                    {Array.from({ length: 12 }, (_, i) => {
                      const complete  = isRowComplete(i)
                      const fieldDone = isFieldDoneInRow(i, activeField)
                      const fieldSkip = isFieldSkippedInRow(i, activeField)
                      const isActive  = activeRow === i
                      const isPredicted = predictedYs && !fieldDone && !fieldSkip && lockedX
                      return (
                        <button
                          key={i}
                          className={[
                            'me-row-btn',
                            isActive   ? 'active'       : '',
                            complete   ? 'complete'     : '',
                            fieldDone && !isActive && !complete ? 'field-placed' : '',
                            fieldSkip && !isActive ? 'field-skipped' : '',
                            isPredicted && !isActive ? 'predicted' : '',
                          ].join(' ')}
                          onClick={() => { setActiveRow(i); setPendingCoord(null); setSnapInfo(null) }}
                          style={isActive ? { borderColor: activeColor, background: `${activeColor}15`, color: activeColor } : {}}
                          title={`Row ${i + 1}${complete ? ' ✓' : ''}${fieldSkip ? ' (skipped)' : ''}${isPredicted ? ' (predicted)' : ''}`}
                        >
                          <span>{DUMMY_TEAMS[i]?.rank}</span>
                          {complete   && <CheckCircle2 size={9} />}
                          {fieldSkip && !complete && <SkipForward size={9} style={{ opacity: 0.5 }} />}
                          {fieldDone && !fieldSkip && !complete && (
                            <span className="me-row-dot" style={{ background: activeColor }} />
                          )}
                          {isPredicted && (
                            <span className="me-row-predicted-dot" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* ── Smart status + actions ── */}
                <div className="me-panel-section me-smart-section">
                  <div className="me-panel-label"><Wand2 size={12} /> Smart Tools</div>

                  {/* Status pill */}
                  {smartStatus && (
                    <div className={`me-smart-status status-${smartStatus.type}`}>
                      {smartStatus.type === 'done'    && <CheckCircle2 size={12} />}
                      {smartStatus.type === 'ready'   && <Wand2 size={12} />}
                      {smartStatus.type === 'partial' && <Rows3 size={12} />}
                      {smartStatus.type === 'hint'    && <Info size={12} />}
                      {smartStatus.type === 'idle'    && <MousePointer2 size={12} />}
                      <span>{smartStatus.msg}</span>
                    </div>
                  )}

                  {/* Snap toggle */}
                  <div className="me-snap-row">
                    <button
                      className={`me-snap-toggle ${snapEnabled ? 'active' : ''}`}
                      onClick={() => setSnapEnabled(v => !v)}
                    >
                      <Magnet size={13} />
                      {snapEnabled ? 'Snap ON' : 'Snap OFF'}
                    </button>
                    {lockedX !== null && (
                      <span className="me-snap-x-badge">
                        col X = {lockedX}
                      </span>
                    )}
                  </div>

                  {/* Lock column X */}
                  {lockedX !== null && (
                    <button className="me-smart-btn" onClick={handleLockColumnX}>
                      <AlignCenter size={12} />
                      Apply X={lockedX} to all 12 rows
                    </button>
                  )}

                  {/* Lock row Y — level all fields in this row */}
                  {(() => {
                    const rowY = getLockedRowY(config.cells || [], activeRow)
                    const unleveled = CELL_FIELDS.some(f => {
                      const c = config.cells?.[activeRow]?.[f.key]
                      return isFieldPlaced(c) && c.y !== rowY
                    })
                    if (!rowY) return null
                    return (
                      <button
                        className={`me-smart-btn ${unleveled ? 'primary' : ''}`}
                        onClick={handleLockRowY}
                        title={`Set all fields in row ${activeRow + 1} to Y=${rowY}`}
                      >
                        <Rows3 size={12} />
                        Level row {activeRow + 1} to Y={rowY}
                        {unleveled && <span className="me-smart-badge">fix</span>}
                      </button>
                    )
                  })()}

                  {/* Auto-fill from spacing */}
                  {spacingDetected && lockedX !== null && placedRowCount < 12 && (
                    <button className="me-smart-btn primary" onClick={handleAutoFillSpacing}>
                      <Wand2 size={12} />
                      Auto-fill all rows ({Math.round(spacingDetected.gap)}px spacing)
                    </button>
                  )}

                  {/* Interpolate row 1 → 12 */}
                  <button
                    className="me-smart-btn"
                    onClick={() => handleInterpolate(activeField)}
                    disabled={!config.cells?.[0]?.[activeField] || config.cells[0][activeField].x === 0}
                  >
                    <Rows3 size={12} />
                    Interpolate rows 1–12
                  </button>
                </div>
              </>
            )}

            {activeSection === 'extra' && (
              <div className="me-panel-section">
                <div className="me-panel-label"><Type size={12} /> Extra Fields</div>
                <div className="me-field-grid">
                  {EXTRA_FIELDS.map(({ key, label, color }) => {
                    const skipped = isFieldSkipped(config.extra_fields?.[key])
                    const done    = isFieldDone(config.extra_fields?.[key])
                    return (
                      <button
                        key={key}
                        className={`me-field-btn ${activeField === key ? 'active' : ''} ${skipped ? 'skipped' : ''}`}
                        style={activeField === key ? { borderColor: color, background: `${color}15`, color } : {}}
                        onClick={() => { setActiveField(key); setPendingCoord(null) }}
                      >
                        <span className="me-field-dot" style={{ background: skipped ? '#bdc1c6' : color }} />
                        <span className="me-field-btn-label">{label}</span>
                        {skipped && <span className="me-skip-indicator"><SkipForward size={9} /></span>}
                        {done && !skipped && <span className="me-done-indicator"><CheckCircle2 size={9} /></span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Coords card ── */}
            <div className="me-coords-card" style={{ borderColor: `${activeColor}55` }}>
              <div className="me-coords-header" style={{ color: activeColor }}>
                <span className="me-field-dot" style={{ background: isSkipped ? '#bdc1c6' : activeColor }} />
                <strong>{activeFieldMeta?.label}</strong>
                {isSkipped && <span className="me-skipped-tag"><SkipForward size={11} /> Skipped</span>}
                {activeSection === 'cells' && <span className="me-coords-row-tag">Row {activeRow + 1}</span>}
              </div>
              <div className="me-coords-body">
                {!isSkipped && (
                  <div className="me-coord-row">
                    <span className="me-coord-label">X</span>
                    <span className="me-coord-value" style={currentCoords.x !== 0 ? { color: activeColor } : {}}>
                      {currentCoords.x !== 0 ? currentCoords.x : '—'}
                    </span>
                    <span className="me-coord-label">Y</span>
                    <span className="me-coord-value" style={currentCoords.y !== 0 ? { color: activeColor } : {}}>
                      {currentCoords.y !== 0 ? currentCoords.y : '—'}
                    </span>
                  </div>
                )}

                {/* Manual X/Y inputs */}
                {!isSkipped && !pendingCoord && activeSection === 'cells' && (
                  <div className="me-manual-inputs">
                    <label className="me-manual-label">Manual</label>
                    <input
                      type="number"
                      className="me-manual-input"
                      placeholder="X"
                      value={currentCoords.x !== 0 ? currentCoords.x : ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        if (isNaN(val)) return
                        updateConfig(next => { next.cells[activeRow][activeField].x = val })
                      }}
                    />
                    <input
                      type="number"
                      className="me-manual-input"
                      placeholder="Y"
                      value={currentCoords.y !== 0 ? currentCoords.y : ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        if (isNaN(val)) return
                        updateConfig(next => { next.cells[activeRow][activeField].y = val })
                      }}
                    />
                  </div>
                )}

                {/* Arrow nudge hint */}
                {isPlaced && !pendingCoord && activeSection === 'cells' && (
                  <p className="me-nudge-hint">
                    <span className="me-nudge-keys">← → ↑ ↓</span> nudge 1px &nbsp;·&nbsp;
                    <span className="me-nudge-keys">⇧+arrow</span> 10px
                  </p>
                )}

                {pendingCoord && !isSkipped && (
                  <div className="me-pending-block">
                    <div className="me-pending-row" style={{ borderColor: activeColor, background: `${activeColor}10` }}>
                      <MousePointer2 size={12} style={{ color: activeColor, flexShrink: 0 }} />
                      <span className="me-pending-label">Pending:</span>
                      <span className="me-pending-coords" style={{ color: activeColor }}>
                        {pendingCoord.x}, {pendingCoord.y}
                      </span>
                      {(snapInfo?.snappedX || snapInfo?.snappedY) && (
                        <span className="me-snap-badge">
                          <Magnet size={10} />
                          {snapInfo.snappedX && snapInfo.snappedY ? 'X+Y' : snapInfo.snappedX ? 'X' : 'Y'} snapped
                        </span>
                      )}
                      {snapInfo?.bypassed && (
                        <span className="me-snap-badge bypassed">raw</span>
                      )}
                    </div>

                    {/* Show snap delta so user can judge if prediction is wrong */}
                    {(snapInfo?.snappedX || snapInfo?.snappedY) && snapInfo?.raw && (
                      <div className="me-snap-delta">
                        <span>raw click: {snapInfo.raw.x}, {snapInfo.raw.y}</span>
                        {snapInfo.snappedX && snapInfo.raw.x !== pendingCoord.x && (
                          <span className="me-delta-pill">X moved {pendingCoord.x - snapInfo.raw.x > 0 ? '+' : ''}{pendingCoord.x - snapInfo.raw.x}px</span>
                        )}
                        {snapInfo.snappedY && snapInfo.raw.y !== pendingCoord.y && (
                          <span className="me-delta-pill">Y moved {pendingCoord.y - snapInfo.raw.y > 0 ? '+' : ''}{pendingCoord.y - snapInfo.raw.y}px</span>
                        )}
                      </div>
                    )}

                    {/* Cancel pending / use raw */}
                    <div className="me-pending-actions">
                      <button
                        className="me-cancel-pending-btn"
                        onClick={() => { setPendingCoord(null); setSnapInfo(null) }}
                        title="Cancel (Esc)"
                      >
                        <Trash2 size={11} /> Cancel
                      </button>
                      {(snapInfo?.snappedX || snapInfo?.snappedY) && snapInfo?.raw && (
                        <button
                          className="me-use-raw-btn"
                          onClick={() => {
                            setPendingCoord({ x: snapInfo.raw.x, y: snapInfo.raw.y })
                            setSnapInfo(prev => ({ ...prev, snappedX: false, snappedY: false, bypassed: true }))
                          }}
                          title="Use raw click position (ignore snap)"
                        >
                          Use raw ({snapInfo.raw.x}, {snapInfo.raw.y})
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {!isSkipped && (
                  <div className="me-alignment-row">
                    <span className="me-coord-label">Align</span>
                    {['left', 'center', 'right'].map(a => (
                      <button
                        key={a}
                        className={`me-align-btn ${currentCoords.alignment === a ? 'active' : ''}`}
                        style={currentCoords.alignment === a ? { background: activeColor, borderColor: activeColor, color: '#fff' } : {}}
                        onClick={() => handleAlignmentChange(a)}
                      >{a[0].toUpperCase()}</button>
                    ))}
                    {activeSection === 'cells' && (
                      <button
                        className="me-apply-all-btn"
                        onClick={handleApplyAlignmentToAll}
                        title="Apply this alignment to all 12 rows"
                      >
                        all
                      </button>
                    )}
                  </div>
                )}

                {/* Per-field font size — per row */}
                {!isSkipped && (
                  <div className="me-alignment-row">
                    <span className="me-coord-label">Size</span>
                    <div className="me-size-input-wrap">
                      <input
                        type="number"
                        className="me-setting-input"
                        min={10} max={800} step={5}
                        value={currentFieldFontSize}
                        onChange={e => handleFieldFontSizeChange(parseInt(e.target.value) || 130, false)}
                        title={activeSection === 'cells'
                          ? `Font size for Row ${activeRow + 1} · ${activeFieldMeta?.label}`
                          : 'Font size for this extra field'}
                      />
                      <span className="me-size-unit">px</span>
                    </div>
                    {activeSection === 'cells' && (
                      <button
                        className="me-apply-all-btn"
                        onClick={() => handleFieldFontSizeChange(currentFieldFontSize, true)}
                        title="Apply this size to all 12 rows"
                      >all</button>
                    )}
                  </div>
                )}

                {/* Per-field font override — per row */}
                {!isSkipped && (
                  <div className="me-field-font-row">
                    <span className="me-coord-label">Font</span>
                    <div style={{ flex: 1 }}>
                      <FontPicker
                        value={currentFieldFontPath || config.scoreboard?.font_path || FONT_OPTIONS[0]}
                        onChange={v => {
                          const sbFont = config.scoreboard?.font_path || FONT_OPTIONS[0]
                          handleFieldFontPathChange(v === sbFont ? null : v, null)
                        }}
                      />
                    </div>
                    {currentFieldFontPath && (
                      <button
                        className="me-clear-font-btn"
                        onClick={() => handleFieldFontPathChange(null, null)}
                        title="Reset to scoreboard font"
                      >↩</button>
                    )}
                  </div>
                )}

                <div className="me-action-btns">
                  {pendingCoord && !isSkipped && (
                    <button className="me-assign-btn" style={{ background: activeColor }}
                      onClick={handleAssign} title="Assign (Enter)">
                      <CornerDownLeft size={13} /> Assign
                    </button>
                  )}
                  {!isSkipped ? (
                    <button className="me-skip-btn" onClick={handleSkip}>
                      <SkipForward size={12} /> Skip
                    </button>
                  ) : (
                    <button className="me-unskip-btn" onClick={handleUnskip}>
                      <RotateCcw size={12} /> Restore
                    </button>
                  )}
                  {isPlaced && (
                    <button className="me-clear-btn" onClick={handleClear}>
                      <Trash2 size={12} /> Clear
                    </button>
                  )}
                </div>

                {isSkipped && (
                  <p className="me-skip-note">
                    <Info size={11} />
                    Marked as not needed — won't be rendered.
                  </p>
                )}

                {/* ── Row overrides — per-row font_size & color for this field ── */}
                {!isSkipped && activeSection === 'cells' && (
                  <div className="me-row-overrides">
                    <div className="me-panel-label" style={{ marginBottom: 6 }}>
                      <Rows3 size={12} /> Per-row overrides
                    </div>
                    <div className="me-row-override-grid">
                      {DUMMY_TEAMS.map((team, rowIdx) => {
                        const override = config.cells?.[activeField]?.row_overrides?.[String(rowIdx)] || {}
                        const fieldDefault = config.cells?.[activeField]
                        const effSize = override.font_size ?? fieldDefault?.font_size ?? config.scoreboard?.font_size ?? 130
                        const effColor = override.color_rgb ?? fieldDefault?.color_rgb ?? config.scoreboard?.color_rgb ?? [255,255,255]
                        const hasOverride = override.font_size !== undefined || override.color_rgb !== undefined
                        return (
                          <div key={rowIdx} className={`me-row-override-row ${hasOverride ? 'has-override' : ''}`}>
                            <span className="me-row-override-rank" style={{ color: activeColor }}>
                              {team.rank}
                            </span>
                            {/* font size */}
                            <input
                              type="number"
                              className="me-row-override-size"
                              min={10} max={800} step={5}
                              value={effSize}
                              onChange={e => handleFieldFontSizeChange(parseInt(e.target.value) || 130, rowIdx)}
                              title={`Row ${rowIdx + 1} font size`}
                            />
                            <span className="me-size-unit">px</span>
                            {/* color */}
                            <input
                              type="color"
                              className="me-color-picker-sm"
                              value={rgbToHex(effColor)}
                              onChange={e => {
                                const rgb = hexToRgb(e.target.value)
                                updateConfig(next => {
                                  if (!next.cells[activeField]) return
                                  if (!next.cells[activeField].row_overrides)
                                    next.cells[activeField].row_overrides = {}
                                  if (!next.cells[activeField].row_overrides[String(rowIdx)])
                                    next.cells[activeField].row_overrides[String(rowIdx)] = {}
                                  next.cells[activeField].row_overrides[String(rowIdx)].color_rgb = rgb
                                })
                              }}
                              title={`Row ${rowIdx + 1} color`}
                            />
                            {/* clear override */}
                            {hasOverride && (
                              <button
                                className="me-row-override-clear"
                                onClick={() => {
                                  updateConfig(next => {
                                    if (next.cells[activeField]?.row_overrides?.[String(rowIdx)])
                                      delete next.cells[activeField].row_overrides[String(rowIdx)]
                                  })
                                }}
                                title="Clear row override"
                              >↩</button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ══ CENTER ══ */}
          <div className="me-canvas-wrap">
            <div className="me-zoom-bar">
              <button className="me-zoom-btn" onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(1)))}><ZoomOut size={14} /></button>
              <span className="me-zoom-label">{Math.round(zoom * 100)}%</span>
              <button className="me-zoom-btn" onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(1)))}><ZoomIn size={14} /></button>
              <button className="me-zoom-btn" onClick={() => setZoom(1)} title="Reset"><Maximize2 size={13} /></button>
              {previewMode === 'off' && (
                <span className="me-canvas-hint">
                  <MousePointer2 size={12} /> Click · <CornerDownLeft size={12} /> Enter ·
                  <Magnet size={12} style={{ color: snapEnabled ? activeColor : undefined }} />
                  {snapEnabled ? 'Snap on' : 'Snap off'} ·
                  <span style={{ opacity: 0.7 }}>⌥ Alt = bypass snap</span>
                </span>
              )}
              {previewMode === 'client' && (
                <span className="me-canvas-hint" style={{ color: 'var(--success)' }}>
                  <Eye size={12} /> Client preview — dummy data overlay
                </span>
              )}
              {previewMode === 'server' && (
                <span className="me-canvas-hint" style={{ color: 'var(--primary-hover)' }}>
                  <Eye size={12} /> Server render — what the backend actually produces
                </span>
              )}
            </div>
            <div className="me-canvas-scroll">
              <div className="me-canvas-inner" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
                {theme.url ? (
                  <div className="me-img-container">
                    <img ref={imgRef} src={theme.url} alt={theme.name}
                      className="me-image" onLoad={() => setImgLoaded(true)} draggable={false} />
                    {imgLoaded && previewMode === 'off' && (
                      <MappingOverlay
                        imageRef={imgRef} imageUrl={theme.url}
                        config={config} activeField={activeField} activeRow={activeRow}
                        pendingCoord={pendingCoord} snapInfo={snapInfo}
                        onImageClick={handleImageClick}
                        predictedYs={predictedYs}
                        activeSection={activeSection}
                      />
                    )}
                    {imgLoaded && previewMode === 'client' && (
                      <ClientPreviewOverlay
                        config={config} imageRef={imgRef} imageUrl={theme.url}
                        selectedCellIdx={activeSection === 'cells' ? activeRow : null}
                        selectedField={activeSection === 'extra' ? activeField : null}
                      />
                    )}
                  </div>
                ) : (
                  <div className="me-no-image">
                    <AlertCircle size={32} />
                    <p>No image URL. Add one in the theme editor first.</p>
                  </div>
                )}

                {/* Server render result — shown full-size instead of the image */}
                {previewMode === 'server' && (
                  <div className="me-server-preview">
                    {serverPreviewLoading && (
                      <div className="me-server-preview-loading">
                        <Loader2 size={28} className="spin" />
                        <p>Rendering with dummy data…</p>
                      </div>
                    )}
                    {serverPreviewError && !serverPreviewLoading && (
                      <div className="me-server-preview-error">
                        <AlertCircle size={24} />
                        <p>{serverPreviewError}</p>
                        <button className="me-smart-btn" onClick={fetchServerPreview}>
                          <RefreshCcw size={13} /> Retry
                        </button>
                      </div>
                    )}
                    {serverPreviewUrl && !serverPreviewLoading && (
                      <div className="me-server-preview-result">
                        <div className="me-server-preview-bar">
                          <span className="me-server-preview-label">
                            <CheckCircle2 size={13} /> Server render — dummy data
                            {dirty && <span className="me-server-stale-badge">⚠ unsaved changes not reflected</span>}
                          </span>
                          <button className="me-server-refresh-btn" onClick={fetchServerPreview}>
                            <RefreshCcw size={13} /> Re-render
                          </button>
                        </div>
                        <img
                          src={serverPreviewUrl}
                          alt="Server render preview"
                          className="me-server-preview-img"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══ RIGHT PANEL ══ */}
          <div className="me-right">
            <div className="me-panel-section">
              <div className="me-panel-label"><PaletteIcon size={12} /> Scoreboard Style</div>
              <div className="me-setting-row">
                <label className="me-setting-label">Font</label>
                <FontPicker
                  value={config.scoreboard?.font_path || FONT_OPTIONS[0]}
                  onChange={v => handleScoreboardChange('font_path', v)}
                />
              </div>
              <div className="me-setting-row">
                <label className="me-setting-label">Font Size</label>
                <div className="me-size-input-wrap">
                  <input type="number" className="me-setting-input" min={20} max={500} step={5}
                    value={config.scoreboard?.font_size ?? 130}
                    onChange={e => handleScoreboardChange('font_size', parseInt(e.target.value) || 130)} />
                  <span className="me-size-unit">px</span>
                </div>
              </div>
            </div>

            {/* ── Per-field colors ── */}
            <div className="me-panel-section">
              <div className="me-panel-label"><PaletteIcon size={12} /> Field Colors</div>
              <p className="me-field-color-hint">Each field has its own color. Changes apply to all 12 rows.</p>

              {/* Global default color */}
              <div className="me-field-color-row">
                <span className="me-field-color-dot" style={{ background: rgbToHex(config.scoreboard?.color_rgb) }} />
                <span className="me-field-color-label">Default</span>
                <input
                  type="color"
                  className="me-color-picker-sm"
                  value={rgbToHex(config.scoreboard?.color_rgb)}
                  onChange={e => handleScoreboardChange('color_rgb', hexToRgb(e.target.value))}
                  title="Default color for all fields (used when no override is set)"
                />
                <span className="me-color-hex">{rgbToHex(config.scoreboard?.color_rgb).toUpperCase()}</span>
              </div>

              <div className="me-field-colors-divider">Cell fields</div>

              {/* Per cell-field color rows */}
              {CELL_FIELDS.map(({ key, label }) => {
                const fieldColor = config.cells?.[key]?.color_rgb
                  || config.scoreboard?.color_rgb
                  || [255, 255, 255]
                const hex = rgbToHex(fieldColor)
                return (
                  <div key={key} className="me-field-color-row">
                    <span className="me-field-color-dot" style={{ background: hex }} />
                    <span className="me-field-color-label">{label}</span>
                    <input
                      type="color"
                      className="me-color-picker-sm"
                      value={hex}
                      onChange={e => {
                        const rgb = hexToRgb(e.target.value)
                        updateConfig(next => {
                          if (!next.cells[key]) next.cells[key] = { x: 0, y: 0, alignment: 'center' }
                          next.cells[key].color_rgb = rgb
                        })
                      }}
                      title={`Default color for ${label} (applies to all rows without override)`}
                    />
                    <span className="me-color-hex">{hex.toUpperCase()}</span>
                  </div>
                )
              })}

              {/* Extra fields inherit font & color from Scoreboard Style — no separate pickers */}

              <div className="me-field-colors-divider">Extra fields</div>

              {EXTRA_FIELDS.map(({ key, label }) => {
                const fieldColor = config.extra_fields?.[key]?.color_rgb
                  || config.scoreboard?.color_rgb
                  || [255, 255, 255]
                const hex = rgbToHex(fieldColor)
                const fontSize = config.extra_fields?.[key]?.font_size ?? 200
                return (
                  <div key={key} className="me-field-color-row extra" style={{ flexWrap: 'wrap', gap: '6px' }}>
                    <span className="me-field-color-dot" style={{ background: hex }} />
                    <span className="me-field-color-label">{label}</span>
                    {/* Color */}
                    <input
                      type="color"
                      className="me-color-picker-sm"
                      value={hex}
                      onChange={e => {
                        const rgb = hexToRgb(e.target.value)
                        updateConfig(next => {
                          if (!next.extra_fields) next.extra_fields = {}
                          if (!next.extra_fields[key])
                            next.extra_fields[key] = { x: 0, y: 0, alignment: 'center', font_size: 200 }
                          next.extra_fields[key].color_rgb = rgb
                        })
                      }}
                      title={`Color for ${label}`}
                    />
                    {/* Font size */}
                    <div className="me-extra-size-wrap">
                      <input
                        type="number"
                        className="me-extra-size-input"
                        min={10} max={800} step={5}
                        value={fontSize}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 200
                          updateConfig(next => {
                            if (!next.extra_fields) next.extra_fields = {}
                            if (!next.extra_fields[key])
                              next.extra_fields[key] = { x: 0, y: 0, alignment: 'center', font_size: val }
                            else next.extra_fields[key].font_size = val
                          })
                        }}
                        title={`Font size for ${label}`}
                      />
                      <span className="me-size-unit">px</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Progress grid */}
            <div className="me-panel-section">
              <div className="me-panel-label"><CheckCircle2 size={12} /> Progress</div>
              <div className="me-mini-grid">
                {CELL_FIELDS.map(({ key, label, color }) => (
                  <div key={key} className="me-mini-field-row">
                    <span className="me-mini-field-dot" style={{ background: color }} />
                    <span className="me-mini-field-label">{label}</span>
                    <div className="me-mini-cells">
                      {Array.from({ length: 12 }, (_, r) => {
                        const done    = isFieldDoneInRow(r, key)
                        const skipped = isFieldSkippedInRow(r, key)
                        const isAct   = activeRow === r && activeField === key && activeSection === 'cells'
                        return (
                          <div key={r}
                            className={['me-mini-cell', done ? 'placed' : '', skipped ? 'skipped-cell' : '', isAct ? 'active' : ''].join(' ')}
                            style={skipped ? { background: '#e8eaed', borderColor: '#dadce0' }
                              : done ? { background: color, borderColor: 'transparent' }
                              : isAct ? { borderColor: color } : {}}
                            onClick={() => { setActiveSection('cells'); setActiveField(key); setActiveRow(r); setPendingCoord(null) }}
                            title={`${label} · Row ${r+1}${skipped?' (skipped)':''}`}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
                {EXTRA_FIELDS.map(({ key, label, color }) => {
                  const done = isFieldDone(config.extra_fields?.[key])
                  const skipped = isFieldSkipped(config.extra_fields?.[key])
                  return (
                    <div key={key} className="me-mini-field-row extra-row">
                      <span className="me-mini-field-dot" style={{ background: color }} />
                      <span className="me-mini-field-label">{label}</span>
                      <div className="me-mini-cells single">
                        <div
                          className={`me-mini-cell wide ${done?'placed':''} ${skipped?'skipped-cell':''}`}
                          style={skipped ? { background:'#e8eaed', borderColor:'#dadce0' }
                            : done ? { background: color, borderColor:'transparent' } : {}}
                          onClick={() => { setActiveSection('extra'); setActiveField(key); setActiveRow(-1); setPendingCoord(null) }}
                          title={`${label}${skipped?' (skipped)':''}`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="me-progress-footer">
                <strong>{placedCellSlots + placedExtraSlots}</strong> / {totalCellSlots + EXTRA_FIELDS.length} done
              </p>
            </div>

            {/* Tips */}
            <div className="me-panel-section me-tips">
              <div className="me-panel-label"><Info size={12} /> Tips</div>
              <ul className="me-tips-list">
                <li><Magnet size={11} />      Snap aligns X column + Y row automatically</li>
                <li><Wand2 size={11} />       Place 2 rows → auto-fill detects spacing</li>
                <li><CornerDownLeft size={11} /> <strong>Enter</strong> assigns the clicked point</li>
                <li><SkipForward size={11} /> <strong>Skip</strong> fields not in this theme</li>
                <li><RotateCcw size={11} />   <strong>⌘Z</strong> to undo</li>
                <li><Eye size={11} />         <strong>P</strong> → client preview → server render</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ThemeMappingEditor

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Save, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Crosshair,
  ChevronDown, ChevronRight, AlignLeft, AlignCenter, AlignRight,
  SkipForward, RotateCcw, Type, Move, Eye, X, Download,
  Magnet, ChevronsRight, ArrowUpDown,
} from 'lucide-react'
import {
  EMPTY_MAPPING_CONFIG, FONT_OPTIONS, FONT_FAMILY_MAP, DUMMY_TEAMS,
  fetchFontMetrics, getYCorrection,
} from '../../constants/themeConstants'

// ─────────────────────────────────────────────────────────────────────────────
// Field definitions
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'rank',  label: 'Rank' },
  { key: 'team',  label: 'Team Name' },
  { key: 'w',     label: 'Wins' },
  { key: 'pp',    label: 'Placement Pts' },
  { key: 'kp',    label: 'Kill Pts' },
  { key: 'total', label: 'Total' },
  { key: 'mp',    label: 'Matches Played' },
]

const EXTRA_COLUMNS = [
  { key: 'tournament_name',     label: 'Tournament Name' },
  { key: 'lazarflow-watermark', label: 'LazarFlow Watermark' },
]

const SNAP_THRESHOLD = 20   // natural-px distance to trigger snap
const HISTORY_LIMIT  = 40

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

const deepClone = (obj) => JSON.parse(JSON.stringify(obj))

const DEFAULT_ALIGN = {
  rank: 'center', team: 'left', w: 'center',
  pp: 'center', kp: 'center', total: 'center', mp: 'center',
}

const isPlaced  = (c) => c && !c.skipped && (c.x !== 0 || c.y !== 0)
const isSkipped = (c) => c?.skipped === true

const rgbToHex = (rgb) => {
  if (!rgb || rgb.length < 3) return '#ffffff'
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('')
}
const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const getFontFamily = (fontPath) => {
  if (!fontPath) return 'sans-serif'
  const family = FONT_FAMILY_MAP[fontPath]
  return family ? `"${family}", sans-serif` : 'sans-serif'
}

const MOCK_EXTRA = {
  tournament_name: 'GRAND FINALS 2024',
  'lazarflow-watermark': 'lazarflow.app',
}

const getTransform = (align) => {
  if (align === 'center') return 'translateX(-50%)'
  if (align === 'right')  return 'translateX(-100%)'
  return 'none'
}

// ─────────────────────────────────────────────────────────────────────────────
// Snap helpers
// ─────────────────────────────────────────────────────────────────────────────

// Collect all placed X values for a given column across all rows
const getColumnXValues = (cells, colKey) => {
  if (!Array.isArray(cells)) return []
  return cells
    .map(row => row?.[colKey])
    .filter(c => isPlaced(c))
    .map(c => c.x)
}

// Collect all placed Y values for a given row
const getRowYValues = (cells, rowIdx) => {
  if (!Array.isArray(cells)) return []
  const row = cells[rowIdx] || {}
  return COLUMNS
    .map(col => row[col.key])
    .filter(c => isPlaced(c))
    .map(c => c.y)
}

// Snap a raw x/y to nearby column-X or row-Y values
const applySnap = (nx, ny, cells, colKey, rowIdx, snapOn) => {
  if (!snapOn) return { nx, ny, snapX: null, snapY: null }

  let finalX = nx, finalY = ny, snapX = null, snapY = null

  const colXs = getColumnXValues(cells, colKey)
  for (const cx of colXs) {
    if (Math.abs(nx - cx) <= SNAP_THRESHOLD) { finalX = cx; snapX = cx; break }
  }

  const rowYs = getRowYValues(cells, rowIdx)
  for (const ry of rowYs) {
    if (Math.abs(ny - ry) <= SNAP_THRESHOLD) { finalY = ry; snapY = ry; break }
  }

  return { nx: finalX, ny: finalY, snapX, snapY }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildInitialConfig
// ─────────────────────────────────────────────────────────────────────────────

const buildInitialConfig = (existing) => {
  if (!existing) return deepClone(EMPTY_MAPPING_CONFIG)

  const base = deepClone(EMPTY_MAPPING_CONFIG)
  base.scoreboard   = existing.scoreboard   || base.scoreboard
  base.extra_fields = existing.extra_fields || base.extra_fields

  if (Array.isArray(existing.cells)) {
    const rows = Array.from({ length: 12 }, (_, i) => {
      const er   = existing.cells[i] || {}
      const br   = base.cells[i]
      return {
        ...br,
        ...Object.fromEntries(
          Object.keys(br).map(key => [key, er[key] ? { ...br[key], ...er[key] } : br[key]])
        ),
      }
    })
    return { ...base, cells: rows }
  }

  if (existing.cells && typeof existing.cells === 'object') {
    const rows = Array.from({ length: 12 }, () => {
      const row = {}
      COLUMNS.forEach(({ key }) => {
        const old = existing.cells[key]
        row[key] = {
          x: old?.x ?? 0, y: old?.y ?? 0,
          alignment: old?.alignment ?? DEFAULT_ALIGN[key] ?? 'center',
          ...(old?.font_size  ? { font_size: old.font_size  } : {}),
          ...(old?.font_path  ? { font_path: old.font_path  } : {}),
          ...(old?.color_rgb  ? { color_rgb: old.color_rgb  } : {}),
          ...(old?.skipped    ? { skipped:   true            } : {}),
        }
      })
      return row
    })
    return { ...base, cells: rows }
  }

  return base
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldTree — left panel
// ─────────────────────────────────────────────────────────────────────────────

const FieldTree = ({ config, selected, onSelect }) => {
  const [scoreboardOpen, setScoreboardOpen] = useState(true)
  const [expandedRows, setExpandedRows]     = useState(() => new Set([0]))
  const [extrasOpen, setExtrasOpen]         = useState(false)

  const toggleRow = (idx) => setExpandedRows(prev => {
    const next = new Set(prev)
    next.has(idx) ? next.delete(idx) : next.add(idx)
    return next
  })

  // Auto-expand the row of the selected cell
  useEffect(() => {
    if (selected?.section === 'cells' && selected.rowIdx != null) {
      setExpandedRows(prev => new Set([...prev, selected.rowIdx]))
    }
  }, [selected])

  const placedColCount = COLUMNS.filter(col =>
    Array.isArray(config.cells) && config.cells.some(row => isPlaced(row?.[col.key]))
  ).length
  const totalExtra = EXTRA_COLUMNS.filter(col => isPlaced(config.extra_fields?.[col.key])).length

  return (
    <div className="me-tree">

      <button
        className={`me-tree-section-btn ${scoreboardOpen ? 'open' : ''}`}
        onClick={() => setScoreboardOpen(o => !o)}
      >
        <ChevronDown size={14} className={`me-tree-section-chevron ${scoreboardOpen ? 'open' : ''}`} />
        <span className="me-tree-section-label">Scoreboard</span>
        <span className="me-tree-section-sub">12 rows · {COLUMNS.length} cols</span>
        {placedColCount > 0 && (
          <span className="me-tree-section-badge">{placedColCount}/{COLUMNS.length} cols</span>
        )}
      </button>

      {scoreboardOpen && (
        <div className="me-tree-section-body">
          {Array.from({ length: 12 }, (_, rowIdx) => {
            const row         = Array.isArray(config.cells) ? (config.cells[rowIdx] || {}) : {}
            const expanded    = expandedRows.has(rowIdx)
            const rowSelected = selected?.section === 'cells' && selected?.rowIdx === rowIdx
            const placedInRow = COLUMNS.filter(col => isPlaced(row[col.key])).length

            return (
              <div key={rowIdx} className="me-tree-row-group">
                <button
                  className={`me-tree-row-header ${rowSelected ? 'row-selected' : ''}`}
                  onClick={() => toggleRow(rowIdx)}
                >
                  <ChevronRight size={12} className={`me-tree-chevron ${expanded ? 'open' : ''}`} />
                  <span className="me-tree-row-num">Row {rowIdx + 1}</span>
                  {placedInRow > 0 && (
                    <span className="me-tree-row-badge">{placedInRow}/{COLUMNS.length}</span>
                  )}
                </button>

                {expanded && (
                  <div className="me-tree-col-list">
                    {COLUMNS.map(col => {
                      const coords  = row[col.key]
                      const placed  = isPlaced(coords)
                      const skipped = isSkipped(coords)
                      const active  = selected?.section === 'cells' && selected?.rowIdx === rowIdx && selected?.colKey === col.key

                      return (
                        <button
                          key={col.key}
                          className={`me-tree-cell ${active ? 'active' : ''} ${placed ? 'placed' : ''} ${skipped ? 'skipped' : ''}`}
                          onClick={() => onSelect({ section: 'cells', rowIdx, colKey: col.key })}
                        >
                          <span className="me-tree-cell-dot" />
                          <span className="me-tree-cell-label">{col.label}</span>
                          {placed  && <span className="me-tree-cell-coords">{coords.x}, {coords.y}</span>}
                          {skipped && <span className="me-tree-cell-tag">skip</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button
        className={`me-tree-section-btn ${extrasOpen ? 'open' : ''}`}
        onClick={() => setExtrasOpen(o => !o)}
        style={{ marginTop: 4 }}
      >
        <ChevronDown size={14} className={`me-tree-section-chevron ${extrasOpen ? 'open' : ''}`} />
        <span className="me-tree-section-label">Extra Fields</span>
        <span className="me-tree-section-sub">{EXTRA_COLUMNS.length} fields</span>
        {totalExtra > 0 && (
          <span className="me-tree-section-badge">{totalExtra}/{EXTRA_COLUMNS.length}</span>
        )}
      </button>

      {extrasOpen && (
        <div className="me-tree-section-body">
          <div className="me-tree-col-list me-tree-extras">
            {EXTRA_COLUMNS.map(col => {
              const coords  = config.extra_fields?.[col.key]
              const placed  = isPlaced(coords)
              const skipped = isSkipped(coords)
              const active  = selected?.section === 'extra' && selected?.colKey === col.key

              return (
                <button
                  key={col.key}
                  className={`me-tree-cell ${active ? 'active' : ''} ${placed ? 'placed' : ''} ${skipped ? 'skipped' : ''}`}
                  onClick={() => onSelect({ section: 'extra', rowIdx: null, colKey: col.key })}
                >
                  <span className="me-tree-cell-dot" />
                  <span className="me-tree-cell-label">{col.label}</span>
                  {placed  && <span className="me-tree-cell-coords">{coords.x}, {coords.y}</span>}
                  {skipped && <span className="me-tree-cell-tag">skip</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CanvasOverlay
// Features: click-to-place, live preview, snap guides, click-to-select, drag-to-move
// ─────────────────────────────────────────────────────────────────────────────

const CanvasOverlay = ({ imgRef, imgLoaded, config, selected, onPlace, onSelect, snapEnabled }) => {
  const [dims, setDims]     = useState({ w: 0, h: 0 })
  const [hover, setHover]   = useState(null)   // { nx, ny, dx, dy, snapX, snapY }
  const [drag, setDrag]     = useState(null)   // { key: 'cell-r-c'|'extra-k', startNx, startNy, origX, origY }
  const [, forceUpdate]     = useState(0)

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const measure = () => {
      const r = img.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setDims({ w: r.width, h: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(img)
    return () => ro.disconnect()
  }, [imgRef, imgLoaded])

  useEffect(() => {
    const fonts = new Set()
    const sbFont = config.scoreboard?.font_path || FONT_OPTIONS[0]
    fonts.add(sbFont)
    ;(Array.isArray(config.cells) ? config.cells : []).forEach(row => {
      COLUMNS.forEach(col => { if (row?.[col.key]?.font_path) fonts.add(row[col.key].font_path) })
    })
    Object.values(config.extra_fields || {}).forEach(f => { if (f?.font_path) fonts.add(f.font_path) })
    fetchFontMetrics([...fonts]).then(() => forceUpdate(n => n + 1))
  }, [config])

  const getNaturalCoords = useCallback((e) => {
    const img = imgRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    const dx = e.clientX - rect.left
    const dy = e.clientY - rect.top
    const nx = Math.round((dx / rect.width)  * img.naturalWidth)
    const ny = Math.round((dy / rect.height) * img.naturalHeight)
    return { nx, ny, dx, dy }
  }, [imgRef])

  // Hit-test: find a placed dot within SNAP_THRESHOLD display-px of click
  const hitTest = useCallback((dx, dy) => {
    const img = imgRef.current
    if (!img) return null
    const sx = dims.w / img.naturalWidth
    const sy = dims.h / img.naturalHeight
    const HIT_PX = 18

    if (Array.isArray(config.cells)) {
      for (let rowIdx = 0; rowIdx < config.cells.length; rowIdx++) {
        const row = config.cells[rowIdx] || {}
        for (const col of COLUMNS) {
          const c = row[col.key]
          if (!isPlaced(c)) continue
          const cx = c.x * sx, cy = c.y * sy
          if (Math.abs(dx - cx) < HIT_PX && Math.abs(dy - cy) < HIT_PX) {
            return { section: 'cells', rowIdx, colKey: col.key, origX: c.x, origY: c.y }
          }
        }
      }
    }
    for (const col of EXTRA_COLUMNS) {
      const c = config.extra_fields?.[col.key]
      if (!isPlaced(c)) continue
      const img2 = imgRef.current
      const cx = c.x * (dims.w / img2.naturalWidth)
      const cy = c.y * (dims.h / img2.naturalHeight)
      if (Math.abs(dx - cx) < HIT_PX && Math.abs(dy - cy) < HIT_PX) {
        return { section: 'extra', rowIdx: null, colKey: col.key, origX: c.x, origY: c.y }
      }
    }
    return null
  }, [config, dims, imgRef])

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const c = getNaturalCoords(e)
    if (!c) return

    const hit = hitTest(c.dx, c.dy)
    if (hit) {
      e.stopPropagation()
      // Select the cell and start a drag
      onSelect({ section: hit.section, rowIdx: hit.rowIdx, colKey: hit.colKey })
      setDrag({ ...hit, startNx: c.nx, startNy: c.ny })
    }
  }, [getNaturalCoords, hitTest, onSelect])

  const handleMouseMove = useCallback((e) => {
    const c = getNaturalCoords(e)
    if (!c) return

    if (drag) {
      const img = imgRef.current
      if (!img) return
      const rawNx = c.nx
      const rawNy = c.ny
      const rowIdx = drag.section === 'cells' ? drag.rowIdx : -1
      const { nx: snappedNx, ny: snappedNy, snapX, snapY } = applySnap(
        rawNx, rawNy, config.cells, drag.colKey, rowIdx, snapEnabled
      )
      setHover({ ...c, nx: snappedNx, ny: snappedNy, snapX, snapY, isDragging: true })
      return
    }

    if (!selected) { setHover(null); return }
    const rowIdx = selected.section === 'cells' ? selected.rowIdx : -1
    const { nx: snappedNx, ny: snappedNy, snapX, snapY } = applySnap(
      c.nx, c.ny, config.cells, selected.colKey, rowIdx, snapEnabled
    )
    setHover({ ...c, nx: snappedNx, ny: snappedNy, snapX, snapY })
  }, [getNaturalCoords, drag, selected, config.cells, snapEnabled, imgRef])

  const handleMouseUp = useCallback((e) => {
    if (!drag) return
    const c = getNaturalCoords(e)
    if (c) {
      const rowIdx = drag.section === 'cells' ? drag.rowIdx : -1
      const { nx, ny } = applySnap(c.nx, c.ny, config.cells, drag.colKey, rowIdx, snapEnabled)
      onPlace({ x: nx, y: ny }, { section: drag.section, rowIdx: drag.rowIdx, colKey: drag.colKey })
    }
    setDrag(null)
    setHover(null)
  }, [drag, getNaturalCoords, config.cells, snapEnabled, onPlace])

  const handleClick = useCallback((e) => {
    // Don't place if we just finished a drag
    if (drag) return
    const c = getNaturalCoords(e)
    if (!c) return

    // If clicking on an existing dot, select it (already handled in mousedown)
    const hit = hitTest(c.dx, c.dy)
    if (hit) {
      onSelect({ section: hit.section, rowIdx: hit.rowIdx, colKey: hit.colKey })
      return
    }

    // Place the selected cell
    if (!selected) return
    const rowIdx = selected.section === 'cells' ? selected.rowIdx : -1
    const { nx, ny } = applySnap(c.nx, c.ny, config.cells, selected.colKey, rowIdx, snapEnabled)
    onPlace({ x: nx, y: ny })
  }, [drag, getNaturalCoords, hitTest, onSelect, selected, config.cells, snapEnabled, onPlace])

  if (!imgLoaded || dims.w === 0) return null
  const img = imgRef.current
  if (!img?.naturalWidth) return null

  const sx = dims.w / img.naturalWidth
  const sy = dims.h / img.naturalHeight
  const sb         = config.scoreboard || {}
  const sbColor    = sb.color_rgb  || [255, 255, 255]
  const sbFontPath = sb.font_path  || FONT_OPTIONS[0]
  const sbSize     = sb.font_size  || 130

  // Build text items
  const textItems = []
  if (Array.isArray(config.cells)) {
    config.cells.forEach((row, rowIdx) => {
      COLUMNS.forEach(col => {
        const coords = row?.[col.key]
        if (!coords || coords.skipped || (coords.x === 0 && coords.y === 0)) return
        const isActive  = selected?.section === 'cells' && selected?.rowIdx === rowIdx && selected?.colKey === col.key
        const isDragged = drag?.section === 'cells' && drag?.rowIdx === rowIdx && drag?.colKey === col.key
        const color     = coords.color_rgb ? `rgb(${coords.color_rgb.join(',')})` : `rgb(${sbColor.join(',')})`
        const fontPath  = coords.font_path || sbFontPath
        const fontSizePx = (coords.font_size || sbSize) * sy
        const yCorr     = getYCorrection(fontPath, fontSizePx)
        const px        = isDragged && hover ? hover.nx * sx : coords.x * sx
        const py        = isDragged && hover ? hover.ny * sy - yCorr : coords.y * sy - yCorr
        textItems.push({
          key: `cell-${rowIdx}-${col.key}`,
          x: px, y: py,
          value: String(DUMMY_TEAMS[rowIdx]?.[col.key] ?? ''),
          color, fontSize: fontSizePx,
          family: getFontFamily(fontPath),
          align: coords.alignment || 'center',
          isActive, isDragged,
        })
      })
    })
  }
  EXTRA_COLUMNS.forEach(col => {
    const coords = config.extra_fields?.[col.key]
    if (!coords || coords.skipped || (coords.x === 0 && coords.y === 0)) return
    const isActive  = selected?.section === 'extra' && selected?.colKey === col.key
    const isDragged = drag?.section === 'extra' && drag?.colKey === col.key
    const color     = coords.color_rgb ? `rgb(${coords.color_rgb.join(',')})` : `rgb(${sbColor.join(',')})`
    const fontPath  = coords.font_path || sbFontPath
    const fontSizePx = (coords.font_size || sbSize) * sy
    const yCorr     = getYCorrection(fontPath, fontSizePx)
    const px        = isDragged && hover ? hover.nx * sx : coords.x * sx
    const py        = isDragged && hover ? hover.ny * sy - yCorr : coords.y * sy - yCorr
    textItems.push({
      key: `extra-${col.key}`,
      x: px, y: py,
      value: MOCK_EXTRA[col.key] ?? col.key,
      color, fontSize: fontSizePx,
      family: getFontFamily(fontPath),
      align: coords.alignment || 'center',
      isActive, isDragged,
    })
  })

  // Active dot position
  const activeDotPos = (() => {
    if (!selected) return null
    if (drag) return hover ? { x: hover.nx * sx, y: hover.ny * sy } : null
    const coords = selected.section === 'extra'
      ? config.extra_fields?.[selected.colKey]
      : config.cells?.[selected.rowIdx]?.[selected.colKey]
    if (!isPlaced(coords)) return null
    return { x: coords.x * sx, y: coords.y * sy }
  })()

  // Snap guide lines in display-px
  const snapGuideX = hover?.snapX != null ? hover.snapX * sx : null
  const snapGuideY = hover?.snapY != null ? hover.snapY * sy : null

  const cursor = drag ? 'grabbing' : selected ? 'crosshair' : 'default'

  return (
    <div
      className="me-canvas-overlay"
      style={{ width: dims.w, height: dims.h, cursor, pointerEvents: 'all' }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { setHover(null); if (drag) setDrag(null) }}
    >
      {/* Text labels */}
      {textItems.map(item => (
        <div
          key={item.key}
          style={{
            position:      'absolute',
            left:           item.x,
            top:            item.y,
            color:          item.color,
            fontSize:      `${item.fontSize}px`,
            fontFamily:     item.family,
            fontWeight:    'bold',
            display:       'inline-block',
            lineHeight:     1,
            whiteSpace:    'nowrap',
            transform:      getTransform(item.align),
            textShadow:    'none',
            opacity:        (item.isActive || item.isDragged) ? 1 : 0.7,
            pointerEvents: 'none',
            zIndex:         (item.isActive || item.isDragged) ? 20 : 10,
          }}
        >
          {item.value}
        </div>
      ))}

      {/* Active dot */}
      {activeDotPos && (
        <div
          className="me-canvas-dot"
          style={{ left: activeDotPos.x, top: activeDotPos.y }}
        />
      )}

      {/* Snap guide — vertical (column X alignment) */}
      {snapGuideX !== null && (
        <div className="me-canvas-snap-guide me-canvas-snap-guide-v"
          style={{ left: snapGuideX }} />
      )}

      {/* Snap guide — horizontal (row Y alignment) */}
      {snapGuideY !== null && (
        <div className="me-canvas-snap-guide me-canvas-snap-guide-h"
          style={{ top: snapGuideY }} />
      )}

      {/* Regular crosshair while hovering (no snap active) */}
      {hover && !drag && (
        <>
          {snapGuideX === null && (
            <div className="me-canvas-guide me-canvas-guide-v" style={{ left: hover.dx }} />
          )}
          {snapGuideY === null && (
            <div className="me-canvas-guide me-canvas-guide-h" style={{ top: hover.dy }} />
          )}
          <div
            className="me-canvas-coord-badge"
            style={{
              left: Math.min(hover.dx + 14, dims.w - 95),
              top:  Math.max(hover.dy - 30, 4),
            }}
          >
            {hover.nx}, {hover.ny}
            {(snapGuideX !== null || snapGuideY !== null) && (
              <span className="me-canvas-snap-badge">
                {snapGuideX !== null && snapGuideY !== null ? '⊕ X+Y' : snapGuideX !== null ? '⊕ X' : '⊕ Y'}
              </span>
            )}
          </div>
        </>
      )}

      {/* Drag coord badge */}
      {drag && hover && (
        <div
          className="me-canvas-coord-badge me-canvas-coord-badge-drag"
          style={{
            left: Math.min(hover.dx + 14, dims.w - 95),
            top:  Math.max(hover.dy - 30, 4),
          }}
        >
          {hover.nx}, {hover.ny}
        </div>
      )}

      {/* Place hint */}
      {selected && !activeDotPos && !hover && !drag && (
        <div className="me-canvas-place-hint">
          Click on the image to place · drag existing dots to move
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CellInspector — right panel
// Includes: Position, Alignment, Font, Color, Skip, Bulk column nudge, Copy layout
// ─────────────────────────────────────────────────────────────────────────────

const CellInspector = ({ selected, config, onUpdate, onCopyLayout, onApplySpacing }) => {
  const [spacing, setSpacing] = useState(0)

  const coords = selected?.section === 'extra'
    ? config.extra_fields?.[selected.colKey]
    : (Array.isArray(config.cells) ? config.cells[selected?.rowIdx]?.[selected?.colKey] : null)

  const allLabels = [...COLUMNS, ...EXTRA_COLUMNS]
  const fieldMeta = allLabels.find(c => c.key === selected?.colKey)

  const placed  = isPlaced(coords)
  const skipped = isSkipped(coords)

  const sb             = config.scoreboard || {}
  const sbColor        = sb.color_rgb  || [255, 255, 255]
  const sbFont         = sb.font_path  || FONT_OPTIONS[0]
  const sbSize         = sb.font_size  || 130
  const effectiveColor = coords?.color_rgb ?? sbColor
  const effectiveFont  = coords?.font_path ?? sbFont
  const effectiveSize  = coords?.font_size ?? sbSize
  const effectiveAlign = coords?.alignment ?? 'center'

  // Detect row spacing from first two placed rows of this column
  useEffect(() => {
    if (!selected || selected.section !== 'cells' || !Array.isArray(config.cells)) return
    const colKey = selected.colKey
    const ys = config.cells
      .map(row => row?.[colKey])
      .filter(c => isPlaced(c))
      .map(c => c.y)
    if (ys.length >= 2) setSpacing(ys[1] - ys[0])
  }, [selected, config.cells])

  const set = useCallback((patch) => {
    if (!selected) return
    onUpdate(selected, patch)
  }, [selected, onUpdate])

  if (!selected) {
    return (
      <div className="me-inspector me-inspector-empty">
        <Crosshair size={28} strokeWidth={1.5} />
        <p>Select a cell from the left panel to inspect and map it</p>
      </div>
    )
  }

  return (
    <div className="me-inspector">

      {/* ── Header ── */}
      <div className="me-insp-header">
        <div className="me-insp-title">
          <span className="me-insp-field-name">{fieldMeta?.label ?? selected.colKey}</span>
          {selected.section === 'cells' && (
            <span className="me-insp-row-tag">Row {selected.rowIdx + 1}</span>
          )}
          {selected.section === 'extra' && (
            <span className="me-insp-row-tag extra">Extra Field</span>
          )}
        </div>
        {skipped ? (
          <span className="me-insp-status skipped">Skipped</span>
        ) : placed ? (
          <span className="me-insp-status placed">Mapped</span>
        ) : (
          <span className="me-insp-status unmapped">Unmapped</span>
        )}
      </div>

      <div className="me-insp-body">

        {/* ── Position ── */}
        <div className="me-insp-section">
          <div className="me-insp-section-label"><Move size={13} /> Position</div>
          <div className="me-insp-row">
            <div className="me-insp-field">
              <label className="me-insp-label">X</label>
              <input type="number" className="me-insp-input"
                value={coords?.x ?? 0} min={0} disabled={skipped}
                onChange={e => set({ x: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="me-insp-field">
              <label className="me-insp-label">Y</label>
              <input type="number" className="me-insp-input"
                value={coords?.y ?? 0} min={0} disabled={skipped}
                onChange={e => set({ y: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
        </div>

        {/* ── Alignment ── */}
        <div className="me-insp-section">
          <div className="me-insp-section-label"><AlignCenter size={13} /> Alignment</div>
          <div className="me-insp-align-group">
            {[
              { value: 'left',   Icon: AlignLeft },
              { value: 'center', Icon: AlignCenter },
              { value: 'right',  Icon: AlignRight },
            ].map(({ value, Icon }) => (
              <button key={value}
                className={`me-insp-align-btn ${effectiveAlign === value ? 'active' : ''}`}
                onClick={() => set({ alignment: value })} disabled={skipped}>
                <Icon size={15} />
                <span>{value.charAt(0).toUpperCase() + value.slice(1)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Font ── */}
        <div className="me-insp-section">
          <div className="me-insp-section-label"><Type size={13} /> Font</div>
          <div className="me-insp-field" style={{ marginBottom: 10 }}>
            <label className="me-insp-label">Size (px)</label>
            <div className="me-insp-size-row">
              <input type="number" className="me-insp-input"
                value={effectiveSize} min={8} max={800} step={5} disabled={skipped}
                onChange={e => set({ font_size: parseInt(e.target.value) || sbSize })} />
              {coords?.font_size && (
                <button className="me-insp-reset-btn" title="Reset"
                  onClick={() => set({ font_size: undefined })}><RotateCcw size={12} /></button>
              )}
            </div>
            {!coords?.font_size && <span className="me-insp-inherited">Inherited: {sbSize}px</span>}
          </div>
          <div className="me-insp-field">
            <label className="me-insp-label">Family</label>
            <div className="me-insp-size-row">
              <select className="me-insp-select" value={effectiveFont} disabled={skipped}
                onChange={e => set({ font_path: e.target.value === sbFont ? undefined : e.target.value })}>
                {FONT_OPTIONS.map(f => (
                  <option key={f} value={f}>{f.replace('.ttf', '').replace(/([A-Z])/g, ' $1').trim()}</option>
                ))}
              </select>
              {coords?.font_path && (
                <button className="me-insp-reset-btn" title="Reset"
                  onClick={() => set({ font_path: undefined })}><RotateCcw size={12} /></button>
              )}
            </div>
            {!coords?.font_path && <span className="me-insp-inherited">Inherited from scoreboard</span>}
          </div>
        </div>

        {/* ── Color ── */}
        <div className="me-insp-section">
          <div className="me-insp-section-label"><span style={{ fontSize: 13 }}>●</span> Color</div>
          <div className="me-insp-color-row">
            <input type="color" className="me-insp-color-swatch"
              value={rgbToHex(effectiveColor)} disabled={skipped}
              onChange={e => set({ color_rgb: hexToRgb(e.target.value) })} />
            <span className="me-insp-color-hex">{rgbToHex(effectiveColor).toUpperCase()}</span>
            <span className="me-insp-color-rgb">
              rgb({effectiveColor[0]}, {effectiveColor[1]}, {effectiveColor[2]})
            </span>
            {coords?.color_rgb && (
              <button className="me-insp-reset-btn" title="Reset"
                onClick={() => set({ color_rgb: undefined })}><RotateCcw size={12} /></button>
            )}
          </div>
          {!coords?.color_rgb && <span className="me-insp-inherited">Inherited from scoreboard</span>}
        </div>

        {/* ── Skip / Restore ── */}
        <div className="me-insp-section">
          {!skipped ? (
            <button className="me-insp-skip-btn"
              onClick={() => set({ skipped: true, x: 0, y: 0 })}>
              <SkipForward size={14} /> Skip this field
            </button>
          ) : (
            <button className="me-insp-restore-btn" onClick={() => set({ skipped: false })}>
              <RotateCcw size={14} /> Restore field
            </button>
          )}
          <p className="me-insp-skip-note">
            {skipped ? "Skipped — won't appear in renders." : 'Skipped fields are excluded from renders.'}
          </p>
        </div>

        {/* ── Copy layout + row spacing (cells only) ── */}
        {selected.section === 'cells' && (
          <div className="me-insp-section">
            <div className="me-insp-section-label"><ArrowUpDown size={13} /> Copy Layout</div>
            <p className="me-insp-inherited" style={{ marginBottom: 8 }}>
              Copy Row 1's position to all rows using a fixed Y spacing.
            </p>
            <div className="me-insp-field" style={{ marginBottom: 8 }}>
              <label className="me-insp-label">Row spacing (px)</label>
              <input type="number" className="me-insp-input"
                value={spacing} step={1} min={0}
                onChange={e => setSpacing(parseInt(e.target.value) || 0)} />
            </div>
            <div className="me-insp-copy-row">
              <button
                className="me-insp-action-btn"
                onClick={() => onCopyLayout(selected.colKey, spacing)}
                disabled={!isPlaced(Array.isArray(config.cells) ? config.cells[0]?.[selected.colKey] : null)}
              >
                <ChevronsRight size={13} /> Apply to all rows
              </button>
              <button
                className="me-insp-action-btn secondary"
                onClick={() => onApplySpacing(spacing)}
                disabled={spacing === 0}
              >
                <ArrowUpDown size={13} /> Respace all cols
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ThemeMappingEditor
// ─────────────────────────────────────────────────────────────────────────────

const ThemeMappingEditor = ({ theme, onClose, onSaved }) => {
  const [config,    setConfig]    = useState(() => buildInitialConfig(theme.mapping_config))
  const [history,   setHistory]   = useState([])   // undo stack
  const [future,    setFuture]    = useState([])   // redo stack
  const [dirty,     setDirty]     = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saveOk,    setSaveOk]    = useState(false)
  const [saveError, setSaveError] = useState('')
  const [snapEnabled, setSnapEnabled] = useState(true)

  // Server preview state
  const [previewing,   setPreviewing]   = useState(false)
  const [previewUrl,   setPreviewUrl]   = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [previewOpen,  setPreviewOpen]  = useState(false)

  // Selected cell: { section, rowIdx, colKey }
  const [selected, setSelected] = useState(null)

  const imgRef    = useRef(null)
  const [imgLoaded, setImgLoaded] = useState(false)

  // ── Config mutation with undo support ──
  const commitConfig = useCallback((updater) => {
    setConfig(prev => {
      const next = updater(deepClone(prev))
      setHistory(h => [...h.slice(-(HISTORY_LIMIT - 1)), prev])
      setFuture([])
      setDirty(true)
      return next
    })
  }, [])

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setFuture(f => [config, ...f.slice(0, HISTORY_LIMIT - 1)])
      setConfig(prev)
      setDirty(true)
      return h.slice(0, -1)
    })
  }, [config])

  const redo = useCallback(() => {
    setFuture(f => {
      if (f.length === 0) return f
      const next = f[0]
      setHistory(h => [...h.slice(-(HISTORY_LIMIT - 1)), config])
      setConfig(next)
      setDirty(true)
      return f.slice(1)
    })
  }, [config])

  // ── updateCell ──
  const updateCell = useCallback((sel, patch) => {
    commitConfig(next => {
      if (sel.section === 'extra') {
        if (!next.extra_fields) next.extra_fields = {}
        if (!next.extra_fields[sel.colKey])
          next.extra_fields[sel.colKey] = { x: 0, y: 0, alignment: 'center', font_size: 200 }
        Object.entries(patch).forEach(([k, v]) => {
          if (v === undefined) delete next.extra_fields[sel.colKey][k]
          else next.extra_fields[sel.colKey][k] = v
        })
      } else {
        if (!Array.isArray(next.cells)) next.cells = Array.from({ length: 12 }, () => ({}))
        while (next.cells.length < 12) next.cells.push({})
        if (!next.cells[sel.rowIdx]) next.cells[sel.rowIdx] = {}
        if (!next.cells[sel.rowIdx][sel.colKey])
          next.cells[sel.rowIdx][sel.colKey] = { x: 0, y: 0, alignment: DEFAULT_ALIGN[sel.colKey] ?? 'center' }
        Object.entries(patch).forEach(([k, v]) => {
          if (v === undefined) delete next.cells[sel.rowIdx][sel.colKey][k]
          else next.cells[sel.rowIdx][sel.colKey][k] = v
        })
      }
      return next
    })
  }, [commitConfig])

  // ── handlePlace — called by CanvasOverlay on click or drag end ──
  const handlePlace = useCallback((coords, targetSel) => {
    const sel = targetSel || selected
    if (!sel) return
    updateCell(sel, { x: coords.x, y: coords.y, skipped: false })
  }, [selected, updateCell])

  // ── Copy Row 1 layout to all rows with given Y spacing ──
  // Copies position (x, y), color_rgb, font_size, font_path, and alignment from Row 1
  const handleCopyLayout = useCallback((colKey, spacing) => {
    commitConfig(next => {
      if (!Array.isArray(next.cells)) return next
      const row0Cell = next.cells[0]?.[colKey]
      if (!isPlaced(row0Cell)) return next
      const { x: baseX, y: baseY, alignment, font_size, font_path, color_rgb } = row0Cell
      next.cells.forEach((row, idx) => {
        if (!row[colKey]) row[colKey] = { x: 0, y: 0, alignment: DEFAULT_ALIGN[colKey] ?? 'center' }
        row[colKey].x         = baseX
        row[colKey].y         = baseY + idx * spacing
        row[colKey].alignment = alignment ?? DEFAULT_ALIGN[colKey] ?? 'center'
        if (font_size  != null) row[colKey].font_size  = font_size
        else                    delete row[colKey].font_size
        if (font_path  != null) row[colKey].font_path  = font_path
        else                    delete row[colKey].font_path
        if (color_rgb  != null) row[colKey].color_rgb  = [...color_rgb]
        else                    delete row[colKey].color_rgb
      })
      return next
    })
  }, [commitConfig])

  // ── Apply spacing to ALL columns — redistributes all 12 rows using given Y gap ──
  // Also copies color_rgb, font_size, font_path, alignment from each column's Row 1
  const handleApplySpacing = useCallback((spacing) => {
    commitConfig(next => {
      if (!Array.isArray(next.cells)) return next
      COLUMNS.forEach(({ key }) => {
        const row0Cell = next.cells[0]?.[key]
        if (!isPlaced(row0Cell)) return
        const { x: baseX, y: baseY, alignment, font_size, font_path, color_rgb } = row0Cell
        next.cells.forEach((row, idx) => {
          if (!row[key]) row[key] = { x: 0, y: 0, alignment: DEFAULT_ALIGN[key] ?? 'center' }
          row[key].x         = baseX
          row[key].y         = baseY + idx * spacing
          row[key].alignment = alignment ?? DEFAULT_ALIGN[key] ?? 'center'
          if (font_size  != null) row[key].font_size  = font_size
          else                    delete row[key].font_size
          if (font_path  != null) row[key].font_path  = font_path
          else                    delete row[key].font_path
          if (color_rgb  != null) row[key].color_rgb  = [...color_rgb]
          else                    delete row[key].color_rgb
        })
      })
      return next
    })
  }, [commitConfig])

  // ── Navigate to next / previous cell ──
  const allCells = [
    ...Array.from({ length: 12 }, (_, rowIdx) =>
      COLUMNS.map(col => ({ section: 'cells', rowIdx, colKey: col.key }))
    ).flat(),
    ...EXTRA_COLUMNS.map(col => ({ section: 'extra', rowIdx: null, colKey: col.key })),
  ]

  const navigateCell = useCallback((dir) => {
    if (!selected) {
      setSelected(allCells[0])
      return
    }
    const idx = allCells.findIndex(c =>
      c.section === selected.section &&
      c.rowIdx  === selected.rowIdx  &&
      c.colKey  === selected.colKey
    )
    const next = allCells[(idx + dir + allCells.length) % allCells.length]
    setSelected(next)
  }, [selected, allCells])

  // ── Arrow nudge for selected cell ──
  const arrowNudge = useCallback((dx, dy, large) => {
    if (!selected) return
    const step = large ? 10 : 1
    const coords = selected.section === 'extra'
      ? config.extra_fields?.[selected.colKey]
      : config.cells?.[selected.rowIdx]?.[selected.colKey]
    if (!coords) return
    updateCell(selected, {
      x: Math.max(0, (coords.x || 0) + dx * step),
      y: Math.max(0, (coords.y || 0) + dy * step),
    })
  }, [selected, config, updateCell])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const fn = (e) => {
      const tag = e.target.tagName
      const inInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'

      if (e.key === 'Escape') { onClose(); return }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return }

      if (inInput) return

      if (e.key === 'Tab') {
        e.preventDefault()
        navigateCell(e.shiftKey ? -1 : 1)
        return
      }

      const arrows = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] }
      if (arrows[e.key] && selected) {
        e.preventDefault()
        const [dx, dy] = arrows[e.key]
        arrowNudge(dx, dy, e.shiftKey)
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose, undo, redo, navigateCell, arrowNudge, selected])

  // ── Server preview ──
  const handleServerPreview = useCallback(async () => {
    setPreviewing(true)
    setPreviewError('')
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
    try {
      const extraData = Object.fromEntries(
        Object.keys(config.extra_fields || {}).map(k => [
          k, k === 'lazarflow-watermark' ? 'lazarflow.app' : '',
        ])
      )
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/render/preview-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: theme.url,
          mappingConfig: config,
          extraData,
          adjustments: { contrast: 1.0, saturation: 1.0, brightness: 1.0, sharpness: 1.0 },
        }),
      })
      if (!res.ok) {
        let msg = `Error ${res.status}`
        try { const j = await res.json(); msg = j.detail || j.error || j.message || msg } catch (_) {}
        throw new Error(msg)
      }
      const blob = await res.blob()
      setPreviewUrl(URL.createObjectURL(blob))
      setPreviewOpen(true)
    } catch (e) {
      setPreviewError(e.message)
    } finally {
      setPreviewing(false)
    }
  }, [config, theme.url, previewUrl])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const handleSave = async () => {
    setSaving(true); setSaveError(''); setSaveOk(false)
    try {
      const { error } = await supabase
        .from('themes')
        .update({ mapping_config: config, updated_at: new Date().toISOString() })
        .eq('id', theme.id)
      if (error) throw error
      setSaveOk(true); setDirty(false)
      onSaved?.({ ...theme, mapping_config: config })
      setTimeout(() => setSaveOk(false), 3000)
    } catch (e) { setSaveError(e.message) }
    finally     { setSaving(false) }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="me-shell" onClick={onClose}>
      <div className="me-root" onClick={e => e.stopPropagation()}>

        {/* Top bar */}
        <div className="me-topbar">
          <button className="me-back-btn" onClick={onClose}>
            <ArrowLeft size={15} /> Back
          </button>
          <div className="me-title">
            <Crosshair size={15} />
            <span>Mapping Editor</span>
            <span className="me-theme-name">— {theme.name || theme.id.slice(0, 8)}</span>
          </div>

          {/* Keyboard hint */}
          <div className="me-topbar-hints">
            <span>Tab <span className="me-hint-key">next cell</span></span>
            <span>↑↓←→ <span className="me-hint-key">nudge 1px</span></span>
            <span>⇧+↑↓←→ <span className="me-hint-key">10px</span></span>
            <span>⌘Z <span className="me-hint-key">undo</span></span>
          </div>

          <div className="me-topbar-actions">
            {/* Snap toggle */}
            <button
              className={`me-snap-btn ${snapEnabled ? 'active' : ''}`}
              onClick={() => setSnapEnabled(v => !v)}
              title="Toggle snap to column/row alignment"
            >
              <Magnet size={13} />
              {snapEnabled ? 'Snap On' : 'Snap Off'}
            </button>

            {/* Undo / Redo */}
            <button className="me-icon-btn" onClick={undo} disabled={history.length === 0} title="Undo (⌘Z)">
              <RotateCcw size={14} />
            </button>
            <button className="me-icon-btn" onClick={redo} disabled={future.length === 0} title="Redo (⌘⇧Z)"
              style={{ transform: 'scaleX(-1)' }}>
              <RotateCcw size={14} />
            </button>

            {saveError && <span className="me-error-inline"><AlertCircle size={13} /> {saveError}</span>}
            {previewError && <span className="me-error-inline"><AlertCircle size={13} /> {previewError}</span>}
            {saveOk && <span className="me-saved-badge"><CheckCircle2 size={13} /> Saved</span>}

            <button className="me-preview-server-btn" onClick={handleServerPreview} disabled={previewing}>
              {previewing
                ? <><Loader2 size={13} className="spin" /> Rendering…</>
                : <><Eye size={13} /> Server Preview</>}
            </button>

            {dirty && !saveOk && (
              <button className="me-save-btn" onClick={handleSave} disabled={saving}>
                {saving
                  ? <><Loader2 size={13} className="spin" /> Saving…</>
                  : <><Save size={13} /> Save</>}
              </button>
            )}
          </div>
        </div>

        {/* 3-panel body */}
        <div className="me-body">

          <aside className="me-panel me-panel-left">
            <FieldTree config={config} selected={selected} onSelect={setSelected} />
          </aside>

          <main className="me-canvas-area">
            {!theme.url ? (
              <div className="me-canvas-empty"><p>No image URL on this theme.</p></div>
            ) : (
              <div className="me-canvas-wrap">
                <img
                  ref={imgRef}
                  src={theme.url}
                  alt={theme.name || 'theme'}
                  className="me-canvas-img"
                  draggable={false}
                  onLoad={() => setImgLoaded(true)}
                />
                <CanvasOverlay
                  imgRef={imgRef}
                  imgLoaded={imgLoaded}
                  config={config}
                  selected={selected}
                  onPlace={handlePlace}
                  onSelect={setSelected}
                  snapEnabled={snapEnabled}
                />
              </div>
            )}
          </main>

          <aside className="me-panel me-panel-right">
            <CellInspector
              selected={selected}
              config={config}
              onUpdate={updateCell}
              onCopyLayout={handleCopyLayout}
              onApplySpacing={handleApplySpacing}
            />
          </aside>

        </div>
      </div>

      {/* Server Preview Modal */}
      {previewOpen && previewUrl && (
        <div className="me-preview-modal-overlay" onClick={() => setPreviewOpen(false)}>
          <div className="me-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="me-preview-modal-header">
              <span className="me-preview-modal-title"><Eye size={15} /> Server Preview</span>
              <div className="me-preview-modal-actions">
                <a href={previewUrl} download={`${theme.name || theme.id}_preview.png`}
                  className="me-preview-download-btn">
                  <Download size={14} /> Download
                </a>
                <button className="me-preview-close-btn" onClick={() => setPreviewOpen(false)}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="me-preview-modal-body">
              <img src={previewUrl} alt="Server preview" className="me-preview-modal-img" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ThemeMappingEditor

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Save, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Crosshair,
  ChevronDown, ChevronRight, AlignLeft, AlignCenter, AlignRight,
  SkipForward, RotateCcw, Type, Move, Eye, X, Download,
  Magnet, ChevronsRight, ArrowUpDown, Sparkles, ImagePlus } from 'lucide-react'
import {
  FONT_OPTIONS, FONT_FAMILY_MAP,
  fetchFontMetrics, getYCorrection, COLUMNS, EXTRA_COLUMNS,
  DEFAULT_RENDER_TYPE, getRenderTypeDef, DEFAULT_ROWS_BY_TYPE,
  COLUMNS_BY_TYPE, EXTRA_COLUMNS_BY_TYPE, DUMMY_ROWS_BY_TYPE,
  makeEmptyMappingConfig,
} from '../../constants/themeConstants'
import { FontPicker } from './FontPicker'
import AskAiModal from './AskAiModal'

// ─────────────────────────────────────────────────────────────────────────────
// Field definitions
// ─────────────────────────────────────────────────────────────────────────────

const SNAP_THRESHOLD = 20   // natural-px distance to trigger snap
const HISTORY_LIMIT  = 40

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

const deepClone = (obj) => JSON.parse(JSON.stringify(obj))

const DEFAULT_ALIGN = {
  rank: 'center', team: 'left', w: 'center',
  pp: 'center', kp: 'center', total: 'center', mp: 'center',
  player: 'left', kills: 'center', slot: 'center',
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
const getRowYValues = (cells, rowIdx, columns = COLUMNS) => {
  if (!Array.isArray(cells)) return []
  const row = cells[rowIdx] || {}
  return columns
    .map(col => row[col.key])
    .filter(c => isPlaced(c))
    .map(c => c.y)
}

// Snap a raw x/y to nearby column-X or row-Y values
const applySnap = (nx, ny, cells, colKey, rowIdx, snapOn, columns = COLUMNS) => {
  if (!snapOn) return { nx, ny, snapX: null, snapY: null }

  let finalX = nx, finalY = ny, snapX = null, snapY = null

  const colXs = getColumnXValues(cells, colKey)
  for (const cx of colXs) {
    if (Math.abs(nx - cx) <= SNAP_THRESHOLD) { finalX = cx; snapX = cx; break }
  }

  const rowYs = getRowYValues(cells, rowIdx, columns)
  for (const ry of rowYs) {
    if (Math.abs(ny - ry) <= SNAP_THRESHOLD) { finalY = ry; snapY = ry; break }
  }

  return { nx: finalX, ny: finalY, snapX, snapY }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildInitialConfig
// ─────────────────────────────────────────────────────────────────────────────

const buildInitialConfig = (existing, renderType = DEFAULT_RENDER_TYPE) => {
  const def  = getRenderTypeDef(renderType)
  const base = makeEmptyMappingConfig(renderType)

  if (!existing) return base

  base.scoreboard   = existing.scoreboard   || base.scoreboard
  base.extra_fields = existing.extra_fields || base.extra_fields

  const columns  = COLUMNS_BY_TYPE[def.id] || []
  const rowCount = def.hasRows
    ? Math.max(
        DEFAULT_ROWS_BY_TYPE[def.id] || 12,
        Array.isArray(existing.cells) ? existing.cells.length : 0,
      )
    : 0

  if (def.hasRows && Array.isArray(existing.cells)) {
    const rows = Array.from({ length: rowCount }, (_, i) => {
      const er = existing.cells[i] || {}
      const br = base.cells[i] || {}
      return {
        ...br,
        ...Object.fromEntries(
          Object.keys(br).map(key => [key, er[key] ? { ...br[key], ...er[key] } : br[key]])
        ),
        // preserve stored keys the base doesn't know about (e.g. legacy columns)
        ...Object.fromEntries(
          Object.keys(er).filter(key => !(key in br)).map(key => [key, er[key]])
        ),
      }
    })
    return { ...base, cells: rows }
  }

  if (def.hasRows && existing.cells && typeof existing.cells === 'object') {
    const rows = Array.from({ length: rowCount }, () => {
      const row = {}
      columns.forEach(({ key }) => {
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

const FieldTree = ({ config, selected, onSelect, columns = COLUMNS, extraColumns = EXTRA_COLUMNS }) => {
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

  const rowCount = Array.isArray(config.cells) ? config.cells.length : 0
  const placedColCount = columns.filter(col =>
    rowCount > 0 && config.cells.some(row => isPlaced(row?.[col.key]))
  ).length
  const totalExtra = extraColumns.filter(col => isPlaced(config.extra_fields?.[col.key])).length

  return (
    <div className="me-tree">

      <button
        className={`me-tree-section-btn ${scoreboardOpen ? 'open' : ''}`}
        onClick={() => setScoreboardOpen(o => !o)}
      >
        <ChevronDown size={14} className={`me-tree-section-chevron ${scoreboardOpen ? 'open' : ''}`} />
        <span className="me-tree-section-label">Scoreboard</span>
        <span className="me-tree-section-sub">{rowCount} rows · {columns.length} cols</span>
        {placedColCount > 0 && (
          <span className="me-tree-section-badge">{placedColCount}/{columns.length} cols</span>
        )}
      </button>

      {scoreboardOpen && rowCount > 0 && (
        <div className="me-tree-section-body">
          {Array.from({ length: rowCount }, (_, rowIdx) => {
            const row         = config.cells[rowIdx] || {}
            const expanded    = expandedRows.has(rowIdx)
            const rowSelected = selected?.section === 'cells' && selected?.rowIdx === rowIdx
            const placedInRow = columns.filter(col => isPlaced(row[col.key])).length

            return (
              <div key={rowIdx} className="me-tree-row-group">
                <button
                  className={`me-tree-row-header ${rowSelected ? 'row-selected' : ''}`}
                  onClick={() => toggleRow(rowIdx)}
                >
                  <ChevronRight size={12} className={`me-tree-chevron ${expanded ? 'open' : ''}`} />
                  <span className="me-tree-row-num">Row {rowIdx + 1}</span>
                  {placedInRow > 0 && (
                    <span className="me-tree-row-badge">{placedInRow}/{columns.length}</span>
                  )}
                </button>

                {expanded && (
                  <div className="me-tree-col-list">
                    {columns.map(col => {
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
        <span className="me-tree-section-sub">{extraColumns.length} fields</span>
        {totalExtra > 0 && (
          <span className="me-tree-section-badge">{totalExtra}/{extraColumns.length}</span>
        )}
      </button>

      {extrasOpen && (
        <div className="me-tree-section-body">
          <div className="me-tree-col-list me-tree-extras">
            {extraColumns.map(col => {
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

const CanvasOverlay = ({ theme, imgRef, imgLoaded, onImgLoad, config, selected, onPlace, onSelect, snapEnabled, columns = COLUMNS, extraColumns = EXTRA_COLUMNS, dummyRows = DUMMY_ROWS_BY_TYPE[DEFAULT_RENDER_TYPE] }) => {
  const [dims, setDims]     = useState({ w: 0, h: 0 })
  const [hover, setHover]   = useState(null)   // { nx, ny, dx, dy, snapX, snapY }
  const [drag, setDrag]     = useState(null)   // { key: 'cell-r-c'|'extra-k', startNx, startNy, origX, origY }
  const [, forceUpdate]     = useState(0)

  // View state — zoom 1 = fit-to-area; x/y = pan offset in screen px (origin: center)
  const [view, setView]           = useState({ zoom: 1, x: 0, y: 0 })
  const [spaceDown, setSpaceDown] = useState(false)
  const zoomRef   = useRef(null)   // .me-canvas-zoom element
  const panRef    = useRef(null)   // active pan gesture { sx, sy, vx, vy }
  const pannedRef = useRef(false)  // a pan just happened → suppress the next click-place

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const measure = () => {
      // Layout size — unaffected by the zoom transform on the ancestor
      if (img.offsetWidth > 0 && img.offsetHeight > 0)
        setDims({ w: img.offsetWidth, h: img.offsetHeight })
    }
    measure()
    const ro = new ResizeObserver(entries => {
      const cr = entries[0]?.contentRect
      if (cr && cr.width > 0 && cr.height > 0) setDims({ w: cr.width, h: cr.height })
      else measure()
    })
    ro.observe(img)
    return () => ro.disconnect()
  }, [imgRef, imgLoaded])

  // Wheel = zoom at cursor (shift+wheel = pan); non-passive so preventDefault works
  useEffect(() => {
    const area = zoomRef.current?.closest('.me-canvas-area')
    if (!area) return
    const onWheel = (e) => {
      e.preventDefault()
      if (e.shiftKey) {
        setView(v => ({ ...v, x: v.x - (e.deltaY + e.deltaX) }))
        return
      }
      const rect = area.getBoundingClientRect()
      const px = e.clientX - (rect.left + rect.width / 2)
      const py = e.clientY - (rect.top + rect.height / 2)
      setView(v => {
        const nz = Math.min(6, Math.max(0.2, v.zoom * Math.exp(-e.deltaY * 0.0018)))
        const k = nz / v.zoom
        return { zoom: nz, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
      })
    }
    area.addEventListener('wheel', onWheel, { passive: false })
    return () => area.removeEventListener('wheel', onWheel)
  }, [imgLoaded])

  // Space = pan modifier; +/− zoom, 0 = fit
  useEffect(() => {
    const isFormField = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')
    const dn = (e) => {
      if (isFormField(e.target)) return
      if (e.code === 'Space') { e.preventDefault(); setSpaceDown(true); return }
      if (e.key === '+' || e.key === '=') setView(v => ({ ...v, zoom: Math.min(6, v.zoom * 1.25) }))
      else if (e.key === '-') setView(v => ({ ...v, zoom: Math.max(0.2, v.zoom / 1.25) }))
      else if (e.key === '0') setView({ zoom: 1, x: 0, y: 0 })
    }
    const up = (e) => { if (e.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  useEffect(() => {
    const fonts = new Set()
    const sbFont = config.scoreboard?.font_path || FONT_OPTIONS[0]
    fonts.add(sbFont)
    ;(Array.isArray(config.cells) ? config.cells : []).forEach(row => {
      columns.forEach(col => { if (row?.[col.key]?.font_path) fonts.add(row[col.key].font_path) })
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

  // Hit-test: find a placed dot within SNAP_THRESHOLD display-px of click.
  // dx/dy arrive in screen px — convert to internal (fit) px so the zoom
  // transform keeps hit areas screen-consistent.
  const hitTest = useCallback((dxScreen, dyScreen) => {
    const img = imgRef.current
    if (!img) return null
    const dx = dxScreen / view.zoom
    const dy = dyScreen / view.zoom
    const sx = dims.w / img.naturalWidth
    const sy = dims.h / img.naturalHeight
    const HIT_PX = 18

    if (Array.isArray(config.cells)) {
      for (let rowIdx = 0; rowIdx < config.cells.length; rowIdx++) {
        const row = config.cells[rowIdx] || {}
        for (const col of columns) {
          const c = row[col.key]
          if (!isPlaced(c)) continue
          const cx = c.x * sx, cy = c.y * sy
          if (Math.abs(dx - cx) < HIT_PX && Math.abs(dy - cy) < HIT_PX) {
            return { section: 'cells', rowIdx, colKey: col.key, origX: c.x, origY: c.y }
          }
        }
      }
    }
    for (const col of extraColumns) {
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
  }, [config, dims, imgRef, view.zoom])

  const handleMouseDown = useCallback((e) => {
    // Middle-drag or space+left-drag pans the canvas
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault()
      panRef.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
      pannedRef.current = false
      return
    }
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
  }, [getNaturalCoords, hitTest, onSelect, spaceDown, view.x, view.y])

  const handleMouseMove = useCallback((e) => {
    // Active canvas pan
    if (panRef.current) {
      const p = panRef.current
      if (Math.abs(e.clientX - p.sx) + Math.abs(e.clientY - p.sy) > 3) pannedRef.current = true
      setView(v => ({ ...v, x: p.vx + (e.clientX - p.sx), y: p.vy + (e.clientY - p.sy) }))
      return
    }

    const c = getNaturalCoords(e)
    if (!c) return

    if (drag) {
      const img = imgRef.current
      if (!img) return
      const rawNx = c.nx
      const rawNy = c.ny
      const rowIdx = drag.section === 'cells' ? drag.rowIdx : -1
      const { nx: snappedNx, ny: snappedNy, snapX, snapY } = applySnap(
        rawNx, rawNy, config.cells, drag.colKey, rowIdx, snapEnabled, columns
      )
      setHover({ ...c, nx: snappedNx, ny: snappedNy, snapX, snapY, isDragging: true })
      return
    }

    if (!selected) { setHover(null); return }
    const rowIdx = selected.section === 'cells' ? selected.rowIdx : -1
    const { nx: snappedNx, ny: snappedNy, snapX, snapY } = applySnap(
      c.nx, c.ny, config.cells, selected.colKey, rowIdx, snapEnabled, columns
    )
    setHover({ ...c, nx: snappedNx, ny: snappedNy, snapX, snapY })
  }, [getNaturalCoords, drag, selected, config.cells, snapEnabled, imgRef])

  const handleMouseUp = useCallback((e) => {
    if (panRef.current) {
      panRef.current = null
      return
    }
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
    // Don't place if we just finished a drag or a canvas pan
    if (drag || pannedRef.current) {
      pannedRef.current = false
      return
    }
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

  const img = imgRef.current
  const canvasReady = imgLoaded && dims.w > 0 && !!img?.naturalWidth

  const sx = canvasReady ? dims.w / img.naturalWidth : 1
  const sy = canvasReady ? dims.h / img.naturalHeight : 1
  const sb         = config.scoreboard || {}
  const sbColor    = sb.color_rgb  || [255, 255, 255]
  const sbFontPath = sb.font_path  || FONT_OPTIONS[0]
  const sbSize     = sb.font_size  || 130

  // Sample values for extra-field overlays (schedule fields use the type
  // registry's samples so previews show a full card)
  const typeDef = getRenderTypeDef(theme?.type || DEFAULT_RENDER_TYPE)
  const mockExtra = {}
  extraColumns.forEach(c => {
    mockExtra[c.key] = MOCK_EXTRA[c.key]
      ?? (typeDef.fields.find(f => f.key === c.key)?.sample ?? c.label)
  })
  mockExtra['lazarflow-watermark'] = 'lazarflow.app'

  // Build text items
  const textItems = []
  if (Array.isArray(config.cells)) {
    config.cells.forEach((row, rowIdx) => {
      columns.forEach(col => {
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
        if (col.isLogo) {
          // Logo slot — rendered as a resizable box, not text
          textItems.push({
            key: `cell-${rowIdx}-${col.key}`,
            isLogo: true,
            x: px, y: py,
            width: (coords.width || 120) * sx,
            height: (coords.height || 120) * sy,
            label: `${col.label} · Row ${rowIdx + 1}`,
            isActive, isDragged,
          })
          return
        }
        textItems.push({
          key: `cell-${rowIdx}-${col.key}`,
          x: px, y: py,
          value: String(dummyRows[rowIdx]?.[col.key] ?? ''),
          label: `${col.label} · Row ${rowIdx + 1}`,
          color, fontSize: fontSizePx,
          family: getFontFamily(fontPath),
          align: coords.alignment || 'center',
          isActive, isDragged,
        })
      })
    })
  }
  extraColumns.forEach(col => {
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
      value: mockExtra[col.key] ?? col.key,
      label: col.label,
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

  const cursor = drag ? 'grabbing' : (spaceDown || panRef.current) ? 'grab' : selected ? 'crosshair' : 'default'

  return (
    <>
      <div
        className="me-canvas-zoom"
        ref={zoomRef}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        <div className="me-canvas-wrap">
          <img
            ref={imgRef}
            src={theme.url}
            alt={theme.name || 'theme'}
            className="me-canvas-img"
            draggable={false}
            onLoad={onImgLoad}
          />
          {canvasReady && (
            <div
              className="me-canvas-overlay"
              style={{ width: dims.w, height: dims.h, cursor, pointerEvents: 'all' }}
              onClick={handleClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => { setHover(null); if (drag) setDrag(null); panRef.current = null }}
            >
      {/* Text labels + logo slot boxes */}
      {textItems.map(item => item.isLogo ? (
        <div
          key={item.key}
          style={{
            position:      'absolute',
            left:           item.x,
            top:            item.y,
            width:          item.width,
            height:         item.height,
            border:        '2px dashed rgba(26,115,232,0.75)',
            borderRadius:  8,
            background:    'rgba(26,115,232,0.08)',
            display:       'flex',
            alignItems:    'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex:         (item.isActive || item.isDragged) ? 20 : 10,
            outline:        (item.isActive || item.isDragged) ? '1.5px solid #8b5cf6' : 'none',
            outlineOffset:  2,
          }}
        >
          <ImagePlus size={18} color="rgba(26,115,232,0.8)" />
          {(item.isActive || item.isDragged) && (
            <span className="me-canvas-sel-tag">{item.label}</span>
          )}
        </div>
      ) : (
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
            textShadow:    (item.isActive || item.isDragged)
              ? '0 0 0 1px rgba(139,92,246,0.9), 0 2px 8px rgba(0,0,0,0.9)'
              : '0 1px 3px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.5)',
            opacity:        (item.isActive || item.isDragged) ? 1 : 0.85,
            pointerEvents: 'none',
            zIndex:         (item.isActive || item.isDragged) ? 20 : 10,
            outline:        (item.isActive || item.isDragged) ? '1.5px solid #8b5cf6' : 'none',
            outlineOffset:  2,
            borderRadius:   2,
          }}
        >
          {item.value}
          {/* Canva-style corner handles + name tag on the selected element */}
          {(item.isActive || item.isDragged) && [[0, 0], [1, 0], [0, 1], [1, 1]].map(([hx, hy], i) => (
            <span
              key={i}
              className="me-canvas-handle"
              style={{ left: hx ? '100%' : 0, top: hy ? '100%' : 0 }}
            />
          ))}
          {item.isActive && (
            <span className="me-canvas-sel-tag">{item.label}</span>
          )}
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
            <div className="me-canvas-guide me-canvas-guide-v" style={{ left: hover.dx / view.zoom }} />
          )}
          {snapGuideY === null && (
            <div className="me-canvas-guide me-canvas-guide-h" style={{ top: hover.dy / view.zoom }} />
          )}
          <div
            className="me-canvas-coord-badge"
            style={{
              left: Math.min(hover.dx / view.zoom + 14, dims.w - 95),
              top:  Math.max(hover.dy / view.zoom - 30, 4),
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
            left: Math.min(hover.dx / view.zoom + 14, dims.w - 95),
            top:  Math.max(hover.dy / view.zoom - 30, 4),
          }}
        >
          {hover.nx}, {hover.ny}
        </div>
      )}

      {/* Place hint */}
      {selected && !activeDotPos && !hover && !drag && (
        <div className="me-canvas-place-hint">
          Click on the image to place · drag dots to move · scroll to zoom
        </div>
      )}
            </div>
          )}
        </div>
      </div>

      {/* Canvas toolbar */}
      {canvasReady && (
        <div className="me-canvas-toolbar">
          <button
            className="me-canvas-tool-btn"
            title="Zoom out (−)"
            aria-label="Zoom out"
            onClick={() => setView(v => ({ ...v, zoom: Math.max(0.2, v.zoom / 1.25) }))}
          >−</button>
          <span className="me-canvas-zoom-label" title="Zoom — 100% means fit-to-view">
            {Math.round(view.zoom * 100)}%
          </span>
          <button
            className="me-canvas-tool-btn"
            title="Zoom in (+)"
            aria-label="Zoom in"
            onClick={() => setView(v => ({ ...v, zoom: Math.min(6, v.zoom * 1.25) }))}
          >+</button>
          <span className="me-canvas-tool-sep" />
          <button
            className="me-canvas-tool-btn"
            title="Fit to view (0)"
            onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
          >Fit</button>
          <button
            className="me-canvas-tool-btn"
            title="Actual size (1:1)"
            onClick={() => setView({ zoom: Math.min(6, Math.max(0.2, img.naturalWidth / dims.w)), x: 0, y: 0 })}
          >1:1</button>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CellInspector — right panel
// Includes: Position, Alignment, Font, Color, Skip, Bulk column nudge, Copy layout
// ─────────────────────────────────────────────────────────────────────────────

const CellInspector = ({ selected, config, onUpdate, onCopyLayout, onApplySpacing, onSelect, columns = COLUMNS, extraColumns = EXTRA_COLUMNS }) => {
  const [spacing, setSpacing] = useState(0)

  const coords = selected?.section === 'extra'
    ? config.extra_fields?.[selected.colKey]
    : (Array.isArray(config.cells) ? config.cells[selected?.rowIdx]?.[selected?.colKey] : null)

  const allLabels = [...columns, ...extraColumns]
  const fieldMeta = allLabels.find(c => c.key === selected?.colKey)
  const isLogoCell = selected?.section === 'cells' && !!fieldMeta?.isLogo

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
        <button
          className="me-insp-deselect-btn"
          title="Deselect (Esc)"
          aria-label="Deselect"
          onClick={() => onSelect?.(null)}
        >
          <X size={13} />
        </button>
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

        {/* ── Logo slot geometry (logo cells only) ── */}
        {isLogoCell && (
          <>
            <div className="me-insp-section">
              <div className="me-insp-section-label"><ImagePlus size={13} /> Logo Slot Size</div>
              <div className="me-insp-row">
                <div className="me-insp-field">
                  <label className="me-insp-label">Width (px)</label>
                  <input type="number" className="me-insp-input"
                    value={coords?.width ?? 120} min={10}
                    onChange={e => set({ width: parseInt(e.target.value) || 120 })} />
                </div>
                <div className="me-insp-field">
                  <label className="me-insp-label">Height (px)</label>
                  <input type="number" className="me-insp-input"
                    value={coords?.height ?? 120} min={10}
                    onChange={e => set({ height: parseInt(e.target.value) || 120 })} />
                </div>
              </div>
              <div className="me-insp-row">
                <div className="me-insp-field">
                  <label className="me-insp-label">Shape</label>
                  <select className="me-insp-select" value={coords?.shape || 'square'}
                    onChange={e => set({ shape: e.target.value === 'square' ? undefined : e.target.value })}>
                    <option value="square">Square</option>
                    <option value="circle">Circle</option>
                    <option value="rounded">Rounded</option>
                  </select>
                </div>
                <div className="me-insp-field">
                  <label className="me-insp-label">Opacity ({Math.round((coords?.opacity ?? 1) * 100)}%)</label>
                  <input type="range" min={0.1} max={1} step={0.05} style={{ width: '100%' }}
                    value={coords?.opacity ?? 1}
                    onChange={e => set({ opacity: parseFloat(e.target.value) || 1 })} />
                </div>
              </div>
              <span className="me-insp-inherited">
                The team's logo is drawn into this box on every render.
              </span>
            </div>
          </>
        )}
        {!isLogoCell && (
          <>
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
                <button className="me-insp-reset-btn" title="Reset" aria-label="Reset"
                  onClick={() => set({ font_size: undefined })}><RotateCcw size={12} /></button>
              )}
            </div>
            {!coords?.font_size && <span className="me-insp-inherited">Inherited: {sbSize}px</span>}
          </div>
          <div className="me-insp-field">
            <label className="me-insp-label">Family</label>
            <FontPicker
              value={coords?.font_path ?? null}
              sbFont={sbFont}
              disabled={skipped}
              onChange={(fp) => set({ font_path: fp === sbFont ? undefined : fp })}
            />
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
              <button className="me-insp-reset-btn" title="Reset" aria-label="Reset"
                onClick={() => set({ color_rgb: undefined })}><RotateCcw size={12} /></button>
            )}
          </div>
          {!coords?.color_rgb && <span className="me-insp-inherited">Inherited from scoreboard</span>}
        </div>

          </>
        )}

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
  // Render type drives the field schema: which columns exist, how many rows,
  // which extra fields are available, and what the preview overlays show.
  const renderType   = theme?.type || DEFAULT_RENDER_TYPE
  const typeDef      = getRenderTypeDef(renderType)
  const columns      = COLUMNS_BY_TYPE[renderType] || COLUMNS
  const extraColumns = EXTRA_COLUMNS_BY_TYPE[renderType] || EXTRA_COLUMNS
  const dummyRows    = DUMMY_ROWS_BY_TYPE[renderType] || []
  const rowCount     = typeDef.hasRows ? (DEFAULT_ROWS_BY_TYPE[renderType] || 12) : 0

  const [config,    setConfig]    = useState(() => buildInitialConfig(theme.mapping_config, renderType))
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

  // Ask AI modal
  const [askAiOpen, setAskAiOpen] = useState(false)

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
        if (!Array.isArray(next.cells) || next.cells.length === 0) {
          next.cells = Array.from({ length: rowCount }, () => ({}))
        }
        while (next.cells.length < rowCount) next.cells.push({})
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

  // ── Apply spacing to ALL columns — redistributes all rows using given Y gap ──
  // Also copies color_rgb, font_size, font_path, alignment from each column's Row 1
  const handleApplySpacing = useCallback((spacing) => {
    commitConfig(next => {
      if (!Array.isArray(next.cells)) return next
      columns.forEach(({ key }) => {
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
    ...Array.from({ length: rowCount }, (_, rowIdx) =>
      columns.map(col => ({ section: 'cells', rowIdx, colKey: col.key }))
    ).flat(),
    ...extraColumns.map(col => ({ section: 'extra', rowIdx: null, colKey: col.key })),
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
      if (askAiOpen) return   // Ask AI modal handles its own keys

      const tag = e.target.tagName
      const inInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'

      if (e.key === 'Escape') {
        // Canva-style: Escape deselects first, closes the editor only when nothing is selected
        if (selected) { setSelected(null); return }
        onClose(); return
      }
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
  }, [onClose, undo, redo, navigateCell, arrowNudge, selected, askAiOpen])

  // ── Ask AI — apply a normalized config returned by the modal ──
  const handleApplyAiConfig = useCallback((nextConfig) => {
    commitConfig(() => nextConfig)
    setSelected(null)
  }, [commitConfig])

  // Clicking the already-selected field in the tree deselects it (Canva-style toggle)
  const handleTreeSelect = useCallback((sel) => {
    setSelected(prev => (
      prev && prev.section === sel.section && prev.rowIdx === sel.rowIdx && prev.colKey === sel.colKey
        ? null
        : sel
    ))
  }, [])

  // ── Server preview ──
  const handleServerPreview = useCallback(async () => {
    setPreviewing(true)
    setPreviewError('')
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
    try {
      const extraData = Object.fromEntries(
        Object.keys(config.extra_fields || {}).map(k => [
          k, k === 'lazarflow-watermark' ? 'lazarflow.app' : (MOCK_EXTRA[k] ?? ''),
        ])
      )
      // For schedule cards the mock values live on the type registry's samples
      Object.keys(extraData).forEach(k => {
        if (!extraData[k]) {
          extraData[k] = typeDef.fields.find(f => f.key === k)?.sample ?? ''
        }
      })
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/render/preview-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: theme.url,
          mappingConfig: config,
          renderType,
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
            <span>+ / − <span className="me-hint-key">zoom</span></span>
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
            <button className="me-icon-btn" onClick={undo} disabled={history.length === 0} title="Undo (⌘Z)" aria-label="Undo">
              <RotateCcw size={14} />
            </button>
            <button className="me-icon-btn" onClick={redo} disabled={future.length === 0} title="Redo (⌘⇧Z)"
              aria-label="Redo"
              style={{ transform: 'scaleX(-1)' }}>
              <RotateCcw size={14} />
            </button>

            {saveError && <span className="me-error-inline"><AlertCircle size={13} /> {saveError}</span>}
            {previewError && <span className="me-error-inline"><AlertCircle size={13} /> {previewError}</span>}
            {saveOk && <span className="me-saved-badge"><CheckCircle2 size={13} /> Saved</span>}

            <button
              className="me-ai-btn"
              onClick={() => setAskAiOpen(true)}
              disabled={!imgLoaded}
              title="Generate a mapping draft with an AI vision model"
            >
              <Sparkles size={13} /> Ask AI
            </button>

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
            <FieldTree
              config={config}
              selected={selected}
              onSelect={handleTreeSelect}
              columns={columns}
              extraColumns={extraColumns}
            />
          </aside>

          <main className="me-canvas-area">
            {!theme.url ? (
              <div className="me-canvas-empty"><p>No image URL on this theme.</p></div>
            ) : (
              <CanvasOverlay
                theme={theme}
                imgRef={imgRef}
                imgLoaded={imgLoaded}
                onImgLoad={() => setImgLoaded(true)}
                config={config}
                selected={selected}
                onPlace={handlePlace}
                onSelect={setSelected}
                snapEnabled={snapEnabled}
                columns={columns}
                extraColumns={extraColumns}
                dummyRows={dummyRows}
              />
            )}
          </main>

          <aside className="me-panel me-panel-right">
            <CellInspector
              selected={selected}
              config={config}
              onUpdate={updateCell}
              onCopyLayout={handleCopyLayout}
              onApplySpacing={handleApplySpacing}
              onSelect={setSelected}
              columns={columns}
              extraColumns={extraColumns}
            />
          </aside>

        </div>
      </div>

      {/* Ask AI modal */}
      {askAiOpen && (
        <AskAiModal
          theme={theme}
          imgRef={imgRef}
          config={config}
          renderType={renderType}
          onApply={handleApplyAiConfig}
          onClose={() => setAskAiOpen(false)}
        />
      )}

      {/* Server Preview Modal */}
      {previewOpen && previewUrl && (
        <div
          className="me-preview-modal-overlay"
          onClick={(e) => { e.stopPropagation(); setPreviewOpen(false) }}
        >
          <div className="me-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="me-preview-modal-header">
              <span className="me-preview-modal-title"><Eye size={15} /> Server Preview</span>
              <div className="me-preview-modal-actions">
                <a href={previewUrl} download={`${theme.name || theme.id}_preview.png`}
                  className="me-preview-download-btn">
                  <Download size={14} /> Download
                </a>
                <button
                  className="me-preview-close-btn"
                  onClick={(e) => { e.stopPropagation(); setPreviewOpen(false) }}
                  aria-label="Close preview">
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

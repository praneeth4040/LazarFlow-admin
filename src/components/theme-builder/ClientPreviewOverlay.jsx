import { useState, useEffect } from 'react'
import { DUMMY_TEAMS, getFontFamily, fetchFontMetrics, getYCorrection } from '../../constants/themeConstants'

// Cell fields in render order
const CELL_FIELDS = ['rank', 'team', 'w', 'pp', 'kp', 'total', 'mp']

// ─── PIL draw.text() anchor behaviour ───────────────────────────────────────
// PIL default anchor = "la" (left-ascender). Y = top of ascender line.
// CSS match: lineHeight:1 removes leading so element top ≈ ascender top.
// alignment: center → translateX(-50%), right → translateX(-100%), left → none
// ─────────────────────────────────────────────────────────────────────────────

const getTransform = (alignment) => {
  if (alignment === 'center') return 'translateX(-50%)'
  if (alignment === 'right')  return 'translateX(-100%)'
  return 'none'
}

const ClientPreviewOverlay = ({ config, imageRef, imageUrl, selectedCellIdx, selectedField }) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const img = imageRef.current
    if (!img) return
    const update = () => {
      const rect = img.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0)
        setDimensions({ width: rect.width, height: rect.height })
    }
    if (img.complete) update()
    img.addEventListener('load', update)
    window.addEventListener('resize', update)
    const interval = setInterval(update, 500)
    return () => {
      img.removeEventListener('load', update)
      window.removeEventListener('resize', update)
      clearInterval(interval)
    }
  }, [imageRef, imageUrl])

  // Fetch font metrics for all fonts in config so Y correction can be applied
  useEffect(() => {
    if (!config) return
    const fonts = new Set()
    const sbFont = config.scoreboard?.font_path || 'Anton-Regular.ttf'
    fonts.add(sbFont)
    const cells = config.cells
    if (Array.isArray(cells)) {
      cells.forEach(row => {
        if (!row) return
        Object.values(row).forEach(f => { if (f?.font_path) fonts.add(f.font_path) })
      })
    } else if (cells && typeof cells === 'object') {
      Object.values(cells).forEach(f => { if (f?.font_path) fonts.add(f.font_path) })
    }
    Object.values(config.extra_fields || {}).forEach(f => { if (f?.font_path) fonts.add(f.font_path) })
    fetchFontMetrics([...fonts]).then(() => forceUpdate(n => n + 1))
  }, [config])

  if (!imageRef.current || !config || !config.cells || dimensions.width === 0) return null

  const naturalWidth  = imageRef.current.naturalWidth
  const naturalHeight = imageRef.current.naturalHeight
  if (!naturalWidth || !naturalHeight) return null

  const scaleX = dimensions.width  / naturalWidth
  const scaleY = dimensions.height / naturalHeight

  const scoreboard   = config.scoreboard || {}
  const baseColorRgb = scoreboard.color_rgb || [255, 255, 255]
  const defaultColor = `rgb(${baseColorRgb.join(',')})`

  const renderText = (key, coords, value, isSelected, overrideColor) => {
    if (!coords || coords.skipped || (coords.x === 0 && coords.y === 0)) return null

    const fontPath   = coords.font_path || scoreboard.font_path
    const fontSizePx = (coords.font_size || scoreboard.font_size || 130) * scaleY
    const fontFamily = getFontFamily(fontPath)
    const alignment  = coords.alignment || 'left'
    const yCorr      = getYCorrection(fontPath, fontSizePx)
    const color = overrideColor
      || (coords.color_rgb ? `rgb(${coords.color_rgb.join(',')})` : defaultColor)

    return (
      <div
        key={key}
        style={{
          position:   'absolute',
          left:        coords.x * scaleX,
          top:         coords.y * scaleY - yCorr,
          color,
          fontSize:   `${fontSizePx}px`,
          fontWeight: 'bold',
          fontFamily,
          display:    'inline-block',
          lineHeight:  1,
          whiteSpace: 'nowrap',
          transform:   getTransform(alignment),
          textShadow:  'none',
          zIndex: isSelected ? 10 : 1,
          pointerEvents: 'none',
        }}
      >
        {value}
      </div>
    )
  }

  // ── Detect schema ──────────────────────────────────────────────────────────
  const cellsIsArray  = Array.isArray(config.cells)
  const cellsIsObject = !cellsIsArray && config.cells && typeof config.cells === 'object'

  return (
    <div
      className="client-preview-overlay"
      style={{
        position: 'absolute', top: 0, left: 0,
        width: dimensions.width, height: dimensions.height,
        pointerEvents: 'none', overflow: 'hidden',
      }}
    >
      {/* ── New array schema: cells[rowIdx][colKey] ── */}
      {cellsIsArray && config.cells.map((row, rowIdx) => {
        const teamData   = DUMMY_TEAMS[rowIdx] || {}
        const isSelected = rowIdx === selectedCellIdx

        return CELL_FIELDS.map(field => {
          const coords = row?.[field]
          if (!coords || coords.skipped || (coords.x === 0 && coords.y === 0)) return null
          const color = isSelected
            ? '#ffeb3b'
            : (coords.color_rgb ? `rgb(${coords.color_rgb.join(',')})` : defaultColor)
          return renderText(`${rowIdx}-${field}`, coords, teamData[field] ?? '', isSelected, color)
        })
      })}

      {/* ── Legacy object schema: cells[colKey] (shared position per column) ── */}
      {cellsIsObject && CELL_FIELDS.map(field => {
        const coords = config.cells[field]
        if (!coords || coords.skipped || (coords.x === 0 && coords.y === 0)) return null
        const rowIdx   = selectedCellIdx ?? 0
        const teamData = DUMMY_TEAMS[rowIdx] || {}
        const isSelected = selectedCellIdx !== null && selectedCellIdx !== undefined
        const override   = coords.row_overrides?.[String(rowIdx)]
        const colorRgb   = override?.color_rgb ?? coords.color_rgb
        const color      = isSelected
          ? '#ffeb3b'
          : (colorRgb ? `rgb(${colorRgb.join(',')})` : defaultColor)
        return renderText(
          `${field}-${rowIdx}`,
          { ...coords, font_size: override?.font_size ?? coords.font_size ?? scoreboard.font_size ?? 130 },
          teamData[field] ?? '',
          isSelected,
          color,
        )
      })}

      {/* ── Extra fields (both schemas) ── */}
      {config.extra_fields && Object.entries(config.extra_fields).map(([fieldName, coords]) => {
        if (!coords || coords.skipped || (coords.x === 0 && coords.y === 0)) return null
        const isSelected = selectedField === fieldName
        const value = fieldName === 'tournament_name' ? 'GRAND TOURNAMENT 2024' : fieldName
        const color = isSelected
          ? '#ffeb3b'
          : (coords.color_rgb ? `rgb(${coords.color_rgb.join(',')})` : 'rgb(255,255,255)')
        return renderText(fieldName, coords, value, isSelected, color)
      })}
    </div>
  )
}

export default ClientPreviewOverlay

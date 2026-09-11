import { useState, useEffect } from 'react'
import { DUMMY_TEAMS, getFontFamily } from '../../constants/themeConstants'

// ── Cell fields in render order (mirrors CELL_FIELDS in ThemeMappingEditor) ──
const CELL_FIELDS = ['rank', 'team', 'w', 'pp', 'kp', 'total', 'mp']

// ─── Replicate PIL draw.text() default anchor behaviour ────────────────────
//
// PIL default anchor = "la" (left-ascender).
// Y coordinate = top of the ascender line (≈ top of uppercase letters).
//
// CSS `top` on a block element = top of the line-box which includes
// half the leading gap above the ascender when lineHeight > 1.
//
// To match PIL exactly in CSS:
//   1. lineHeight: 1          → removes extra leading, element top ≈ ascender top
//   2. display: inline-block  → element width = text width (needed for center snap)
//   3. For center: translateX(-50%) on inline-block = shift left by text_width/2
//      This mirrors: draw_x = x - text_width // 2
//   4. For right:  translateX(-100%) mirrors: draw_x = x - text_width
//   5. For left:   no transform, left = x  (matches draw_x = x)
//
// One remaining small difference: PIL ascender includes font internal leading
// which varies slightly by typeface, but with lineHeight:1 we're within 1-2px.
// ───────────────────────────────────────────────────────────────────────────

const getTransform = (alignment) => {
  if (alignment === 'center') return 'translateX(-50%)'
  if (alignment === 'right')  return 'translateX(-100%)'
  return 'none'
}

const ClientPreviewOverlay = ({ config, imageRef, imageUrl, selectedCellIdx, selectedField }) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const img = imageRef.current
    if (!img) return
    const updateDimensions = () => {
      const rect = img.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height })
      }
    }
    if (img.complete) updateDimensions()
    img.addEventListener('load', updateDimensions)
    window.addEventListener('resize', updateDimensions)
    const interval = setInterval(updateDimensions, 500)
    return () => {
      img.removeEventListener('load', updateDimensions)
      window.removeEventListener('resize', updateDimensions)
      clearInterval(interval)
    }
  }, [imageRef, imageUrl])

  // Support both old array schema and new object schema
  const cellsIsArray  = Array.isArray(config?.cells)
  const cellsIsObject = config?.cells && typeof config.cells === 'object' && !cellsIsArray

  if (!imageRef.current || !config || !config.cells || dimensions.width === 0) return null

  const naturalWidth  = imageRef.current.naturalWidth
  const naturalHeight = imageRef.current.naturalHeight
  if (!naturalWidth || !naturalHeight) return null

  // Backend draws directly on the natural-resolution image — no canvas normalization.
  const scaleX = dimensions.width  / naturalWidth
  const scaleY = dimensions.height / naturalHeight

  const scoreboard    = config.scoreboard || {}
  const baseColorRgb  = scoreboard.color_rgb || [255, 255, 255]
  const defaultColor  = `rgb(${baseColorRgb.join(',')})`

  const renderText = (key, coords, value, isSelected, overrideColor) => {
    if (!coords || (coords.x === 0 && coords.y === 0)) return null

    const fontSizePx  = (coords.font_size || scoreboard.font_size || 130) * scaleY
    const fontFamily  = getFontFamily(coords.font_path || scoreboard.font_path)
    const alignment   = coords.alignment || 'left'
    const color = overrideColor
      || (coords.color_rgb ? `rgb(${coords.color_rgb.join(',')})` : defaultColor)

    return (
      <div
        key={key}
        style={{
          position:    'absolute',
          left:        coords.x * scaleX,
          top:         coords.y * scaleY,
          color,
          fontSize:    `${fontSizePx}px`,
          fontWeight:  'bold',
          fontFamily,
          // inline-block so element width = text width (mirrors PIL text_width)
          display:     'inline-block',
          // lineHeight 1 removes CSS leading → element top ≈ PIL ascender-top
          lineHeight:  1,
          whiteSpace:  'nowrap',
          // Mirrors PIL alignment: center = x - width/2, right = x - width, left = x
          transform:   getTransform(alignment),
          textShadow:  isSelected
            ? '0 0 10px rgba(0,0,0,0.8)'
            : '1px 1px 2px rgba(0,0,0,0.5)',
          zIndex: isSelected ? 10 : 1,
        }}
      >
        {value}
      </div>
    )
  }

  return (
    <div
      className="client-preview-overlay"
      style={{
        position: 'absolute', top: 0, left: 0,
        width: dimensions.width, height: dimensions.height,
        pointerEvents: 'none', overflow: 'hidden',
      }}
    >
      {/* ── Scoreboard cells ──
           New schema: cells is an object keyed by field name. Each field has one
           x/y position (the anchor for row 0). We render the selected row's data
           at that position to give a live preview of placement and styling.
           Old array schema (legacy): cells is an array of row objects — handled
           via the cellsIsArray branch below.
      ── */}
      {cellsIsObject && CELL_FIELDS.map((field) => {
        const coords = config.cells[field]
        if (!coords || coords.skipped || (coords.x === 0 && coords.y === 0)) return null

        // Show the selected row's data, falling back to row 0
        const rowIdx   = selectedCellIdx ?? 0
        const teamData = DUMMY_TEAMS[rowIdx] || {}
        const isSelected = selectedCellIdx !== null && selectedCellIdx !== undefined

        // row_overrides: per-row font size / color
        const override    = coords.row_overrides?.[String(rowIdx)]
        const rowColorRgb = override?.color_rgb ?? coords.color_rgb
        const rowColor    = isSelected
          ? '#ffeb3b'
          : (rowColorRgb ? `rgb(${rowColorRgb.join(',')})` : defaultColor)

        return renderText(
          `${field}-${rowIdx}`,
          { ...coords, font_size: override?.font_size ?? coords.font_size ?? scoreboard.font_size ?? 130 },
          teamData[field] ?? '',
          isSelected,
          rowColor,
        )
      })}

      {/* ── Legacy: old array schema ── */}
      {cellsIsArray && config.cells.map((cell, idx) => {
        const teamData   = DUMMY_TEAMS[idx] || {}
        const isSelected = idx === selectedCellIdx
        const rowColor   = isSelected ? '#ffeb3b' : null
        return Object.entries(cell).map(([field, coords]) => {
          if (field === 'id') return null
          if (!coords || (coords.x === 0 && coords.y === 0)) return null
          const value = teamData[field] ?? ''
          const color = rowColor
            || (coords.color_rgb ? `rgb(${coords.color_rgb.join(',')})` : defaultColor)
          return renderText(`${idx}-${field}`, coords, value, isSelected, color)
        })
      })}

      {/* ── Extra fields ── */}
      {config.extra_fields && Object.entries(config.extra_fields).map(([fieldName, coords]) => {
        if (!coords || (coords.x === 0 && coords.y === 0)) return null
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

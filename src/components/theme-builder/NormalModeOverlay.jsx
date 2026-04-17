import { useState, useEffect } from 'react'

export const NORMAL_FIELD_COLORS = {
  rank: '#6366f1', team: '#10b981', w: '#f59e0b',
  pp: '#ec4899', kp: '#06b6d4', total: '#a855f7',
  tournament_name: '#f97316',
}

const NormalModeOverlay = ({ imageRef, imageUrl, clickedCoord, mappingConfig }) => {
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
    const t = setInterval(update, 400)
    return () => {
      img.removeEventListener('load', update)
      window.removeEventListener('resize', update)
      clearInterval(t)
    }
  }, [imageRef, imageUrl])

  if (!imageRef.current || dims.w === 0) return null
  const nw = imageRef.current.naturalWidth
  const nh = imageRef.current.naturalHeight
  if (!nw || !nh) return null

  const sx = dims.w / nw
  const sy = dims.h / nh

  // Build list of placed points from the current mapping config JSON
  const placedPoints = []
  try {
    const config = JSON.parse(mappingConfig)
    if (config.cells) {
      config.cells.forEach((cell, rowIdx) => {
        Object.entries(cell).forEach(([field, data]) => {
          if (data && typeof data === 'object' && data.x != null && (data.x !== 0 || data.y !== 0)) {
            placedPoints.push({
              px: data.x * sx, py: data.y * sy,
              label: `R${rowIdx + 1}\u00b7${field.toUpperCase()}`,
              color: NORMAL_FIELD_COLORS[field] || '#6366f1',
            })
          }
        })
      })
    }
    if (config.extra_fields) {
      Object.entries(config.extra_fields).forEach(([field, data]) => {
        if (data && (data.x !== 0 || data.y !== 0)) {
          placedPoints.push({
            px: data.x * sx, py: data.y * sy,
            label: field.toUpperCase(),
            color: NORMAL_FIELD_COLORS[field] || '#f97316',
          })
        }
      })
    }
  } catch (_) {}

  const crossX = clickedCoord ? clickedCoord.x * sx : null
  const crossY = clickedCoord ? clickedCoord.y * sy : null

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: dims.w, height: dims.h, pointerEvents: 'none', overflow: 'hidden' }}>

      {/* Placed points from config */}
      {placedPoints.map((pt, i) => (
        <div key={i} style={{ position: 'absolute', left: pt.px, top: pt.py, transform: 'translate(-50%, -50%)' }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: pt.color, border: '1.5px solid rgba(255,255,255,0.9)',
            boxShadow: `0 0 0 2px ${pt.color}55`,
          }} />
          <div style={{
            position: 'absolute', left: 10, top: -8,
            background: `${pt.color}dd`, color: '#fff',
            fontSize: 9, fontWeight: 800,
            padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
          }}>{pt.label}</div>
        </div>
      ))}

      {/* Crosshair at currently clicked point */}
      {crossX !== null && crossY !== null && (
        <>
          {/* Vertical dashed line */}
          <div style={{
            position: 'absolute', left: crossX, top: 0,
            width: 1, height: '100%', transform: 'translateX(-50%)',
            backgroundImage: 'repeating-linear-gradient(to bottom, rgba(99,102,241,0.9) 0px, rgba(99,102,241,0.9) 6px, transparent 6px, transparent 10px)',
          }} />
          {/* Horizontal dashed line */}
          <div style={{
            position: 'absolute', top: crossY, left: 0,
            height: 1, width: '100%', transform: 'translateY(-50%)',
            backgroundImage: 'repeating-linear-gradient(to right, rgba(99,102,241,0.9) 0px, rgba(99,102,241,0.9) 6px, transparent 6px, transparent 10px)',
          }} />
          {/* Center marker dot */}
          <div style={{
            position: 'absolute', left: crossX, top: crossY,
            width: 12, height: 12, borderRadius: '50%',
            background: '#6366f1', border: '2px solid white',
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 0 3px rgba(99,102,241,0.35), 0 2px 8px rgba(0,0,0,0.4)',
          }} />
          {/* X label */}
          <div style={{
            position: 'absolute', left: crossX + 6, top: 6,
            background: 'rgba(30,27,75,0.92)', color: '#a5b4fc',
            fontSize: 10, fontWeight: 700, padding: '2px 7px',
            borderRadius: 4, whiteSpace: 'nowrap',
            border: '1px solid rgba(99,102,241,0.5)',
          }}>X: {Math.round(clickedCoord.x)}</div>
          {/* Y label */}
          <div style={{
            position: 'absolute', left: 6, top: crossY + 4,
            background: 'rgba(30,27,75,0.92)', color: '#a5b4fc',
            fontSize: 10, fontWeight: 700, padding: '2px 7px',
            borderRadius: 4, whiteSpace: 'nowrap',
            border: '1px solid rgba(99,102,241,0.5)',
          }}>Y: {Math.round(clickedCoord.y)}</div>
          {/* Coordinate badge near intersection */}
          <div style={{
            position: 'absolute', left: crossX + 14, top: crossY + 4,
            background: '#6366f1', color: '#fff',
            fontSize: 10, fontWeight: 800, padding: '3px 8px',
            borderRadius: 5, whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(99,102,241,0.5)',
          }}>{Math.round(clickedCoord.x)}, {Math.round(clickedCoord.y)}</div>
        </>
      )}
    </div>
  )
}

export default NormalModeOverlay

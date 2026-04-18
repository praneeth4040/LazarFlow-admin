import { useState, useEffect } from 'react'

export const FIELD_COLORS = {
  rank:  '#6366f1',
  team:  '#10b981',
  w:     '#f59e0b',
  pp:    '#ec4899',
  kp:    '#06b6d4',
  total: '#a855f7',
}

const GridGuideOverlay = ({ imageRef, imageUrl, columnX, rowYFirst, rowYLast }) => {
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

  const rowYs = (rowYFirst !== null && rowYLast !== null)
    ? Array.from({ length: 12 }, (_, i) => Math.round(rowYFirst + (rowYLast - rowYFirst) * (i / 11)))
    : (rowYFirst !== null ? [rowYFirst] : [])

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: dims.w, height: dims.h, pointerEvents: 'none', overflow: 'hidden' }}>

      {/* Vertical column lines */}
      {Object.entries(columnX).map(([field, x]) => {
        if (x === null) return null
        const px = x * sx
        const color = FIELD_COLORS[field] || '#6366f1'
        return (
          <div key={`col-${field}`}>
            <div style={{ position: 'absolute', left: px, top: 0, width: 2, height: '100%', background: color, opacity: 0.75, transform: 'translateX(-50%)' }} />
            <div style={{
              position: 'absolute', left: px, top: 8,
              transform: 'translateX(-50%)',
              background: color, color: '#fff',
              fontSize: 10, fontWeight: 800,
              padding: '2px 6px', borderRadius: 4,
              whiteSpace: 'nowrap', letterSpacing: '0.05em',
            }}>{field.toUpperCase()}</div>
          </div>
        )
      })}

      {/* Horizontal row lines */}
      {rowYs.map((y, idx) => {
        const py = y * sy
        const isAnchor = idx === 0 || (rowYLast !== null && idx === 11)
        return (
          <div key={`row-${idx}`}>
            <div style={{
              position: 'absolute', left: 0, top: py, width: '100%',
              height: isAnchor ? 2 : 1,
              background: isAnchor ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
              transform: 'translateY(-50%)',
            }} />
            {isAnchor && (
              <div style={{
                position: 'absolute', right: 8, top: py,
                transform: 'translateY(-50%)',
                background: 'rgba(0,0,0,0.75)', color: '#fff',
                fontSize: 10, fontWeight: 700,
                padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
              }}>Row {idx + 1}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default GridGuideOverlay

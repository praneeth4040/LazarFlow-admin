import { useState, useEffect } from 'react'
import { DUMMY_TEAMS } from '../../constants/themeConstants'

const getFontFamily = (fontPath) => {
  if (!fontPath) return 'sans-serif'
  if (fontPath.includes('Anton')) return '"Anton", sans-serif'
  if (fontPath.includes('Roboto')) return '"Roboto", sans-serif'
  if (fontPath.includes('Montserrat')) return '"Montserrat", sans-serif'
  if (fontPath.includes('Bebas')) return '"Bebas Neue", sans-serif'
  return 'sans-serif'
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

  if (!imageRef.current || !config || !config.cells || dimensions.width === 0) return null

  const naturalWidth = imageRef.current.naturalWidth
  const naturalHeight = imageRef.current.naturalHeight
  if (!naturalWidth || !naturalHeight) return null

  const scaleX = dimensions.width / naturalWidth
  const scaleY = dimensions.height / naturalHeight

  const scoreboard = config.scoreboard || {}
  const baseColor = scoreboard.color_rgb || [255, 255, 255]
  const color = `rgb(${baseColor.join(',')})`

  return (
    <div
      className="client-preview-overlay"
      style={{
        position: 'absolute', top: 0, left: 0,
        width: dimensions.width, height: dimensions.height,
        pointerEvents: 'none', overflow: 'hidden',
      }}
    >
      {config.cells.map((cell, idx) => {
        const teamData = DUMMY_TEAMS[idx] || {}
        const isSelected = idx === selectedCellIdx
        return (
          <div key={idx} className={`preview-row ${isSelected ? 'selected' : ''}`}>
            {Object.entries(cell).map(([field, coords]) => {
              if (field === 'id') return null
              if (coords.x === 0 && coords.y === 0) return null
              const value = teamData[field] || ''
              const fieldColor = coords.color_rgb
                ? `rgb(${coords.color_rgb.join(',')})`
                : (isSelected ? '#ffeb3b' : color)
              const fieldFontSize = (coords.font_size || scoreboard.font_size || 130) * scaleY
              const fieldFontFamily = getFontFamily(coords.font_path || scoreboard.font_path)
              return (
                <div
                  key={field}
                  style={{
                    position: 'absolute',
                    left: coords.x * scaleX,
                    top: coords.y * scaleY,
                    color: fieldColor,
                    fontSize: `${fieldFontSize}px`,
                    fontWeight: 'bold',
                    fontFamily: fieldFontFamily,
                    transform: coords.alignment === 'center' ? 'translateX(-50%)' : 'none',
                    textAlign: coords.alignment || 'left',
                    whiteSpace: 'nowrap',
                    textShadow: isSelected ? '0 0 10px rgba(0,0,0,0.8)' : '1px 1px 2px rgba(0,0,0,0.5)',
                    zIndex: isSelected ? 10 : 1,
                  }}
                >
                  {value}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Extra Fields */}
      {config.extra_fields && Object.entries(config.extra_fields).map(([fieldName, coords]) => {
        if (coords.x === 0 && coords.y === 0) return null
        let value = ''
        if (fieldName === 'tournament_name') value = 'GRAND TOURNAMENT 2024'
        const isSelected = selectedField === fieldName
        const fieldColor = isSelected ? '#ffeb3b' : (coords.color_rgb ? `rgb(${coords.color_rgb.join(',')})` : 'rgb(255,255,255)')
        const fieldFontSize = (coords.font_size || 130) * scaleY
        const fieldFontFamily = getFontFamily(coords.font_path || scoreboard.font_path)
        return (
          <div
            key={fieldName}
            style={{
              position: 'absolute',
              left: coords.x * scaleX,
              top: coords.y * scaleY,
              color: fieldColor,
              fontSize: `${fieldFontSize}px`,
              fontWeight: 'bold',
              fontFamily: fieldFontFamily,
              transform: coords.alignment === 'center' ? 'translateX(-50%)' : 'none',
              textAlign: coords.alignment || 'left',
              whiteSpace: 'nowrap',
              textShadow: isSelected ? '0 0 10px rgba(0,0,0,0.8)' : '1px 1px 2px rgba(0,0,0,0.5)',
              zIndex: isSelected ? 15 : 5,
            }}
          >
            {value}
          </div>
        )
      })}
    </div>
  )
}

export default ClientPreviewOverlay

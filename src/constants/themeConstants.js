// ── Theme Builder Constants ──

// Google Fonts available for scoreboard rendering.
// Format: "FamilyName-Style.ttf" — the backend fetches fonts by this filename.
export const FONT_OPTIONS = [
  // ── Impact / Display ──
  'Anton-Regular.ttf',
  'BebasNeue-Regular.ttf',
  'Oswald-Bold.ttf',
  'Oswald-Regular.ttf',
  'Teko-Bold.ttf',
  'Teko-SemiBold.ttf',
  'Rajdhani-Bold.ttf',
  'Rajdhani-SemiBold.ttf',
  'BlackOpsOne-Regular.ttf',
  'Barlow-Bold.ttf',
  'BarlowCondensed-Bold.ttf',
  'BarlowCondensed-ExtraBold.ttf',
  'BarlowSemiCondensed-Bold.ttf',
  'Exo2-Bold.ttf',
  'Exo2-ExtraBold.ttf',
  'Quantico-Bold.ttf',
  'Orbitron-Bold.ttf',
  'Orbitron-ExtraBold.ttf',
  'Michroma-Regular.ttf',
  'AudioWide-Regular.ttf',
  'Syncopate-Bold.ttf',
  'Share-Bold.ttf',
  'Electrolize-Regular.ttf',
  'NovaMono-Regular.ttf',
  // ── Sans-Serif ──
  'Roboto-Bold.ttf',
  'Roboto-Black.ttf',
  'RobotoCondensed-Bold.ttf',
  'Montserrat-Bold.ttf',
  'Montserrat-ExtraBold.ttf',
  'Montserrat-Black.ttf',
  'Inter-Bold.ttf',
  'Inter-ExtraBold.ttf',
  'Poppins-Bold.ttf',
  'Poppins-ExtraBold.ttf',
  'Poppins-Black.ttf',
  'NunitoSans-Bold.ttf',
  'NunitoSans-ExtraBold.ttf',
  'PTSans-Bold.ttf',
  'Ubuntu-Bold.ttf',
  'Lato-Black.ttf',
  'Lato-Bold.ttf',
  'SourceSansPro-Bold.ttf',
  'SourceSansPro-Black.ttf',
  'OpenSans-Bold.ttf',
  'OpenSans-ExtraBold.ttf',
  'Manrope-Bold.ttf',
  'Manrope-ExtraBold.ttf',
  'DMSans-Bold.ttf',
  'Kanit-Bold.ttf',
  'Kanit-ExtraBold.ttf',
  'Kanit-Black.ttf',
  // ── Slab / Decorative ──
  'RussoOne-Regular.ttf',
  'Righteous-Regular.ttf',
  'Bangers-Regular.ttf',
  'Saira-Bold.ttf',
  'SairaCondensed-Bold.ttf',
  'SairaExtraCondensed-Bold.ttf',
  'FjallaOne-Regular.ttf',
  'Unbounded-Bold.ttf',
  'Unbounded-ExtraBold.ttf',
  'Unbounded-Black.ttf',
  'ChakraPetch-Bold.ttf',
  'BigShoulderDisplay-Bold.ttf',
  'BigShoulderDisplay-ExtraBold.ttf',
  'BigShoulderDisplay-Black.ttf',
]

// Map font filename → Google Fonts family name for live CSS preview
export const FONT_FAMILY_MAP = {
  'Anton-Regular.ttf':                  'Anton',
  'BebasNeue-Regular.ttf':              'Bebas Neue',
  'Oswald-Bold.ttf':                    'Oswald',
  'Oswald-Regular.ttf':                 'Oswald',
  'Teko-Bold.ttf':                      'Teko',
  'Teko-SemiBold.ttf':                  'Teko',
  'Rajdhani-Bold.ttf':                  'Rajdhani',
  'Rajdhani-SemiBold.ttf':              'Rajdhani',
  'BlackOpsOne-Regular.ttf':            'Black Ops One',
  'Barlow-Bold.ttf':                    'Barlow',
  'BarlowCondensed-Bold.ttf':           'Barlow Condensed',
  'BarlowCondensed-ExtraBold.ttf':      'Barlow Condensed',
  'BarlowSemiCondensed-Bold.ttf':       'Barlow Semi Condensed',
  'Exo2-Bold.ttf':                      'Exo 2',
  'Exo2-ExtraBold.ttf':                 'Exo 2',
  'Quantico-Bold.ttf':                  'Quantico',
  'Orbitron-Bold.ttf':                  'Orbitron',
  'Orbitron-ExtraBold.ttf':             'Orbitron',
  'Michroma-Regular.ttf':               'Michroma',
  'AudioWide-Regular.ttf':              'Audiowide',
  'Syncopate-Bold.ttf':                 'Syncopate',
  'Share-Bold.ttf':                     'Share',
  'Electrolize-Regular.ttf':            'Electrolize',
  'NovaMono-Regular.ttf':               'Nova Mono',
  'Roboto-Bold.ttf':                    'Roboto',
  'Roboto-Black.ttf':                   'Roboto',
  'RobotoCondensed-Bold.ttf':           'Roboto Condensed',
  'Montserrat-Bold.ttf':                'Montserrat',
  'Montserrat-ExtraBold.ttf':           'Montserrat',
  'Montserrat-Black.ttf':               'Montserrat',
  'Inter-Bold.ttf':                     'Inter',
  'Inter-ExtraBold.ttf':                'Inter',
  'Poppins-Bold.ttf':                   'Poppins',
  'Poppins-ExtraBold.ttf':              'Poppins',
  'Poppins-Black.ttf':                  'Poppins',
  'NunitoSans-Bold.ttf':                'Nunito Sans',
  'NunitoSans-ExtraBold.ttf':           'Nunito Sans',
  'PTSans-Bold.ttf':                    'PT Sans',
  'Ubuntu-Bold.ttf':                    'Ubuntu',
  'Lato-Black.ttf':                     'Lato',
  'Lato-Bold.ttf':                      'Lato',
  'SourceSansPro-Bold.ttf':             'Source Sans Pro',
  'SourceSansPro-Black.ttf':            'Source Sans Pro',
  'OpenSans-Bold.ttf':                  'Open Sans',
  'OpenSans-ExtraBold.ttf':             'Open Sans',
  'Manrope-Bold.ttf':                   'Manrope',
  'Manrope-ExtraBold.ttf':              'Manrope',
  'DMSans-Bold.ttf':                    'DM Sans',
  'Kanit-Bold.ttf':                     'Kanit',
  'Kanit-ExtraBold.ttf':                'Kanit',
  'Kanit-Black.ttf':                    'Kanit',
  'RussoOne-Regular.ttf':               'Russo One',
  'Righteous-Regular.ttf':              'Righteous',
  'Bangers-Regular.ttf':                'Bangers',
  'Saira-Bold.ttf':                     'Saira',
  'SairaCondensed-Bold.ttf':            'Saira Condensed',
  'SairaExtraCondensed-Bold.ttf':       'Saira Extra Condensed',
  'FjallaOne-Regular.ttf':              'Fjalla One',
  'Unbounded-Bold.ttf':                 'Unbounded',
  'Unbounded-ExtraBold.ttf':            'Unbounded',
  'Unbounded-Black.ttf':                'Unbounded',
  'ChakraPetch-Bold.ttf':               'Changa One',
  'BigShoulderDisplay-Bold.ttf':        'Big Shoulders Display',
  'BigShoulderDisplay-ExtraBold.ttf':   'Big Shoulders Display',
  'BigShoulderDisplay-Black.ttf':       'Big Shoulders Display',
}

// ── Font family resolver ──
// Maps a font filename (e.g. "Anton-Regular.ttf") to a CSS font-family string.
// Used by both ThemeMappingEditor and ClientPreviewOverlay for live preview.
export const getFontFamily = (fontPath) => {
  if (!fontPath) return 'sans-serif'
  const family = FONT_FAMILY_MAP[fontPath]
  if (family) return `"${family}", sans-serif`
  // fallback: derive family name from filename
  const base = fontPath.replace('.ttf', '').replace('.otf', '').split('-')[0]
  return `"${base}", sans-serif`
}

// Default cell entry for a single row×column slot
const EMPTY_CELL = (alignment = 'center') => ({ x: 0, y: 0, alignment })

// Build a blank 12-row cells array
const makeEmptyCells = () =>
  Array.from({ length: 12 }, () => ({
    rank:  EMPTY_CELL('center'),
    team:  EMPTY_CELL('left'),
    w:     EMPTY_CELL('center'),
    pp:    EMPTY_CELL('center'),
    kp:    EMPTY_CELL('center'),
    total: EMPTY_CELL('center'),
    mp:    EMPTY_CELL('center'),
  }))

export const EMPTY_MAPPING_CONFIG = {
  // Schema: cells is an array of 12 row objects.
  // Each row object is keyed by column name → { x, y, alignment, font_size?, font_path?, color_rgb? }
  // skipped: true can be added per-cell to exclude it from rendering.
  cells: makeEmptyCells(),
  scoreboard: {
    color_rgb: [255, 255, 255],
    font_path: 'Anton-Regular.ttf',
    font_size: 130,
  },
  extra_fields: {
    tournament_name: {
      x: 0, y: 0,
      alignment: 'center',
      font_size: 200,
    },
    'lazarflow-watermark': {
      x: 0, y: 0,
      alignment: 'left',
      font_size: 60,
    },
  },
}

export const DUMMY_TEAMS = [
  { rank: '1',  team: 'ALPHA SQUAD',  w: '1', pp: '15', kp: '22', total: '38', mp: '6' },
  { rank: '2',  team: 'BETA TEAM',    w: '0', pp: '12', kp: '18', total: '30', mp: '6' },
  { rank: '3',  team: 'GAMMA FORCE',  w: '0', pp: '10', kp: '15', total: '25', mp: '6' },
  { rank: '4',  team: 'DELTA OPS',    w: '0', pp: '8',  kp: '12', total: '20', mp: '6' },
  { rank: '5',  team: 'EPSILON V',    w: '0', pp: '7',  kp: '10', total: '17', mp: '5' },
  { rank: '6',  team: 'ZETA PRIME',   w: '0', pp: '6',  kp: '8',  total: '14', mp: '5' },
  { rank: '7',  team: 'ETA RIDERS',   w: '0', pp: '5',  kp: '6',  total: '11', mp: '5' },
  { rank: '8',  team: 'THETA X',      w: '0', pp: '4',  kp: '5',  total: '9',  mp: '4' },
  { rank: '9',  team: 'IOTA GANG',    w: '0', pp: '3',  kp: '4',  total: '7',  mp: '4' },
  { rank: '10', team: 'KAPPA CLAN',   w: '0', pp: '2',  kp: '3',  total: '5',  mp: '3' },
  { rank: '11', team: 'LAMBDA L',     w: '0', pp: '1',  kp: '2',  total: '3',  mp: '2' },
  { rank: '12', team: 'MU RAIDERS',   w: '0', pp: '0',  kp: '1',  total: '1',  mp: '1' },
]

// ── Font metrics cache ──────────────────────────────────────────────────────
// Fetched from /api/render/font-metrics and cached in memory for the session.
// Shape: { "Anton-Regular.ttf": { ascender, descender, units_per_em } }
const _fontMetricsCache = {}
let _fontMetricsFetchPromise = null

/**
 * Fetch font metrics for a list of font filenames from the backend.
 * Results are merged into the in-memory cache.
 * Returns the cache after the fetch completes.
 */
export const fetchFontMetrics = async (fontPaths = []) => {
  // Deduplicate and filter to only .ttf files not already cached
  const needed = [...new Set(fontPaths.filter(f => f && typeof f === 'string' && f.endsWith('.ttf') && !_fontMetricsCache[f]))]
  if (needed.length === 0) return _fontMetricsCache

  try {
    const res = await fetch(`/api/render/font-metrics?fonts=${needed.join(',')}`)
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try { const j = await res.json(); detail = j.detail || j.error || detail } catch (_) {}
      console.warn('[font-metrics] fetch failed:', detail)
      return _fontMetricsCache
    }
    const data = await res.json()
    Object.assign(_fontMetricsCache, data)
    console.debug('[font-metrics] loaded:', Object.keys(data))
  } catch (err) {
    console.warn('[font-metrics] fetch error:', err?.message || err)
  }
  return _fontMetricsCache
}

/**
 * Given font metrics for a specific font, compute how many display-pixels
 * the CSS top needs to shift UP to match PIL's "la" (left-ascender) anchor.
 *
 * PIL places Y at the ascender line. CSS `top` with `lineHeight:1` places Y
 * at the top of the em square. The em square top is higher than the ascender
 * by: (units_per_em - ascender) / units_per_em * fontSizePx
 *
 * We subtract this value from the CSS top to push the text down to match PIL.
 */
export const getYCorrection = (fontPath, fontSizePx) => {
  const metrics = _fontMetricsCache[fontPath]
  if (!metrics) return 0
  const { ascender, units_per_em } = metrics
  if (!units_per_em || !ascender) return 0
  return ((units_per_em - ascender) / units_per_em) * fontSizePx
}

import { useState, useEffect, useMemo } from 'react'
import {
  Sparkles, Copy, Check, AlertTriangle,
  AlertCircle, CheckCircle2, X, ChevronDown, Image as ImageIcon,
} from 'lucide-react'
import { FONT_OPTIONS, COLUMNS, EXTRA_COLUMNS } from '../../constants/themeConstants'

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder — describes the schema, coordinate system and image so any
// vision-capable LLM can draft a mapping_config for the attached theme image.
// ─────────────────────────────────────────────────────────────────────────────

const COLUMN_KEYS = COLUMNS.map(c => c.key)
const EXTRA_KEYS  = EXTRA_COLUMNS.map(c => c.key)
const ALIGNMENTS  = ['left', 'center', 'right']

// Turn the form setup into prompt bullet lines
const buildSetupLines = (setup) => {
  const lines = []
  const { visibleRows, skips, extraNotes } = setup || {}

  const vr = Number(visibleRows)
  if (Number.isFinite(vr) && vr >= 1 && vr < 12) {
    lines.push(
      `This design shows only ${vr} visible data rows. Rows ${vr + 1}–12 are not in the design: ` +
      `set "skipped": true on every field of those rows.`
    )
  }

  Object.entries(skips || {}).forEach(([key, s]) => {
    if (!s) return
    if (s.mode === 'first') {
      const n = Math.min(11, Math.max(1, Math.round(Number(s.count) || 1)))
      lines.push(
        `Column "${key}" is hidden in the first ${n} row${n > 1 ? 's' : ''} only: ` +
        `set "skipped": true on "${key}" for rows 1–${n}, and map it normally for the rows after that.`
      )
    } else {
      lines.push(`Column "${key}" does not exist in this design: set "skipped": true on "${key}" for every row.`)
    }
  })

  String(extraNotes || '').trim().split('\n')
    .map(l => l.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean)
    .forEach(l => lines.push(l))

  return lines
}

const buildPrompt = (theme, dims, scoreboard, setup) => {
  const { w, h } = dims
  const sb = scoreboard || {}
  const setupLines = buildSetupLines(setup)

  return `You are generating a \`mapping_config\` JSON for a scoreboard theme image used by the Lazarflow render pipeline.

THEME: ${theme?.name || '(unnamed)'}
IMAGE: ${w && h ? `${w} × ${h} px (the attached image)` : 'the attached image'}

COORDINATE SYSTEM
- x, y are integers in the image's NATURAL pixels. Origin (0, 0) = top-left of the image.
- y is the TOP of the text (top of the ascender line), NOT the baseline. Think "top of the tallest glyphs".
- alignment is the horizontal anchor at x:
  - "left":   x = left edge of the text
  - "center": x = horizontal CENTER of the text
  - "right":  x = right edge of the text

WHAT THE CONFIG MAPS
A standings table of 12 rows (cells[i] = standings row i+1). Each row has these 7 column fields:
${COLUMNS.map(c => `- "${c.key}": ${c.label}${c.key === 'rank' ? ' — values "1".."12" (usually "center")' : c.key === 'team' ? ' — team name, up to ~20 characters (usually "left")' : ' — short number, up to 3 digits (usually "center")'}`).join('\n')}
Plus 2 extra fields:
- "tournament_name": tournament title text, if the design shows one
- "lazarflow-watermark": the "lazarflow.app" watermark, if the design shows one
${setupLines.length ? `
SPECIAL NOTES — provided by the theme owner about this exact design. They OVERRIDE the default assumptions above:
${setupLines.map(l => `- ${l}`).join('\n')}
` : ''}
SCHEMA (exact shape to output)
{
  "cells": [
    // array of EXACTLY 12 objects — cells[0] = row 1 ... cells[11] = row 12
    {
      "rank":  { "x": 0, "y": 0, "alignment": "center" },
      "team":  { "x": 0, "y": 0, "alignment": "left" },
      "w":     { "x": 0, "y": 0, "alignment": "center" },
      "pp":    { "x": 0, "y": 0, "alignment": "center" },
      "kp":    { "x": 0, "y": 0, "alignment": "center" },
      "total": { "x": 0, "y": 0, "alignment": "center" },
      "mp":    { "x": 0, "y": 0, "alignment": "center" }
    }
    // ... repeat for all 12 rows
  ],
  "scoreboard": { "color_rgb": [255, 255, 255], "font_path": "Anton-Regular.ttf", "font_size": 130 },
  "extra_fields": {
    "tournament_name":     { "x": 0, "y": 0, "alignment": "center", "font_size": 200 },
    "lazarflow-watermark": { "x": 0, "y": 0, "alignment": "left", "font_size": 60 }
  }
}
Per-field optional overrides: "font_size" (int), "font_path" (from the list below), "color_rgb" ([R, G, B] — use for per-column or highlight-row colors).
If a field or column does not exist in this design, set "skipped": true on it instead of coordinates.

CURRENT SCOREBOARD DEFAULTS — keep these unless the image clearly shows a different color / size:
${JSON.stringify(sb)}

FONTS AVAILABLE (valid "font_path" values):
${FONT_OPTIONS.join(', ')}

INSTRUCTIONS
First read the SPECIAL NOTES section above if present — it describes specifics of this exact design.
1. Look at the attached image and find the standings table: the column headers and the data rows.
2. All rows share the same x per column — compute each column's x once from the header or first data row.
3. Rows are evenly spaced vertically: read the y of the first row and the y of the last visible row, then interpolate the in-between rows evenly.
4. Choose each column's alignment from the visual layout (numbers centered on their column, team names left-aligned).
5. Estimate font_size from the rendered text height in px if it clearly differs from the default; set it on scoreboard or per-field.
6. If the design shows fewer than 12 visible data rows, still output 12 row objects and mark the fields of non-visible rows with "skipped": true.
7. Ignore logos, backgrounds and decorative art — map only real text areas of the standings table. Use your best judgment for colors: e.g. a gold rank-1 color → give that cell a "color_rgb" override.

OUTPUT
Return ONLY the raw JSON object — no markdown fences, no comments, no explanation.`
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse + normalize the pasted AI output into a valid mapping_config.
// Returns { ok, config, error, warnings, stats }
// ─────────────────────────────────────────────────────────────────────────────

const extractJson = (text) => {
  let t = String(text || '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const s = t.indexOf('{')
  const e = t.lastIndexOf('}')
  if (s >= 0 && e > s) t = t.slice(s, e + 1)
  return JSON.parse(t)
}

const coerceColor = (v) => {
  if (!Array.isArray(v)) return null
  const nums = v.filter(n => Number.isFinite(Number(n))).map(n => Math.round(Number(n)))
  if (nums.length < 3 || nums.length > 4) return null
  if (nums.some(n => n < 0 || n > 255)) return null
  return nums
}

const normalizeField = (raw, warnings, label) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push(`${label}: not an object — treated as unmapped`)
    return { x: 0, y: 0, alignment: 'center' }
  }
  const out = { x: 0, y: 0, alignment: 'center' }

  const x = Number(raw.x), y = Number(raw.y)
  if (Number.isFinite(x) && Number.isFinite(y)) {
    out.x = Math.max(0, Math.round(x))
    out.y = Math.max(0, Math.round(y))
  } else if (raw.skipped !== true) {
    warnings.push(`${label}: missing/invalid x or y — treated as unmapped`)
  }

  if (ALIGNMENTS.includes(raw.alignment)) out.alignment = raw.alignment
  else if (raw.alignment != null) warnings.push(`${label}: unknown alignment "${raw.alignment}" — using "center"`)

  if (Number.isFinite(Number(raw.font_size)) && Number(raw.font_size) > 0) {
    out.font_size = Math.round(Number(raw.font_size))
  } else if (raw.font_size != null) {
    warnings.push(`${label}: invalid font_size — dropped`)
  }

  if (typeof raw.font_path === 'string' && raw.font_path.trim()) {
    out.font_path = raw.font_path.trim()
    if (!FONT_OPTIONS.includes(out.font_path)) {
      warnings.push(`${label}: "${out.font_path}" is not in the font list — backend may fall back to the default font`)
    }
  }

  const color = coerceColor(raw.color_rgb)
  if (color) out.color_rgb = color
  else if (raw.color_rgb != null) warnings.push(`${label}: invalid color_rgb — dropped`)

  if (raw.skipped === true) out.skipped = true

  return out
}

const normalizeAiConfig = (raw, currentConfig) => {
  const warnings = []

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Output is not a JSON object.' }
  }

  // cells — accept array, or object keyed "0".."11"
  let rawCells = raw.cells
  if (!Array.isArray(rawCells) && rawCells && typeof rawCells === 'object') {
    rawCells = Object.keys(rawCells)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => rawCells[k])
    warnings.push('cells was an object — converted to an array')
  }
  if (!Array.isArray(rawCells) || rawCells.length === 0) {
    return { ok: false, error: 'cells is missing or empty — expected an array of 12 row objects.' }
  }

  const cells = Array.from({ length: 12 }, (_, i) => {
    const rowRaw = rawCells[i]
    if (!rowRaw || typeof rowRaw !== 'object') {
      if (rowRaw != null) warnings.push(`cells[${i}]: not an object — row left unmapped`)
      return {}
    }
    const row = {}
    Object.entries(rowRaw).forEach(([key, val]) => {
      if (!COLUMN_KEYS.includes(key)) {
        warnings.push(`cells[${i}]: unknown column "${key}" — dropped`)
        return
      }
      row[key] = normalizeField(val, warnings, `cells[${i}].${key}`)
    })
    return row
  })
  if (rawCells.length > 12) warnings.push(`cells had ${rawCells.length} rows — trimmed to 12`)
  if (rawCells.length < 12) warnings.push(`cells had ${rawCells.length} rows — padded to 12`)

  // scoreboard — valid props only, fall back to current defaults
  const sbBase = currentConfig?.scoreboard || { color_rgb: [255, 255, 255], font_path: 'Anton-Regular.ttf', font_size: 130 }
  const scoreboard = { ...sbBase }
  const rawSb = raw.scoreboard
  if (rawSb && typeof rawSb === 'object') {
    const c = coerceColor(rawSb.color_rgb)
    if (c) scoreboard.color_rgb = c
    else if (rawSb.color_rgb != null) warnings.push('scoreboard.color_rgb: invalid — kept current value')
    if (typeof rawSb.font_path === 'string' && rawSb.font_path.trim()) {
      scoreboard.font_path = rawSb.font_path.trim()
      if (!FONT_OPTIONS.includes(scoreboard.font_path)) {
        warnings.push(`scoreboard.font_path "${scoreboard.font_path}" is not in the font list — backend may fall back`)
      }
    }
    if (Number.isFinite(Number(rawSb.font_size)) && Number(rawSb.font_size) > 0) {
      scoreboard.font_size = Math.round(Number(rawSb.font_size))
    }
  }

  // extra_fields — known keys only
  const extra_fields = {}
  const rawExtras = raw.extra_fields
  if (rawExtras && typeof rawExtras === 'object' && !Array.isArray(rawExtras)) {
    Object.entries(rawExtras).forEach(([key, val]) => {
      if (!EXTRA_KEYS.includes(key)) {
        warnings.push(`extra_fields: unknown field "${key}" — dropped`)
        return
      }
      extra_fields[key] = normalizeField(val, warnings, `extra_fields.${key}`)
    })
  }

  const config = { cells, scoreboard, extra_fields }

  // Stats
  let mapped = 0, skipped = 0
  cells.forEach(row => Object.values(row).forEach(f => {
    if (f.skipped) skipped++
    else if (f.x !== 0 || f.y !== 0) mapped++
  }))
  const extrasMapped = EXTRA_KEYS.filter(k => {
    const f = extra_fields[k]
    return f && !f.skipped && (f.x !== 0 || f.y !== 0)
  }).length

  return { ok: true, config, warnings, stats: { mapped, skipped, extrasMapped } }
}

const analyzePaste = (text, currentConfig) => {
  if (!text.trim()) return null
  let raw
  try {
    raw = extractJson(text)
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e.message}` }
  }
  return normalizeAiConfig(raw, currentConfig)
}

// ─────────────────────────────────────────────────────────────────────────────
// AskAiModal
// ─────────────────────────────────────────────────────────────────────────────

const AskAiModal = ({ theme, imgRef, config, onApply, onClose }) => {
  const [pasted, setPasted]   = useState('')
  const [copied, setCopied]   = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  // Form setup
  const [visibleRows, setVisibleRows] = useState(12)
  const [skips, setSkips]             = useState({})   // key → { mode: 'all' | 'first', count }
  const [extraNotes, setExtraNotes]   = useState('')

  const toggleSkip = (key) => setSkips(prev => {
    const next = { ...prev }
    if (next[key]) delete next[key]
    else next[key] = { mode: 'all', count: 1 }
    return next
  })
  const setSkipMode  = (key, mode)  => setSkips(prev => ({ ...prev, [key]: { ...prev[key], mode } }))
  const setSkipCount = (key, count) => setSkips(prev => ({ ...prev, [key]: { ...prev[key], count: Math.min(11, Math.max(1, Math.round(Number(count) || 1))) } }))
  const [imgFailed, setImgFailed] = useState(false)

  const dims = {
    w: imgRef?.current?.naturalWidth  || 0,
    h: imgRef?.current?.naturalHeight || 0,
  }

  const prompt = useMemo(
    () => buildPrompt(theme, dims, config?.scoreboard, { visibleRows, skips, extraNotes }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, config?.scoreboard, visibleRows, skips, extraNotes]
  )

  // Caption parts — show what the prompt picked up
  const vrNum = Number(visibleRows)
  const hasRowLimit = Number.isFinite(vrNum) && vrNum >= 1 && vrNum < 12
  const captionParts = ['schema', 'coordinates', 'fonts']
  if (hasRowLimit) captionParts.push(`${vrNum} rows`)
  if (Object.keys(skips).length > 0) captionParts.push('skipped columns')
  if (extraNotes.trim()) captionParts.push('your notes')

  const result = useMemo(() => analyzePaste(pasted, config), [pasted, config])

  // Escape closes this modal (the editor's own Escape handler is suppressed while open)
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea')
      ta.value = prompt
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleApply = (e) => {
    e.stopPropagation()
    if (!result?.ok) return
    onApply(result.config)
    onClose()
  }

  // stopPropagation before closing: without it the click bubbles to the editor
  // shell's click-to-close handler, which closes the whole editor (+ drawer)
  const dismiss = (e) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <div className="me-ai-overlay" onClick={dismiss}>
      <div className="me-ai-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="me-ai-header">
          <div className="me-ai-title">
            <Sparkles size={16} />
            <span>Ask AI — generate mapping</span>
          </div>
          <button className="me-ai-close-btn" onClick={dismiss} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="me-ai-body">

          {/* Step 1 — structured form */}
          <section className="me-ai-section">
            <div className="me-ai-section-head">
              <h3><span className="me-ai-step-num">1</span> Describe this design</h3>
            </div>

            <div className="me-ai-form-row">
              <label className="me-ai-form-label" htmlFor="me-ai-rows">Visible data rows</label>
              <input
                id="me-ai-rows"
                type="number"
                className="me-ai-num-input"
                min={1} max={12}
                value={visibleRows}
                onChange={e => {
                  const v = parseInt(e.target.value)
                  setVisibleRows(Number.isFinite(v) ? Math.min(12, Math.max(1, v)) : 12)
                }}
              />
              <span className="me-ai-form-help">rows after this get marked skipped</span>
            </div>

            <div className="me-ai-form-row">
              <span className="me-ai-form-label">Columns not in this design</span>
              <div className="me-ai-chips">
                {[...COLUMNS, ...EXTRA_COLUMNS].map(col => (
                  <button
                    key={col.key}
                    type="button"
                    className={`me-ai-chip ${skips[col.key] ? 'on' : ''}`}
                    aria-pressed={!!skips[col.key]}
                    onClick={() => toggleSkip(col.key)}
                  >
                    {col.label}
                  </button>
                ))}
              </div>
              {Object.entries(skips).map(([key, s]) => {
                const label = [...COLUMNS, ...EXTRA_COLUMNS].find(c => c.key === key)?.label ?? key
                return (
                  <div key={key} className="me-ai-skip-mode">
                    <span className="me-ai-skip-mode-label">{label}</span>
                    <label className="me-ai-radio">
                      <input
                        type="radio"
                        name={`mode-${key}`}
                        checked={s.mode === 'all'}
                        onChange={() => setSkipMode(key, 'all')}
                      />
                      not in this design
                    </label>
                    <label className="me-ai-radio">
                      <input
                        type="radio"
                        name={`mode-${key}`}
                        checked={s.mode === 'first'}
                        onChange={() => setSkipMode(key, 'first')}
                      />
                      hidden in first
                    </label>
                    <input
                      type="number"
                      className="me-ai-mini-input"
                      min={1} max={11}
                      value={s.count}
                      disabled={s.mode !== 'first'}
                      onChange={e => setSkipCount(key, e.target.value)}
                    />
                    <span className="me-ai-skip-mode-help">rows</span>
                  </div>
                )
              })}
            </div>

            <div className="me-ai-form-row">
              <label className="me-ai-form-label" htmlFor="me-ai-notes">
                Anything else? <span className="me-ai-notes-optional">(optional — colors, quirks…)</span>
              </label>
              <textarea
                id="me-ai-notes"
                className="me-ai-notes"
                value={extraNotes}
                onChange={e => setExtraNotes(e.target.value)}
                placeholder={'e.g. Row 1 text is gold — give it a color_rgb override'}
              />
            </div>

            <div className="me-ai-actions-row">
              <button className="me-ai-copy-primary" onClick={handleCopy}>
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy prompt</>}
              </button>
              {!imgFailed && theme?.url && (
                <a
                  className="me-ai-img-btn"
                  href={theme.url}
                  target="_blank"
                  rel="noreferrer"
                  download={`${theme.name || 'theme'}.png`}
                  onClick={() => setImgFailed(false)}
                  title="Save the theme image and attach it to the LLM chat"
                >
                  <ImageIcon size={14} /> Get image
                </a>
              )}
              <span className="me-ai-includes">Prompt includes {captionParts.join(' · ')}</span>
            </div>
            <button className="me-ai-prompt-toggle" onClick={() => setShowPrompt(v => !v)}>
              <ChevronDown size={13} className={`me-ai-toggle-chevron ${showPrompt ? 'open' : ''}`} />
              {showPrompt ? 'Hide prompt' : 'View prompt'}
            </button>
            {showPrompt && (
              <textarea
                className="me-ai-prompt"
                readOnly
                value={prompt}
                onFocus={e => e.target.select()}
              />
            )}
          </section>

          {/* Step 2 — paste */}
          <section className="me-ai-section">
            <div className="me-ai-section-head">
              <h3><span className="me-ai-step-num">2</span> Paste the AI's JSON</h3>
            </div>
            <textarea
              className="me-ai-paste"
              value={pasted}
              onChange={e => setPasted(e.target.value)}
              placeholder='Paste the AI response here — e.g. {"cells": [...], "scoreboard": {...}, "extra_fields": {...}}'
              spellCheck={false}
            />
          </section>
        </div>

        {/* Footer */}
        <div className="me-ai-footer">
          <div className="me-ai-status">
            {result && !result.ok && (
              <span className="me-ai-error"><AlertCircle size={14} /> {result.error}</span>
            )}
            {result?.ok && (
              <>
                <span className="me-ai-ok">
                  <CheckCircle2 size={14} />
                  {result.stats.mapped} fields mapped · {result.stats.skipped} skipped · {result.stats.extrasMapped} extras mapped
                </span>
                {result.warnings.length > 0 && (
                  <span className="me-ai-warn" title={result.warnings.join('\n')}>
                    <AlertTriangle size={13} />
                    {result.warnings.length} warning{result.warnings.length > 1 ? 's' : ''}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="me-ai-footer-actions">
            <span className="me-ai-footnote">Apply replaces the whole config — ⌘Z to undo, preview before saving.</span>
            <button className="me-ai-cancel-btn" onClick={dismiss}>Cancel</button>
            <button
              className="me-ai-apply-btn"
              onClick={handleApply}
              disabled={!result?.ok}
            >
              <Sparkles size={13} /> Apply config
            </button>
          </div>
        </div>

        {/* Warnings detail */}
        {result?.ok && result.warnings.length > 0 && (
          <div className="me-ai-warnlist">
            {result.warnings.slice(0, 8).map((w, i) => (
              <div key={i} className="me-ai-warn-item"><AlertTriangle size={12} /> {w}</div>
            ))}
            {result.warnings.length > 8 && (
              <div className="me-ai-warn-item">+{result.warnings.length - 8} more…</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AskAiModal

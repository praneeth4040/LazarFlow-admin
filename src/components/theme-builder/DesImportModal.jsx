import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Loader2, X, FileUp, CheckCircle2, AlertCircle, Image as ImageIcon,
  ShieldCheck, Sparkles, ArrowRight, RefreshCcw, Info, Layers,
  Scan, Rows3, Pencil,
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {}
}

// ─────────────────────────────────────────────────────────────────────────────
// DesImportModal — drop a PointCalc .des design, see it rendered with demo
// data through the real render pipeline, rename if needed, import as theme.
// ─────────────────────────────────────────────────────────────────────────────

export default function DesImportModal({ onClose, onImported }) {
  const [file,     setFile]     = useState(null)
  const [name,     setName]     = useState('')
  const [phase,    setPhase]    = useState('idle') // idle | verifying | review | importing | done
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  const acceptFile = (f) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.des')) {
      setError('Expected a .des file.')
      return
    }
    setFile(f)
    setResult(null)
    setPhase('idle')
    setError('')
    if (!name.trim()) setName(f.name.replace(/\.des$/i, ''))
  }

  const pickFile = (e) => acceptFile(e.target.files?.[0])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (phase === 'verifying' || phase === 'importing') return
    acceptFile(e.dataTransfer.files?.[0])
  }

  const callImport = async (createTheme) => {
    const headers = await authHeaders()
    const fd = new FormData()
    fd.append('file', file)
    if (name.trim()) fd.append('name', name.trim())
    fd.append('createTheme', String(createTheme))
    fd.append('preview', 'true')
    const res = await fetch(`${API_BASE}/api/des/import`, {
      method: 'POST',
      headers,
      body: fd,
    })
    if (!res.ok) {
      let msg = `Error ${res.status}`
      try {
        const j = await res.json()
        msg = j.detail?.message || j.message || msg
      } catch { /* response body was not JSON */ }
      throw new Error(msg)
    }
    return res.json()
  }

  const handleVerify = async () => {
    if (!file) return
    setPhase('verifying'); setError('')
    try {
      setResult(await callImport(false))
      setPhase('review')
    } catch (e) {
      setError(e.message); setPhase('idle')
    }
  }

  const handleImport = async () => {
    setPhase('importing'); setError('')
    try {
      const data = await callImport(true)
      setResult(data)
      setPhase('done')
      onImported?.(data)
    } catch (e) {
      setError(e.message); setPhase('review')
    }
  }

  const audit = result?.audit
  const clean = audit && audit.unknown_count === 0
  const img = result?.image
  const rows = result?.mapping_config?.cells?.length ?? 0
  const special = result?.mapping_config?.des_meta?.special_row_count ?? 0

  /* ── Step 1 — upload ─────────────────────────────────────────────────── */
  if (phase === 'idle' || phase === 'verifying') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="create-theme-modal dim-modal" onClick={e => e.stopPropagation()}>
          <div className="ctm-header">
            <div className="ctm-title">
              <FileUp size={18} className="ctm-title-icon" />
              <h2>Import PointCalc .des Theme</h2>
            </div>
            <button className="ctm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>

          <div className="ctm-body">
            <p className="ctm-description">
              The background image and every layout coordinate are extracted automatically —
              the theme arrives fully mapped, no manual work.
            </p>

            <div
              className={`dim-drop ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
              onClick={() => phase === 'idle' && fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              role="button"
              aria-label="Upload .des file"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".des"
                onChange={pickFile}
                style={{ display: 'none' }}
              />
              <div className="dim-drop-icon">
                {phase === 'verifying'
                  ? <Loader2 size={26} className="spin" />
                  : file ? <CheckCircle2 size={26} /> : <FileUp size={26} />}
              </div>
              {file ? (
                <>
                  <strong>{file.name}</strong>
                  <span className="dim-drop-sub">
                    {(file.size / 1048576).toFixed(2)} MB · click or drop to replace
                  </span>
                </>
              ) : (
                <>
                  <strong>Drop your .des file here</strong>
                  <span className="dim-drop-sub">or click to browse</span>
                </>
              )}
            </div>

            {file && (
              <div className="ctm-field">
                <label className="ctm-label">
                  <Pencil size={12} /> Theme Name
                </label>
                <input
                  className="ctm-input"
                  placeholder="Defaults to the design's internal name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
            )}

            {error && <div className="ctm-error"><AlertCircle size={14} /> {error}</div>}

            <button className="dim-primary-btn dim-block" onClick={handleVerify} disabled={!file || phase === 'verifying'}>
              {phase === 'verifying'
                ? <><Loader2 size={14} className="spin" /> Decoding &amp; rendering demo preview…</>
                : <><Sparkles size={14} /> Decode &amp; Preview</>}
            </button>

            {phase === 'idle' && !file && (
              <div className="dim-hint">
                <Info size={13} />
                Try it with any PointCalc design file — the preview below the fold is what
                your tournaments will render.
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ── Step 3 — done ───────────────────────────────────────────────────── */
  if (phase === 'done') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="create-theme-modal dim-modal" onClick={e => e.stopPropagation()}>
          <div className="ctm-header">
            <div className="ctm-title">
              <CheckCircle2 size={18} className="ctm-title-icon dim-ok-icon" />
              <h2>Theme Imported</h2>
            </div>
            <button className="ctm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="ctm-body">
            <div className="dim-done-card">
              <CheckCircle2 size={22} />
              <div>
                <strong>{result?.name}</strong>
                <span>Status <em>pending</em> · listed under Standings · the preview below is exactly what it will render</span>
              </div>
            </div>
            {result?.preview && (
              <div className="dim-preview-wrap tall">
                <img className="dim-preview" src={result.preview} alt="Imported theme preview" />
              </div>
            )}
            <button className="dim-primary-btn dim-block" onClick={onClose}>
              Done — back to themes
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Step 2 — review (side-by-side) ──────────────────────────────────── */
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="create-theme-modal dim-modal wide" onClick={e => e.stopPropagation()}>
        <div className="ctm-header">
          <div className="ctm-title">
            <Scan size={18} className="ctm-title-icon" />
            <h2>Review &amp; Import</h2>
          </div>
          <button className="ctm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="dim-review">
          {/* left — rendered demo preview */}
          <div className="dim-preview-col">
            <div className="dim-preview-label">
              <ImageIcon size={12} /> Rendered with demo data
            </div>
            <div className="dim-preview-wrap">
              {result?.preview
                ? <img className="dim-preview" src={result.preview} alt="Rendered demo preview" />
                : <div className="dim-hint"><AlertCircle size={13} /> Preview render failed — mapping config is still valid.</div>}
            </div>
          </div>

          {/* right — stats + actions */}
          <div className="dim-side-col">
            <div className={`dim-audit ${clean ? 'ok' : 'warn'}`}>
              {clean ? <ShieldCheck size={14} /> : <AlertCircle size={14} />}
              <div>
                <strong>{clean ? 'Full fidelity' : `${audit.unknown_count} unmapped field(s)`}</strong>
                {!clean && <span>{audit.unknown_keys.slice(0, 2).join(', ')}</span>}
              </div>
            </div>

            <div className="dim-chips">
              <div className="dim-chip">
                <Scan size={13} />
                <span>Background</span>
                <b>{img?.width}×{img?.height}</b>
              </div>
              <div className="dim-chip">
                <Rows3 size={13} />
                <span>Rows mapped</span>
                <b>{rows}</b>
              </div>
              <div className="dim-chip">
                <Layers size={13} />
                <span>Special rows</span>
                <b>{special}</b>
              </div>
            </div>

            <div className="dim-rename">
              <label className="ctm-label"><Pencil size={11} /> Theme name</label>
              <input
                className="ctm-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Theme name"
              />
            </div>

            {error && <div className="ctm-error"><AlertCircle size={14} /> {error}</div>}

            <div className="dim-side-actions">
              <button className="dim-secondary-btn" onClick={handleVerify} disabled={phase === 'importing'}>
                <RefreshCcw size={13} /> Re-render
              </button>
              <button className="dim-primary-btn" onClick={handleImport} disabled={phase === 'importing'}>
                {phase === 'importing'
                  ? <><Loader2 size={14} className="spin" /> Importing…</>
                  : <>Import <ArrowRight size={14} /></>}
              </button>
            </div>
          </div>
        </div>

        <details className="dim-json-details">
          <summary><Info size={12} /> Advanced — mapping config JSON</summary>
          <pre className="dim-json">{JSON.stringify(result?.mapping_config ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  )
}

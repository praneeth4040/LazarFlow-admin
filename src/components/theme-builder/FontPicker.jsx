/**
 * FontPicker.jsx — searchable font selector for the theme builder.
 *
 * Three sources, one dropdown:
 *   • Curated list   — the bundled esports font set (always visible)
 *   • Google Fonts   — live search across ~1,900 families via the backend
 *                      (google-webfonts-helper proxy, no API key)
 *   • Custom uploads — .ttf/.otf files in the fonts bucket, uploaded inline
 *                      (admin-only on the backend)
 *
 * `value`/onChange work in font_path strings ("Montserrat-700.ttf") — the
 * same convention mapping_config uses, so nothing downstream changes.
 * `value == null` means "inherited from scoreboard".
 */
import React, { useEffect, useRef, useState } from 'react';
import { Search, Upload, Check, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL;

const pretty = (fp) => fp.replace('.ttf', '').replace(/([A-Z])/g, ' $1').trim()

export const FontPicker = ({ value, sbFont, disabled, onChange }) => {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [googleHits, setGoogleHits] = useState([])
    const [searching, setSearching] = useState(false)
    const [curated, setCurated] = useState([])
    const [custom, setCustom] = useState([])
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState(null)

    // load the catalog (curated + custom) once
    useEffect(() => {
        let dead = false
        ;(async () => {
            try {
                const { data: sessionData } = await supabase.auth.getSession()
                const token = sessionData?.session?.access_token
                const res = await fetch(`${API_BASE}/api/render/fonts`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                })
                if (!res.ok) return
                const d = await res.json()
                if (!dead) { setCurated(d.curated || []); setCustom(d.custom || []) }
            } catch { /* catalog is optional chrome — the select still shows inherited */ }
        })()
        return () => { dead = true }
    }, [])

    // debounced Google search (backend proxies google-webfonts-helper)
    const searchTimer = useRef(null)
    useEffect(() => {
        if (!open || query.trim().length < 2) { setGoogleHits([]); return }
        clearTimeout(searchTimer.current)
        searchTimer.current = setTimeout(async () => {
            setSearching(true)
            try {
                const { data: sessionData } = await supabase.auth.getSession()
                const token = sessionData?.session?.access_token
                const res = await fetch(
                    `${API_BASE}/api/render/fonts/google/search?q=${encodeURIComponent(query.trim())}`,
                    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
                )
                if (res.ok) setGoogleHits(await res.json())
            } catch { /* keep previous results */ }
            finally { setSearching(false) }
        }, 350)
        return () => clearTimeout(searchTimer.current)
    }, [query, open])

    /** Cache a searched Google font (family id + variant) and select it. */
    const useGoogleFont = async (font) => {
        setUploading(true); setError(null)
        try {
            const { data: sessionData } = await supabase.auth.getSession()
            const token = sessionData?.session?.access_token
            const res = await fetch(`${API_BASE}/api/render/fonts/google`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ font_id: font.id, variant: 'regular' }),
            })
            const d = await res.json()
            if (!res.ok) throw new Error(d.detail?.message || `Error ${res.status}`)
            setCustom(prev => prev.some(c => c.name === d.font_path)
                ? prev : [...prev, { name: d.font_path }])
            onChange(d.font_path)
            setQuery(''); setGoogleHits([])
        } catch (e) {
            setError(e.message || 'Could not cache that font')
        } finally { setUploading(false) }
    }

    /** Upload a custom .ttf/.otf and select it. */
    const uploadFont = async (file) => {
        setUploading(true); setError(null)
        try {
            const { data: sessionData } = await supabase.auth.getSession()
            const token = sessionData?.session?.access_token
            const fd = new FormData()
            fd.append('file', file)
            const res = await fetch(`${API_BASE}/api/render/fonts/upload`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: fd,
            })
            const d = await res.json()
            if (!res.ok) throw new Error(d.detail?.message || `Error ${res.status}`)
            setCustom(prev => prev.some(c => c.name === d.font_path)
                ? prev : [...prev, { name: d.font_path }])
            onChange(d.font_path)
        } catch (e) {
            setError(e.message || 'Upload failed')
        } finally { setUploading(false) }
    }

    return (
        <div style={{ position: 'relative' }}>
            <button
                type="button"
                className="me-insp-select"
                style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                disabled={disabled}
                onClick={() => setOpen(o => !o)}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {value ? pretty(value) : `Inherited: ${pretty(sbFont)}`}
                </span>
                <ChevronDown size={14} />
            </button>

            {open && (
                <div
                    style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
                        boxShadow: '0 12px 30px rgba(0,0,0,0.15)', marginTop: 4,
                        maxHeight: 340, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    }}
                >
                    <div style={{ padding: 10, borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px',
                        }}>
                            <Search size={13} color="#94a3b8" />
                            <input
                                autoFocus
                                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, color: '#1e293b' }}
                                placeholder="Search Google Fonts…"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                            />
                            {searching && (
                                <span style={{
                                    width: 10, height: 10, border: '2px solid #e2e8f0',
                                    borderTopColor: '#1a73e8', borderRadius: '50%',
                                    display: 'inline-block', animation: 'spin 0.8s linear infinite',
                                }} />
                            )}
                        </div>
                    </div>

                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {googleHits.length > 0 && (
                            <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5 }}>
                                GOOGLE FONTS — CLICK TO CACHE &amp; USE
                            </div>
                        )}
                        {googleHits.map(f => (
                            <button
                                key={f.id} type="button"
                                style={{
                                    display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 12px', cursor: uploading ? 'wait' : 'pointer', border: 'none',
                                    background: 'transparent', textAlign: 'left',
                                }}
                                disabled={uploading}
                                onClick={() => useGoogleFont(f)}
                            >
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{f.family}</span>
                                <span style={{ fontSize: 10, color: '#94a3b8' }}>{f.variants.length} weights</span>
                            </button>
                        ))}

                        {googleHits.length === 0 && (
                            <>
                                <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5 }}>
                                    CURATED
                                </div>
                                {curated.map(fp => (
                                    <PickerRow key={fp} label={pretty(fp)} selected={value === fp}
                                        onClick={() => { onChange(fp); setOpen(false) }} />
                                ))}
                                {custom.length > 0 && (
                                    <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5 }}>
                                        YOUR UPLOADS
                                    </div>
                                )}
                                {custom.map(c => (
                                    <PickerRow key={c.name} label={pretty(c.name)} selected={value === c.name}
                                        onClick={() => { onChange(c.name); setOpen(false) }} />
                                ))}
                            </>
                        )}

                        <label style={{
                            display: 'flex', alignItems: 'center', gap: 6, margin: '8px 10px',
                            padding: '8px 10px', borderRadius: 8, border: '1px dashed #cbd5e1',
                            cursor: uploading ? 'wait' : 'pointer', fontSize: 12, color: '#475569',
                        }}>
                            <Upload size={13} />
                            {uploading ? 'Uploading…' : 'Upload .ttf / .otf'}
                            <input
                                type="file" accept=".ttf,.otf" style={{ display: 'none' }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadFont(f); e.target.value = '' }}
                            />
                        </label>
                        {error && <div style={{ color: '#dc2626', fontSize: 11, padding: '0 10px 6px' }}>{error}</div>}
                    </div>
                </div>
            )}
        </div>
    )
}

const PickerRow = ({ label, selected, onClick }) => (
    <button
        type="button"
        style={{
            display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', cursor: 'pointer', border: 'none',
            background: selected ? '#eff6ff' : 'transparent', textAlign: 'left',
        }}
        onClick={onClick}
    >
        <span style={{ fontSize: 13, fontWeight: 600, color: selected ? '#1a73e8' : '#1e293b' }}>{label}</span>
        {selected && <Check size={13} color="#1a73e8" />}
    </button>
)

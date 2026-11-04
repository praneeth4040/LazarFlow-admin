// Shared formatting and small helpers used across the admin views.

export const titleCase = (value) => {
  const text = String(value || '').trim()
  if (!text) return 'Unknown'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const shortDate = (iso) => {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('en-GB', sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: '2-digit' })
}

export const fullDate = (iso) => {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export const relative = (iso, now = 0) => {
  if (!iso || !now) return '—'
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return '—'
  const diff = now - time
  if (diff < 60_000) return 'just now'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.max(1, Math.floor(days / 30.44))
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

export const inr = (value) => `₹${(Number(value) || 0).toLocaleString('en-IN', {
  maximumFractionDigits: 2,
})}`

export const compactNumber = (value) => {
  const n = Number(value) || 0
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString('en-IN')
}

export const percent = (value, total) => {
  if (!total) return 0
  return Math.round((Number(value) || 0) / total * 100)
}

// ── CSV export ─────────────────────────────────────────────────────────────
// Cells that start with a formula character are prefixed with an apostrophe so
// spreadsheets treat user-supplied text as text.

export const csvCell = (value) => {
  let text = String(value ?? '')
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`
  }
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export const downloadCsv = (filename, csv) => {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// ── Overlay helpers ────────────────────────────────────────────────────────
// Reference-counted so a drawer and a dialog can be open at the same time.

let scrollLocks = 0

export const lockBodyScroll = () => {
  if (typeof document === 'undefined') return () => {}
  if (scrollLocks === 0) {
    document.body.style.overflow = 'hidden'
  }
  scrollLocks += 1
  return () => {
    scrollLocks = Math.max(0, scrollLocks - 1)
    if (scrollLocks === 0) {
      document.body.style.overflow = ''
    }
  }
}

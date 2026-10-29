import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Modal — focus-trapped dialog that closes on Escape / backdrop click.
// ---------------------------------------------------------------------------
export function Modal({ open, title, children, onClose, actions, tone = 'default', dismissible = true }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement
    const panel = panelRef.current
    const focusables = () => panel?.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])') || []
    ;(focusables()[0] || panel)?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation()
        onCloseRef.current?.()
      }
      if (e.key === 'Tab') {
        const items = [...focusables()]
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      previouslyFocused?.focus?.()
    }
  }, [open, dismissible])

  if (!open) return null
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose?.() }}>
      <div className={`modal-panel ${tone}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          {dismissible && (
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Skeleton placeholders
// ---------------------------------------------------------------------------
export function Skeleton({ height = 16, width = '100%', radius = 8, style }) {
  return <span className="skeleton" style={{ height, width, borderRadius: radius, ...style }} aria-hidden="true" />
}

export function SkeletonCards({ count = 4, height = 86 }) {
  return (
    <div className="grid" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} height={height} radius={14} />)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Donut: correct / wrong / skipped split
// ---------------------------------------------------------------------------
export function Donut({ segments, size = 132, stroke = 14, center, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + x.value, 0)
  let offset = 0
  return (
    <figure className="donut" style={{ width: size, height: size }} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * c
          const el = (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(len - 2, 0.001)} ${c}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          )
          offset += len
          return el
        })}
      </svg>
      <figcaption className="donut-center">{center}</figcaption>
    </figure>
  )
}

// ---------------------------------------------------------------------------
// Ring: single progress value 0..1
// ---------------------------------------------------------------------------
export function Ring({ value, size = 56, stroke = 6, children, color = 'var(--accent)', label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value || 0))
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${v * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring-value"
        />
      </svg>
      <span className="ring-center">{children}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score line: descriptive totals over time
// ---------------------------------------------------------------------------
export function ScoreLine({ points, max, height = 120, label }) {
  if (points.length < 2) return null
  const w = 320
  const pad = 16
  const x = (i) => pad + (i * (w - pad * 2)) / (points.length - 1)
  const y = (v) => height - pad - (Math.max(0, Math.min(max, v)) / max) * (height - pad * 2)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  return (
    <svg className="score-line" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
      <line x1={pad} x2={w - pad} y1={y(max / 2)} y2={y(max / 2)} className="score-line-mid" />
      <path d={path} className="score-line-path" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r="3.5" className="score-line-dot">
          <title>{`${p.label}: ${p.value}/${max}`}</title>
        </circle>
      ))}
    </svg>
  )
}

// level: the heading level of the title (1 when it is all the screen shows).
export function EmptyState({ icon: Icon, title, children, action, level = 3 }) {
  const Heading = `h${level}`
  return (
    <div className="empty-state">
      {Icon && <span className="empty-icon"><Icon size={22} /></span>}
      <Heading className="empty-title">{title}</Heading>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

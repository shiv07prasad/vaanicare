// Isometric illustration kit: every shape is computed from 3D geometry and drawn as SVG.
import { useEffect, useId, useRef, useState } from 'react'

const C = Math.cos(Math.PI / 6)
const S = 0.5

// world (x, y, z) -> screen (sx, sy); z points up
export const proj = (x, y, z = 0) => [(x - y) * C, (x + y) * S - z]

const f = (n) => Math.round(n * 100) / 100
const path = (pts) => 'M' + pts.map(([x, y]) => `${f(x)},${f(y)}`).join('L') + 'Z'

function roundedSquare(w, r, seg = 6) {
  const h = w / 2
  const corners = [[h - r, -h + r, -90], [h - r, h - r, 0], [-h + r, h - r, 90], [-h + r, -h + r, 180]]
  const pts = []
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = ((a0 + (90 * i) / seg) * Math.PI) / 180
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  }
  return pts
}

// Lower silhouette of a projected convex outline, split at its lowest point.
function sideChains(pts) {
  const n = pts.length
  let li = 0, ri = 0, bi = 0
  pts.forEach((p, i) => {
    if (p[0] < pts[li][0]) li = i
    if (p[0] > pts[ri][0]) ri = i
    if (p[1] > pts[bi][1]) bi = i
  })
  const walk = (from, to, step) => {
    const out = [pts[from]]
    let i = from
    while (i !== to) { i = (i + step + n) % n; out.push(pts[i]) }
    return out
  }
  let chain = walk(li, ri, 1)
  if (!chain.includes(pts[bi])) chain = walk(li, ri, -1)
  const k = chain.indexOf(pts[bi])
  return [chain.slice(0, k + 1), chain.slice(k)]
}

const extrude = (chain, t) => [...chain, ...chain.slice().reverse().map(([x, y]) => [x, y + t])]

// ---------------------------------------------------------------- icons (24x24, stroke)

export const ICONS = {
  mic: <><rect x="9" y="3.5" width="6" height="10.5" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9 20.5h6" /></>,
  transcript: <><path d="M3.5 5h11v7.5H9l-3 2.5v-2.5H3.5z" /><path d="M17.5 9.5h3v7.5h-2v2.5l-3-2.5H11" /><path d="M6.5 8.2h5M6.5 10.2h3" /></>,
  notes: <><rect x="5.5" y="4" width="13" height="16.5" rx="2" /><path d="M9 4V2.8h6V4M8.5 9h7M8.5 12.5h7M8.5 16h4" /></>,
  phone: <path d="M6.6 3.5h3l1.6 4.1-2.1 1.4a10.5 10.5 0 0 0 5.9 5.9l1.4-2.1 4.1 1.6v3a2.1 2.1 0 0 1-2.1 2.1A15.6 15.6 0 0 1 4.5 5.6a2.1 2.1 0 0 1 2.1-2.1z" />,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5z" /></>,
  timeline: <><rect x="4" y="4" width="16" height="4.5" rx="1.2" /><rect x="4" y="10" width="16" height="4.5" rx="1.2" /><rect x="4" y="16" width="10" height="4" rx="1.2" /></>,
  wave: <path d="M3 12h2M7 8v8M10.5 5v14M14 9v6M17.5 6.5v11M21 11v2" />,
  user: <><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
}

// ---------------------------------------------------------------- defs

function Defs({ p }) {
  return (
    <defs>
      <linearGradient id={`${p}top`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fbfbfb" /><stop offset="1" stopColor="#ececec" />
      </linearGradient>
      <linearGradient id={`${p}left`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d9d9d9" /><stop offset="1" stopColor="#cdcdcd" />
      </linearGradient>
      <linearGradient id={`${p}right`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ececec" /><stop offset="1" stopColor="#e2e2e2" />
      </linearGradient>
      <linearGradient id={`${p}topA`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f1efff" /><stop offset=".55" stopColor="#a99dff" /><stop offset="1" stopColor="#6c5cff" />
      </linearGradient>
      <linearGradient id={`${p}leftA`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5140f5" /><stop offset="1" stopColor="#2b1fc4" />
      </linearGradient>
      <linearGradient id={`${p}rightA`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3a2be0" /><stop offset="1" stopColor="#1f1499" />
      </linearGradient>
      <linearGradient id={`${p}bar`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8f82ff" /><stop offset="1" stopColor="#4a39f2" />
      </linearGradient>
    </defs>
  )
}

// ---------------------------------------------------------------- slab

export function Slab({ p, size = 200, thick = 34, radius = 16, active = false, icon, iconScale = 1 }) {
  const top = roundedSquare(size, radius).map(([x, y]) => proj(x, y, thick))
  const [left, right] = sideChains(top)
  const inset = roundedSquare(size * 0.8, radius * 0.75).map(([x, y]) => proj(x, y, thick))
  const d = size * 0.42
  const dots = [[-d, -d], [d, -d], [d, d], [-d, d]].map(([x, y]) => proj(x, y, thick))
  const base = [proj(size * 0.42, size / 2, thick * 0.32), proj(size / 2, size * 0.42, thick * 0.32)]
  const k = (size * 0.2 * iconScale) / 12
  const edge = active ? '#7466ff' : '#bdbdbd'
  const ink = active ? '#1d128f' : '#8a8a8a'

  return (
    <g className={`iso-slab ${active ? 'is-active' : ''}`}>
      <path d={path(extrude(left, thick))} fill={`url(#${p}${active ? 'leftA' : 'left'})`} stroke={edge} strokeWidth=".8" strokeLinejoin="round" />
      <path d={path(extrude(right, thick))} fill={`url(#${p}${active ? 'rightA' : 'right'})`} stroke={edge} strokeWidth=".8" strokeLinejoin="round" />
      <path d={path(top)} fill={`url(#${p}${active ? 'topA' : 'top'})`} stroke={edge} strokeWidth=".8" strokeLinejoin="round" />
      <path d={path(inset)} fill="none" stroke={active ? 'rgba(255,255,255,.75)' : '#d2d2d2'} strokeWidth="1" />
      {dots.map(([x, y], i) => <circle key={i} cx={f(x)} cy={f(y)} r={size * 0.012 + 1.2} fill={active ? '#2a1ca8' : '#4a4a4a'} />)}
      {base.map(([x, y], i) => <circle key={`b${i}`} cx={f(x)} cy={f(y)} r={size * 0.009 + 1} fill={active ? '#c9c2ff' : '#5a5a5a'} />)}
      {icon && (
        <g transform={`matrix(${C},${S},${-C},${S},0,${-thick})`}>
          <g transform={`scale(${k}) translate(-12 -12)`} fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="-1" y="-1" width="26" height="26" rx="6" stroke={active ? 'rgba(255,255,255,.9)' : '#b5b5b5'} strokeWidth="1.2" />
            {ICONS[icon]}
          </g>
        </g>
      )}
    </g>
  )
}

// A single slab in its own SVG (feature cards, empty states, logo)
export function IsoIcon({ icon, active = false, size = 120, thick, className = '' }) {
  const p = 'i' + useId().replace(/:/g, '')
  const t = thick ?? size * 0.17
  const w = size * C + 8
  const top = size / 2 + t + 4
  return (
    <svg className={`iso-icon ${className}`} viewBox={`${-w} ${-top} ${w * 2} ${top + size / 2 + 6}`} aria-hidden="true">
      <Defs p={p} />
      <Slab p={p} size={size} thick={t} radius={size * 0.08} active={active} icon={icon} />
    </svg>
  )
}

export function Logo({ size = 28 }) {
  return <span className="logo-mark" style={{ width: size }}><IsoIcon icon={null} active size={60} thick={16} /></span>
}

// ---------------------------------------------------------------- process stack

// Hook: returns the stack SVG plus each layer's vertical centre (in %) for positioning labels.
export function useIsoStack({ steps, active, size = 220 }) {
  const p = 'k' + useId().replace(/:/g, '')
  const thick = size * 0.16
  const step = size * 0.4
  const extra = size * 0.24
  const h = size / 2
  const ys = steps.map((_, i) => i * step + (i >= active ? extra : 0) + (i > active ? extra : 0))
  const top = -(h + thick) - 12
  const bottom = ys[ys.length - 1] + h + 14
  const w = size * C + 12
  const xL = -size * C * 0.985, xR = size * C * 0.985

  return {
    centers: ys.map((y) => ((y - thick - top) / (bottom - top)) * 100),
    svg: (
      <svg className="iso-stack" viewBox={`${-w} ${top} ${w * 2} ${bottom - top}`} aria-hidden="true">
        <Defs p={p} />
        <g stroke="#b9b9b9" strokeDasharray="3 4" strokeWidth="1">
          {[xL, 0, xR].map((x) => <line key={x} x1={x} x2={x} y1={top + 20} y2={bottom - 6} />)}
        </g>
        {steps.map((s, i) => ({ s, i })).reverse().map(({ s, i }) => (
          <g key={i} className="iso-layer" style={{ transform: `translateY(${ys[i]}px)` }}>
            <Slab p={p} size={size} thick={thick} radius={size * 0.075} active={i === active} icon={s.icon} />
          </g>
        ))}
      </svg>
    ),
  }
}

// ---------------------------------------------------------------- voice waveform on a slab

function box(x, y, w, d, z0, z1) {
  const P = (a, b, c) => proj(a, b, c)
  return {
    top: [P(x - w / 2, y - d / 2, z1), P(x + w / 2, y - d / 2, z1), P(x + w / 2, y + d / 2, z1), P(x - w / 2, y + d / 2, z1)],
    right: [P(x + w / 2, y - d / 2, z1), P(x + w / 2, y + d / 2, z1), P(x + w / 2, y + d / 2, z0), P(x + w / 2, y - d / 2, z0)],
    left: [P(x - w / 2, y + d / 2, z1), P(x + w / 2, y + d / 2, z1), P(x + w / 2, y + d / 2, z0), P(x - w / 2, y + d / 2, z0)],
  }
}

export function IsoWave({ size = 300, bars = 13, level = null, live = true }) {
  const p = 'w' + useId().replace(/:/g, '')
  const [t, setT] = useState(0)
  const raf = useRef(0)
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!live || reduce) return
    const start = performance.now()
    const tick = (now) => { setT((now - start) / 1000); raf.current = requestAnimationFrame(tick) }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [live])

  const thick = size * 0.12
  const span = size * 0.34
  const bw = size * 0.032
  const maxH = size * 0.42
  const items = Array.from({ length: bars }, (_, i) => {
    const u = i / (bars - 1) - 0.5
    const env = Math.cos(u * Math.PI) ** 1.3
    const osc = live
      ? 0.55 + 0.45 * Math.sin(t * 3.1 + i * 0.9) * Math.sin(t * 1.7 + i * 0.4)
      : 0.35 + 0.15 * Math.sin(i * 1.3)
    const amp = level == null ? osc : 0.12 + level * (0.6 + 0.4 * Math.sin(t * 9 + i * 1.7))
    const hgt = Math.max(size * 0.02, maxH * env * Math.max(0.08, amp))
    return { x: u * 2 * span, y: -u * 2 * span, hgt }
  })
  const w = size * C + 10
  const topY = -(size / 2 + thick + maxH) - 10

  return (
    <svg className="iso-wave" viewBox={`${-w} ${topY} ${w * 2} ${size / 2 - topY + 8}`} aria-hidden="true">
      <Defs p={p} />
      <Slab p={p} size={size} thick={thick} radius={size * 0.07} />
      {items.map((b, i) => {
        const g = box(b.x, b.y, bw, bw, thick, thick + b.hgt)
        return (
          <g key={i}>
            <path d={path(g.left)} fill="#3424d6" />
            <path d={path(g.right)} fill="#2416a8" />
            <path d={path(g.top)} fill="#b7aeff" />
          </g>
        )
      })}
    </svg>
  )
}

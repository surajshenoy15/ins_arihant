import React, { useRef, useEffect, useMemo, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore, LIGHT_MODES } from '../../stores/gameStore'

// ─── Quest-safe CanvasTexture hook ───────────────────────────────────────────
// Replaces ALL <Html> usage. Draws to an offscreen canvas, uploads as texture.
function useCanvasTexture(width, height) {
  const canvas  = useMemo(() => {
    const c = document.createElement('canvas')
    c.width  = width
    c.height = height
    return c
  }, [width, height])

  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    return t
  }, [canvas])

  const ctx = useMemo(() => canvas.getContext('2d'), [canvas])

  const markDirty = useCallback(() => {
    texture.needsUpdate = true
  }, [texture])

  return { canvas, ctx, texture, markDirty }
}

// ─── Shared font helpers ──────────────────────────────────────────────────────
const FONT = "'Share Tech Mono', monospace"
function glow(ctx, color, blur = 6) {
  ctx.shadowColor  = color
  ctx.shadowBlur   = blur
}
function noGlow(ctx) {
  ctx.shadowBlur = 0
}

// ─── Scanline overlay ─────────────────────────────────────────────────────────
function drawScanlines(ctx, w, h) {
  for (let y = 0; y < h; y += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.07)'
    ctx.fillRect(0, y, w, 2)
  }
}

// ─── Thermal noise ────────────────────────────────────────────────────────────
const TW = 128, TH = 80
function ns(x, y, t) {
  return (
    Math.sin(x * 0.8 + t * 0.3) * Math.cos(y * 0.6 - t * 0.2) +
    Math.sin(x * 1.5 - t * 0.5) * Math.sin(y * 1.2 + t * 0.4) * 0.5 +
    Math.cos(x * 0.3 + y * 0.4 + t * 0.1) * 0.5
  ) / 2.5 + 0.5
}
function tc(v) {
  const s = [
    { p: 0,    r: 8,   g: 8,   b: 80  },
    { p: 0.15, r: 0,   g: 40,  b: 160 },
    { p: 0.30, r: 0,   g: 140, b: 200 },
    { p: 0.45, r: 0,   g: 200, b: 120 },
    { p: 0.60, r: 180, g: 220, b: 0   },
    { p: 0.75, r: 255, g: 160, b: 0   },
    { p: 0.88, r: 255, g: 50,  b: 0   },
    { p: 1.0,  r: 255, g: 220, b: 220 },
  ]
  const val = Math.max(0, Math.min(1, v))
  let l = s[0], u = s[s.length - 1]
  for (let i = 0; i < s.length - 1; i++) {
    if (val >= s[i].p && val <= s[i + 1].p) { l = s[i]; u = s[i + 1]; break }
  }
  const rng = u.p - l.p, t2 = rng > 0 ? (val - l.p) / rng : 0
  const st  = t2 * t2 * (3 - 2 * t2)
  return {
    r: Math.round(l.r + (u.r - l.r) * st),
    g: Math.round(l.g + (u.g - l.g) * st),
    b: Math.round(l.b + (u.b - l.b) * st),
  }
}

// ─── Canvas draw functions (pure — no React) ──────────────────────────────────

function drawClock(ctx, w, h, data) {
  const { heading, depth, speed, missionTime, oxygenLevel } = data
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#03080c'
  ctx.fillRect(0, 0, w, h)

  // border
  ctx.strokeStyle = 'rgba(0,180,255,0.2)'
  ctx.lineWidth   = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  const now = new Date()
  const hh  = String(now.getHours()).padStart(2, '0')
  const mm  = String(now.getMinutes()).padStart(2, '0')
  const ss  = String(now.getSeconds()).padStart(2, '0')
  const mt  = missionTime ?? 0
  const mth = String(Math.floor(mt / 3600)).padStart(2, '0')
  const mtm = String(Math.floor((mt % 3600) / 60)).padStart(2, '0')
  const mts = String(Math.floor(mt % 60)).padStart(2, '0')
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  ctx.font      = `10px ${FONT}`
  ctx.fillStyle = 'rgba(0,229,255,0.65)'
  ctx.fillText('INS ARIHANT • S73', 8, 18)

  glow(ctx, '#ffe066', 8)
  ctx.font      = `bold 28px ${FONT}`
  ctx.fillStyle = '#ffe066'
  ctx.fillText(`${hh}:${mm}:${ss}`, 8, 52)
  noGlow(ctx)

  ctx.font      = `9px ${FONT}`
  ctx.fillStyle = 'rgba(0,229,255,0.45)'
  ctx.fillText(`${dateStr} IST`, 8, 66)

  ctx.strokeStyle = 'rgba(0,229,255,0.12)'
  ctx.lineWidth   = 1
  ctx.beginPath(); ctx.moveTo(8, 72); ctx.lineTo(w - 8, 72); ctx.stroke()

  ctx.font      = `9px ${FONT}`
  ctx.fillStyle = '#4cff8a'
  ctx.fillText(`MISSION T+ ${mth}:${mtm}:${mts}`, 8, 84)

  const rows = [
    ['HDG', `${String(Math.round(heading ?? 0)).padStart(3, '0')}°`, '#ffe066'],
    ['SPD', `${(speed ?? 0).toFixed(1)}kn`, '#ffe066'],
    ['DEP', `${Math.abs(depth ?? 0).toFixed(0)}m`, Math.abs(depth ?? 0) > 300 ? '#ff6f6f' : '#00e5ff'],
    ['O2',  `${(oxygenLevel ?? 98).toFixed(0)}%`,  (oxygenLevel ?? 98) < 80 ? '#ff6f6f' : '#4cff8a'],
  ]
  const col = w / 2
  rows.forEach(([label, val, color], i) => {
    const x  = i % 2 === 0 ? 8 : col + 4
    const y  = 100 + Math.floor(i / 2) * 18
    ctx.font      = `9px ${FONT}`
    ctx.fillStyle = 'rgba(0,229,255,0.55)'
    ctx.fillText(label, x, y)
    ctx.font      = `bold 11px ${FONT}`
    ctx.fillStyle = color
    ctx.fillText(val, x + 28, y)
  })

  drawScanlines(ctx, w, h)
}

function drawTactical(ctx, w, h, data) {
  const { heading, speed, depth, contacts, missionTime, currentScene } = data
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#03080c'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(110,200,220,0.16)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  glow(ctx, '#9fe7ff', 4)
  ctx.font      = `bold 11px ${FONT}`
  ctx.fillStyle = '#9fe7ff'
  ctx.fillText('COMMAND TACTICAL', 8, 18)
  noGlow(ctx)

  ctx.strokeStyle = 'rgba(120,180,200,0.25)'
  ctx.beginPath(); ctx.moveTo(8, 23); ctx.lineTo(w - 8, 23); ctx.stroke()

  ctx.font      = `8px ${FONT}`
  ctx.fillStyle = '#5b7581'
  ctx.fillText(`INS ARIHANT S73 • ${String(currentScene ?? '').replace(/_/g, ' ').toUpperCase()}`, 8, 35)

  const cols = [
    ['HDG', `${String(Math.round(heading ?? 0)).padStart(3, '0')}°`],
    ['SPD', `${(speed ?? 0).toFixed(0)}kn`],
    ['DEP', `${Math.abs(depth ?? 0).toFixed(0)}m`],
  ]
  cols.forEach(([label, val], i) => {
    const x = 8 + i * (w / 3)
    ctx.font = `8px ${FONT}`; ctx.fillStyle = 'rgba(0,229,255,0.5)'; ctx.fillText(label, x, 50)
    ctx.font = `bold 10px ${FONT}`; ctx.fillStyle = '#d6f7ff'; ctx.fillText(val, x, 62)
  })

  const hostile = (contacts ?? []).filter(c => c.hostile).length
  ctx.font      = `8px ${FONT}`
  ctx.fillStyle = '#a8f2ff'
  ctx.fillText(`TRACKS: ${(contacts ?? []).length}`, 8, 78)
  if (hostile > 0) {
    ctx.fillStyle = '#ff6f6f'
    ctx.fillText(`  (${hostile} HOSTILE)`, 70, 78)
  }

  ;(contacts ?? []).slice(0, 4).forEach((c, i) => {
    const y = 92 + i * 14
    ctx.fillStyle = c.hostile ? '#ff7d7d' : '#ffd36a'
    ctx.fillRect(8, y - 9, 3, 10)
    ctx.font = `8px ${FONT}`
    ctx.fillText(`${c.name}  ${c.bearing.toFixed(0)}°  ${c.distance.toFixed(0)}m${c.tracked ? '  [TRACK]' : ''}`, 14, y)
  })

  const mt  = missionTime ?? 0
  const mth = String(Math.floor(mt / 3600)).padStart(2, '0')
  const mtm = String(Math.floor((mt % 3600) / 60)).padStart(2, '0')
  const mts = String(Math.floor(mt % 60)).padStart(2, '0')
  ctx.font = `7px ${FONT}`; ctx.fillStyle = '#465661'
  ctx.fillText(`T+${mth}:${mtm}:${mts}`, 8, h - 6)

  drawScanlines(ctx, w, h)
}

function drawWeapons(ctx, w, h, data) {
  const { torpedoCount, brahmosMissiles } = data
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#03080c'; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(255,120,100,0.22)'; ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  glow(ctx, '#ff8d7e', 4)
  ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = '#ff8d7e'
  ctx.fillText('WEAPONS CONTROL', 8, 18)
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(255,120,100,0.22)'; ctx.beginPath(); ctx.moveTo(8, 23); ctx.lineTo(w - 8, 23); ctx.stroke()

  // Torpedo bar
  ctx.font = `8px ${FONT}`; ctx.fillStyle = '#a8f2ff'; ctx.fillText('TORPEDO 533mm', 8, 40)
  ctx.font = `bold 14px ${FONT}`; ctx.fillStyle = '#ffb0a0'
  ctx.fillText(String(torpedoCount ?? 0), w - 20, 40)
  ctx.fillStyle = 'rgba(255,90,90,0.15)'; ctx.fillRect(8, 44, w - 16, 6)
  ctx.fillStyle = '#ff6a6a'
  ctx.fillRect(8, 44, ((torpedoCount ?? 0) / 6) * (w - 16), 6)

  // BrahMos bar
  ctx.font = `8px ${FONT}`; ctx.fillStyle = '#a8f2ff'; ctx.fillText('BRAHMOS', 8, 68)
  ctx.font = `bold 14px ${FONT}`; ctx.fillStyle = '#ffd38f'
  ctx.fillText(String(brahmosMissiles ?? 0), w - 20, 68)
  ctx.fillStyle = 'rgba(255,190,90,0.15)'; ctx.fillRect(8, 72, w - 16, 6)
  ctx.fillStyle = '#ffb648'
  ctx.fillRect(8, 72, ((brahmosMissiles ?? 0) / 4) * (w - 16), 6)

  ctx.font = `7px ${FONT}`; ctx.fillStyle = '#8cb7c0'
  ctx.fillText('K-15 SAGARIKA STATUS READY', 8, h - 8)
  drawScanlines(ctx, w, h)
}

function drawEngineering(ctx, w, h, data) {
  const { reactorTemp, hullIntegrity, oxygenLevel } = data
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#03080c'; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(120,220,170,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  glow(ctx, '#89e3b0', 4)
  ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = '#89e3b0'
  ctx.fillText('ENGINEERING', 8, 18)
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(120,220,170,0.18)'; ctx.beginPath(); ctx.moveTo(8, 23); ctx.lineTo(w - 8, 23); ctx.stroke()

  const rHot = (reactorTemp ?? 345) > 450
  ctx.font = `8px ${FONT}`; ctx.fillStyle = '#a8f2ff'; ctx.fillText('REACTOR', 8, 40)
  ctx.fillStyle = rHot ? '#ff7d7d' : '#d6f7ff'
  ctx.fillText(`${(reactorTemp ?? 345).toFixed(0)}°K`, w - 48, 40)
  ctx.fillStyle = 'rgba(100,180,200,0.1)'; ctx.fillRect(8, 44, w - 16, 5)
  ctx.fillStyle = rHot ? '#ff7d7d' : '#9fe7ff'
  ctx.fillRect(8, 44, Math.min((reactorTemp ?? 345) / 600, 1) * (w - 16), 5)

  const hLow = (hullIntegrity ?? 100) < 70
  ctx.font = `8px ${FONT}`; ctx.fillStyle = '#a8f2ff'; ctx.fillText('HULL', 8, 62)
  ctx.fillStyle = hLow ? '#ff7d7d' : '#8de3b1'
  ctx.fillText(`${(hullIntegrity ?? 100).toFixed(0)}%`, w - 30, 62)
  ctx.fillStyle = 'rgba(80,180,130,0.1)'; ctx.fillRect(8, 66, w - 16, 5)
  ctx.fillStyle = hLow ? '#ff7d7d' : '#8de3b1'
  ctx.fillRect(8, 66, ((hullIntegrity ?? 100) / 100) * (w - 16), 5)

  ctx.font = `8px ${FONT}`; ctx.fillStyle = '#a8f2ff'; ctx.fillText(`O2: ${(oxygenLevel ?? 98).toFixed(0)}%`, 8, 84)
  ctx.font = `7px ${FONT}`; ctx.fillStyle = '#51646d'; ctx.fillText('83MW PWR • STEAM TURBINE', 8, h - 8)
  drawScanlines(ctx, w, h)
}

function drawNavigation(ctx, w, h, data) {
  const { heading, depth, speed } = data
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#03080c'; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(120,180,200,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  glow(ctx, '#8fe9ff', 4)
  ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = '#8fe9ff'
  ctx.fillText('NAVIGATION', 8, 18)
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(120,180,200,0.18)'; ctx.beginPath(); ctx.moveTo(8, 23); ctx.lineTo(w - 8, 23); ctx.stroke()

  const rows = [
    ['HDG', `${String(Math.round(heading ?? 0)).padStart(3, '0')}°`],
    ['DEP', `${Math.abs(depth ?? 0).toFixed(1)}m`],
    ['SPD', `${(speed ?? 0).toFixed(1)}kts`],
  ]
  rows.forEach(([label, val], i) => {
    const y = 42 + i * 20
    ctx.font = `9px ${FONT}`; ctx.fillStyle = 'rgba(0,229,255,0.55)'; ctx.fillText(label + ':', 8, y)
    glow(ctx, '#d6f7ff', 3)
    ctx.font = `bold 13px ${FONT}`; ctx.fillStyle = '#d6f7ff'; ctx.fillText(val, 42, y)
    noGlow(ctx)
  })

  ctx.font = `8px ${FONT}`; ctx.fillStyle = '#617a85'
  ctx.fillText('BAY OF BENGAL • PATROL GRID', 8, h - 8)
  drawScanlines(ctx, w, h)
}

function drawSonar(ctx, w, h, data) {
  const { contacts } = data
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#03080c'; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(120,180,200,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  glow(ctx, '#92f0ff', 4)
  ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = '#92f0ff'; ctx.fillText('SONAR', 8, 18)
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(120,180,200,0.18)'; ctx.beginPath(); ctx.moveTo(8, 23); ctx.lineTo(w - 8, 23); ctx.stroke()

  ctx.font = `8px ${FONT}`; ctx.fillStyle = '#a8f2ff'
  ctx.fillText('PASSIVE ARRAY', 8, 36)
  ctx.fillText(`CONTACTS: ${(contacts ?? []).length}`, 8, 50)

  ;(contacts ?? []).slice(0, 4).forEach((c, i) => {
    const y = 64 + i * 14
    ctx.fillStyle = c.hostile ? '#ff7d7d' : '#ffd36a'
    ctx.font = `8px ${FONT}`
    ctx.fillText(`● ${c.name}  ${c.bearing.toFixed(0)}° / ${c.distance.toFixed(0)}m`, 8, y)
  })

  ctx.font = `7px ${FONT}`; ctx.fillStyle = '#51646d'; ctx.fillText('HULL ARRAY ONLINE', 8, h - 8)
  drawScanlines(ctx, w, h)
}

function drawCrew(ctx, w, h) {
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#03080c'; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(180,160,90,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  glow(ctx, '#d6c98c', 4)
  ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = '#d6c98c'; ctx.fillText('WATCH STATUS', 8, 18)
  noGlow(ctx)
  ctx.strokeStyle = 'rgba(180,160,90,0.18)'; ctx.beginPath(); ctx.moveTo(8, 23); ctx.lineTo(w - 8, 23); ctx.stroke()

  const crew = [
    'Cdr. Singh — XO', 'Lt.Cdr. Sharma — Wpns',
    'Lt. Nair — Nav', 'Lt. Verma — Sonar', 'SLt. Patel — Reactor',
  ]
  crew.forEach((name, i) => {
    const y = 38 + i * 16
    ctx.font = `8px ${FONT}`; ctx.fillStyle = '#a8f2ff'; ctx.fillText(name, 8, y)
    ctx.beginPath(); ctx.arc(w - 12, y - 4, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#8de3b1'; ctx.fill()
  })

  ctx.font = `7px ${FONT}`; ctx.fillStyle = '#8de3b1'; ctx.fillText('ALL STATIONS MANNED', 8, h - 8)
  drawScanlines(ctx, w, h)
}

function drawCompass(ctx, w, h, heading) {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#03080c'; ctx.fillRect(0, 0, w, h)

  const cx = w / 2, cy = h / 2 - 8, r = Math.min(w, h) * 0.36

  // background disk
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + 4)
  grad.addColorStop(0, '#0a1a2a'); grad.addColorStop(1, '#050d18')
  ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2)
  ctx.fillStyle = grad; ctx.fill()
  ctx.strokeStyle = 'rgba(0,229,255,0.25)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke()

  // tick marks
  for (let deg = 0; deg < 360; deg += 10) {
    const rad   = ((deg - heading) * Math.PI) / 180
    const isMaj = deg % 90 === 0
    const isMid = deg % 45 === 0
    const inner = r - (isMaj ? 14 : isMid ? 10 : 6)
    ctx.strokeStyle = isMaj ? 'rgba(0,229,255,0.9)' : isMid ? 'rgba(0,229,255,0.55)' : 'rgba(0,229,255,0.25)'
    ctx.lineWidth = isMaj ? 1.8 : 1
    ctx.beginPath()
    ctx.moveTo(cx + Math.sin(rad) * inner, cy - Math.cos(rad) * inner)
    ctx.lineTo(cx + Math.sin(rad) * (r - 1), cy - Math.cos(rad) * (r - 1))
    ctx.stroke()
  }

  // cardinal labels
  const cardinals = [
    ['N', 0], ['NE', 45], ['E', 90], ['SE', 135],
    ['S', 180], ['SW', 225], ['W', 270], ['NW', 315],
  ]
  cardinals.forEach(([label, deg]) => {
    const rad  = ((deg - heading) * Math.PI) / 180
    const dist = r - 22
    const x    = cx + Math.sin(rad) * dist
    const y    = cy - Math.cos(rad) * dist + 4
    const isNS = label === 'N' || label === 'S'
    ctx.font      = `${isNS ? 11 : 8}px ${FONT}`
    ctx.fillStyle = label === 'N' ? '#ff4444' : isNS ? '#00e5ff' : 'rgba(0,229,255,0.6)'
    ctx.textAlign = 'center'
    ctx.fillText(label, x, y)
  })

  // N arrow
  const nRad = (-heading * Math.PI) / 180
  ctx.fillStyle = '#cc2222'
  ctx.beginPath()
  ctx.moveTo(cx + Math.sin(nRad) * (r - 8), cy - Math.cos(nRad) * (r - 8))
  ctx.lineTo(cx + Math.sin(nRad + 0.18) * (r * 0.3), cy - Math.cos(nRad + 0.18) * (r * 0.3))
  ctx.lineTo(cx + Math.sin(nRad - 0.18) * (r * 0.3), cy - Math.cos(nRad - 0.18) * (r * 0.3))
  ctx.closePath(); ctx.fill()

  // S arrow
  const sRad = nRad + Math.PI
  ctx.fillStyle = 'rgba(0,229,255,0.5)'
  ctx.beginPath()
  ctx.moveTo(cx + Math.sin(sRad) * (r - 8), cy - Math.cos(sRad) * (r - 8))
  ctx.lineTo(cx + Math.sin(sRad + 0.18) * (r * 0.3), cy - Math.cos(sRad + 0.18) * (r * 0.3))
  ctx.lineTo(cx + Math.sin(sRad - 0.18) * (r * 0.3), cy - Math.cos(sRad - 0.18) * (r * 0.3))
  ctx.closePath(); ctx.fill()

  // lubber line (fixed, top)
  ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(cx, cy - r - 1); ctx.lineTo(cx, cy - r + 10); ctx.stroke()

  // centre dot
  glow(ctx, '#00e5ff', 5)
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  ctx.fillStyle = '#00e5ff'; ctx.fill()
  noGlow(ctx)

  // heading readout
  ctx.textAlign  = 'center'
  ctx.font       = `bold 12px ${FONT}`
  ctx.fillStyle  = '#ffcc00'
  ctx.fillText(`${String(Math.round(heading)).padStart(3, '0')}°`, cx, cy + r + 16)

  // title
  ctx.font = `9px ${FONT}`; ctx.fillStyle = 'rgba(0,229,255,0.6)'
  ctx.fillText('COMPASS', cx, 14)

  ctx.textAlign = 'left'
  drawScanlines(ctx, w, h)
}

function drawThermal(ctx, w, h, contacts, t) {
  const img = ctx.createImageData(w, h)
  const d   = img.data
  const sc  = 2, sw = Math.ceil(w / sc), sh = Math.ceil(h / sc)
  const tf  = new Float32Array(sw * sh)

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const nx = x / sw, ny = y / sh
      let tmp = ns(nx * 4, ny * 3, t) * 0.5 + ns(nx * 8, ny * 6, t * 1.3) * 0.25 + ns(nx * 16, ny * 12, t * 0.7) * 0.125
      const vx = 0.3 + Math.sin(t * 0.2) * 0.1, vy = 0.65
      const vd = Math.sqrt((nx - vx) ** 2 + (ny - vy) ** 2)
      tmp += Math.max(0, 0.35 - vd) * 2.2
      ;(contacts ?? []).forEach(c => {
        if (!c.thermal) return
        const cx2 = (c.bearing % 360) / 360
        const cy2 = 0.3 + Math.min(c.distance / 5000, 1) * 0.5
        const cd  = Math.sqrt((nx - cx2) ** 2 + (ny - cy2) ** 2)
        tmp += Math.max(0, 0.08 - cd) * (c.hostile ? 6 : 3)
      })
      tmp += Math.max(0, ny - 0.85) * 2
      tf[y * sw + x] = Math.max(0, Math.min(1, tmp))
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x / w * (sw - 1), fy = y / h * (sh - 1)
      const ix = Math.floor(fx), iy = Math.floor(fy)
      const dx = fx - ix, dy = fy - iy
      const ix1 = Math.min(ix + 1, sw - 1), iy1 = Math.min(iy + 1, sh - 1)
      const v =
        tf[iy  * sw + ix]  * (1 - dx) * (1 - dy) +
        tf[iy  * sw + ix1] * dx       * (1 - dy) +
        tf[iy1 * sw + ix]  * (1 - dx) * dy +
        tf[iy1 * sw + ix1] * dx       * dy
      const col = tc(v), idx = (y * w + x) * 4
      d[idx] = col.r; d[idx + 1] = col.g; d[idx + 2] = col.b; d[idx + 3] = 230
    }
  }
  ctx.putImageData(img, 0, 0)

  ctx.fillStyle = 'rgba(0,229,255,0.7)'
  ctx.font      = `10px ${FONT}`
  ctx.fillText('THERMAL IMAGING', 6, 14)
  ctx.strokeStyle = 'rgba(0,229,255,0.35)'
  ctx.lineWidth = 1; ctx.strokeRect(0, 0, w, h)

  const grd = ctx.createLinearGradient(6, h - 12, w - 6, h - 12)
  const stops = ['#080850', '#0028a0', '#008cc8', '#00c878', '#b4dc00', '#ffa000', '#ff3200', '#ffdddd']
  stops.forEach((c, i) => grd.addColorStop(i / (stops.length - 1), c))
  ctx.fillStyle = grd; ctx.fillRect(6, h - 12, w - 12, 6)
  ctx.fillStyle = 'rgba(0,229,255,0.5)'; ctx.font = `8px ${FONT}`
  ctx.fillText('COLD', 6, h - 2)
  ctx.textAlign = 'right'; ctx.fillText('HOT', w - 6, h - 2); ctx.textAlign = 'left'
}

function drawHUD(ctx, w, h, heading, depth, speed) {
  ctx.clearRect(0, 0, w, h)
  // transparent background — just text
  const hdgStr   = String(Math.round((heading + 360) % 360)).padStart(3, '0')
  const depStr   = Math.abs(depth ?? 0).toFixed(0)
  const spdStr   = (speed ?? 0).toFixed(1)
  const depColor = Math.abs(depth ?? 0) > 300 ? '#ff5050' : Math.abs(depth ?? 0) > 150 ? '#ffaa00' : '#00e5ff'
  const spdColor = (speed ?? 0) > 20 ? '#ff7777' : (speed ?? 0) > 12 ? '#ffcc44' : '#00ff88'

  ctx.textAlign = 'center'
  const labels = [
    { x: w * 0.18, label: 'HDG', val: `${hdgStr}°`, color: '#ffe066' },
    { x: w * 0.50, label: 'DEP', val: `${depStr}m`, color: depColor },
    { x: w * 0.82, label: 'SPD', val: `${spdStr}kn`, color: spdColor },
  ]
  labels.forEach(({ x, label, val, color }) => {
    ctx.font = `9px ${FONT}`; ctx.fillStyle = 'rgba(0,229,255,0.5)'
    ctx.fillText(label, x, h * 0.42)
    glow(ctx, color, 6)
    ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = color
    ctx.fillText(val, x, h * 0.82)
    noGlow(ctx)
  })
  ctx.textAlign = 'left'
}

function drawKeyHint(ctx, w, h) {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#030810'; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(0,229,255,0.15)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = '#00e5ff'; ctx.fillText('DRIVE CONTROLS', 8, 16)
  ctx.strokeStyle = 'rgba(0,229,255,0.2)'; ctx.beginPath(); ctx.moveTo(8, 20); ctx.lineTo(w - 8, 20); ctx.stroke()

  const lines = [
    [['↑↓', '#ffe066'], [' Throttle  ', 'rgba(0,229,255,0.55)'], ['←→', '#ffe066'], [' Rudder', 'rgba(0,229,255,0.55)']],
    [['Q/E', '#ffe066'], [' Dive / Ascend', 'rgba(0,229,255,0.55)']],
    [['WASD', '#ffe066'], [' Camera walk', 'rgba(0,229,255,0.4)']],
    [['P', '#ffe066'], [' Periscope  ', 'rgba(0,229,255,0.55)'], ['T', '#ffe066'], [' Thermal', 'rgba(0,229,255,0.55)']],
  ]
  lines.forEach((parts, i) => {
    let x = 8
    const y = 34 + i * 16
    ctx.font = `8px ${FONT}`
    parts.forEach(([text, color]) => {
      ctx.fillStyle = color; ctx.fillText(text, x, y)
      x += ctx.measureText(text).width
    })
  })
}

// ─── CanvasTexture Screen component ──────────────────────────────────────────
function CanvasScreen({ position, rotation = [0, 0, 0], width = 1.6, height = 1.0, content, label = '', canvasW = 256, canvasH = 160 }) {
  const { ctx, texture, markDirty } = useCanvasTexture(canvasW, canvasH)
  const tickRef = useRef(0)

  useFrame(({ clock }) => {
    tickRef.current++
    // Clock screen updates every frame (shows seconds), others at ~12fps
    const interval = content === 'clock' ? 6 : content === 'thermal' ? 1 : 5
    if (tickRef.current % interval !== 0) return

    const s = useGameStore.getState()
    const data = {
      heading: s.heading, speed: s.speed, depth: s.depth,
      contacts: s.contacts, missionTime: s.missionTime,
      currentScene: s.currentScene, hullIntegrity: s.hullIntegrity,
      oxygenLevel: s.oxygenLevel, reactorTemp: s.reactorTemp,
      torpedoCount: s.torpedoCount, brahmosMissiles: s.brahmosMissiles,
    }

    switch (content) {
      case 'clock':       drawClock(ctx, canvasW, canvasH, data);         break
      case 'tactical':    drawTactical(ctx, canvasW, canvasH, data);      break
      case 'weapons':     drawWeapons(ctx, canvasW, canvasH, data);       break
      case 'engineering': drawEngineering(ctx, canvasW, canvasH, data);   break
      case 'navigation':  drawNavigation(ctx, canvasW, canvasH, data);    break
      case 'sonar':       drawSonar(ctx, canvasW, canvasH, data);         break
      case 'crew':        drawCrew(ctx, canvasW, canvasH);                break
      case 'compass':     drawCompass(ctx, canvasW, canvasH, s.heading);  break
      case 'thermal':
        if (s.thermalEnabled) {
          drawThermal(ctx, canvasW, canvasH, s.contacts, clock.elapsedTime)
        } else {
          ctx.clearRect(0, 0, canvasW, canvasH)
          ctx.fillStyle = '#03080c'; ctx.fillRect(0, 0, canvasW, canvasH)
          ctx.font = `10px ${FONT}`; ctx.fillStyle = 'rgba(0,229,255,0.3)'
          ctx.textAlign = 'center'
          ctx.fillText('⊘', canvasW / 2, canvasH / 2 - 10)
          ctx.fillText('THERMAL OFFLINE', canvasW / 2, canvasH / 2 + 6)
          ctx.font = `8px ${FONT}`; ctx.fillStyle = 'rgba(0,229,255,0.2)'
          ctx.fillText('PRESS T TO ENABLE', canvasW / 2, canvasH / 2 + 20)
          ctx.textAlign = 'left'
        }
        break
      default:
        ctx.clearRect(0, 0, canvasW, canvasH)
        ctx.fillStyle = '#03080c'; ctx.fillRect(0, 0, canvasW, canvasH)
    }
    markDirty()
  })

  return (
    <group position={position} rotation={rotation}>
      {/* Monitor bezel */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width + 0.18, height + 0.14, 0.14]} />
        <meshStandardMaterial color="#18202a" roughness={0.76} metalness={0.4} />
      </mesh>
      {/* Screen plane with CanvasTexture */}
      <mesh position={[0, 0, 0.072]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {/* Status LED */}
      <mesh position={[width / 2 + 0.035, height / 2 + 0.01, 0.074]}>
        <sphereGeometry args={[0.01, 6, 6]} />
        <meshStandardMaterial color="#76ff9b" emissive="#76ff9b" emissiveIntensity={1.8} />
      </mesh>
      {!!label && (
        <Text position={[0, -height / 2 - 0.08, 0.075]} fontSize={0.032} color="#8aa0ad" anchorX="center">{label}</Text>
      )}
    </group>
  )
}

// ─── HUD Strip (above viewport) ───────────────────────────────────────────────
function DriveHUDStrip({ position }) {
  const { ctx, texture, markDirty } = useCanvasTexture(370, 32)

  useFrame(() => {
    const s = useGameStore.getState()
    drawHUD(ctx, 370, 32, s.heading, s.depth, s.speed)
    markDirty()
  })

  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.28, 0.06]} />
        <meshStandardMaterial color="#0d1520" roughness={0.8} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[2.54, 0.22]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

// ─── Key Hint Panel ────────────────────────────────────────────────────────────
function KeyHintPanel({ position, rotation = [0, 0, 0] }) {
  const width = 0.9, height = 0.62
  const { ctx, texture, markDirty } = useCanvasTexture(200, 138)
  const drawn = useRef(false)

  useFrame(() => {
    if (drawn.current) return   // static — draw once
    drawKeyHint(ctx, 200, 138)
    markDirty()
    drawn.current = true
  })

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width + 0.12, height + 0.1, 0.09]} />
        <meshStandardMaterial color="#14191f" roughness={0.85} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.048]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

// ─── Interior Controls ────────────────────────────────────────────────────────
function InteriorControls() {
  useEffect(() => {
    const onKeyDown = e => {
      const store = useGameStore.getState()
      if (e.code === 'Digit9') store.decreaseInteriorBrightness?.()
      if (e.code === 'Digit0') store.increaseInteriorBrightness?.()
      if (e.code === 'KeyL')   store.toggleInteriorFloodLights?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  return null
}

// ─── Structural components (unchanged) ────────────────────────────────────────

function BulkheadShell({ position = [0, 0, 0], length = 12.5, radius = 3.15 }) {
  const ringCount = Math.floor(length / 1.5)
  return (
    <group position={position}>
      <mesh rotation={[0, 0, Math.PI / 2]} receiveShadow>
        <cylinderGeometry args={[radius, radius, length, 32, 1, true]} />
        <meshStandardMaterial color="#0a0d12" roughness={0.94} metalness={0.55} side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, -radius + 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[length, radius * 1.55]} />
        <meshStandardMaterial color="#111418" roughness={0.98} metalness={0.15} />
      </mesh>
      <mesh position={[0, -radius + 0.41, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[length - 0.4, 2.45]} />
        <meshStandardMaterial color="#1a1d22" roughness={1} metalness={0.08} />
      </mesh>
      {Array.from({ length: ringCount }, (_, i) => (
        <mesh key={i} position={[-length / 2 + (i + 0.5) * (length / ringCount), 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[radius - 0.03, 0.065, 6, 24]} />
          <meshStandardMaterial color="#20242b" roughness={0.72} metalness={0.75} />
        </mesh>
      ))}
      <mesh position={[0, radius - 0.28, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[length - 0.8, 0.16, 0.42]} />
        <meshStandardMaterial color="#1f242c" roughness={0.75} metalness={0.55} />
      </mesh>
      {[-1.3, 1.3].map((z, i) => (
        <group key={i}>
          <mesh position={[0, radius - 0.58, z]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[length - 0.8, 0.035, 0.22]} />
            <meshStandardMaterial color="#2b313c" roughness={0.7} metalness={0.6} />
          </mesh>
          <mesh position={[0, radius - 0.42, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.025, 0.025, length - 1.0, 6]} />
            <meshStandardMaterial color="#4a2d20" roughness={0.85} metalness={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function InteriorArmorPanels() {
  return (
    <group>
      {[[-3.02, [Math.PI / 2]], [3.02, [-Math.PI / 2]]].map(([x, rot], i) => (
        <mesh key={i} position={[x, 0.15, -0.15]} rotation={[0, rot[0], 0]} receiveShadow>
          <planeGeometry args={[5.7, 2.9]} />
          <meshStandardMaterial color="#161b22" roughness={0.92} metalness={0.25} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[0, 2.22, -0.55]} rotation={[Math.PI / 2.85, 0, 0]} receiveShadow>
        <planeGeometry args={[5.7, 1.9]} />
        <meshStandardMaterial color="#12171d" roughness={0.96} metalness={0.18} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.1, 2.65]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[5.2, 2.8]} />
        <meshStandardMaterial color="#0d1117" roughness={1} metalness={0.12} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function EndBulkheads() {
  return (
    <group>
      {[[-5.35, Math.PI / 2], [5.35, -Math.PI / 2]].map(([x, ry], i) => (
        <mesh key={i} position={[x, 0, 0]} rotation={[0, ry, 0]} receiveShadow>
          <planeGeometry args={[5.9, 5.9]} />
          <meshStandardMaterial color="#0f141a" roughness={0.96} metalness={0.2} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

function WatertightDoor({ position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.18, 3.2, 2.75]} />
        <meshStandardMaterial color="#20242a" roughness={0.7} metalness={0.8} />
      </mesh>
      <mesh position={[0.02, -0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.08, 2.08, 1.38]} />
        <meshStandardMaterial color="#0b0e13" roughness={0.9} metalness={0.2} />
      </mesh>
      <group position={[0.11, 0.25, 0]}>
        <mesh>
          <torusGeometry args={[0.16, 0.02, 8, 16]} />
          <meshStandardMaterial color="#a12b24" roughness={0.45} metalness={0.75} />
        </mesh>
        {[0, 1, 2, 3].map(i => (
          <mesh key={i} rotation={[0, 0, i * Math.PI / 2]}>
            <boxGeometry args={[0.3, 0.014, 0.014]} />
            <meshStandardMaterial color="#8f241e" roughness={0.45} metalness={0.7} />
          </mesh>
        ))}
      </group>
      <Text position={[0.1, 1.2, 0.01]} fontSize={0.045} color="#a27f4c" anchorX="center">WATERTIGHT</Text>
    </group>
  )
}

function PeriscopeColumn({ position }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.12) * 0.18
  })
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.38, 16]} />
        <meshStandardMaterial color="#1b2028" roughness={0.62} metalness={0.82} />
      </mesh>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.13, 0.15, 0.28, 14]} />
        <meshStandardMaterial color="#232a34" roughness={0.58} metalness={0.84} />
      </mesh>
      <group ref={ref}>
        <mesh position={[0, 1.8, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.07, 0.07, 3.6, 12]} />
          <meshStandardMaterial color="#2a313b" roughness={0.42} metalness={0.88} />
        </mesh>
        <mesh position={[0, 3.55, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.085, 0.085, 0.22, 12]} />
          <meshStandardMaterial color="#323945" roughness={0.34} metalness={0.92} />
        </mesh>
        <mesh position={[0.23, 3.58, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[0.036, 0.036, 0.46, 10]} />
          <meshStandardMaterial color="#11161c" roughness={0.24} metalness={0.95} />
        </mesh>
        <mesh position={[0.45, 3.58, 0]}>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshStandardMaterial color="#cfefff" emissive="#9fdcff" emissiveIntensity={0.28} roughness={0.12} metalness={0.6} />
        </mesh>
      </group>
    </group>
  )
}

function ConsoleDesk({ position, rotation = [0, 0, 0], width = 1.8, depth = 0.78, hasKeyboard = true }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.08, 0]} rotation={[0.24, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.08, depth]} />
        <meshStandardMaterial color="#151a20" roughness={0.82} metalness={0.45} />
      </mesh>
      <mesh position={[0, -0.22, 0.34]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.54, 0.06]} />
        <meshStandardMaterial color="#0f1319" roughness={0.88} metalness={0.32} />
      </mesh>
      {[-width / 2 + 0.08, width / 2 - 0.08].map((x, i) => (
        <mesh key={i} position={[x, -0.52, 0.16]} castShadow receiveShadow>
          <boxGeometry args={[0.05, 0.62, 0.05]} />
          <meshStandardMaterial color="#262c36" roughness={0.74} metalness={0.48} />
        </mesh>
      ))}
      {hasKeyboard && (
        <mesh position={[0, -0.06, 0.16]} castShadow receiveShadow>
          <boxGeometry args={[0.54, 0.02, 0.21]} />
          <meshStandardMaterial color="#07090c" roughness={0.95} metalness={0.1} />
        </mesh>
      )}
    </group>
  )
}

function HelmStation({ position }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.68, 0.58]} />
        <meshStandardMaterial color="#181d23" roughness={0.85} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.56, -0.22]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.62, 0.09]} />
        <meshStandardMaterial color="#181d23" roughness={0.85} metalness={0.35} />
      </mesh>
      <Text position={[0, 1.12, 0.38]} fontSize={0.038} color="#95b8c9" anchorX="center">HELM / PLANES</Text>
    </group>
  )
}

function EquipmentRack({ position, rotation = [0, 0, 0], height = 2.2 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.84, height, 0.56]} />
        <meshStandardMaterial color="#151a20" roughness={0.8} metalness={0.42} />
      </mesh>
      {Array.from({ length: 4 }, (_, i) => (
        <group key={i} position={[0, -height / 2 + 0.4 + i * 0.5, 0.29]}>
          <mesh>
            <boxGeometry args={[0.72, 0.42, 0.03]} />
            <meshStandardMaterial color="#0b1016" roughness={0.7} metalness={0.4} />
          </mesh>
          {Array.from({ length: 6 }, (_, j) => (
            <mesh key={j} position={[-0.28 + j * 0.11, 0.13, 0.025]}>
              <sphereGeometry args={[0.011, 6, 6]} />
              <meshStandardMaterial
                color={j < 3 ? '#4cff77' : j === 3 ? '#ffcf44' : '#ff5454'}
                emissive={j < 3 ? '#4cff77' : j === 3 ? '#ffcf44' : '#ff5454'}
                emissiveIntensity={1.1}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function IndiaPlate({ position }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.95, 0.78, 0.04]} />
        <meshStandardMaterial color="#11161c" roughness={0.84} metalness={0.35} />
      </mesh>
      {[['#FF9933', 0.17], ['#FFFFFF', 0.01], ['#138808', -0.15]].map(([color, y], i) => (
        <mesh key={i} position={[0, y, 0.025]}>
          <planeGeometry args={[1.4, 0.12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} />
        </mesh>
      ))}
      <mesh position={[0, 0.01, 0.028]}>
        <ringGeometry args={[0.035, 0.05, 24]} />
        <meshStandardMaterial color="#1d3b8f" emissive="#1d3b8f" emissiveIntensity={0.22} />
      </mesh>
      <Text position={[0, -0.33, 0.03]} fontSize={0.05} color="#9caab4" anchorX="center">INS ARIHANT • S73</Text>
    </group>
  )
}

function SideViewport({ position, size = 0.52 }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <ringGeometry args={[size * 0.88, size, 24]} />
        <meshStandardMaterial color="#212832" roughness={0.55} metalness={0.82} />
      </mesh>
      {/* Quest-safe: simple dark transparent circle, no transmission */}
      <mesh position={[0, 0, 0.02]}>
        <circleGeometry args={[size * 0.87, 20]} />
        <meshStandardMaterial color="#061018" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  )
}

// ─── Forward Viewport — Quest-safe glass ─────────────────────────────────────
function ForwardViewport({ position = [0, 1.02, -2.66], width = 2.95, height = 2.05 }) {
  const depth   = useGameStore(s => s.depth)
  const heading = useGameStore(s => s.heading)
  const speed   = useGameStore(s => s.speed)
  const tintRef = useRef()
  const sheenRef = useRef()

  useFrame(({ clock }) => {
    const t         = clock.elapsedTime
    const depthTint = THREE.MathUtils.clamp(Math.abs(depth) / 400, 0, 0.5)
    if (tintRef.current)  tintRef.current.opacity  = 0.08 + depthTint * 0.18
    if (sheenRef.current) sheenRef.current.opacity = 0.05 + Math.sin(t * 0.6 + heading * 0.01) * 0.02
  })

  return (
    <group position={position}>
      {/* Outer armored frame */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width + 0.24, height + 0.22, 0.12]} />
        <meshStandardMaterial color="#1c242d" roughness={0.5} metalness={0.88} />
      </mesh>

      {/* Thin gasket — does NOT cover the glass area */}
      <mesh position={[0, 0, 0.025]}>
        <boxGeometry args={[width + 0.04, height + 0.04, 0.018]} />
        <meshStandardMaterial color="#070b10" roughness={0.95} metalness={0.18} />
      </mesh>

      {/*
        ── Quest-safe glass ──
        meshStandardMaterial transparent + low opacity instead of
        meshPhysicalMaterial transmission (which crashes Quest shaders).
        Still looks like glass, works on all hardware.
      */}
      <mesh position={[0, 0, 0.048]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color="#7dd4f0"
          roughness={0.04}
          metalness={0.08}
          transparent
          opacity={0.14}
          depthWrite={false}
          envMapIntensity={0.4}
        />
      </mesh>

      {/* Depth tint overlay */}
      <mesh position={[0, 0, 0.052]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          ref={tintRef}
          color="#003355"
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Glare sheen */}
      <mesh position={[0.18, height * 0.28, 0.056]}>
        <planeGeometry args={[width * 0.55, height * 0.18]} />
        <meshBasicMaterial
          ref={sheenRef}
          color="#e8f8ff"
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Braces */}
      {[
        [0, height / 2 - 0.14, 0.065, width - 0.08, 0.045, 0.028],
        [0, -height / 2 + 0.14, 0.065, width - 0.08, 0.045, 0.028],
        [0, 0, 0.065, 0.045, height - 0.1, 0.028],
        [0, height * 0.08, 0.065, width - 0.08, 0.028, 0.022],
      ].map(([x, y, z, bw, bh, bd], i) => (
        <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[bw, bh, bd]} />
          <meshStandardMaterial color="#2a323c" roughness={0.55} metalness={0.82} />
        </mesh>
      ))}

      {/* Corner bolts */}
      {[
        [-width / 2 - 0.06,  height / 2 - 0.08, 0.068],
        [ width / 2 + 0.06,  height / 2 - 0.08, 0.068],
        [-width / 2 - 0.06, -height / 2 + 0.08, 0.068],
        [ width / 2 + 0.06, -height / 2 + 0.08, 0.068],
      ].map((p, i) => (
        <mesh key={i} position={p} castShadow receiveShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.02, 8]} />
          <meshStandardMaterial color="#4c5661" roughness={0.38} metalness={0.95} />
        </mesh>
      ))}

      <pointLight position={[0, 0.1, 0.45]} color="#63d8ff" intensity={0.55} distance={5.2} />
    </group>
  )
}

function PipeCluster({ x }) {
  return (
    <>
      <mesh position={[x, 2.65, 0]}>
        <boxGeometry args={[0.15, 0.05, 0.08]} />
        <meshStandardMaterial color="#8c1f1f" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[x, -1.82, 2.2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.34, 8]} />
        <meshStandardMaterial color="#a22821" roughness={0.45} metalness={0.65} />
      </mesh>
    </>
  )
}

// ─── Interior Lighting — Quest-safe (only ONE castShadow light) ───────────────
function InteriorLighting() {
  const mode       = useGameStore(s => s.lightMode)
  const alarm      = useGameStore(s => s.alarmActive)
  const depth      = useGameStore(s => s.depth)
  const brightness = useGameStore(s => s.interiorBrightness ?? 1.0)
  const floodOn    = useGameStore(s => s.interiorFloodLightsOn ?? true)

  const warmRef     = useRef()
  const redRef      = useRef()
  const viewportRef = useRef()

  useFrame(({ clock }) => {
    const baseWarm =
      mode === LIGHT_MODES.STEALTH  ? 0.35 :
      mode === LIGHT_MODES.OFF      ? 0.1  :
      mode === LIGHT_MODES.COMBAT   ? 0.7  : 1.25

    if (warmRef.current)     warmRef.current.intensity     = baseWarm * brightness
    if (viewportRef.current) {
      const glow = THREE.MathUtils.clamp(Math.abs(depth) / 70, 0.25, 1.0)
      viewportRef.current.intensity = glow * 2.2 * brightness
    }
    if (redRef.current) {
      redRef.current.intensity =
        mode === LIGHT_MODES.EMERGENCY || alarm
          ? (Math.sin(clock.elapsedTime * 8) > 0 ? 1.6 : 0.12)
          : 0
    }
  })

  const floodI = floodOn
    ? mode === LIGHT_MODES.STEALTH ? 0.35
    : mode === LIGHT_MODES.COMBAT  ? 0.95 : 1.6
    : 0

  return (
    <group>
      <ambientLight intensity={0.38} color="#9aa7b2" />
      {/* ONE castShadow light only — Quest GPU limit */}
      <pointLight ref={warmRef} position={[0, 2.25, -0.2]} color="#ffd7a6" distance={11} decay={1.6} castShadow />
      {/* All other lights: NO castShadow */}
      <pointLight position={[-2.4, 2.0, 0.5]} color="#ffe0b8" intensity={floodI * brightness} distance={9} decay={1.7} />
      <pointLight position={[ 2.4, 2.0, 0.5]} color="#ffe0b8" intensity={floodI * brightness} distance={9} decay={1.7} />
      <pointLight ref={viewportRef} position={[0, 1.0, -2.15]} color="#63d8ff" distance={7} decay={1.6} />
      <pointLight position={[0, 1.0, -1.5]} color="#66d9ff" intensity={0.45} distance={4.2} />
      <pointLight ref={redRef} position={[0, 2.1, 0]} color="#ff2e3a" distance={9} decay={2} />
    </group>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function SubmarineInterior() {
  return (
    <group>
      <InteriorControls />
      <InteriorLighting />
      <InteriorArmorPanels />
      <EndBulkheads />
      <BulkheadShell position={[0, 0, 0]} length={12.5} radius={3.1} />

      <WatertightDoor position={[ 5.15, -0.48, 0]} />
      <WatertightDoor position={[-5.15, -0.48, 0]} />

      <PeriscopeColumn position={[-0.1, -0.45, 0.62]} />
      <HelmStation     position={[2.15, -2.22, 0.7]} />

      <ForwardViewport position={[0, 1.0, -2.66]} width={2.75} height={1.95} />
      <SideViewport position={[-4.65, 0.82, -2.46]} size={0.44} />
      <SideViewport position={[ 4.65, 0.82, -2.46]} size={0.44} />

      <IndiaPlate position={[0, 1.95, -3.0]} />

      {/* HUD strip above viewport */}
      <DriveHUDStrip position={[0, 2.12, -2.68]} />

      {/* CENTER: Tactical */}
      <CanvasScreen
        position={[0, 1.04, -1.58]} rotation={[0.12, 0, 0]}
        width={1.72} height={0.98} canvasW={310} canvasH={176}
        content="tactical" label="COMMAND"
      />
      <ConsoleDesk position={[0, -0.9, -1.08]} width={1.8} depth={0.64} />

      {/* CENTER-RIGHT: Compass */}
      <CanvasScreen
        position={[1.12, 1.08, -1.55]} rotation={[0.12, -0.18, 0]}
        width={1.0} height={1.0} canvasW={180} canvasH={180}
        content="compass" label="NAV COMPASS"
      />

      {/* CENTER-LEFT: Clock */}
      <CanvasScreen
        position={[-1.14, 1.08, -1.55]} rotation={[0.12, 0.18, 0]}
        width={1.0} height={1.0} canvasW={180} canvasH={180}
        content="clock" label="CHRONOMETER"
      />

      {/* LEFT INNER: Sonar */}
      <CanvasScreen
        position={[-2.55, 0.96, -1.14]} rotation={[0.14, 0.32, 0]}
        width={1.08} height={0.74} canvasW={194} canvasH={133}
        content="sonar" label="SONAR"
      />
      <ConsoleDesk position={[-2.62, -0.9, -0.74]} rotation={[0, 0.32, 0]} width={1.16} depth={0.58} />

      {/* RIGHT INNER: Navigation */}
      <CanvasScreen
        position={[2.55, 0.96, -1.14]} rotation={[0.14, -0.32, 0]}
        width={1.08} height={0.74} canvasW={194} canvasH={133}
        content="navigation" label="NAV"
      />
      <ConsoleDesk position={[2.62, -0.9, -0.74]} rotation={[0, -0.32, 0]} width={1.16} depth={0.58} />

      {/* OUTER LEFT: Engineering */}
      <CanvasScreen
        position={[-4.55, 0.94, -0.55]} rotation={[0.14, 0.56, 0]}
        width={0.92} height={0.64} canvasW={166} canvasH={115}
        content="engineering" label="ENG"
      />
      <ConsoleDesk position={[-4.6, -0.9, -0.18]} rotation={[0, 0.56, 0]} width={0.98} depth={0.52} hasKeyboard={false} />

      {/* OUTER RIGHT: Weapons */}
      <CanvasScreen
        position={[4.55, 0.94, -0.55]} rotation={[0.14, -0.56, 0]}
        width={0.92} height={0.64} canvasW={166} canvasH={115}
        content="weapons" label="WPN"
      />
      <ConsoleDesk position={[4.6, -0.9, -0.18]} rotation={[0, -0.56, 0]} width={0.98} depth={0.52} hasKeyboard={false} />

      {/* REAR: Thermal */}
      <CanvasScreen
        position={[-1.8, 0.55, 2.55]} rotation={[0, Math.PI, 0]}
        width={1.4} height={0.88} canvasW={252} canvasH={158}
        content="thermal" label="THERMAL IMAGING"
      />

      {/* REAR: Crew */}
      <CanvasScreen
        position={[1.8, 0.55, 2.55]} rotation={[0, Math.PI, 0]}
        width={1.4} height={0.88} canvasW={252} canvasH={158}
        content="crew" label="CREW STATUS"
      />

      {/* Key hint panel */}
      <KeyHintPanel position={[0, 0.28, 2.56]} rotation={[0, Math.PI, 0]} />

      <EquipmentRack position={[-2.0, -1.5, 2.05]} rotation={[0, Math.PI, 0]} />
      <EquipmentRack position={[ 2.0, -1.5, 2.05]} rotation={[0, Math.PI, 0]} />

      <PipeCluster x={-4.0} />
      <PipeCluster x={0} />
      <PipeCluster x={4.0} />
    </group>
  )
}
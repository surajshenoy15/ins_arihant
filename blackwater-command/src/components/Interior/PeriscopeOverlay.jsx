import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../../stores/gameStore'

export default function PeriscopeOverlay() {
  const periscopeMode   = useGameStore(s => s.periscopeMode)
  const togglePeriscope = useGameStore(s => s.togglePeriscope)

  const canvasRef = useRef()
  const animRef   = useRef()

  // Single mutable ref — rAF loop reads this directly, no stale closures
  const live = useRef({
    scopeHdg : 0,
    zoom     : 1.0,
    frame    : 0,
    dragging : false,
    lastX    : 0,
  })

  // Reset when periscope opens
  useEffect(() => {
    if (periscopeMode) {
      live.current.scopeHdg = useGameStore.getState().heading ?? 0
      live.current.zoom     = 1.0
      live.current.dragging = false
    }
  }, [periscopeMode])

  // ── [P] key — intercept before command handler ─────────────────────────────
  useEffect(() => {
    if (!periscopeMode) return
    const onKey = (e) => {
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        e.stopImmediatePropagation()
        togglePeriscope()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [periscopeMode, togglePeriscope])

  // ── Attach pointer + wheel directly to canvas element ─────────────────────
  useEffect(() => {
    if (!periscopeMode) return
    const cv = canvasRef.current
    if (!cv) return

    const onDown  = (e) => {
      live.current.dragging = true
      live.current.lastX    = e.clientX
      cv.style.cursor = 'grabbing'
      e.preventDefault()
    }
    const onMove  = (e) => {
      if (!live.current.dragging) return
      const dx = e.clientX - live.current.lastX
      live.current.lastX    = e.clientX
      live.current.scopeHdg = ((live.current.scopeHdg + dx * 0.4) % 360 + 360) % 360
    }
    const onUp    = () => {
      live.current.dragging = false
      cv.style.cursor = 'grab'
    }
    const onWheel = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const step = e.deltaY > 0 ? -0.2 : 0.2
      live.current.zoom = Math.min(4.0, Math.max(1.0, live.current.zoom + step))
    }

    // Touch
    let tx = 0
    const onTStart = (e) => { tx = e.touches[0].clientX }
    const onTMove  = (e) => {
      const dx = e.touches[0].clientX - tx
      tx = e.touches[0].clientX
      live.current.scopeHdg = ((live.current.scopeHdg + dx * 0.4) % 360 + 360) % 360
      e.preventDefault()
    }

    cv.addEventListener('mousedown',  onDown,  { passive: false })
    cv.addEventListener('mousemove',  onMove)
    cv.addEventListener('mouseup',    onUp)
    cv.addEventListener('mouseleave', onUp)
    cv.addEventListener('wheel',      onWheel, { passive: false })
    cv.addEventListener('touchstart', onTStart,{ passive: true  })
    cv.addEventListener('touchmove',  onTMove, { passive: false })
    window.addEventListener('mouseup', onUp)  // safety net

    return () => {
      cv.removeEventListener('mousedown',  onDown)
      cv.removeEventListener('mousemove',  onMove)
      cv.removeEventListener('mouseup',    onUp)
      cv.removeEventListener('mouseleave', onUp)
      cv.removeEventListener('wheel',      onWheel)
      cv.removeEventListener('touchstart', onTStart)
      cv.removeEventListener('touchmove',  onTMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [periscopeMode])

  // ── Canvas draw loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!periscopeMode) { cancelAnimationFrame(animRef.current); return }
    const cv = canvasRef.current
    if (!cv) return

    const resize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      animRef.current = requestAnimationFrame(draw)
      live.current.frame++
      const { scopeHdg, zoom, frame } = live.current
      const gs = useGameStore.getState()

      const ctx = cv.getContext('2d')
      const W = cv.width, H = cv.height
      const cx = W / 2, cy = H / 2
      const R  = Math.min(W, H) * 0.46

      ctx.clearRect(0, 0, W, H)

      // Black mask
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)

      // Cut circular viewport
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()
      ctx.restore()

      // Clip inner area for scan + tint
      ctx.save()
      ctx.beginPath(); ctx.arc(cx, cy, R - 3, 0, Math.PI * 2); ctx.clip()

      if (zoom > 1.05) {
        ctx.fillStyle = `rgba(0,40,20,${Math.min((zoom - 1) * 0.1, 0.3)})`
        ctx.fillRect(0, 0, W, H)
      }

      // Scan line
      const scanY = ((frame * 1.8) % (R * 2)) - R
      const sg = ctx.createLinearGradient(0, cy + scanY - 6, 0, cy + scanY + 6)
      sg.addColorStop(0, 'rgba(100,255,150,0)')
      sg.addColorStop(0.5, 'rgba(100,255,150,0.06)')
      sg.addColorStop(1, 'rgba(100,255,150,0)')
      ctx.fillStyle = sg
      ctx.fillRect(cx - R, cy + scanY - 6, R * 2, 12)
      ctx.restore()

      // Scope rings
      ctx.strokeStyle = 'rgba(80,120,100,0.55)'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = 'rgba(80,180,120,0.18)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(cx, cy, R - 8, 0, Math.PI * 2); ctx.stroke()

      // Crosshair
      ctx.strokeStyle = 'rgba(180,220,180,0.75)'; ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx - R + 12, cy); ctx.lineTo(cx - 18, cy)
      ctx.moveTo(cx + 18, cy);     ctx.lineTo(cx + R - 12, cy)
      ctx.moveTo(cx, cy - R + 12); ctx.lineTo(cx, cy - 22)
      ctx.moveTo(cx, cy + 22);     ctx.lineTo(cx, cy + R - 12)
      ctx.stroke()
      ctx.fillStyle = 'rgba(180,255,180,0.85)'
      ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill()

      // Stadia lines
      ;[0.25, 0.5, 0.75].forEach(f => {
        const off = f * R * 0.7
        ;[-off, off].forEach(dy => {
          ctx.strokeStyle = 'rgba(150,200,150,0.35)'; ctx.lineWidth = 0.8
          ctx.setLineDash([4, 6])
          ctx.beginPath()
          ctx.moveTo(cx - R * 0.35, cy + dy); ctx.lineTo(cx + R * 0.35, cy + dy)
          ctx.stroke()
        })
      })
      ctx.setLineDash([])

      // Bearing ring ticks
      const bR = R - 22
      for (let i = -90; i <= 90; i += 5) {
        const bdeg     = ((scopeHdg + i) % 360 + 360) % 360
        const angle    = -Math.PI / 2 + (i / 180) * Math.PI * 1.2
        const isMajor  = i % 30 === 0
        const isMid    = i % 10 === 0
        const tLen     = isMajor ? 14 : isMid ? 8 : 5
        const ox = cx + Math.cos(angle) * bR, oy = cy + Math.sin(angle) * bR
        const ix = cx + Math.cos(angle) * (bR - tLen), iy = cy + Math.sin(angle) * (bR - tLen)
        ctx.strokeStyle = isMajor ? 'rgba(180,255,180,0.8)' : 'rgba(130,180,130,0.45)'
        ctx.lineWidth   = isMajor ? 1.5 : 0.8
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ix, iy); ctx.stroke()
        if (isMajor) {
          const card  = { 0:'N', 90:'E', 180:'S', 270:'W' }
          const r10   = Math.round(bdeg / 10) * 10
          const label = card[r10] ?? `${r10}`
          ctx.fillStyle = 'rgba(180,255,180,0.85)'
          ctx.font = '10px "Share Tech Mono",monospace'
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(label,
            cx + Math.cos(angle) * (bR - tLen - 10),
            cy + Math.sin(angle) * (bR - tLen - 10))
        }
      }

      // Bearing readout
      ctx.fillStyle = 'rgba(200,255,200,0.95)'
      ctx.font = 'bold 14px "Share Tech Mono",monospace'
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
      ctx.fillText(`BRG ${String(Math.round(scopeHdg)).padStart(3,'0')}°`, cx, cy - R + 52)

      // Zoom readout
      ctx.fillStyle = zoom > 1.05 ? 'rgba(100,255,160,1)' : 'rgba(160,220,180,0.6)'
      ctx.font = 'bold 11px "Share Tech Mono",monospace'
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'
      ctx.fillText(`ZOOM ×${zoom.toFixed(1)}`, cx + R - 18, cy - R + 36)

      // Left info panel
      const px = cx - R + 18, py = cy + 20
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.font = '9px "Share Tech Mono",monospace'
      ;[
        ['DEPTH', `${Math.abs(gs.depth).toFixed(0)}m`],
        ['HDG',   `${gs.heading.toFixed(0)}°`],
        ['SCOPE', `${Math.round(scopeHdg)}°`],
        ['ZOOM',  `×${zoom.toFixed(1)}`],
      ].forEach(([l, v], i) => {
        ctx.fillStyle = 'rgba(120,180,140,0.5)';  ctx.fillText(l, px, py + i * 18)
        ctx.fillStyle = 'rgba(200,255,200,0.9)';  ctx.fillText(v, px + 44, py + i * 18)
      })

      // Right — closest hostile
      const hostile = gs.contacts.filter(c => c.hostile).sort((a,b) => a.distance - b.distance)[0]
      if (hostile) {
        const rx = cx + R - 85, ry = cy + 20
        ctx.textAlign = 'left'
        ctx.fillStyle = 'rgba(255,100,80,0.7)'; ctx.font = '8px "Share Tech Mono",monospace'
        ctx.fillText('CONTACT', rx, ry)
        ctx.fillStyle = 'rgba(255,130,110,0.95)'; ctx.font = '9px "Share Tech Mono",monospace'
        ctx.fillText(hostile.name, rx, ry + 16)
        ctx.fillStyle = 'rgba(200,255,200,0.8)'
        ctx.fillText(`BRG ${hostile.bearing.toFixed(0)}°`, rx, ry + 32)
        ctx.fillText(`${hostile.distance.toFixed(0)}m`, rx, ry + 48)
      }

      // Rim chrome
      const rim = ctx.createRadialGradient(cx, cy, R - 4, cx, cy, R + 4)
      rim.addColorStop(0,   'rgba(60,90,70,0)')
      rim.addColorStop(0.4, 'rgba(80,130,100,0.5)')
      rim.addColorStop(1,   'rgba(20,30,24,0)')
      ctx.strokeStyle = rim; ctx.lineWidth = 8
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()
    }

    draw()
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
  }, [periscopeMode])

  if (!periscopeMode) return null

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position     : 'fixed',
          inset        : 0,
          width        : '100vw',
          height       : '100vh',
          zIndex       : 200,
          cursor       : 'grab',
          touchAction  : 'none',
          pointerEvents: 'auto',   // ← MUST be auto, not none
          userSelect   : 'none',
        }}
      />

      <div style={{
        position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)',
        zIndex: 210, pointerEvents: 'none',
        padding: '5px 16px',
        background: 'rgba(0,10,6,0.82)',
        border: '1px solid rgba(80,180,100,0.3)', borderRadius: 3,
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: 9, letterSpacing: 2, color: 'rgba(160,240,180,0.8)',
      }}>
        DRAG TO ROTATE · SCROLL TO ZOOM · [P] TO EXIT
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); togglePeriscope() }}
        style={{
          position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)',
          zIndex: 210,
          padding: '6px 20px',
          background: 'rgba(0,10,6,0.85)',
          border: '1px solid rgba(80,180,100,0.35)', borderRadius: 3,
          color: 'rgba(160,240,180,0.8)',
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: 9, letterSpacing: 2, cursor: 'pointer',
        }}
      >
        [P] EXIT PERISCOPE
      </button>
    </>
  )
}
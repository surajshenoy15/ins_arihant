import React, { useRef, useEffect, useCallback, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { speakReactive, indraVoice } from '../../systems/AIAssistant'
import { submarineAudio } from '../../systems/AudioManager'

const S  = 260
const MR = 6000

export default function SonarDisplay({ visible = true }) {
  const canvasRef    = useRef()
  const sweepRef     = useRef(0)
  const animRef      = useRef()
  const [hoverId, setHoverId] = useState(null)

  const contacts     = useGameStore(s => s.contacts)
  const mode         = useGameStore(s => s.sonarMode)
  const ping         = useGameStore(s => s.sonarPingActive)
  const trackContact = useGameStore(s => s.trackContact)
  const fireTorpedo  = useGameStore(s => s.fireTorpedo)
  const fireBrahMos  = useGameStore(s => s.fireBrahMos)
  const torpedoCount = useGameStore(s => s.torpedoCount)
  const brahmoCount  = useGameStore(s => s.brahmosMissiles)
  const tif          = useGameStore(s => s.torpedoInFlight)
  const bif          = useGameStore(s => s.brahmoInFlight)

  const contactXY = useCallback((bearing, distance, R, cx, cy) => {
    const b = (bearing - 90) * Math.PI / 180
    const d = Math.min(distance / MR, 1) * R
    return { x: cx + Math.cos(b) * d, y: cy + Math.sin(b) * d }
  }, [])

  const draw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2
    const R = W / 2 - 22

    ctx.clearRect(0, 0, W, H)

    // Background
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
    bg.addColorStop(0, 'rgba(0,18,10,0.97)')
    bg.addColorStop(1, 'rgba(0,6,3,0.94)')
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()

    // Range rings + labels
    for (let i = 1; i <= 4; i++) {
      const rr = R / 4 * i
      ctx.strokeStyle = `rgba(0,229,255,${i === 4 ? 0.18 : 0.07})`
      ctx.lineWidth   = i === 4 ? 1.2 : 0.5
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle   = 'rgba(0,229,255,0.22)'
      ctx.font        = '7px "Share Tech Mono",monospace'
      ctx.textAlign   = 'left'
      ctx.fillText(`${Math.round(MR / 4 * i / 1000)}km`, cx + 4, cy - rr + 10)
    }

    // Cross-hairs
    ctx.strokeStyle = 'rgba(0,229,255,0.07)'
    ctx.lineWidth   = 0.5
    for (let a = 0; a < 360; a += 45) {
      const rad = (a - 90) * Math.PI / 180
      ctx.beginPath(); ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(rad) * R, cy + Math.sin(rad) * R); ctx.stroke()
    }

    // Bearing labels
    ctx.fillStyle = 'rgba(0,229,255,0.4)'
    ctx.font      = '8px "Share Tech Mono",monospace'
    ctx.textAlign = 'center'
    ;['N','NE','E','SE','S','SW','W','NW'].forEach((l, i) => {
      const a = (i * 45 - 90) * Math.PI / 180
      ctx.fillText(l, cx + Math.cos(a) * (R + 12), cy + Math.sin(a) * (R + 12) + 3)
    })

    // Sweep
    sweepRef.current = (sweepRef.current + 0.018) % (Math.PI * 2)
    for (let i = 0; i < 40; i++) {
      const a = sweepRef.current - i * 0.02
      ctx.strokeStyle = `rgba(0,255,100,${(1 - i / 40) * 0.22})`
      ctx.lineWidth   = 1.5
      ctx.beginPath(); ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(0,255,120,0.85)'
    ctx.lineWidth   = 2
    ctx.beginPath(); ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(sweepRef.current) * R, cy + Math.sin(sweepRef.current) * R); ctx.stroke()

    // Ping ring
    if (ping) {
      const pp = (Date.now() % 3000) / 3000
      ctx.strokeStyle = `rgba(0,255,200,${(1 - pp) * 0.6})`
      ctx.lineWidth   = 2
      ctx.beginPath(); ctx.arc(cx, cy, pp * R, 0, Math.PI * 2); ctx.stroke()
    }

    // ── Torpedo path + dot ──
    if (tif && !tif.detonated) {
      const tgt    = contacts.find(c => c.id === tif.targetId)
      const brg    = tgt?.bearing ?? tif.bearing
      const dist   = tgt?.distance ?? MR * 0.65
      const { x: tx, y: ty } = contactXY(brg, dist, R, cx, cy)
      const elapsed  = Math.min((Date.now() - tif.launched) / 4000, 1)

      // Dashed path line
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(255,80,50,0.5)'
      ctx.lineWidth   = 1.2
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke()
      ctx.setLineDash([])

      // Torpedo dot moving along path
      const dpx = cx + (tx - cx) * elapsed
      const dpy = cy + (ty - cy) * elapsed
      // Wake trail
      for (let i = 6; i >= 1; i--) {
        const tp = Math.max(0, elapsed - i * 0.04)
        ctx.fillStyle = `rgba(255,120,50,${0.5 - i * 0.08})`
        ctx.beginPath(); ctx.arc(cx + (tx - cx) * tp, cy + (ty - cy) * tp, 2.8 - i * 0.35, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle   = '#ff6600'
      ctx.shadowColor = '#ff6600'
      ctx.shadowBlur  = 12
      ctx.beginPath(); ctx.arc(dpx, dpy, 4, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur  = 0
      ctx.fillStyle   = '#ff8844'
      ctx.font        = '7px "Share Tech Mono",monospace'
      ctx.textAlign   = 'left'
      ctx.fillText('◆ TORP', dpx + 5, dpy - 3)
    }

    // ── BrahMos path + dot ──
    if (bif && !bif.detonated) {
      const tgt   = contacts.find(c => c.id === bif.targetId)
      const brg   = tgt?.bearing ?? bif.bearing
      const dist  = tgt?.distance ?? MR * 0.65
      const { x: bx, y: by } = contactXY(brg, dist, R, cx, cy)
      const elapsed = Math.min((Date.now() - bif.launched) / 7000, 1)

      ctx.setLineDash([6, 3])
      ctx.strokeStyle = 'rgba(255,160,40,0.55)'
      ctx.lineWidth   = 1.5
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke()
      ctx.setLineDash([])

      const mpx = cx + (bx - cx) * elapsed
      const mpy = cy + (by - cy) * elapsed
      for (let i = 5; i >= 1; i--) {
        const tp = Math.max(0, elapsed - i * 0.03)
        ctx.fillStyle = `rgba(255,153,51,${0.55 - i * 0.1})`
        ctx.beginPath(); ctx.arc(cx + (bx - cx) * tp, cy + (by - cy) * tp, 3 - i * 0.4, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle   = '#FF9933'
      ctx.shadowColor = '#FF9933'
      ctx.shadowBlur  = 14
      ctx.beginPath(); ctx.arc(mpx, mpy, 4.5, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur  = 0
      ctx.fillStyle   = '#FF9933'
      ctx.font        = '7px "Share Tech Mono",monospace'
      ctx.textAlign   = 'left'
      ctx.fillText('◆ BRAHMOS', mpx + 5, mpy - 3)
    }

    // ── Contacts ──
    contacts.forEach(c => {
      const { x: px, y: py } = contactXY(c.bearing, c.distance, R, cx, cy)

      // Echo trail
      if (c.echoTrail.length > 1) {
        ctx.strokeStyle = c.hostile ? 'rgba(255,50,50,0.14)' : 'rgba(255,220,0,0.1)'
        ctx.lineWidth   = 1
        ctx.beginPath()
        c.echoTrail.forEach((e, i) => {
          const { x: ex, y: ey } = contactXY(e.bearing, e.distance, R, cx, cy)
          i === 0 ? ctx.moveTo(ex, ey) : ctx.lineTo(ex, ey)
        })
        ctx.stroke()
      }

      const col = c.hostile ? '#ff1744' : c.tracked ? '#00e5ff' : '#ffd600'

      // Tracked: dashed lock ring + bearing arc
      if (c.tracked) {
        ctx.strokeStyle = col
        ctx.lineWidth   = 1.2
        ctx.setLineDash([3, 3])
        ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
        const spread = 0.09
        const bRad   = (c.bearing - 90) * Math.PI / 180
        ctx.strokeStyle = `rgba(${c.hostile ? '255,23,68' : '0,229,255'},0.12)`
        ctx.lineWidth   = 15
        ctx.beginPath()
        ctx.arc(cx, cy, Math.min(c.distance / MR, 1) * R, bRad - spread, bRad + spread)
        ctx.stroke()
      }

      // Hover ring
      if (hoverId === c.id) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth   = 1
        ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI * 2); ctx.stroke()
      }

      // Dot
      ctx.fillStyle   = col
      ctx.shadowColor = col
      ctx.shadowBlur  = c.tracked ? 14 : 7
      ctx.beginPath(); ctx.arc(px, py, c.tracked ? 5.5 : 3.5, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur  = 0

      // Label
      if (c.tracked || hoverId === c.id) {
        ctx.fillStyle = col
        ctx.font      = '7px "Share Tech Mono",monospace'
        ctx.textAlign = 'left'
        ctx.fillText(c.name || 'UNKNOWN', px + 9, py - 5)
        ctx.fillText(`${Math.round(c.distance)}m`, px + 9, py + 4)
        ctx.fillText(`BRG ${Math.round(c.bearing)}°`, px + 9, py + 13)
      }
    })

    // Own ship
    ctx.fillStyle   = '#00e5ff'
    ctx.shadowColor = '#00e5ff'
    ctx.shadowBlur  = 9
    ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill()
    const hdg = (useGameStore.getState().heading - 90) * Math.PI / 180
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(hdg) * 15, cy + Math.sin(hdg) * 15); ctx.stroke()
    ctx.shadowBlur = 0

    // Status
    ctx.fillStyle = 'rgba(0,229,255,0.5)'
    ctx.font      = '8px "Share Tech Mono",monospace'
    ctx.textAlign = 'left'
    ctx.fillText('SONAR: ' + mode.toUpperCase(), 12, 16)
    ctx.fillText('CONTACTS: ' + contacts.length, 12, 26)
    const locked = contacts.filter(c => c.tracked)
    if (locked.length > 0) {
      ctx.fillStyle = '#ff4444'
      ctx.fillText('LOCKED: ' + locked.map(c => c.name).join(', '), 12, 36)
    }
  }, [contacts, mode, ping, tif, bif, hoverId, contactXY])

  useEffect(() => {
    const loop = () => { draw(); animRef.current = requestAnimationFrame(loop) }
    loop()
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  const getContactAtMouse = useCallback((e) => {
    const cv = canvasRef.current
    if (!cv) return null
    const rect  = cv.getBoundingClientRect()
    const sx    = cv.width  / rect.width
    const sy    = cv.height / rect.height
    const mx    = (e.clientX - rect.left) * sx
    const my    = (e.clientY - rect.top)  * sy
    const R     = cv.width / 2 - 22
    const cx    = cv.width / 2, cy = cv.height / 2
    const HIT   = 18 * (cv.width / S)
    let best    = null, bestD = HIT
    contacts.forEach(c => {
      const { x, y } = contactXY(c.bearing, c.distance, R, cx, cy)
      const d = Math.hypot(mx - x, my - y)
      if (d < bestD) { best = c; bestD = d }
    })
    return best
  }, [contacts, contactXY])

  const handleClick = useCallback(e => {
    const c = getContactAtMouse(e)
    if (c) {
      trackContact(c.id)
      submarineAudio?.playClick?.()
      indraVoice?.speak?.(`Tracking ${c.name}. Bearing ${Math.round(c.bearing)}. Range ${Math.round(c.distance)} metres.`, 'info')
    }
  }, [getContactAtMouse, trackContact])

  const handleMouseMove = useCallback(e => {
    setHoverId(getContactAtMouse(e)?.id ?? null)
  }, [getContactAtMouse])

  if (!visible) return null

  const fireTarget = contacts.find(c => c.hostile && c.tracked) || contacts.find(c => c.hostile)

  return (
    <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 5, userSelect: 'none' }}>

      {/* Sonar disc */}
      <div style={{
        width: S, height: S, borderRadius: '50%', overflow: 'hidden',
        border: '1px solid rgba(0,229,255,0.22)',
        boxShadow: '0 0 30px rgba(0,229,255,0.09), inset 0 0 40px rgba(0,0,0,0.6)',
        cursor: hoverId ? 'crosshair' : 'default',
      }}>
        <canvas
          ref={canvasRef}
          width={S * 2} height={S * 2}
          style={{ width: S, height: S, display: 'block' }}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverId(null)}
        />
      </div>

      {/* Fire panel — shown when any hostile is on screen */}
      {fireTarget && (
        <div style={{
          padding: '7px 9px',
          background: 'rgba(0,4,16,0.93)',
          border: '1px solid rgba(255,40,40,0.28)',
          borderRadius: 4, backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          {/* Target info */}
          <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: 'rgba(0,229,255,0.7)', lineHeight: 1.7 }}>
            <span style={{ color: '#ff4444', fontWeight: 700, letterSpacing: 1 }}>
              {fireTarget.tracked ? '◉ ' : '○ '}{fireTarget.name}
            </span>
            {'  '}
            <span>BRG {Math.round(fireTarget.bearing)}°</span>
            {'  '}
            <span>{Math.round(fireTarget.distance)}m</span>
            {!fireTarget.tracked && (
              <span style={{ color: '#ffd600', marginLeft: 6 }}>← click to lock</span>
            )}
          </div>

          {/* Buttons row */}
          <div style={{ display: 'flex', gap: 4 }}>
            <FireBtn
              label={tif ? '◆ RUNNING' : `⬡ TORPEDO ×${torpedoCount}`}
              color="#ff1744"
              disabled={torpedoCount <= 0 || !!tif}
              active={!!tif}
              onClick={() => {
                if (torpedoCount > 0 && fireTarget) {
                  fireTorpedo(fireTarget.id)
                  submarineAudio?.playTorpedoLaunch?.()
                  speakReactive?.('torpedoFired')
                } else {
                  indraVoice?.speak?.(torpedoCount <= 0 ? 'Tubes empty.' : 'No target.', 'warning')
                }
              }}
            />
            <FireBtn
              label={bif ? '◆ INBOUND' : `⬡ BRAHMOS ×${brahmoCount}`}
              color="#FF9933"
              disabled={brahmoCount <= 0 || !!bif}
              active={!!bif}
              onClick={() => {
                if (brahmoCount > 0 && fireTarget) {
                  fireBrahMos(fireTarget.id)
                  submarineAudio?.playMissileLaunch?.()
                  speakReactive?.('brahmosFired')
                } else {
                  indraVoice?.speak?.(brahmoCount <= 0 ? 'BrahMos empty.' : 'No target.', 'warning')
                }
              }}
            />
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: 7, fontFamily: 'var(--font-mono)', color: 'rgba(0,229,255,0.2)' }}>
        CLICK CONTACT TO LOCK · FIRE FROM SONAR OR [F] [B]
      </div>
    </div>
  )
}

function FireBtn({ label, color, disabled, active, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: '5px 7px',
        background: active ? color + '20' : 'rgba(0,4,16,0.8)',
        border: `1px solid ${!disabled ? color : 'rgba(255,255,255,0.05)'}`,
        borderRadius: 3,
        color: !disabled ? color : 'rgba(255,255,255,0.18)',
        fontFamily: 'var(--font-display)', fontSize: 7, letterSpacing: 1,
        cursor: !disabled ? 'pointer' : 'not-allowed',
        transition: 'all 0.15s', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}
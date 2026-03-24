import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore, LIGHT_MODES } from '../../stores/gameStore'

// ─── Live Clock Hook ──────────────────────────────────────────────────────────
function useLiveClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

// ─── Thermal Canvas Renderer ──────────────────────────────────────────────────
const W = 256, H = 160
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
  const st = t2 * t2 * (3 - 2 * t2)
  return {
    r: Math.round(l.r + (u.r - l.r) * st),
    g: Math.round(l.g + (u.g - l.g) * st),
    b: Math.round(l.b + (u.b - l.b) * st),
  }
}

function ThermalCanvas({ contacts }) {
  const ref = useRef()
  const draw = useCallback(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const t = Date.now() * 0.001
    const img = ctx.createImageData(W, H)
    const d = img.data
    const sc = 2, sw = Math.ceil(W / sc), sh = Math.ceil(H / sc)
    const tf = new Float32Array(sw * sh)

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const nx = x / sw, ny = y / sh
        let tmp = ns(nx * 4, ny * 3, t) * 0.5 + ns(nx * 8, ny * 6, t * 1.3) * 0.25 + ns(nx * 16, ny * 12, t * 0.7) * 0.125
        // Sub heat source (reactor/engine at rear bottom)
        const vx = 0.3 + Math.sin(t * 0.2) * 0.1, vy = 0.65
        const vd = Math.sqrt((nx - vx) ** 2 + (ny - vy) ** 2)
        tmp += Math.max(0, 0.35 - vd) * 2.2
        // Contact heat sources
        contacts.forEach(c => {
          if (!c.thermal) return
          const cx = (c.bearing % 360) / 360
          const cy = 0.3 + Math.min(c.distance / 5000, 1) * 0.5
          const cd = Math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2)
          tmp += Math.max(0, 0.08 - cd) * (c.hostile ? 6 : 3)
        })
        tmp += Math.max(0, ny - 0.85) * 2
        tf[y * sw + x] = Math.max(0, Math.min(1, tmp))
      }
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const fx = x / W * (sw - 1), fy = y / H * (sh - 1)
        const ix = Math.floor(fx), iy = Math.floor(fy)
        const dx = fx - ix, dy = fy - iy
        const ix1 = Math.min(ix + 1, sw - 1), iy1 = Math.min(iy + 1, sh - 1)
        const v =
          tf[iy * sw + ix] * (1 - dx) * (1 - dy) +
          tf[iy * sw + ix1] * dx * (1 - dy) +
          tf[iy1 * sw + ix] * (1 - dx) * dy +
          tf[iy1 * sw + ix1] * dx * dy
        const col = tc(v), idx = (y * W + x) * 4
        d[idx] = col.r; d[idx + 1] = col.g; d[idx + 2] = col.b; d[idx + 3] = 230
      }
    }
    ctx.putImageData(img, 0, 0)

    // Overlay labels
    ctx.fillStyle = 'rgba(0,229,255,0.7)'
    ctx.font = '10px "Share Tech Mono",monospace'
    ctx.fillText('THERMAL IMAGING', 6, 14)
    ctx.fillStyle = 'rgba(0,229,255,0.35)'
    ctx.strokeRect(0, 0, W, H)

    // Scale bar
    const grd = ctx.createLinearGradient(6, H - 12, W - 6, H - 12)
    const stops = ['#080850', '#0028a0', '#008cc8', '#00c878', '#b4dc00', '#ffa000', '#ff3200', '#ffdddd']
    stops.forEach((c, i) => grd.addColorStop(i / (stops.length - 1), c))
    ctx.fillStyle = grd
    ctx.fillRect(6, H - 12, W - 12, 6)
    ctx.fillStyle = 'rgba(0,229,255,0.5)'
    ctx.font = '8px "Share Tech Mono",monospace'
    ctx.fillText('COLD', 6, H - 2)
    ctx.textAlign = 'right'
    ctx.fillText('HOT', W - 6, H - 2)
    ctx.textAlign = 'left'
  }, [contacts])

  useEffect(() => {
    let raf
    const loop = () => { draw(); raf = requestAnimationFrame(loop) }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [draw])

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}

// ─── Compass Rose Component ───────────────────────────────────────────────────
function CompassRose({ heading }) {
  const size = 120
  const cx = size / 2, cy = size / 2, r = 52

  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const majorTicks = Array.from({ length: 36 }, (_, i) => i * 10)
  const hdgRad = (-heading * Math.PI) / 180

  return (
    <svg width={size} height={size} style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id="cgrd" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#0a1a2a" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#050d18" stopOpacity="1" />
        </radialGradient>
        <filter id="cglow">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Background disk */}
      <circle cx={cx} cy={cy} r={r + 4} fill="url(#cgrd)" stroke="rgba(0,229,255,0.25)" strokeWidth="1" />

      {/* Rotating rose group */}
      <g transform={`rotate(${-heading} ${cx} ${cy})`}>
        {/* Tick marks */}
        {majorTicks.map(deg => {
          const rad = (deg * Math.PI) / 180
          const isMajor = deg % 90 === 0
          const isMid   = deg % 45 === 0
          const inner = r - (isMajor ? 14 : isMid ? 10 : 6)
          return (
            <line
              key={deg}
              x1={cx + Math.sin(rad) * inner}
              y1={cy - Math.cos(rad) * inner}
              x2={cx + Math.sin(rad) * (r - 1)}
              y2={cy - Math.cos(rad) * (r - 1)}
              stroke={isMajor ? 'rgba(0,229,255,0.9)' : isMid ? 'rgba(0,229,255,0.55)' : 'rgba(0,229,255,0.25)'}
              strokeWidth={isMajor ? 1.8 : 1}
            />
          )
        })}

        {/* Cardinal labels */}
        {cardinals.map((label, i) => {
          const deg = i * 45
          const rad = (deg * Math.PI) / 180
          const dist = r - 22
          const isNS = label === 'N' || label === 'S'
          return (
            <text
              key={label}
              x={cx + Math.sin(rad) * dist}
              y={cy - Math.cos(rad) * dist + 3.5}
              textAnchor="middle"
              fill={label === 'N' ? '#ff4444' : isNS ? '#00e5ff' : 'rgba(0,229,255,0.6)'}
              fontSize={isNS ? 11 : 8}
              fontFamily='"Share Tech Mono",monospace'
              fontWeight="bold"
              filter="url(#cglow)"
            >
              {label}
            </text>
          )
        })}

        {/* North arrow (red) */}
        <polygon
          points={`${cx},${cy - r + 8} ${cx - 5},${cy} ${cx + 5},${cy}`}
          fill="#cc2222"
          opacity="0.9"
        />
        {/* South arrow (cyan) */}
        <polygon
          points={`${cx},${cy + r - 8} ${cx - 5},${cy} ${cx + 5},${cy}`}
          fill="rgba(0,229,255,0.5)"
        />
      </g>

      {/* Fixed lubber line */}
      <line x1={cx} y1={cy - r - 1} x2={cx} y2={cy - r + 10}
        stroke="#ffcc00" strokeWidth="2.5" />

      {/* Centre dot */}
      <circle cx={cx} cy={cy} r={3} fill="#00e5ff" filter="url(#cglow)" />

      {/* Heading digital readout */}
      <text
        x={cx} y={cy + r + 16}
        textAnchor="middle"
        fill="#ffcc00"
        fontSize={12}
        fontFamily='"Share Tech Mono",monospace'
        fontWeight="bold"
        filter="url(#cglow)"
      >
        {String(Math.round(heading)).padStart(3, '0')}°
      </text>
    </svg>
  )
}

// ─── Interior Controls (key listener) ────────────────────────────────────────
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

// ─── Structural components ────────────────────────────────────────────────────

function BulkheadShell({ position = [0, 0, 0], length = 12.5, radius = 3.15 }) {
  const ringCount = Math.floor(length / 1.5)
  return (
    <group position={position}>
      <mesh rotation={[0, 0, Math.PI / 2]} receiveShadow castShadow>
        <cylinderGeometry args={[radius, radius, length, 40, 1, true]} />
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
        <mesh key={i} position={[-length / 2 + (i + 0.5) * (length / ringCount), 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
          <torusGeometry args={[radius - 0.03, 0.065, 8, 36]} />
          <meshStandardMaterial color="#20242b" roughness={0.72} metalness={0.75} />
        </mesh>
      ))}
      <mesh position={[0, radius - 0.28, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <boxGeometry args={[length - 0.8, 0.16, 0.42]} />
        <meshStandardMaterial color="#1f242c" roughness={0.75} metalness={0.55} />
      </mesh>
      {[-1.3, 1.3].map((z, i) => (
        <group key={i}>
          <mesh position={[0, radius - 0.58, z]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <boxGeometry args={[length - 0.8, 0.035, 0.22]} />
            <meshStandardMaterial color="#2b313c" roughness={0.7} metalness={0.6} />
          </mesh>
          <mesh position={[0, radius - 0.42, z]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
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
        <mesh key={i} position={[x, 0, 0]} rotation={[0, ry, 0]} receiveShadow castShadow>
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
        <mesh castShadow receiveShadow>
          <torusGeometry args={[0.16, 0.02, 8, 16]} />
          <meshStandardMaterial color="#a12b24" roughness={0.45} metalness={0.75} />
        </mesh>
        {[0, 1, 2, 3].map(i => (
          <mesh key={i} rotation={[0, 0, i * Math.PI / 2]} castShadow receiveShadow>
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
        <cylinderGeometry args={[0.34, 0.34, 0.38, 18]} />
        <meshStandardMaterial color="#1b2028" roughness={0.62} metalness={0.82} />
      </mesh>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.13, 0.15, 0.28, 16]} />
        <meshStandardMaterial color="#232a34" roughness={0.58} metalness={0.84} />
      </mesh>
      <group ref={ref}>
        <mesh position={[0, 1.8, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.07, 0.07, 3.6, 14]} />
          <meshStandardMaterial color="#2a313b" roughness={0.42} metalness={0.88} />
        </mesh>
        <mesh position={[0, 3.55, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.085, 0.085, 0.22, 14]} />
          <meshStandardMaterial color="#323945" roughness={0.34} metalness={0.92} />
        </mesh>
        <mesh position={[0.23, 3.58, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[0.036, 0.036, 0.46, 12]} />
          <meshStandardMaterial color="#11161c" roughness={0.24} metalness={0.95} />
        </mesh>
        <mesh position={[0.45, 3.58, 0]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshStandardMaterial color="#cfefff" emissive="#9fdcff" emissiveIntensity={0.28} roughness={0.12} metalness={0.6} />
        </mesh>
        <mesh position={[-0.07, 3.52, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.16, 0.11, 0.11]} />
          <meshStandardMaterial color="#1c2128" roughness={0.28} metalness={0.92} />
        </mesh>
      </group>
      <mesh position={[0, -0.12, 0]} castShadow receiveShadow>
        <torusGeometry args={[0.35, 0.03, 8, 18]} />
        <meshStandardMaterial color="#252b35" roughness={0.52} metalness={0.84} />
      </mesh>
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
      <mesh position={[0, 0.13, -depth * 0.43]} rotation={[0.28, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[width - 0.12, 0.03, 0.02]} />
        <meshStandardMaterial color="#66d9ff" emissive="#66d9ff" emissiveIntensity={0.1} />
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
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-width / 2 + 0.18 + i * 0.12, 0.03, 0.26]} castShadow receiveShadow>
          <boxGeometry args={[0.04, 0.018, 0.04]} />
          <meshStandardMaterial color={i < 5 ? '#2e3948' : i === 5 ? '#7a2b20' : '#244a2d'} roughness={0.8} metalness={0.2} />
        </mesh>
      ))}
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
      <mesh position={[0, 0.56, 0.46]} castShadow receiveShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.62, 8]} />
        <meshStandardMaterial color="#313844" roughness={0.5} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0.82, 0.46]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <torusGeometry args={[0.17, 0.015, 8, 18, Math.PI]} />
        <meshStandardMaterial color="#2f353f" roughness={0.45} metalness={0.78} />
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
          <mesh castShadow receiveShadow>
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

// ─── Modernized Screen Content ────────────────────────────────────────────────

function LiveClockPanel({ heading, depth, speed, missionTime, hull, o2, reactorTemp }) {
  // This is called from Html component — uses real Date
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const timeStr = `${hh}:${mm}:${ss}`
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const mt  = missionTime ?? 0
  const mth = String(Math.floor(mt / 3600)).padStart(2, '0')
  const mtm = String(Math.floor((mt % 3600) / 60)).padStart(2, '0')
  const mts = String(Math.floor(mt % 60)).padStart(2, '0')

  const base = `font-family:"Share Tech Mono",monospace;background:#03080c;color:#a8f2ff;width:100%;height:100%;padding:8px;box-sizing:border-box;overflow:hidden;border:1px solid rgba(0,180,255,0.15);`
  const scan = `<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 4px);pointer-events:none;"></div>`

  return `
    <div style="${base}position:relative;">
      ${scan}
      <div style="color:#00e5ff;font-size:10px;letter-spacing:3px;margin-bottom:2px;opacity:0.7;">INS ARIHANT • S73</div>
      <div style="font-size:26px;font-weight:bold;color:#ffe066;letter-spacing:4px;line-height:1.1;text-shadow:0 0 12px rgba(255,220,50,0.5);">${timeStr}</div>
      <div style="font-size:8px;color:rgba(0,229,255,0.5);margin-bottom:6px;">${dateStr} IST</div>
      <div style="font-size:8px;color:#4cff8a;border-top:1px solid rgba(0,229,255,0.12);padding-top:4px;margin-bottom:2px;">MISSION T+ ${mth}:${mtm}:${mts}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;font-size:9px;margin-top:4px;">
        <div>HDG <span style="color:#ffe066;font-size:11px;">${String(Math.round(heading ?? 0)).padStart(3,'0')}°</span></div>
        <div>SPD <span style="color:#ffe066;font-size:11px;">${(speed ?? 0).toFixed(1)}<span style="font-size:7px;color:rgba(255,224,102,0.6)">kn</span></span></div>
        <div>DEP <span style="color:${Math.abs(depth ?? 0) > 300 ? '#ff6f6f' : '#00e5ff'};font-size:11px;">${Math.abs(depth ?? 0).toFixed(0)}<span style="font-size:7px;opacity:0.6">m</span></span></div>
        <div>O₂ <span style="color:${(o2 ?? 98) < 80 ? '#ff6f6f' : '#4cff8a'};font-size:11px;">${(o2 ?? 98).toFixed(0)}<span style="font-size:7px;opacity:0.6">%</span></span></div>
      </div>
    </div>`
}

function TacticalContent({ heading, speed, depth, contacts, missionTime, currentScene }) {
  const hostile = contacts?.filter(c => c.hostile).length ?? 0
  const mt  = missionTime ?? 0
  const mth = String(Math.floor(mt / 3600)).padStart(2, '0')
  const mtm = String(Math.floor((mt % 3600) / 60)).padStart(2, '0')
  const mts = String(Math.floor(mt % 60)).padStart(2, '0')

  const base = `font-family:"Share Tech Mono",monospace;color:#a8f2ff;font-size:8px;background:#03080c;padding:7px;width:100%;height:100%;overflow:hidden;border:1px solid rgba(110,200,220,0.16);position:relative;box-shadow:inset 0 0 12px rgba(0,180,255,0.08);`
  const scan = `<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 4px);pointer-events:none;"></div>`

  return `
    <div style="${base}">
      ${scan}
      <div style="color:#9fe7ff;font-size:11px;letter-spacing:2px;margin-bottom:4px;border-bottom:1px solid rgba(120,180,200,0.25);padding-bottom:3px;">COMMAND TACTICAL</div>
      <div style="color:#5b7581;font-size:7px;margin-bottom:6px;">INS ARIHANT S73 • ${String(currentScene ?? '').replace(/_/g,' ').toUpperCase()}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:8px;margin-bottom:6px;">
        <div>HDG <span style="color:#d6f7ff">${String(Math.round(heading ?? 0)).padStart(3,'0')}°</span></div>
        <div>SPD <span style="color:#d6f7ff">${(speed ?? 0).toFixed(0)}kn</span></div>
        <div>DEP <span style="color:#d6f7ff">${Math.abs(depth ?? 0).toFixed(0)}m</span></div>
      </div>
      <div style="margin-bottom:4px;">TRACKS: ${contacts?.length ?? 0}${hostile > 0 ? ` <span style="color:#ff6f6f">(${hostile} HOSTILE)</span>` : ''}</div>
      ${(contacts ?? []).slice(0, 4).map(c => `
        <div style="color:${c.hostile ? '#ff7d7d' : '#ffd36a'};font-size:8px;margin-top:2px;padding-left:6px;border-left:2px solid ${c.hostile ? '#ff6a6a' : '#d3aa55'}">
          ${c.name} ${c.bearing.toFixed(0)}° ${c.distance.toFixed(0)}m ${c.tracked ? '<span style="color:#8fe9ff">[TRACK]</span>' : ''}
        </div>`).join('')}
      <div style="position:absolute;bottom:6px;left:8px;color:#465661;font-size:7px;">T+${mth}:${mtm}:${mts}</div>
    </div>`
}

function ScreenContent({ content, storeData }) {
  const { heading, speed, depth, contacts, missionTime, currentScene, hullIntegrity, oxygenLevel, reactorTemp, torpedoCount, brahmosMissiles } = storeData

  const base = `font-family:"Share Tech Mono",monospace;color:#a8f2ff;font-size:8px;background:#03080c;padding:7px;width:100%;height:100%;overflow:hidden;border:1px solid rgba(110,200,220,0.16);position:relative;`
  const scan = `<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 4px);pointer-events:none;"></div>`

  switch (content) {
    case 'tactical':
      return TacticalContent({ heading, speed, depth, contacts, missionTime, currentScene })

    case 'weapons':
      return `<div style="${base}">${scan}
        <div style="color:#ff8d7e;font-size:11px;letter-spacing:2px;margin-bottom:6px;border-bottom:1px solid rgba(255,120,100,0.22);padding-bottom:3px;">WEAPONS CONTROL</div>
        <div style="font-size:8px;margin-bottom:3px;">TORPEDO 533mm <span style="color:#ffb0a0;font-size:13px;float:right;font-weight:bold;">${torpedoCount}</span></div>
        <div style="background:rgba(255,90,90,0.12);height:5px;border-radius:3px;margin-bottom:8px;overflow:hidden;">
          <div style="background:#ff6a6a;height:100%;width:${(torpedoCount / 6) * 100}%;border-radius:3px;"></div>
        </div>
        <div style="font-size:8px;margin-bottom:3px;">BRAHMOS <span style="color:#ffd38f;font-size:13px;float:right;font-weight:bold;">${brahmosMissiles}</span></div>
        <div style="background:rgba(255,190,90,0.12);height:5px;border-radius:3px;margin-bottom:8px;overflow:hidden;">
          <div style="background:#ffb648;height:100%;width:${(brahmosMissiles / 4) * 100}%;border-radius:3px;"></div>
        </div>
        <div style="color:#8cb7c0;font-size:7px;margin-top:4px;">K-15 SAGARIKA STATUS READY</div>
      </div>`

    case 'engineering':
      return `<div style="${base}">${scan}
        <div style="color:#89e3b0;font-size:11px;letter-spacing:2px;margin-bottom:6px;border-bottom:1px solid rgba(120,220,170,0.18);padding-bottom:3px;">ENGINEERING</div>
        <div style="font-size:8px;margin-bottom:2px;">REACTOR <span style="color:${reactorTemp > 450 ? '#ff7d7d' : '#d6f7ff'};float:right;">${reactorTemp.toFixed(0)}°K</span></div>
        <div style="background:rgba(100,180,200,0.08);height:4px;border-radius:2px;margin-bottom:6px;overflow:hidden;">
          <div style="background:${reactorTemp > 450 ? '#ff7d7d' : '#9fe7ff'};height:100%;width:${Math.min((reactorTemp / 600) * 100, 100)}%;border-radius:2px;"></div>
        </div>
        <div style="font-size:8px;margin-bottom:2px;">HULL <span style="color:${hullIntegrity < 70 ? '#ff7d7d' : '#8de3b1'};float:right;">${hullIntegrity.toFixed(0)}%</span></div>
        <div style="background:rgba(80,180,130,0.08);height:4px;border-radius:2px;margin-bottom:6px;overflow:hidden;">
          <div style="background:${hullIntegrity < 70 ? '#ff7d7d' : '#8de3b1'};height:100%;width:${hullIntegrity}%;border-radius:2px;"></div>
        </div>
        <div style="font-size:8px;">O₂: ${oxygenLevel.toFixed(0)}%</div>
        <div style="color:#51646d;font-size:7px;margin-top:6px;">83MW PWR • STEAM TURBINE</div>
      </div>`

    case 'navigation':
      return `<div style="${base}">${scan}
        <div style="color:#8fe9ff;font-size:11px;letter-spacing:2px;margin-bottom:6px;border-bottom:1px solid rgba(120,180,200,0.18);padding-bottom:3px;">NAVIGATION</div>
        <div style="font-size:9px;margin-bottom:3px;">HDG: <span style="color:#d6f7ff;font-size:12px;">${String(Math.round(heading)).padStart(3,'0')}°</span></div>
        <div style="font-size:9px;margin-bottom:3px;">DEP: <span style="color:#d6f7ff;font-size:12px;">${Math.abs(depth).toFixed(1)}m</span></div>
        <div style="font-size:9px;margin-bottom:6px;">SPD: <span style="color:#d6f7ff;font-size:12px;">${speed.toFixed(1)}kts</span></div>
        <div style="color:#617a85;font-size:8px;">BAY OF BENGAL • PATROL GRID</div>
      </div>`

    case 'sonar':
      return `<div style="${base}">${scan}
        <div style="color:#92f0ff;font-size:11px;letter-spacing:2px;margin-bottom:6px;border-bottom:1px solid rgba(120,180,200,0.18);padding-bottom:3px;">SONAR</div>
        <div style="font-size:8px;">PASSIVE ARRAY</div>
        <div style="font-size:8px;margin-top:3px;">CONTACTS: ${contacts?.length ?? 0}</div>
        ${(contacts ?? []).slice(0, 3).map(c => `<div style="font-size:7px;color:${c.hostile ? '#ff7d7d' : '#ffd36a'};margin-top:2px;">● ${c.name} ${c.bearing.toFixed(0)}°/${c.distance.toFixed(0)}m</div>`).join('')}
        <div style="color:#51646d;font-size:7px;margin-top:6px;">HULL ARRAY ONLINE</div>
      </div>`

    case 'crew':
      return `<div style="${base}">${scan}
        <div style="color:#d6c98c;font-size:11px;letter-spacing:2px;margin-bottom:6px;border-bottom:1px solid rgba(180,160,90,0.18);padding-bottom:3px;">WATCH STATUS</div>
        <div style="font-size:8px;line-height:1.8;">
          <div>Cdr. Singh — XO<span style="color:#8de3b1;float:right;">●</span></div>
          <div>Lt.Cdr. Sharma — Wpns<span style="color:#8de3b1;float:right;">●</span></div>
          <div>Lt. Nair — Nav<span style="color:#8de3b1;float:right;">●</span></div>
          <div>Lt. Verma — Sonar<span style="color:#8de3b1;float:right;">●</span></div>
          <div>SLt. Patel — Reactor<span style="color:#8de3b1;float:right;">●</span></div>
        </div>
        <div style="color:#8de3b1;font-size:7px;margin-top:4px;">ALL STATIONS MANNED</div>
      </div>`

    default:
      return `<div style="${base}"><div style="color:#4a5c66;">STANDBY</div></div>`
  }
}

// ─── Live Monitor Screen ───────────────────────────────────────────────────────
// Polls store every frame via useFrame and re-renders Html content
function LiveMonitorScreen({ position, rotation = [0, 0, 0], width = 1.6, height = 1, content = 'tactical', label = '' }) {
  const htmlRef  = useRef()
  const tickRef  = useRef(0)

  const storeRef = useRef({})

  useFrame(() => {
    tickRef.current++
    // Update at ~10fps to save perf (every 6 frames at 60fps)
    if (tickRef.current % 6 !== 0) return
    const s = useGameStore.getState()
    storeRef.current = {
      heading:      s.heading,
      speed:        s.speed,
      depth:        s.depth,
      contacts:     s.contacts,
      missionTime:  s.missionTime,
      currentScene: s.currentScene,
      hullIntegrity: s.hullIntegrity,
      oxygenLevel:  s.oxygenLevel,
      reactorTemp:  s.reactorTemp,
      torpedoCount: s.torpedoCount,
      brahmosMissiles: s.brahmosMissiles,
    }
    if (htmlRef.current) {
      const html = content === 'clock'
        ? LiveClockPanel(storeRef.current)
        : ScreenContent({ content, storeData: storeRef.current })
      htmlRef.current.innerHTML = html
    }
  })

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width + 0.18, height + 0.14, 0.14]} />
        <meshStandardMaterial color="#18202a" roughness={0.76} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.072]}>
        <planeGeometry args={[width + 0.04, height + 0.04]} />
        <meshStandardMaterial color="#05090d" emissive="#102430" emissiveIntensity={0.16} />
      </mesh>
      <Html
        transform occlude distanceFactor={1.55}
        position={[0, 0, 0.073]}
        style={{ width: `${width * 72}px`, height: `${height * 72}px`, pointerEvents: 'none' }}
      >
        <div ref={htmlRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
      </Html>
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

// ─── Compass Monitor Screen ───────────────────────────────────────────────────
function CompassMonitorScreen({ position, rotation = [0, 0, 0] }) {
  const width = 1.0, height = 1.0
  const heading = useGameStore(s => s.heading)

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width + 0.18, height + 0.14, 0.14]} />
        <meshStandardMaterial color="#18202a" roughness={0.76} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.072]}>
        <planeGeometry args={[width + 0.04, height + 0.04]} />
        <meshStandardMaterial color="#05090d" emissive="#102430" emissiveIntensity={0.16} />
      </mesh>
      <Html
        transform occlude distanceFactor={1.55}
        position={[0, 0, 0.073]}
        style={{ width: `${width * 72}px`, height: `${height * 72}px`, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03080c' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}>
          <div style={{ fontFamily: '"Share Tech Mono",monospace', color: 'rgba(0,229,255,0.6)', fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>COMPASS</div>
          <CompassRose heading={heading} />
        </div>
      </Html>
      <Text position={[0, -height / 2 - 0.08, 0.075]} fontSize={0.032} color="#8aa0ad" anchorX="center">NAV COMPASS</Text>
    </group>
  )
}

// ─── Thermal Monitor Screen ───────────────────────────────────────────────────
function ThermalMonitorScreen({ position, rotation = [0, 0, 0] }) {
  const width = 1.4, height = 0.88
  const contacts = useGameStore(s => s.contacts)
  const thermalEnabled = useGameStore(s => s.thermalEnabled)

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width + 0.18, height + 0.14, 0.14]} />
        <meshStandardMaterial color="#18202a" roughness={0.76} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.072]}>
        <planeGeometry args={[width + 0.04, height + 0.04]} />
        <meshStandardMaterial color="#05090d" emissive="#102430" emissiveIntensity={0.16} />
      </mesh>
      <Html
        transform occlude distanceFactor={1.55}
        position={[0, 0, 0.073]}
        style={{ width: `${width * 72}px`, height: `${height * 72}px`, pointerEvents: 'none', overflow: 'hidden', background: '#03080c' }}
      >
        {thermalEnabled ? (
          <ThermalCanvas contacts={contacts} />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"Share Tech Mono",monospace', color: 'rgba(0,229,255,0.3)', fontSize: 10,
            flexDirection: 'column', gap: 6, background: '#03080c',
          }}>
            <div style={{ fontSize: 18, opacity: 0.4 }}>⊘</div>
            <div>THERMAL OFFLINE</div>
            <div style={{ fontSize: 8, opacity: 0.5 }}>PRESS T TO ENABLE</div>
          </div>
        )}
      </Html>
      <Text position={[0, -height / 2 - 0.08, 0.075]} fontSize={0.032} color="#8aa0ad" anchorX="center">THERMAL IMAGING</Text>
    </group>
  )
}

// ─── Forward Viewport ─────────────────────────────────────────────────────────
function ForwardViewport({ position = [0, 0.95, -2.72], width = 2.9, height = 2.15 }) {
  const depth = useGameStore(s => s.depth)
  const glow = THREE.MathUtils.clamp(Math.abs(depth) / 80, 0.25, 1)
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <planeGeometry args={[width + 0.3, height + 0.3]} />
        <meshStandardMaterial color="#202730" roughness={0.52} metalness={0.82} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[width, height]} />
        <meshPhysicalMaterial color="#0c2130" roughness={0.08} metalness={0.02} transmission={0.72} thickness={0.55} transparent opacity={0.58} emissive="#0d4460" emissiveIntensity={0.22 * glow} />
      </mesh>
      <pointLight position={[0, 0, 0.25]} color="#59d8ff" intensity={1.1 * glow} distance={5.2} />
    </group>
  )
}

function SideViewport({ position, size = 0.52 }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <ringGeometry args={[size * 0.88, size, 28]} />
        <meshStandardMaterial color="#212832" roughness={0.55} metalness={0.82} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <circleGeometry args={[size * 0.87, 24]} />
        <meshPhysicalMaterial color="#081622" roughness={0.1} metalness={0.03} transmission={0.6} thickness={0.4} transparent opacity={0.46} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2, r = size * 0.94
        return (
          <mesh key={i} position={[Math.cos(a) * r, Math.sin(a) * r, 0.03]} castShadow receiveShadow>
            <cylinderGeometry args={[0.01, 0.01, 0.015, 6]} />
            <meshStandardMaterial color="#3b434d" metalness={0.82} roughness={0.42} />
          </mesh>
        )
      })}
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

// ─── Drive HUD strip (3D plane inside the sub) ────────────────────────────────
// A horizontal instrument panel strip above the forward viewport
function DriveHUDStrip({ position }) {
  const heading = useGameStore(s => s.heading)
  const depth   = useGameStore(s => s.depth)
  const speed   = useGameStore(s => s.speed)

  const hdgStr   = String(Math.round((heading + 360) % 360)).padStart(3, '0')
  const depStr   = Math.abs(depth).toFixed(0)
  const spdStr   = speed.toFixed(1)
  const depColor = Math.abs(depth) > 300 ? '#ff5050' : Math.abs(depth) > 150 ? '#ffaa00' : '#00e5ff'
  const spdColor = speed > 20 ? '#ff7777' : speed > 12 ? '#ffcc44' : '#00ff88'

  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.28, 0.06]} />
        <meshStandardMaterial color="#0d1520" roughness={0.8} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[2.54, 0.22]} />
        <meshStandardMaterial color="#040b12" emissive="#091a28" emissiveIntensity={0.4} />
      </mesh>
      <Html
        transform occlude distanceFactor={1.55}
        position={[0, 0, 0.034]}
        style={{ width: 185, height: 16, pointerEvents: 'none' }}
      >
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          fontFamily: '"Share Tech Mono",monospace', fontSize: 10,
          background: 'transparent',
        }}>
          <span style={{ color: 'rgba(0,229,255,0.5)' }}>HDG&nbsp;<span style={{ color: '#ffe066', fontWeight: 'bold' }}>{hdgStr}°</span></span>
          <span style={{ color: 'rgba(0,229,255,0.3)' }}>|</span>
          <span style={{ color: 'rgba(0,229,255,0.5)' }}>DEP&nbsp;<span style={{ color: depColor, fontWeight: 'bold' }}>{depStr}m</span></span>
          <span style={{ color: 'rgba(0,229,255,0.3)' }}>|</span>
          <span style={{ color: 'rgba(0,229,255,0.5)' }}>SPD&nbsp;<span style={{ color: spdColor, fontWeight: 'bold' }}>{spdStr}kn</span></span>
        </div>
      </Html>
    </group>
  )
}

// ─── Interior Lighting ────────────────────────────────────────────────────────
function InteriorLighting() {
  const mode       = useGameStore(s => s.lightMode)
  const alarm      = useGameStore(s => s.alarmActive)
  const depth      = useGameStore(s => s.depth)
  const brightness = useGameStore(s => s.interiorBrightness ?? 1.0)
  const floodOn    = useGameStore(s => s.interiorFloodLightsOn ?? true)

  const warmRef      = useRef()
  const redRef       = useRef()
  const viewportRef  = useRef()

  useFrame(({ clock }) => {
    const baseWarm =
      mode === LIGHT_MODES.STEALTH  ? 0.35 :
      mode === LIGHT_MODES.OFF      ? 0.1  :
      mode === LIGHT_MODES.COMBAT   ? 0.7  : 1.25

    if (warmRef.current) warmRef.current.intensity = baseWarm * brightness

    if (viewportRef.current) {
      const underwaterGlow = THREE.MathUtils.clamp(Math.abs(depth) / 70, 0.25, 1.0)
      viewportRef.current.intensity = underwaterGlow * 2.2 * brightness
    }

    if (redRef.current) {
      redRef.current.intensity =
        mode === LIGHT_MODES.EMERGENCY || alarm
          ? (Math.sin(clock.elapsedTime * 8) > 0 ? 1.6 : 0.12)
          : 0
    }
  })

  const floodIntensity = floodOn
    ? mode === LIGHT_MODES.STEALTH ? 0.35
    : mode === LIGHT_MODES.COMBAT  ? 0.95 : 1.6
    : 0

  return (
    <group>
      <ambientLight intensity={0.34} color="#9aa7b2" />
      <pointLight ref={warmRef} position={[0, 2.25, -0.2]} color="#ffd7a6" distance={11} decay={1.6} castShadow />
      <pointLight position={[-2.4, 2.0, 0.5]} color="#ffe0b8" intensity={floodIntensity * brightness} distance={9} decay={1.7} />
      <pointLight position={[ 2.4, 2.0, 0.5]} color="#ffe0b8" intensity={floodIntensity * brightness} distance={9} decay={1.7} />
      <pointLight ref={viewportRef} position={[0, 1.0, -2.15]} color="#63d8ff" distance={7} decay={1.6} />
      <pointLight position={[0, 1.0, -1.5]}    color="#66d9ff" intensity={0.45} distance={4.2} />
      <pointLight position={[-2.4, 0.9, -1.4]} color="#66d9ff" intensity={0.28} distance={3.4} />
      <pointLight position={[ 2.4, 0.9, -1.4]} color="#66d9ff" intensity={0.28} distance={3.4} />
      <pointLight ref={redRef} position={[0, 2.1, 0]} color="#ff2e3a" distance={9} decay={2} />
    </group>
  )
}

function PipeCluster({ x }) {
  return (
    <>
      <mesh position={[x, 2.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.15, 0.05, 0.08]} />
        <meshStandardMaterial color="#8c1f1f" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[x, -1.82, 2.2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.34, 8]} />
        <meshStandardMaterial color="#a22821" roughness={0.45} metalness={0.65} />
      </mesh>
    </>
  )
}

// ─── Key bindings hint panel ──────────────────────────────────────────────────
function KeyHintPanel({ position, rotation = [0, 0, 0] }) {
  const width = 0.9, height = 0.62
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width + 0.12, height + 0.1, 0.09]} />
        <meshStandardMaterial color="#14191f" roughness={0.85} metalness={0.4} />
      </mesh>
      <Html
        transform occlude distanceFactor={1.55}
        position={[0, 0, 0.048]}
        style={{ width: `${width * 68}px`, height: `${height * 68}px`, pointerEvents: 'none' }}
      >
        <div style={{
          fontFamily: '"Share Tech Mono",monospace', fontSize: 7,
          color: 'rgba(0,229,255,0.55)', padding: 5, lineHeight: 1.7,
          background: '#030810', width: '100%', height: '100%',
          boxSizing: 'border-box',
        }}>
          <div style={{ color: '#00e5ff', fontSize: 8, marginBottom: 3, borderBottom: '1px solid rgba(0,229,255,0.2)', paddingBottom: 2 }}>DRIVE CONTROLS</div>
          <div><span style={{ color: '#ffe066' }}>↑↓</span> Throttle  <span style={{ color: '#ffe066' }}>←→</span> Rudder</div>
          <div><span style={{ color: '#ffe066' }}>Q/E</span> Dive / Ascend</div>
          <div style={{ marginTop: 3, borderTop: '1px solid rgba(0,229,255,0.1)', paddingTop: 3, color: 'rgba(0,229,255,0.4)' }}>
            <span style={{ color: '#ffe066' }}>WASD</span> Camera walk
          </div>
          <div><span style={{ color: '#ffe066' }}>P</span> Periscope  <span style={{ color: '#ffe066' }}>T</span> Thermal</div>
        </div>
      </Html>
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

      {/* ── Drive HUD strip above forward viewport ── */}
      <DriveHUDStrip position={[0, 2.12, -2.68]} />

      {/* ── CENTER: Tactical + Clock ── */}
      <LiveMonitorScreen
        position={[0, 1.04, -1.58]}
        rotation={[0.12, 0, 0]}
        width={1.72} height={0.98}
        content="tactical"
        label="COMMAND"
      />
      <ConsoleDesk position={[0, -0.9, -1.08]} width={1.8} depth={0.64} />

      {/* ── CENTER-RIGHT: Compass ── */}
      <CompassMonitorScreen
        position={[1.12, 1.08, -1.55]}
        rotation={[0.12, -0.18, 0]}
      />

      {/* ── CENTER-LEFT: Clock / status ── */}
      <LiveMonitorScreen
        position={[-1.14, 1.08, -1.55]}
        rotation={[0.12, 0.18, 0]}
        width={1.0} height={1.0}
        content="clock"
        label="CHRONOMETER"
      />

      {/* ── LEFT INNER: Sonar ── */}
      <LiveMonitorScreen
        position={[-2.55, 0.96, -1.14]}
        rotation={[0.14, 0.32, 0]}
        width={1.08} height={0.74}
        content="sonar"
        label="SONAR"
      />
      <ConsoleDesk position={[-2.62, -0.9, -0.74]} rotation={[0, 0.32, 0]} width={1.16} depth={0.58} />

      {/* ── RIGHT INNER: Navigation ── */}
      <LiveMonitorScreen
        position={[2.55, 0.96, -1.14]}
        rotation={[0.14, -0.32, 0]}
        width={1.08} height={0.74}
        content="navigation"
        label="NAV"
      />
      <ConsoleDesk position={[2.62, -0.9, -0.74]} rotation={[0, -0.32, 0]} width={1.16} depth={0.58} />

      {/* ── OUTER LEFT: Engineering ── */}
      <LiveMonitorScreen
        position={[-4.55, 0.94, -0.55]}
        rotation={[0.14, 0.56, 0]}
        width={0.92} height={0.64}
        content="engineering"
        label="ENG"
      />
      <ConsoleDesk position={[-4.6, -0.9, -0.18]} rotation={[0, 0.56, 0]} width={0.98} depth={0.52} hasKeyboard={false} />

      {/* ── OUTER RIGHT: Weapons ── */}
      <LiveMonitorScreen
        position={[4.55, 0.94, -0.55]}
        rotation={[0.14, -0.56, 0]}
        width={0.92} height={0.64}
        content="weapons"
        label="WPN"
      />
      <ConsoleDesk position={[4.6, -0.9, -0.18]} rotation={[0, -0.56, 0]} width={0.98} depth={0.52} hasKeyboard={false} />

      {/* ── THERMAL screen on rear wall ── */}
      <ThermalMonitorScreen
        position={[-1.8, 0.55, 2.55]}
        rotation={[0, Math.PI, 0]}
      />

      {/* ── Thermal next to it (different position) ── */}
      <LiveMonitorScreen
        position={[1.8, 0.55, 2.55]}
        rotation={[0, Math.PI, 0]}
        width={1.4} height={0.88}
        content="crew"
        label="CREW STATUS"
      />

      {/* ── Key hint panel on rear wall ── */}
      <KeyHintPanel
        position={[0, 0.28, 2.56]}
        rotation={[0, Math.PI, 0]}
      />

      <EquipmentRack position={[-2.0, -1.5, 2.05]} rotation={[0, Math.PI, 0]} />
      <EquipmentRack position={[ 2.0, -1.5, 2.05]} rotation={[0, Math.PI, 0]} />

      <PipeCluster x={-4.0} />
      <PipeCluster x={0} />
      <PipeCluster x={4.0} />
    </group>
  )
}
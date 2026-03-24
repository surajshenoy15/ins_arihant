import React, { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../../stores/gameStore'

const DEG2RAD       = Math.PI / 180
const TORPEDO_SPEED = 32
const BRAHMOS_SPEED = 72
const ENEMY_RADIUS  = 62
const SUB_BOW       = new THREE.Vector3(10, -0.5, 0)
const BRAHMOS_EXIT  = new THREE.Vector3(0, 3.5, 0)

function bearingToWorld(deg, radius, y = 0) {
  const rad = (deg - 90) * DEG2RAD
  return new THREE.Vector3(Math.cos(rad) * radius, y, Math.sin(rad) * radius)
}

// ─── EXPLOSION ───────────────────────────────────────────────────────────────
function Explosion({ position, scale = 1, onDone }) {
  const g    = useRef()
  const t0   = useRef(null)
  const DUR  = 2.8

  const particles = useMemo(() => Array.from({ length: 60 }, (_, i) => ({
    dir:   new THREE.Vector3((Math.random()-0.5)*2, 0.08+Math.random()*1.9, (Math.random()-0.5)*2).normalize(),
    speed: (4 + Math.random() * 18) * scale,
    size:  (0.06 + Math.random() * 0.34) * scale,
    color: i < 18 ? '#ff4400' : i < 34 ? '#ffaa00' : i < 48 ? '#ffee55' : '#ffffff',
    spin:  (Math.random()-0.5) * 5,
  })), [scale])

  useFrame(({ clock }) => {
    if (!g.current) return
    if (!t0.current) t0.current = clock.elapsedTime
    const el = clock.elapsedTime - t0.current
    const t  = el / DUR
    if (t >= 1) { onDone?.(); return }

    g.current.children.forEach((obj, i) => {
      if (i < particles.length) {
        const p = particles[i]
        const fade = Math.max(0, 1 - t * 1.35)
        obj.position.copy(p.dir).multiplyScalar(p.speed * el)
        obj.position.y -= 5 * el * el
        obj.scale.setScalar(Math.max(0, p.size * (1 + t * 2.2)))
        obj.material.opacity = fade
        obj.rotation.z += p.spin * 0.016
      } else if (i === particles.length) {
        // core fireball
        obj.scale.setScalar(Math.max(0, (1 - t * 1.9) * 7 * scale))
        obj.material.opacity = Math.max(0, 1 - t * 2.4)
      } else {
        // smoke
        obj.scale.setScalar(Math.max(0, t * 4 * scale))
        obj.material.opacity = Math.max(0, 0.5 - t * 0.6)
        obj.position.y = el * 3
      }
    })
  })

  return (
    <group ref={g} position={position}>
      {particles.map((p, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 4, 4]} />
          <meshBasicMaterial color={p.color} transparent opacity={1} depthWrite={false} />
        </mesh>
      ))}
      {/* Core fireball */}
      <mesh>
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial color="#ff7700" transparent opacity={0.94} depthWrite={false} />
      </mesh>
      {/* Smoke */}
      <mesh position={[0, 1, 0]}>
        <sphereGeometry args={[0.9, 10, 10]} />
        <meshBasicMaterial color="#443322" transparent opacity={0.5} depthWrite={false} />
      </mesh>
      {/* Light */}
      <pointLight color="#ff6600" intensity={14 * scale} distance={50} decay={1.8} />
    </group>
  )
}

// ─── TORPEDO ─────────────────────────────────────────────────────────────────
function TorpedoProjectile({ id, targetPos, onHit }) {
  const g        = useRef()
  const trail    = useRef()
  const traveled = useRef(0)
  const done     = useRef(false)
  const TLEN     = 32
  const tArr     = useRef(new Float32Array(TLEN * 3))
  const totalD   = useMemo(() => SUB_BOW.distanceTo(targetPos), [targetPos])
  const dir      = useMemo(() => targetPos.clone().sub(SUB_BOW).normalize(), [targetPos])

  useFrame((_, dt) => {
    if (!g.current || done.current) return
    traveled.current += TORPEDO_SPEED * dt
    const t   = Math.min(traveled.current / totalD, 1)
    const pos = SUB_BOW.clone().lerp(targetPos, t)
    pos.y    += Math.sin(t * Math.PI) * -2.8   // running depth dip

    g.current.position.copy(pos)

    // Look ahead
    const lookt  = Math.min(t + 0.02, 1)
    const lookAt = SUB_BOW.clone().lerp(targetPos, lookt)
    lookAt.y    += Math.sin(lookt * Math.PI) * -2.8
    g.current.lookAt(lookAt)
    g.current.rotateY(Math.PI / 2)

    // Trail
    const arr = tArr.current
    arr.copyWithin(3, 0, (TLEN - 1) * 3)
    arr[0] = pos.x; arr[1] = pos.y; arr[2] = pos.z
    if (trail.current) trail.current.geometry.attributes.position.needsUpdate = true

    if (t >= 0.985 && !done.current) { done.current = true; onHit?.(pos.clone()) }
  })

  return (
    <group ref={g} position={SUB_BOW.toArray()}>
      {/* Body */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.09, 1.65, 12]} />
        <meshStandardMaterial color="#7a8fa0" metalness={0.92} roughness={0.18} />
      </mesh>
      {/* Nose */}
      <mesh position={[0.88, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.13, 0.48, 12]} />
        <meshStandardMaterial color="#5a7080" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Fins */}
      {[0, Math.PI/2, Math.PI, Math.PI*1.5].map((r, i) => (
        <mesh key={i} position={[-0.66, 0, 0]} rotation={[r, 0, 0]}>
          <boxGeometry args={[0.1, 0.38, 0.05]} />
          <meshStandardMaterial color="#445566" metalness={0.8} />
        </mesh>
      ))}
      {/* Propeller glow */}
      <mesh position={[-0.9, 0, 0]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial color="#80eeff" transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <pointLight color="#80eeff" intensity={1.6} distance={6} position={[-0.92, 0, 0]} />
      {/* Bubble trail */}
      <points ref={trail}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={tArr.current} count={TLEN} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.2} color="#c8f4ff" transparent opacity={0.55} depthWrite={false} sizeAttenuation />
      </points>
    </group>
  )
}

// ─── BRAHMOS ──────────────────────────────────────────────────────────────────
function BrahmosMissile({ id, targetPos, onHit }) {
  const g        = useRef()
  const trail    = useRef()
  const traveled = useRef(0)
  const done     = useRef(false)
  const TLEN     = 28
  const tArr     = useRef(new Float32Array(TLEN * 3))
  const totalD   = useMemo(() => BRAHMOS_EXIT.distanceTo(targetPos), [targetPos])
  const spinRef  = useRef(0)

  useFrame((_, dt) => {
    if (!g.current || done.current) return
    traveled.current += BRAHMOS_SPEED * dt
    const t   = Math.min(traveled.current / totalD, 1)
    const pos = BRAHMOS_EXIT.clone().lerp(targetPos, t)
    // High arc — climbs to 28 units altitude then terminal dive
    pos.y    += Math.sin(t * Math.PI) * 28

    g.current.position.copy(pos)

    const lookt  = Math.min(t + 0.015, 1)
    const lookAt = BRAHMOS_EXIT.clone().lerp(targetPos, lookt)
    lookAt.y    += Math.sin(lookt * Math.PI) * 28
    g.current.lookAt(lookAt)

    // Exhaust flame flicker
    spinRef.current += dt * 12
    const flame = g.current.getObjectByName('exhaust')
    if (flame) flame.material.opacity = 0.75 + Math.sin(spinRef.current) * 0.2

    const arr = tArr.current
    arr.copyWithin(3, 0, (TLEN - 1) * 3)
    arr[0] = pos.x; arr[1] = pos.y; arr[2] = pos.z
    if (trail.current) trail.current.geometry.attributes.position.needsUpdate = true

    if (t >= 0.985 && !done.current) { done.current = true; onHit?.(pos.clone()) }
  })

  return (
    <group ref={g} position={BRAHMOS_EXIT.toArray()}>
      {/* Body */}
      <mesh>
        <cylinderGeometry args={[0.11, 0.11, 2.0, 10]} />
        <meshStandardMaterial color="#3a4555" metalness={0.95} roughness={0.15} />
      </mesh>
      {/* Nose */}
      <mesh position={[0, 1.15, 0]}>
        <coneGeometry args={[0.11, 0.6, 10]} />
        <meshStandardMaterial color="#2a3545" metalness={0.95} roughness={0.12} />
      </mesh>
      {/* Fins */}
      {[0, Math.PI/2, Math.PI, Math.PI*1.5].map((r, i) => (
        <mesh key={i} position={[0, -0.78, 0]} rotation={[r, 0, 0]}>
          <boxGeometry args={[0.05, 0.35, 0.32]} />
          <meshStandardMaterial color="#1a2535" metalness={0.8} />
        </mesh>
      ))}
      {/* Exhaust flame (named for flicker) */}
      <mesh name="exhaust" position={[0, -1.15, 0]}>
        <coneGeometry args={[0.14, 0.85, 8]} />
        <meshBasicMaterial color="#ff8800" transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh position={[0, -1.45, 0]}>
        <coneGeometry args={[0.08, 0.6, 8]} />
        <meshBasicMaterial color="#ffdd00" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <pointLight color="#ff6600" intensity={3.5} distance={12} position={[0, -1.2, 0]} />
      {/* Hot contrail */}
      <points ref={trail}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={tArr.current} count={TLEN} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.35} color="#ff9944" transparent opacity={0.65} depthWrite={false} sizeAttenuation />
      </points>
    </group>
  )
}

// ─── ENEMY DESTROYER ─────────────────────────────────────────────────────────
function EnemyDestroyer({ position, bearing, isTracked }) {
  const g  = useRef()
  const t0 = useRef(Math.random() * 100)

  useFrame(({ clock }) => {
    if (!g.current) return
    const t = clock.elapsedTime + t0.current
    g.current.rotation.z = Math.sin(t * 0.38) * 0.021
    g.current.rotation.x = Math.sin(t * 0.26 + 1) * 0.009
    g.current.position.y = position.y + Math.sin(t * 0.48) * 0.09
    g.current.rotation.y = (bearing - 90) * DEG2RAD
  })

  return (
    <group ref={g} position={[position.x, position.y, position.z]} scale={0.55}>
      <mesh castShadow><boxGeometry args={[14, 1.7, 3.2]} /><meshStandardMaterial color="#2a3545" roughness={0.7} metalness={0.6} /></mesh>
      <mesh position={[7.5, 0, 0]} rotation={[0, Math.PI/2, 0]}><coneGeometry args={[1.65, 3.2, 4]} /><meshStandardMaterial color="#252f40" roughness={0.7} metalness={0.6} /></mesh>
      <mesh position={[-7.2, -0.2, 0]} rotation={[0, -Math.PI/2, 0]}><coneGeometry args={[1.2, 2.4, 4]} /><meshStandardMaterial color="#252f40" roughness={0.7} metalness={0.6} /></mesh>
      <mesh position={[0, -0.72, 0]}><boxGeometry args={[14.2, 0.2, 3.24]} /><meshStandardMaterial color="#cc1111" emissive="#cc0000" emissiveIntensity={0.6} /></mesh>
      <mesh position={[0, 0.93, 0]}><boxGeometry args={[13, 0.12, 2.8]} /><meshStandardMaterial color="#3a4a5a" roughness={0.85} /></mesh>
      <mesh position={[1.5, 2.3, 0]} castShadow><boxGeometry args={[3.5, 2.4, 2.4]} /><meshStandardMaterial color="#2d3d50" roughness={0.7} metalness={0.5} /></mesh>
      <mesh position={[-2.5, 1.65, 0]}><boxGeometry args={[2.8, 1.7, 2.2]} /><meshStandardMaterial color="#263040" roughness={0.7} /></mesh>
      <mesh position={[1.5, 4.4, 0]}><cylinderGeometry args={[0.08, 0.08, 3.8, 8]} /><meshStandardMaterial color="#1a2530" metalness={0.8} /></mesh>
      <mesh position={[1.5, 6.2, 0]} rotation={[Math.PI/2, 0, 0]}><torusGeometry args={[0.52, 0.065, 8, 16]} /><meshStandardMaterial color="#445566" metalness={0.9} /></mesh>
      <mesh position={[5.2, 1.2, 0]}><cylinderGeometry args={[0.52, 0.57, 0.55, 10]} /><meshStandardMaterial color="#1e2d3a" metalness={0.8} /></mesh>
      <mesh position={[5.85, 1.45, 0]} rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.07, 0.07, 2.2, 8]} /><meshStandardMaterial color="#111820" metalness={0.9} /></mesh>
      <mesh position={[-0.5, 2.9, 0]}><cylinderGeometry args={[0.23, 0.29, 1.5, 10]} /><meshStandardMaterial color="#1a2030" metalness={0.5} /></mesh>
      {isTracked && <>
        <mesh position={[0, 5.9, 0]}><sphereGeometry args={[0.22, 8, 8]} /><meshBasicMaterial color="#ff2222" /></mesh>
        <pointLight color="#ff2222" intensity={2.2} distance={12} position={[0, 5.9, 0]} />
      </>}
      <mesh position={[0, -0.97, 0]} rotation={[-Math.PI/2, 0, 0]}>
        <planeGeometry args={[17, 3.8]} />
        <meshBasicMaterial color="#c8eeff" transparent opacity={0.15} depthWrite={false} />
      </mesh>
    </group>
  )
}

// ─── ENEMY SUBMARINE ─────────────────────────────────────────────────────────
function EnemySubmarineShip({ position, bearing, isTracked }) {
  const g  = useRef()
  const t0 = useRef(Math.random() * 100)

  const profile = useMemo(() => {
    const pts = []
    for (let i = 0; i <= 28; i++) {
      const t = i / 28
      const r = t < 0.12 ? Math.sin((t/0.12)*Math.PI/2)*1.4
              : t > 0.88 ? Math.sin(((1-t)/0.12)*Math.PI/2)*1.1 : 1.4
      pts.push(new THREE.Vector2(r, (t - 0.5) * 14))
    }
    return pts
  }, [])

  useFrame(({ clock }) => {
    if (!g.current) return
    const t = clock.elapsedTime + t0.current
    g.current.rotation.z = Math.sin(t * 0.36) * 0.014
    g.current.position.y = position.y + Math.sin(t * 0.43) * 0.05
    g.current.rotation.y = (bearing - 90) * DEG2RAD
  })

  return (
    <group ref={g} position={[position.x, position.y, position.z]} scale={0.48}>
      <mesh rotation={[0, 0, Math.PI / 2]}><latheGeometry args={[profile, 24]} /><meshStandardMaterial color="#1a2030" roughness={0.65} metalness={0.9} /></mesh>
      <mesh position={[1.2, 1.65, 0]}><boxGeometry args={[2.2, 1.8, 0.95]} /><meshStandardMaterial color="#111820" roughness={0.6} metalness={0.88} /></mesh>
      <mesh position={[0.8, 2.9, 0]}><cylinderGeometry args={[0.045, 0.045, 1.5, 8]} /><meshStandardMaterial color="#223344" metalness={0.9} /></mesh>
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI/2]}><torusGeometry args={[1.42, 0.07, 5, 32]} /><meshStandardMaterial color="#cc1111" emissive="#cc0000" emissiveIntensity={0.65} /></mesh>
      {isTracked && <>
        <mesh position={[0, 3.3, 0]}><sphereGeometry args={[0.16, 8, 8]} /><meshBasicMaterial color="#ff2222" /></mesh>
        <pointLight color="#ff2222" intensity={1.5} distance={7} position={[0, 3.3, 0]} />
      </>}
    </group>
  )
}

// ─── AUTO ENEMY SPAWNER (React component, lives in MainScene) ─────────────────
export function EnemySpawner() {
  const currentScene = useGameStore(s => s.currentScene)
  const contacts     = useGameStore(s => s.contacts)
  const addContact   = useGameStore(s => s.addContact)
  const spawnedRef   = useRef(false)

  const COMBAT_SCENES = useMemo(() => [
    'first_contact','threat_assessment','combat_stations',
    'torpedo_engagement','brahmos_strike','final_stand',
  ], [])

  useEffect(() => {
    if (COMBAT_SCENES.includes(currentScene) && contacts.length === 0 && !spawnedRef.current) {
      spawnedRef.current = true
      addContact('destroyer')
      setTimeout(() => addContact('submarine'), 900)
      setTimeout(() => addContact('frigate'), 1800)
    }
    if (!COMBAT_SCENES.includes(currentScene)) spawnedRef.current = false
  }, [currentScene, contacts.length])

  return null
}

// ─── COMBAT SCENE ─────────────────────────────────────────────────────────────
export default function CombatScene() {
  const contacts        = useGameStore(s => s.contacts)
  const torpedoInFlight = useGameStore(s => s.torpedoInFlight)
  const brahmoInFlight  = useGameStore(s => s.brahmoInFlight)

  const [explosions,    setExplosions]    = useState([])
  const [activeTorpedo, setActiveTorpedo] = useState(null)
  const [activeBrahmo,  setActiveBrahmo]  = useState(null)

  useEffect(() => {
    if (torpedoInFlight && !torpedoInFlight.detonated) setActiveTorpedo(torpedoInFlight)
    if (!torpedoInFlight) setActiveTorpedo(null)
  }, [torpedoInFlight?.id, torpedoInFlight?.detonated])

  useEffect(() => {
    if (brahmoInFlight && !brahmoInFlight.detonated) setActiveBrahmo(brahmoInFlight)
    if (!brahmoInFlight) setActiveBrahmo(null)
  }, [brahmoInFlight?.id, brahmoInFlight?.detonated])

  // Resolve 3D world target pos from bearing stored in the weapon state
  const resolveTarget = (weapon, yOffset) => {
    if (!weapon) return null
    const contact = contacts.find(c => c.id === weapon.targetId)
    return bearingToWorld(contact?.bearing ?? weapon.bearing, ENEMY_RADIUS * 0.88, yOffset)
  }

  const torpedoTarget = useMemo(() => resolveTarget(activeTorpedo, -0.5), [activeTorpedo?.id])
  const brahmoTarget  = useMemo(() => resolveTarget(activeBrahmo,  1.0),  [activeBrahmo?.id])

  const addExplosion = (pos, scale) => {
    const id = `ex-${Date.now()}-${Math.random()}`
    setExplosions(prev => [...prev, { id, pos: pos.toArray(), scale }])
  }
  const removeExplosion = id => setExplosions(prev => prev.filter(e => e.id !== id))

  return (
    <group>
      {/* Enemy ships */}
      {contacts.map(c => {
        const p = bearingToWorld(c.bearing, ENEMY_RADIUS)
        p.y = c.type === 'submarine' ? -1.8 : 0.55
        return c.type === 'submarine'
          ? <EnemySubmarineShip key={c.id} position={p} bearing={c.bearing} isTracked={c.tracked} />
          : <EnemyDestroyer     key={c.id} position={p} bearing={c.bearing} isTracked={c.tracked} />
      })}

      {/* Torpedo */}
      {activeTorpedo && torpedoTarget && (
        <TorpedoProjectile
          key={activeTorpedo.id}
          id={activeTorpedo.id}
          targetPos={torpedoTarget}
          onHit={pos => { setActiveTorpedo(null); addExplosion(pos, 1.2) }}
        />
      )}

      {/* BrahMos */}
      {activeBrahmo && brahmoTarget && (
        <BrahmosMissile
          key={activeBrahmo.id}
          id={activeBrahmo.id}
          targetPos={brahmoTarget}
          onHit={pos => { setActiveBrahmo(null); addExplosion(pos, 2.0) }}
        />
      )}

      {/* Explosions */}
      {explosions.map(ex => (
        <Explosion key={ex.id} position={ex.pos} scale={ex.scale} onDone={() => removeExplosion(ex.id)} />
      ))}
    </group>
  )
}
import React, { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, DIVE_PHASES } from '../../stores/gameStore'
import OceanSurfaceShader from './OceanSurfaceShader'

// ─── Device detection ─────────────────────────────────────────────────────────
const IS_QUEST  = /OculusBrowser|Quest/.test(navigator.userAgent)
const IS_MOBILE = /Android|iPhone|iPad/.test(navigator.userAgent)
const IS_LOW    = IS_QUEST || IS_MOBILE

// ─── OCEAN SOUND ENGINE ──────────────────────────────────────────────────────
class OceanSoundEngine {
  constructor() {
    this.ctx = null; this.masterGain = null; this.nodes = {}; this.initialized = false
  }
  init() {
    if (this.initialized) return
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)()
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.setValueAtTime(0.0, this.ctx.currentTime)
      this.masterGain.connect(this.ctx.destination)
      this._buildOceanLayers()
      this.initialized = true
    } catch(e) { console.warn('OceanSoundEngine init failed:', e) }
  }
  _createNoiseBuffer(duration = 3) {
    const sr = this.ctx.sampleRate, frames = sr * duration
    const buf = this.ctx.createBuffer(2, frames, sr)
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c)
      for (let i = 0; i < frames; i++) ch[i] = Math.random() * 2 - 1
    }
    return buf
  }
  _buildOceanLayers() {
    const ctx = this.ctx
    const rumbleNoise = ctx.createBufferSource()
    rumbleNoise.buffer = this._createNoiseBuffer(4); rumbleNoise.loop = true
    const rumbleLow = ctx.createBiquadFilter(); rumbleLow.type = 'lowpass'; rumbleLow.frequency.value = 80; rumbleLow.Q.value = 1.2
    const rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0.55
    rumbleNoise.connect(rumbleLow).connect(rumbleGain).connect(this.masterGain); rumbleNoise.start()
    this.nodes.rumble = { source: rumbleNoise, gain: rumbleGain, filter: rumbleLow }

    const washNoise = ctx.createBufferSource()
    washNoise.buffer = this._createNoiseBuffer(3); washNoise.loop = true
    const washBand = ctx.createBiquadFilter(); washBand.type = 'bandpass'; washBand.frequency.value = 320; washBand.Q.value = 0.5
    const washGain = ctx.createGain(); washGain.gain.value = 0.28
    const washLfo = ctx.createOscillator(); washLfo.frequency.value = 0.18; washLfo.type = 'sine'
    const washLfoGain = ctx.createGain(); washLfoGain.gain.value = 0.18
    washLfo.connect(washLfoGain).connect(washGain.gain); washLfo.start()
    washNoise.connect(washBand).connect(washGain).connect(this.masterGain); washNoise.start()
    this.nodes.wash = { source: washNoise, gain: washGain, lfo: washLfo }

    const foamNoise = ctx.createBufferSource()
    foamNoise.buffer = this._createNoiseBuffer(2); foamNoise.loop = true
    const foamHigh = ctx.createBiquadFilter(); foamHigh.type = 'highpass'; foamHigh.frequency.value = 2400; foamHigh.Q.value = 0.8
    const foamGain = ctx.createGain(); foamGain.gain.value = 0.08
    foamNoise.connect(foamHigh).connect(foamGain).connect(this.masterGain); foamNoise.start()
    this.nodes.foam = { source: foamNoise, gain: foamGain }

    const pressureOsc = ctx.createOscillator(); pressureOsc.type = 'sine'; pressureOsc.frequency.value = 42
    const pressureGain = ctx.createGain(); pressureGain.gain.value = 0.0
    pressureOsc.connect(pressureGain).connect(this.masterGain); pressureOsc.start()
    this.nodes.pressure = { osc: pressureOsc, gain: pressureGain }
  }
  updateForPhase(divePhase, waveIntensity = 1.0) {
    if (!this.initialized || !this.ctx) return
    const t = this.ctx.currentTime
    const p = this.nodes.pressure.gain.gain
    const r = this.nodes.rumble.gain.gain
    const w = this.nodes.wash.gain.gain
    const f = this.nodes.foam.gain.gain
    switch (divePhase) {
      case DIVE_PHASES.HARBOR:          this._ramp(this.masterGain.gain,0.35,t);this._ramp(r,0.22,t);this._ramp(w,0.18,t);this._ramp(f,0.04,t);this._ramp(p,0.0,t);break
      case DIVE_PHASES.SURFACE:         this._ramp(this.masterGain.gain,0.7,t);this._ramp(r,0.5*waveIntensity,t);this._ramp(w,0.38*waveIntensity,t);this._ramp(f,0.12*waveIntensity,t);this._ramp(p,0.0,t);break
      case DIVE_PHASES.PERISCOPE_DEPTH: this._ramp(this.masterGain.gain,0.55,t);this._ramp(r,0.35,t);this._ramp(w,0.22,t);this._ramp(f,0.06,t);this._ramp(p,0.04,t);break
      case DIVE_PHASES.SHALLOW:         this._ramp(this.masterGain.gain,0.5,t);this._ramp(r,0.28,t);this._ramp(w,0.12,t);this._ramp(f,0.03,t);this._ramp(p,0.09,t);break
      case DIVE_PHASES.DEEP:            this._ramp(this.masterGain.gain,0.38,t);this._ramp(r,0.18,t);this._ramp(w,0.04,t);this._ramp(f,0.0,t);this._ramp(p,0.16,t);break
      default:                          this._ramp(this.masterGain.gain,0.28,t);this._ramp(r,0.12,t);this._ramp(w,0.0,t);this._ramp(f,0.0,t);this._ramp(p,0.22,t);break
    }
  }
  _ramp(param, value, t, rampTime = 2.5) {
    try { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(value, t + rampTime) } catch {}
  }
  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume() }
  destroy() { if (this.ctx) this.ctx.close() }
}
const soundEngine = new OceanSoundEngine()

function OceanSound() {
  const divePhase = useGameStore(s => s.divePhase)
  const surfaceWaveIntensity = useGameStore(s => s.surfaceWaveIntensity)
  const initialized = useRef(false)
  useEffect(() => {
    const onInteraction = () => {
      if (initialized.current) return
      soundEngine.init(); soundEngine.updateForPhase(divePhase, surfaceWaveIntensity); initialized.current = true
    }
    window.addEventListener('click', onInteraction, { once: true })
    window.addEventListener('keydown', onInteraction, { once: true })
    return () => { window.removeEventListener('click', onInteraction); window.removeEventListener('keydown', onInteraction) }
  }, [])
  useEffect(() => { if (!initialized.current) return; soundEngine.resume(); soundEngine.updateForPhase(divePhase, surfaceWaveIntensity) }, [divePhase, surfaceWaveIntensity])
  return null
}

// ─── LIGHTING ────────────────────────────────────────────────────────────────
function Sunlight() {
  const divePhase = useGameStore(s => s.divePhase)
  const sunlightIntensity = useGameStore(s => s.sunlightIntensity)
  const ref = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.008
    ref.current.position.set(55 + Math.sin(t) * 8, 85, 28 + Math.cos(t) * 5)
  })
  const intensity = useMemo(() => {
    switch (divePhase) {
      case DIVE_PHASES.HARBOR: return 1.35 * sunlightIntensity
      case DIVE_PHASES.SURFACE: return 1.1 * sunlightIntensity
      case DIVE_PHASES.PERISCOPE_DEPTH: return 0.72 * sunlightIntensity
      case DIVE_PHASES.SHALLOW: return 0.42 * sunlightIntensity
      case DIVE_PHASES.DEEP: return 0.12 * sunlightIntensity
      default: return 0.03 * sunlightIntensity
    }
  }, [divePhase, sunlightIntensity])
  return (
    <group>
      {/* Quest: no castShadow on directional light */}
      <directionalLight ref={ref} position={[55, 85, 28]} intensity={intensity} color="#fff5d8" castShadow={false} />
      <hemisphereLight intensity={0.18 + intensity * 0.32} color="#90d8ff" groundColor="#0d2a3a" />
      <ambientLight intensity={0.09 + intensity * 0.09} color="#b4d6ee" />
    </group>
  )
}

// ─── SKY ─────────────────────────────────────────────────────────────────────
function ProceduralSky() {
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase !== DIVE_PHASES.HARBOR && divePhase !== DIVE_PHASES.SURFACE) return null
  return (
    <group>
      <mesh renderOrder={-10}>
        <sphereGeometry args={[480, IS_LOW ? 16 : 32, IS_LOW ? 16 : 32]} />
        <meshBasicMaterial color="#87c8f5" side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, -60, 0]}>
        <cylinderGeometry args={[470, 490, 180, IS_LOW ? 16 : 32, 1, true]} />
        <meshBasicMaterial color="#c8e8f8" side={THREE.BackSide} transparent opacity={0.75} />
      </mesh>
      <mesh position={[95, 120, -245]}>
        <sphereGeometry args={[18, IS_LOW ? 12 : 32, IS_LOW ? 12 : 32]} />
        <meshBasicMaterial color="#fff8d8" />
      </mesh>
      <pointLight position={[95, 120, -235]} intensity={3.2} color="#ffe3a1" distance={700} />
    </group>
  )
}

function CloudLayer() {
  const divePhase = useGameStore(s => s.divePhase)
  const groupRef = useRef()
  const cloudDefs = useMemo(() => Array.from({ length: IS_LOW ? 8 : 18 }, (_, i) => ({
    id: i,
    cx: (Math.random() - 0.5) * 620,
    cy: 85 + Math.random() * 55,
    cz: -150 - Math.random() * 220,
    puffs: Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => ({
      dx: (Math.random() - 0.5) * 40, dy: (Math.random() - 0.5) * 8, dz: (Math.random() - 0.5) * 20,
      sx: 15 + Math.random() * 28, sy: 7 + Math.random() * 12, sz: 12 + Math.random() * 20,
    })),
    speed: 0.5 + Math.random() * 1.0, baseX: (Math.random() - 0.5) * 620,
  })), [])
  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    groupRef.current.children.forEach((cloudGroup, i) => {
      const cd = cloudDefs[i]
      cloudGroup.position.x = ((cd.baseX + t * cd.speed * 0.35 + 400) % 800) - 400
      cloudGroup.position.y = cd.cy + Math.sin(t * 0.05 + i * 1.3) * 1.2
    })
  })
  if (divePhase !== DIVE_PHASES.HARBOR && divePhase !== DIVE_PHASES.SURFACE) return null
  return (
    <group ref={groupRef}>
      {cloudDefs.map(cd => (
        <group key={cd.id} position={[cd.cx, cd.cy, cd.cz]}>
          {cd.puffs.map((p, pi) => (
            <mesh key={pi} position={[p.dx, p.dy, p.dz]} scale={[p.sx, p.sy, p.sz]}>
              <sphereGeometry args={[1, 6, 6]} />
              <meshBasicMaterial color="#f0f8ff" transparent opacity={0.72} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// ─── WATER SPRAY ─────────────────────────────────────────────────────────────
function WaterSpray() {
  const divePhase = useGameStore(s => s.divePhase)
  const surfaceWaveIntensity = useGameStore(s => s.surfaceWaveIntensity)
  const sprayRef = useRef()
  const count = IS_LOW ? 120 : 280
  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i*3] = (Math.random()-0.5)*200; pos[i*3+1] = Math.random()*3; pos[i*3+2] = (Math.random()-0.5)*200
      vel[i*3] = (Math.random()-0.5)*0.08; vel[i*3+1] = 0.02+Math.random()*0.06; vel[i*3+2] = (Math.random()-0.5)*0.08
    }
    return { positions: pos, velocities: vel }
  }, [count])
  useFrame(() => {
    if (!sprayRef.current) return
    const arr = sprayRef.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      arr[i*3] += velocities[i*3]; arr[i*3+1] += velocities[i*3+1] - 0.018; arr[i*3+2] += velocities[i*3+2]
      if (arr[i*3+1] < -0.5) {
        arr[i*3] = (Math.random()-0.5)*200; arr[i*3+1] = Math.random()*0.5; arr[i*3+2] = (Math.random()-0.5)*200
        velocities[i*3] = (Math.random()-0.5)*0.06*surfaceWaveIntensity
        velocities[i*3+1] = 0.02+Math.random()*0.07*surfaceWaveIntensity
        velocities[i*3+2] = (Math.random()-0.5)*0.06*surfaceWaveIntensity
      }
    }
    sprayRef.current.geometry.attributes.position.needsUpdate = true
  })
  if (divePhase !== DIVE_PHASES.SURFACE) return null
  return (
    <points ref={sprayRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.12} color="#dff8ff" transparent opacity={0.45*surfaceWaveIntensity} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

// ─── HARBOR ──────────────────────────────────────────────────────────────────
function HarborBackdrop() {
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase !== DIVE_PHASES.HARBOR && divePhase !== DIVE_PHASES.SURFACE) return null
  return (
    <group position={[0, 0, -145]}>
      <mesh position={[0, 3, -10]} receiveShadow>
        <boxGeometry args={[320, 24, 60]} />
        <meshStandardMaterial color="#56786a" roughness={1} metalness={0.02} />
      </mesh>
      <mesh position={[0, -2.5, 18]} receiveShadow>
        <boxGeometry args={[280, 8, 14]} />
        <meshStandardMaterial color="#6f767d" roughness={0.95} metalness={0.04} />
      </mesh>
      {[-88,-42,0,44,92].map((x,i) => (
        <mesh key={i} position={[x,1.2,4]} receiveShadow>
          <boxGeometry args={[26,5,22]} />
          <meshStandardMaterial color={i%2===0?'#60717e':'#536774'} roughness={0.92} metalness={0.05} />
        </mesh>
      ))}
      {[[-110,'#d98e5a',18,18,20],[-72,'#5fa8d3',24,20,18],[-30,'#d8b24d',22,16,18],[18,'#77b255',26,22,20],[62,'#c97979',20,18,18],[104,'#7b8bd6',22,20,20]].map(([x,color,w,h,d],i) => (
        <mesh key={i} position={[x,h/2+2,-6-(i%2)*4]}>
          <boxGeometry args={[w,h,d]} />
          <meshStandardMaterial color={color} roughness={0.88} metalness={0.03} />
        </mesh>
      ))}
      {[-108,-62,-16,30,72,118].map((x,i) => (
        <group key={i} position={[x,16,6]}>
          <mesh><boxGeometry args={[1.8,32,1.8]} /><meshStandardMaterial color="#d6a43d" roughness={0.75} metalness={0.2} /></mesh>
          <mesh position={[8,12,0]}><boxGeometry args={[18,1.4,1.4]} /><meshStandardMaterial color="#d6a43d" roughness={0.75} metalness={0.2} /></mesh>
          <pointLight position={[0,15,0]} color="#ffd89a" intensity={0.55} distance={30} />
        </group>
      ))}
    </group>
  )
}

function DistantHills() {
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase !== DIVE_PHASES.HARBOR && divePhase !== DIVE_PHASES.SURFACE) return null
  return (
    <group position={[0,18,-230]}>
      {[-180,-110,-40,45,125].map((x,i) => (
        <mesh key={i} position={[x,0,0]}>
          <coneGeometry args={[50+i*6,60+i*5,4]} />
          <meshStandardMaterial color={i%2===0?'#4f6e60':'#607d68'} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// ─── GOD RAYS ────────────────────────────────────────────────────────────────
function GodRays() {
  const sunlightIntensity = useGameStore(s => s.sunlightIntensity)
  const divePhase = useGameStore(s => s.divePhase)
  const groupRef = useRef()
  const count = IS_LOW ? 6 : 12
  useFrame(({ clock }) => {
    if (!groupRef.current) return
    groupRef.current.children.forEach((ray, i) => {
      ray.material.opacity = (0.008 + Math.sin(clock.elapsedTime * 0.5 + i * 0.8) * 0.004) * sunlightIntensity
    })
  })
  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.DEEP || divePhase === DIVE_PHASES.ABYSS) return null
  return (
    <group ref={groupRef}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[-55+i*10,-10,-30+(i%3)*12]} rotation={[-Math.PI/2.6,0,0.1+i*0.04]}>
          <planeGeometry args={[7,58]} />
          <meshBasicMaterial color="#8fdcff" transparent opacity={0.01*sunlightIntensity} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  )
}

// ─── SUSPENDED PARTICLES ─────────────────────────────────────────────────────
function SuspendedParticles() {
  const pointsRef = useRef()
  const divePhase = useGameStore(s => s.divePhase)
  const count = IS_LOW ? 600 : 1600
  const positions = useMemo(() => {
    const p = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      p[i*3] = (Math.random()-0.5)*280; p[i*3+1] = -Math.random()*95; p[i*3+2] = (Math.random()-0.5)*280
    }
    return p
  }, [count])
  useFrame(({ clock }) => {
    if (!pointsRef.current) return
    const arr = pointsRef.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      arr[i*3+1] += Math.sin(clock.elapsedTime * 0.22 + i) * 0.0014
      arr[i*3]   += Math.cos(clock.elapsedTime * 0.07 + i) * 0.0005
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true
  })
  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.SURFACE) return null
  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.14} color="#8fdcff" transparent opacity={0.2} depthWrite={false} />
    </points>
  )
}

// ─── OCEAN FLOOR ─────────────────────────────────────────────────────────────
function OceanFloor() {
  const divePhase = useGameStore(s => s.divePhase)
  const segs = IS_LOW ? 60 : 140
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(440, 440, segs, segs)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i)
      const h = Math.sin(x*0.035)*1.8 + Math.cos(y*0.028)*1.5 + Math.sin((x+y)*0.018)*2.6 + Math.cos(Math.sqrt(x*x+y*y)*0.02)*1.2
      pos.setZ(i, h)
    }
    geo.computeVertexNormals()
    return geo
  }, [segs])
  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.SURFACE) return null
  return (
    <mesh geometry={geometry} rotation={[-Math.PI/2,0,0]} position={[0,-38,0]} receiveShadow>
      <meshStandardMaterial color="#0e2420" roughness={1} metalness={0.02} />
    </mesh>
  )
}

// ─── CORAL REEF — rich, colorful, varied ──────────────────────────────────────
function CoralReef() {
  const divePhase = useGameStore(s => s.divePhase)
  const groupRef = useRef()

  // Branch coral that sways
  const branchCorals = useMemo(() => Array.from({ length: IS_LOW ? 40 : 90 }, (_, i) => ({
    id: i,
    x: (Math.random()-0.5)*180, z: (Math.random()-0.5)*180,
    h: 1.2 + Math.random()*3.5,
    color: ['#ff6b6b','#ff9f43','#feca57','#ff4757','#ff6348','#ff7f50','#ee5a24','#c0392b','#e74c3c'][Math.floor(Math.random()*9)],
    branches: 3 + Math.floor(Math.random()*5),
    phase: Math.random()*Math.PI*2,
    speed: 0.3 + Math.random()*0.5,
  })), [])

  // Fan/plate coral
  const fanCorals = useMemo(() => Array.from({ length: IS_LOW ? 20 : 45 }, (_, i) => ({
    id: i,
    x: (Math.random()-0.5)*160, z: (Math.random()-0.5)*160,
    w: 1.5 + Math.random()*2.5, h: 1.0 + Math.random()*2.0,
    rotY: Math.random()*Math.PI,
    color: ['#9b59b6','#8e44ad','#6c5ce7','#a29bfe','#fd79a8','#e84393','#d63031'][Math.floor(Math.random()*7)],
    phase: Math.random()*Math.PI*2,
  })), [])

  // Brain/dome coral
  const domeCorals = useMemo(() => Array.from({ length: IS_LOW ? 15 : 35 }, (_, i) => ({
    id: i,
    x: (Math.random()-0.5)*170, z: (Math.random()-0.5)*170,
    r: 0.4 + Math.random()*1.2,
    color: ['#00b894','#00cec9','#0984e3','#74b9ff','#55efc4','#00d2d3','#01a3a4'][Math.floor(Math.random()*7)],
  })), [])

  // Tube/pipe coral
  const tubeCorals = useMemo(() => Array.from({ length: IS_LOW ? 25 : 55 }, (_, i) => ({
    id: i,
    x: (Math.random()-0.5)*175, z: (Math.random()-0.5)*175,
    h: 0.8 + Math.random()*2.2, r: 0.06 + Math.random()*0.12,
    color: ['#fd79a8','#e17055','#fdcb6e','#6c5ce7','#00b894','#0984e3'][Math.floor(Math.random()*6)],
    tiltX: (Math.random()-0.5)*0.4, tiltZ: (Math.random()-0.5)*0.4,
  })), [])

  // Anemones
  const anemones = useMemo(() => Array.from({ length: IS_LOW ? 20 : 50 }, (_, i) => ({
    id: i,
    x: (Math.random()-0.5)*165, z: (Math.random()-0.5)*165,
    tentacles: 8 + Math.floor(Math.random()*8),
    r: 0.3 + Math.random()*0.5,
    color: ['#ff7675','#fd79a8','#fdcb6e','#e17055','#ff6b81','#ffeaa7'][Math.floor(Math.random()*6)],
    phase: Math.random()*Math.PI*2,
    speed: 0.4 + Math.random()*0.6,
  })), [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    // Animate branch corals swaying (children 0..branchCorals.length-1)
    const kids = groupRef.current.children
    branchCorals.forEach((c, i) => {
      if (kids[i]) {
        kids[i].rotation.z = Math.sin(t * c.speed + c.phase) * 0.04
        kids[i].rotation.x = Math.cos(t * c.speed * 0.7 + c.phase) * 0.025
      }
    })
    // Animate anemones
    const offset = branchCorals.length + fanCorals.length + domeCorals.length + tubeCorals.length
    anemones.forEach((a, i) => {
      const kid = kids[offset + i]
      if (kid) {
        kid.rotation.z = Math.sin(t * a.speed + a.phase) * 0.08
      }
    })
  })

  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.SURFACE) return null

  const BASE_Y = -36

  return (
    <group ref={groupRef} position={[0, BASE_Y, 0]}>
      {/* Branch corals */}
      {branchCorals.map(c => (
        <group key={`b${c.id}`} position={[c.x, 0, c.z]}>
          {Array.from({ length: c.branches }, (_, bi) => {
            const angle = (bi / c.branches) * Math.PI * 2
            const lean = 0.15 + bi * 0.05
            return (
              <mesh key={bi} position={[Math.sin(angle)*0.18, c.h/2, Math.cos(angle)*0.18]}
                rotation={[Math.sin(angle)*lean, angle, Math.cos(angle)*lean]}>
                <cylinderGeometry args={[0.025, 0.06, c.h, IS_LOW ? 4 : 6]} />
                <meshStandardMaterial color={c.color} roughness={0.8} metalness={0.05} emissive={c.color} emissiveIntensity={0.12} />
              </mesh>
            )
          })}
          {/* tip bloom */}
          <mesh position={[0, c.h, 0]}>
            <sphereGeometry args={[0.08, IS_LOW ? 4 : 6, IS_LOW ? 4 : 6]} />
            <meshStandardMaterial color={c.color} emissive={c.color} emissiveIntensity={0.5} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Fan / plate corals */}
      {fanCorals.map(c => (
        <mesh key={`f${c.id}`} position={[c.x, c.h/2, c.z]} rotation={[0.1, c.rotY, 0]}>
          <planeGeometry args={[c.w, c.h, IS_LOW ? 4 : 8, IS_LOW ? 4 : 8]} />
          <meshStandardMaterial color={c.color} side={THREE.DoubleSide} transparent opacity={0.82}
            emissive={c.color} emissiveIntensity={0.15} roughness={0.6} depthWrite={false} />
        </mesh>
      ))}

      {/* Brain / dome corals */}
      {domeCorals.map(c => (
        <mesh key={`d${c.id}`} position={[c.x, c.r*0.5, c.z]}>
          <sphereGeometry args={[c.r, IS_LOW ? 8 : 16, IS_LOW ? 6 : 12]} />
          <meshStandardMaterial color={c.color} roughness={0.9} metalness={0.0} emissive={c.color} emissiveIntensity={0.08} />
        </mesh>
      ))}

      {/* Tube / pipe corals */}
      {tubeCorals.map(c => (
        <mesh key={`t${c.id}`} position={[c.x, c.h/2, c.z]} rotation={[c.tiltX, 0, c.tiltZ]}>
          <cylinderGeometry args={[c.r*0.7, c.r, c.h, IS_LOW ? 5 : 8]} />
          <meshStandardMaterial color={c.color} roughness={0.75} emissive={c.color} emissiveIntensity={0.2} />
        </mesh>
      ))}

      {/* Anemones */}
      {anemones.map(a => (
        <group key={`a${a.id}`} position={[a.x, 0, a.z]}>
          {/* base */}
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[a.r*0.5, a.r*0.7, 0.25, IS_LOW ? 6 : 10]} />
            <meshStandardMaterial color={a.color} roughness={0.8} emissive={a.color} emissiveIntensity={0.15} />
          </mesh>
          {/* tentacles */}
          {Array.from({ length: a.tentacles }, (_, ti) => {
            const ang = (ti / a.tentacles) * Math.PI * 2
            const dist = a.r * 0.55
            return (
              <mesh key={ti} position={[Math.cos(ang)*dist*0.5, 0.35, Math.sin(ang)*dist*0.5]}
                rotation={[0.4*Math.cos(ang), ang, 0.4*Math.sin(ang)]}>
                <cylinderGeometry args={[0.015, 0.03, a.r*0.9, 4]} />
                <meshStandardMaterial color={a.color} emissive={a.color} emissiveIntensity={0.3} roughness={0.7} />
              </mesh>
            )
          })}
        </group>
      ))}
    </group>
  )
}

// ─── STARFISH & SEA URCHINS ───────────────────────────────────────────────────
function SeaFloorCreatures() {
  const divePhase = useGameStore(s => s.divePhase)
  const creatures = useMemo(() => Array.from({ length: IS_LOW ? 20 : 45 }, (_, i) => ({
    id: i,
    x: (Math.random()-0.5)*160, z: (Math.random()-0.5)*160,
    type: Math.random() > 0.4 ? 'starfish' : 'urchin',
    color: Math.random() > 0.5 ? '#e74c3c' : Math.random() > 0.5 ? '#e67e22' : '#8e44ad',
    rotY: Math.random()*Math.PI*2, scale: 0.15 + Math.random()*0.25,
  })), [])
  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.SURFACE) return null
  return (
    <group position={[0,-37.5,0]}>
      {creatures.map(c => (
        <group key={c.id} position={[c.x, 0, c.z]} rotation={[0, c.rotY, 0]} scale={c.scale}>
          {c.type === 'starfish' ? (
            // 5 arms
            <>
              {[0,1,2,3,4].map(arm => {
                const a = (arm/5)*Math.PI*2
                return (
                  <mesh key={arm} position={[Math.cos(a)*1.2, 0, Math.sin(a)*1.2]} rotation={[0, a, 0.15]}>
                    <capsuleGeometry args={[0.18, 1.6, 4, 6]} />
                    <meshStandardMaterial color={c.color} roughness={0.9} emissive={c.color} emissiveIntensity={0.1} />
                  </mesh>
                )
              })}
              <mesh><sphereGeometry args={[0.32, 6, 6]} /><meshStandardMaterial color={c.color} roughness={0.9} /></mesh>
            </>
          ) : (
            // urchin = spiky sphere
            <>
              <mesh><sphereGeometry args={[0.45, 8, 8]} /><meshStandardMaterial color="#1a1a2e" roughness={0.9} /></mesh>
              {Array.from({ length: 12 }, (_, si) => {
                const phi = Math.acos(-1 + (2*si)/12), theta = Math.sqrt(12*Math.PI)*phi
                return (
                  <mesh key={si} position={[Math.sin(phi)*Math.cos(theta)*0.55, Math.cos(phi)*0.55, Math.sin(phi)*Math.sin(theta)*0.55]}
                    rotation={[phi, theta, 0]}>
                    <cylinderGeometry args={[0.03, 0.01, 0.55, 4]} />
                    <meshStandardMaterial color={c.color} emissive={c.color} emissiveIntensity={0.2} />
                  </mesh>
                )
              })}
            </>
          )}
        </group>
      ))}
    </group>
  )
}

// ─── KELP FOREST ─────────────────────────────────────────────────────────────
function KelpForest() {
  const divePhase = useGameStore(s => s.divePhase)
  const groupRef = useRef()
  const kelp = useMemo(() => Array.from({ length: IS_LOW ? 30 : 65 }, (_, i) => ({
    x: (Math.random()-0.5)*190, z: (Math.random()-0.5)*190,
    h: 5 + Math.random()*12, s: 0.7 + Math.random()*0.9, id: i,
    phase: Math.random()*Math.PI*2, speed: 0.2+Math.random()*0.4,
    segments: IS_LOW ? 3 : 6,
  })), [])
  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    groupRef.current.children.forEach((k, i) => {
      if (kelp[i]) k.rotation.z = Math.sin(t * kelp[i].speed + kelp[i].phase) * 0.06
    })
  })
  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.SURFACE) return null
  return (
    <group ref={groupRef} position={[0,-33,0]}>
      {kelp.map(k => (
        <group key={k.id} position={[k.x, k.h/2, k.z]}>
          <mesh>
            <cylinderGeometry args={[0.05*k.s, 0.12*k.s, k.h, 5]} />
            <meshStandardMaterial color="#1a5535" roughness={0.95} metalness={0.02} />
          </mesh>
          {/* kelp fronds */}
          {Array.from({ length: 3 }, (_, fi) => (
            <mesh key={fi} position={[(fi-1)*0.12, k.h*0.2 + fi*k.h*0.2, 0]}
              rotation={[0.2+fi*0.15, fi*0.8, 0.1*fi]}>
              <planeGeometry args={[0.18*k.s, k.h*0.28]} />
              <meshStandardMaterial color="#1e6b3d" side={THREE.DoubleSide} roughness={0.9} transparent opacity={0.85} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// ─── FISH — many more species, richer behavior ────────────────────────────────
const FISH_COLORS = [
  ['#ff9f43','#ee5a24'],   // orange clownfish
  ['#74b9ff','#0984e3'],   // blue tang
  ['#55efc4','#00b894'],   // green wrasse
  ['#ffeaa7','#fdcb6e'],   // yellow tang
  ['#fd79a8','#e84393'],   // pink fish
  ['#a29bfe','#6c5ce7'],   // purple anthias
  ['#dfe6e9','#b2bec3'],   // silver snapper
  ['#ff7675','#d63031'],   // red grouper
  ['#81ecec','#00cec9'],   // teal parrotfish
]

function FishSchool({ index, count, orbitRadius, orbitY, color, accentColor, speed, fishSize }) {
  const groupRef = useRef()
  const fish = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    phase: (i / count) * Math.PI * 2 + Math.random() * 0.5,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 1.5 + Math.random(),
    spread: { x: (Math.random()-0.5)*2, y: (Math.random()-0.5)*1, z: (Math.random()-0.5)*2 },
  })), [count])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    groupRef.current.children.forEach((child, i) => {
      if (!fish[i]) return
      const f = fish[i]
      const a = t * speed + f.phase
      const spread = orbitRadius * 0.18
      child.position.set(
        Math.cos(a) * orbitRadius + f.spread.x * spread,
        orbitY + Math.sin(a * 2) * 0.8 + f.spread.y,
        Math.sin(a) * orbitRadius + f.spread.z * spread
      )
      child.rotation.y = -a + Math.PI / 2
      // tail waggle
      child.children[1] && (child.children[1].rotation.y = Math.sin(t * f.wobbleSpeed * 4 + f.wobble) * 0.3)
    })
  })

  return (
    <group ref={groupRef}>
      {fish.map(f => (
        <group key={f.id}>
          {/* body */}
          <mesh>
            <capsuleGeometry args={[fishSize*0.28, fishSize*0.7, 3, 6]} />
            <meshStandardMaterial color={color} roughness={0.5} metalness={0.12} />
          </mesh>
          {/* tail */}
          <mesh position={[-fishSize*0.55, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
            <coneGeometry args={[fishSize*0.22, fishSize*0.38, 4]} />
            <meshStandardMaterial color={accentColor} roughness={0.5} metalness={0.08} />
          </mesh>
          {/* dorsal fin */}
          <mesh position={[0, fishSize*0.28, 0]} rotation={[0, 0, 0.2]}>
            <coneGeometry args={[fishSize*0.1, fishSize*0.3, 3]} />
            <meshStandardMaterial color={accentColor} roughness={0.6} transparent opacity={0.8} />
          </mesh>
          {/* eye */}
          <mesh position={[fishSize*0.32, fishSize*0.05, fishSize*0.14]}>
            <sphereGeometry args={[fishSize*0.07, 5, 5]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function FishPopulation() {
  const divePhase = useGameStore(s => s.divePhase)
  const schools = useMemo(() => [
    { count: IS_LOW?8:18, orbitRadius: 14, orbitY: -8,  colors: FISH_COLORS[0], speed: 0.38, size: 0.38, center: [12,0,-8]  },
    { count: IS_LOW?6:14, orbitRadius: 10, orbitY: -14, colors: FISH_COLORS[1], speed: 0.42, size: 0.32, center: [-18,0,14] },
    { count: IS_LOW?5:12, orbitRadius: 8,  orbitY: -5,  colors: FISH_COLORS[2], speed: 0.55, size: 0.28, center: [8,0,20]  },
    { count: IS_LOW?6:14, orbitRadius: 12, orbitY: -18, colors: FISH_COLORS[3], speed: 0.36, size: 0.35, center: [-8,0,-15] },
    { count: IS_LOW?4:10, orbitRadius: 9,  orbitY: -10, colors: FISH_COLORS[4], speed: 0.48, size: 0.25, center: [22,0,5]  },
    { count: IS_LOW?5:12, orbitRadius: 11, orbitY: -12, colors: FISH_COLORS[5], speed: 0.44, size: 0.3,  center: [-22,0,-6] },
    { count: IS_LOW?4:10, orbitRadius: 7,  orbitY: -7,  colors: FISH_COLORS[6], speed: 0.52, size: 0.42, center: [0,0,18]  },
    { count: IS_LOW?3:8,  orbitRadius: 6,  orbitY: -20, colors: FISH_COLORS[7], speed: 0.35, size: 0.48, center: [-14,0,8]  },
    { count: IS_LOW?4:10, orbitRadius: 13, orbitY: -6,  colors: FISH_COLORS[8], speed: 0.46, size: 0.34, center: [16,0,-18] },
  ], [])
  if (divePhase === DIVE_PHASES.HARBOR) return null
  return (
    <>
      {schools.map((s, i) => (
        <group key={i} position={s.center}>
          <FishSchool
            index={i} count={s.count} orbitRadius={s.orbitRadius} orbitY={s.orbitY}
            color={s.colors[0]} accentColor={s.colors[1]} speed={s.speed} fishSize={s.size}
          />
        </group>
      ))}
    </>
  )
}

// ─── SHARKS ──────────────────────────────────────────────────────────────────
function Shark({ startAngle, orbitR, y, speed }) {
  const ref = useRef()
  const tailRef = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    const a = t * speed + startAngle
    ref.current.position.set(Math.cos(a)*orbitR, y, Math.sin(a)*orbitR)
    ref.current.rotation.y = -a + Math.PI/2
    if (tailRef.current) tailRef.current.rotation.y = Math.sin(t*speed*8)*0.25
  })
  return (
    <group ref={ref}>
      {/* body */}
      <mesh><capsuleGeometry args={[0.42, 2.8, 4, 8]} /><meshStandardMaterial color="#607d8b" roughness={0.6} metalness={0.15} /></mesh>
      {/* tail */}
      <group ref={tailRef} position={[-1.7, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI/4]}><coneGeometry args={[0.35, 0.9, 4]} /><meshStandardMaterial color="#546e7a" roughness={0.6} /></mesh>
        <mesh rotation={[0, 0, -Math.PI/4]}><coneGeometry args={[0.22, 0.7, 4]} /><meshStandardMaterial color="#546e7a" roughness={0.6} /></mesh>
      </group>
      {/* dorsal fin */}
      <mesh position={[0.3, 0.55, 0]} rotation={[0, 0, 0.15]}><coneGeometry args={[0.18, 0.65, 3]} /><meshStandardMaterial color="#546e7a" roughness={0.6} /></mesh>
      {/* pectoral fins */}
      {[-1,1].map((side, si) => (
        <mesh key={si} position={[0.1, -0.1, side*0.52]} rotation={[0, side*0.3, side*0.5]}>
          <coneGeometry args={[0.12, 0.55, 3]} /><meshStandardMaterial color="#607d8b" roughness={0.6} />
        </mesh>
      ))}
      {/* eye */}
      <mesh position={[1.1, 0.12, 0.28]}><sphereGeometry args={[0.07, 6, 6]} /><meshStandardMaterial color="#111" /></mesh>
      {/* belly */}
      <mesh position={[0, -0.28, 0]}><capsuleGeometry args={[0.35, 2.2, 3, 6]} /><meshStandardMaterial color="#eceff1" roughness={0.7} /></mesh>
    </group>
  )
}

function SharkPatrol() {
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase !== DIVE_PHASES.DEEP && divePhase !== DIVE_PHASES.ABYSS && divePhase !== DIVE_PHASES.SHALLOW) return null
  return (
    <group>
      <Shark startAngle={0}           orbitR={55} y={-22} speed={0.07} />
      <Shark startAngle={Math.PI}     orbitR={42} y={-28} speed={0.055} />
      <Shark startAngle={Math.PI/2}   orbitR={68} y={-18} speed={0.065} />
    </group>
  )
}

// ─── MANTA RAY ────────────────────────────────────────────────────────────────
function MantaRay() {
  const ref = useRef()
  const wingL = useRef(), wingR = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.12
    ref.current.position.set(Math.cos(t)*60, -15 + Math.sin(t*0.5)*4, Math.sin(t)*60)
    ref.current.rotation.y = -t + Math.PI/2
    ref.current.rotation.x = Math.sin(t*3)*0.04
    const flap = Math.sin(clock.elapsedTime*1.2)*0.22
    if (wingL.current) wingL.current.rotation.z = -flap
    if (wingR.current) wingR.current.rotation.z = flap
  })
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.SURFACE) return null
  return (
    <group ref={ref}>
      {/* body */}
      <mesh><capsuleGeometry args={[0.55, 1.2, 4, 8]} /><meshStandardMaterial color="#263238" roughness={0.7} metalness={0.1} /></mesh>
      {/* left wing */}
      <group ref={wingL} position={[0, 0, 0.8]}>
        <mesh position={[0, 0, 2.2]} rotation={[0.05, -0.05, 0]}>
          <boxGeometry args={[1.8, 0.08, 3.8]} />
          <meshStandardMaterial color="#263238" roughness={0.7} metalness={0.1} />
        </mesh>
      </group>
      {/* right wing */}
      <group ref={wingR} position={[0, 0, -0.8]}>
        <mesh position={[0, 0, -2.2]} rotation={[0.05, 0.05, 0]}>
          <boxGeometry args={[1.8, 0.08, 3.8]} />
          <meshStandardMaterial color="#263238" roughness={0.7} metalness={0.1} />
        </mesh>
      </group>
      {/* tail */}
      <mesh position={[-1.2, 0, 0]} rotation={[0, 0, 0.1]}><cylinderGeometry args={[0.08, 0.02, 2.2, 6]} /><meshStandardMaterial color="#37474f" roughness={0.8} /></mesh>
      {/* belly spots */}
      <mesh position={[0.2, -0.3, 0.2]}><sphereGeometry args={[0.15, 6, 6]} /><meshStandardMaterial color="#eceff1" roughness={0.8} /></mesh>
    </group>
  )
}

// ─── TURTLE ───────────────────────────────────────────────────────────────────
function SeaTurtle() {
  const ref = useRef()
  const flippers = [useRef(), useRef(), useRef(), useRef()]
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.08
    ref.current.position.set(Math.cos(t*1.3+1)*35, -10+Math.sin(t*0.7)*3, Math.sin(t*1.3+1)*35)
    ref.current.rotation.y = -t*1.3 + Math.PI/2 + 1
    const fp = Math.sin(clock.elapsedTime*1.5)*0.3
    if (flippers[0].current) flippers[0].current.rotation.z = fp
    if (flippers[1].current) flippers[1].current.rotation.z = -fp
    if (flippers[2].current) flippers[2].current.rotation.z = -fp*0.7
    if (flippers[3].current) flippers[3].current.rotation.z = fp*0.7
  })
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.ABYSS) return null
  return (
    <group ref={ref}>
      {/* shell */}
      <mesh><sphereGeometry args={[0.7, IS_LOW?8:14, IS_LOW?6:10]} /><meshStandardMaterial color="#33691e" roughness={0.9} /></mesh>
      {/* shell pattern */}
      <mesh><sphereGeometry args={[0.72, IS_LOW?6:10, IS_LOW?5:8]} /><meshStandardMaterial color="#558b2f" roughness={0.9} transparent opacity={0.4} wireframe /></mesh>
      {/* head */}
      <mesh position={[0.75, 0.1, 0]}><sphereGeometry args={[0.25, 7, 7]} /><meshStandardMaterial color="#4a6741" roughness={0.85} /></mesh>
      {/* front flippers */}
      <group ref={flippers[0]} position={[0.1, -0.1, 0.72]}>
        <mesh position={[0, 0, 0.45]} rotation={[0.2, -0.1, 0]}><capsuleGeometry args={[0.1, 0.8, 3, 6]} /><meshStandardMaterial color="#4a6741" roughness={0.85} /></mesh>
      </group>
      <group ref={flippers[1]} position={[0.1, -0.1, -0.72]}>
        <mesh position={[0, 0, -0.45]} rotation={[0.2, 0.1, 0]}><capsuleGeometry args={[0.1, 0.8, 3, 6]} /><meshStandardMaterial color="#4a6741" roughness={0.85} /></mesh>
      </group>
      {/* rear flippers */}
      <group ref={flippers[2]} position={[-0.5, -0.1, 0.6]}>
        <mesh position={[0, 0, 0.35]} rotation={[0.1, -0.2, 0]}><capsuleGeometry args={[0.08, 0.6, 3, 5]} /><meshStandardMaterial color="#4a6741" roughness={0.85} /></mesh>
      </group>
      <group ref={flippers[3]} position={[-0.5, -0.1, -0.6]}>
        <mesh position={[0, 0, -0.35]} rotation={[0.1, 0.2, 0]}><capsuleGeometry args={[0.08, 0.6, 3, 5]} /><meshStandardMaterial color="#4a6741" roughness={0.85} /></mesh>
      </group>
    </group>
  )
}

// ─── JELLYFISH ────────────────────────────────────────────────────────────────
function Jellyfish({ x, z, y, color, speed, phase }) {
  const ref = useRef()
  const bellRef = useRef()
  useFrame(({ clock }) => {
    if (!ref.current || !bellRef.current) return
    const t = clock.elapsedTime
    ref.current.position.y = y + Math.sin(t * speed + phase) * 1.5
    const pulse = 1 + Math.sin(t * speed * 2 + phase) * 0.08
    bellRef.current.scale.set(pulse, 1/pulse, pulse)
  })
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.SURFACE) return null
  return (
    <group ref={ref} position={[x, y, z]}>
      {/* bell */}
      <group ref={bellRef}>
        <mesh>
          <sphereGeometry args={[0.5, IS_LOW?8:14, IS_LOW?6:10, 0, Math.PI*2, 0, Math.PI/2]} />
          <meshStandardMaterial color={color} transparent opacity={0.55} roughness={0.2} emissive={color} emissiveIntensity={0.3} depthWrite={false} />
        </mesh>
      </group>
      {/* tentacles */}
      {Array.from({ length: IS_LOW ? 4 : 8 }, (_, i) => {
        const a = (i / (IS_LOW ? 4 : 8)) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a)*0.25, -0.5, Math.sin(a)*0.25]}>
            <cylinderGeometry args={[0.015, 0.005, 1.8+Math.random()*1.2, 3]} />
            <meshStandardMaterial color={color} transparent opacity={0.4} emissive={color} emissiveIntensity={0.2} depthWrite={false} />
          </mesh>
        )
      })}
    </group>
  )
}

function JellyfishSwarm() {
  const jellies = useMemo(() => Array.from({ length: IS_LOW ? 8 : 20 }, (_, i) => ({
    id: i,
    x: (Math.random()-0.5)*100, z: (Math.random()-0.5)*100,
    y: -8 - Math.random()*20,
    color: ['#ee82ee','#da70d6','#ff69b4','#87ceeb','#40e0d0','#7fffd4','#e0b0ff'][i%7],
    speed: 0.25 + Math.random()*0.3,
    phase: Math.random()*Math.PI*2,
  })), [])
  return (
    <>
      {jellies.map(j => <Jellyfish key={j.id} {...j} />)}
    </>
  )
}

// ─── WHALE (deep only) ────────────────────────────────────────────────────────
function Whale() {
  const ref = useRef()
  const tailRef = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.04
    ref.current.position.set(Math.cos(t)*120, -35+Math.sin(t*0.4)*5, Math.sin(t)*120)
    ref.current.rotation.y = -t + Math.PI/2
    if (tailRef.current) tailRef.current.rotation.z = Math.sin(clock.elapsedTime*0.6)*0.2
  })
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase !== DIVE_PHASES.DEEP && divePhase !== DIVE_PHASES.ABYSS) return null
  return (
    <group ref={ref}>
      <mesh><capsuleGeometry args={[3.5, 18, 6, 12]} /><meshStandardMaterial color="#263238" roughness={0.8} metalness={0.05} /></mesh>
      <group ref={tailRef} position={[-11, 0, 0]}>
        <mesh rotation={[0,0,Math.PI/5]}><coneGeometry args={[2.2, 5.5, 5]} /><meshStandardMaterial color="#1c2a30" roughness={0.8} /></mesh>
        <mesh rotation={[0,0,-Math.PI/5]}><coneGeometry args={[1.6, 4.5, 5]} /><meshStandardMaterial color="#1c2a30" roughness={0.8} /></mesh>
      </group>
      {/* pectoral fins */}
      {[-1,1].map((s,si) => (
        <mesh key={si} position={[2, -1, s*4.5]} rotation={[0, s*0.2, s*0.45]}>
          <capsuleGeometry args={[0.6, 4.5, 3, 6]} /><meshStandardMaterial color="#1c2a30" roughness={0.8} />
        </mesh>
      ))}
      {/* white belly */}
      <mesh position={[0,-2.5,0]}><capsuleGeometry args={[2.2, 14, 4, 8]} /><meshStandardMaterial color="#b0bec5" roughness={0.85} /></mesh>
      {/* eye */}
      <mesh position={[7, 1.5, 2.8]}><sphereGeometry args={[0.3, 7, 7]} /><meshStandardMaterial color="#111" /></mesh>
      {/* blowhole glow */}
      <pointLight position={[8, 4, 0]} color="#88ccff" intensity={0.4} distance={15} />
    </group>
  )
}

// ─── THERMAL VENTS & BUBBLES ─────────────────────────────────────────────────
function ThermalVents() {
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.SURFACE) return null
  return (
    <group position={[-55,-35,42]}>
      <mesh><coneGeometry args={[3.2,10,8]} /><meshStandardMaterial color="#2a2a28" roughness={1} /></mesh>
      <mesh position={[0,6.5,0]}><cylinderGeometry args={[0.35,0.6,8,8]} /><meshStandardMaterial color="#3a3a34" roughness={1} /></mesh>
      <pointLight position={[0,8,0]} color="#ff8c42" intensity={0.9} distance={20} />
    </group>
  )
}

function BubbleColumns() {
  const divePhase = useGameStore(s => s.divePhase)
  const groupRef = useRef()
  const bubbleGroups = useMemo(() => Array.from({ length: IS_LOW ? 3 : 6 }, (_, i) => ({
    id: i, x: -80+i*28, z: -30+(i%2)*25,
  })), [])
  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    groupRef.current.children.forEach((bg, bi) => {
      bg.children.forEach((bubble, i) => {
        bubble.position.y = ((i * 1.2 + t * (0.8 + bi * 0.1)) % 22) - 1
      })
    })
  })
  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.SURFACE) return null
  return (
    <group ref={groupRef}>
      {bubbleGroups.map(g => (
        <group key={g.id} position={[g.x,-34,g.z]}>
          {Array.from({ length: IS_LOW ? 10 : 18 }, (_, i) => (
            <mesh key={i} position={[Math.sin(i)*0.45, i*1.2, Math.cos(i)*0.45]}>
              <sphereGeometry args={[0.07+(i%3)*0.025, 5, 5]} />
              <meshBasicMaterial color="#c8f0ff" transparent opacity={0.22} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// ─── FOG CONTROLLER ───────────────────────────────────────────────────────────
function SceneFogController() {
  const { scene } = useThree()
  const divePhase = useGameStore(s => s.divePhase)
  useFrame(() => {
    let color = '#0a3b5c', near = 18, far = 120
    switch (divePhase) {
      case DIVE_PHASES.HARBOR:          color='#8bbfdf'; near=130; far=400; break
      case DIVE_PHASES.SURFACE:         color='#79b2d8'; near=100; far=340; break
      case DIVE_PHASES.PERISCOPE_DEPTH: color='#256b8a'; near=30;  far=160; break
      case DIVE_PHASES.SHALLOW:         color='#114d68'; near=22;  far=105; break
      case DIVE_PHASES.DEEP:            color='#06263e'; near=12;  far=65;  break
      default:                          color='#03121f'; near=8;   far=38;  break
    }
    scene.fog = new THREE.Fog(color, near, far)
    scene.background = new THREE.Color(color)
  })
  return null
}

// ─── SURFACE GLOW ────────────────────────────────────────────────────────────
function SurfaceGlow() {
  const sunlight = useGameStore(s => s.sunlightIntensity)
  const divePhase = useGameStore(s => s.divePhase)
  const meshRef = useRef()
  useFrame(({ clock }) => {
    if (!meshRef.current) return
    meshRef.current.material.opacity = (divePhase===DIVE_PHASES.HARBOR?0.012:0.018) + Math.sin(clock.elapsedTime*0.4)*0.004
  })
  if (sunlight < 0.2 || divePhase === DIVE_PHASES.ABYSS || divePhase === DIVE_PHASES.DEEP) return null
  return (
    <mesh ref={meshRef} position={[0,0.04,0]} rotation={[-Math.PI/2,0,0]}>
      <planeGeometry args={[560,560,1,1]} />
      <meshBasicMaterial color="#cbefff" transparent opacity={0.015} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  )
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export default function UnderwaterEnvironment() {
  return (
    <group>
      <SceneFogController />
      <OceanSound />
      <ProceduralSky />
      <CloudLayer />
      <DistantHills />
      <Sunlight />
      <OceanSurfaceShader />
      <SurfaceGlow />
      <WaterSpray />
      <HarborBackdrop />
      <GodRays />
      <SuspendedParticles />
      <OceanFloor />
      <CoralReef />
      <SeaFloorCreatures />
      <KelpForest />
      <FishPopulation />
      <JellyfishSwarm />
      <SharkPatrol />
      <MantaRay />
      <SeaTurtle />
      <Whale />
      <ThermalVents />
      <BubbleColumns />
    </group>
  )
}
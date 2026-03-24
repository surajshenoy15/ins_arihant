import React, { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, DIVE_PHASES } from '../../stores/gameStore'
import OceanSurfaceShader from './OceanSurfaceShader'

// ─── OCEAN SOUND ENGINE ──────────────────────────────────────────────────────
// Synthesizes realistic ocean sounds using Web Audio API — no audio files needed

class OceanSoundEngine {
  constructor() {
    this.ctx = null
    this.masterGain = null
    this.nodes = {}
    this.initialized = false
  }

  init() {
    if (this.initialized) return
    this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.setValueAtTime(0.0, this.ctx.currentTime)
    this.masterGain.connect(this.ctx.destination)
    this._buildOceanLayers()
    this.initialized = true
  }

  _createNoiseBuffer(duration = 3) {
    const sr     = this.ctx.sampleRate
    const frames = sr * duration
    const buf    = this.ctx.createBuffer(2, frames, sr)
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c)
      for (let i = 0; i < frames; i++) ch[i] = Math.random() * 2 - 1
    }
    return buf
  }

  _buildOceanLayers() {
    const ctx = this.ctx

    // 1. Deep rumble — low sub-bass roll
    const rumbleNoise = ctx.createBufferSource()
    rumbleNoise.buffer = this._createNoiseBuffer(4)
    rumbleNoise.loop = true
    const rumbleLow = ctx.createBiquadFilter()
    rumbleLow.type = 'lowpass'
    rumbleLow.frequency.value = 80
    rumbleLow.Q.value = 1.2
    const rumbleGain = ctx.createGain()
    rumbleGain.gain.value = 0.55
    rumbleNoise.connect(rumbleLow).connect(rumbleGain).connect(this.masterGain)
    rumbleNoise.start()
    this.nodes.rumble = { source: rumbleNoise, gain: rumbleGain, filter: rumbleLow }

    // 2. Wave wash — mid-frequency swooshing
    const washNoise = ctx.createBufferSource()
    washNoise.buffer = this._createNoiseBuffer(3)
    washNoise.loop = true
    const washBand = ctx.createBiquadFilter()
    washBand.type = 'bandpass'
    washBand.frequency.value = 320
    washBand.Q.value = 0.5
    const washGain = ctx.createGain()
    washGain.gain.value = 0.28

    // LFO modulates the wash — gives rhythmic wave feel
    const washLfo = ctx.createOscillator()
    washLfo.frequency.value = 0.18  // ~1 wave per 5-6s
    washLfo.type = 'sine'
    const washLfoGain = ctx.createGain()
    washLfoGain.gain.value = 0.18
    washLfo.connect(washLfoGain).connect(washGain.gain)
    washLfo.start()

    washNoise.connect(washBand).connect(washGain).connect(this.masterGain)
    washNoise.start()
    this.nodes.wash = { source: washNoise, gain: washGain, lfo: washLfo }

    // 3. Foam / spray — high freq hiss
    const foamNoise = ctx.createBufferSource()
    foamNoise.buffer = this._createNoiseBuffer(2)
    foamNoise.loop = true
    const foamHigh = ctx.createBiquadFilter()
    foamHigh.type = 'highpass'
    foamHigh.frequency.value = 2400
    foamHigh.Q.value = 0.8
    const foamGain = ctx.createGain()
    foamGain.gain.value = 0.08

    // Foam LFO — faster, cresting rhythms
    const foamLfo = ctx.createOscillator()
    foamLfo.frequency.value = 0.22
    foamLfo.type = 'sine'
    const foamLfoGain = ctx.createGain()
    foamLfoGain.gain.value = 0.07
    foamLfo.connect(foamLfoGain).connect(foamGain.gain)
    foamLfo.start()

    foamNoise.connect(foamHigh).connect(foamGain).connect(this.masterGain)
    foamNoise.start()
    this.nodes.foam = { source: foamNoise, gain: foamGain, lfo: foamLfo }

    // 4. Underwater pressure hum (for submerged phases)
    const pressureOsc = ctx.createOscillator()
    pressureOsc.type = 'sine'
    pressureOsc.frequency.value = 42
    const pressureGain = ctx.createGain()
    pressureGain.gain.value = 0.0
    pressureOsc.connect(pressureGain).connect(this.masterGain)
    pressureOsc.start()
    this.nodes.pressure = { osc: pressureOsc, gain: pressureGain }

    // 5. Bubbles — random pops (simulated via brief band-filtered bursts)
    this._scheduleBubbles()
  }

  _scheduleBubbles() {
    if (!this.ctx || !this.initialized) return
    const delay = 0.8 + Math.random() * 2.5
    const freq  = 600 + Math.random() * 800

    const osc  = this.ctx.createOscillator()
    const env  = this.ctx.createGain()
    const filt = this.ctx.createBiquadFilter()

    osc.type = 'sine'
    osc.frequency.value = freq
    filt.type = 'bandpass'
    filt.frequency.value = freq
    filt.Q.value = 8

    const t = this.ctx.currentTime + delay
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(this.nodes.bubbleVolume || 0.0, t + 0.01)
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)

    osc.connect(filt).connect(env).connect(this.masterGain)
    osc.start(t)
    osc.stop(t + 0.15)

    setTimeout(() => this._scheduleBubbles(), delay * 800)
  }

  updateForPhase(divePhase, waveIntensity = 1.0) {
    if (!this.initialized || !this.ctx) return
    const t = this.ctx.currentTime

    switch (divePhase) {
      case DIVE_PHASES.HARBOR:
        this._ramp(this.masterGain.gain,     0.35, t)
        this._ramp(this.nodes.rumble.gain.gain, 0.22, t)
        this._ramp(this.nodes.wash.gain.gain,   0.18, t)
        this._ramp(this.nodes.foam.gain.gain,   0.04, t)
        this._ramp(this.nodes.pressure.gain.gain, 0.0, t)
        this.nodes.bubbleVolume = 0.0
        break
      case DIVE_PHASES.SURFACE:
        this._ramp(this.masterGain.gain,     0.7, t)
        this._ramp(this.nodes.rumble.gain.gain, 0.5 * waveIntensity, t)
        this._ramp(this.nodes.wash.gain.gain,   0.38 * waveIntensity, t)
        this._ramp(this.nodes.foam.gain.gain,   0.12 * waveIntensity, t)
        this._ramp(this.nodes.pressure.gain.gain, 0.0, t)
        // Wave LFO speed driven by intensity
        this.nodes.wash.lfo.frequency.setValueAtTime(0.15 + waveIntensity * 0.12, t)
        this.nodes.bubbleVolume = 0.02 * waveIntensity
        break
      case DIVE_PHASES.PERISCOPE_DEPTH:
        this._ramp(this.masterGain.gain,     0.55, t)
        this._ramp(this.nodes.rumble.gain.gain, 0.35, t)
        this._ramp(this.nodes.wash.gain.gain,   0.22, t)
        this._ramp(this.nodes.foam.gain.gain,   0.06, t)
        this._ramp(this.nodes.pressure.gain.gain, 0.04, t)
        this.nodes.bubbleVolume = 0.04
        break
      case DIVE_PHASES.SHALLOW:
        this._ramp(this.masterGain.gain,     0.5, t)
        this._ramp(this.nodes.rumble.gain.gain, 0.28, t)
        this._ramp(this.nodes.wash.gain.gain,   0.12, t)
        this._ramp(this.nodes.foam.gain.gain,   0.03, t)
        this._ramp(this.nodes.pressure.gain.gain, 0.09, t)
        this.nodes.bubbleVolume = 0.06
        break
      case DIVE_PHASES.DEEP:
        this._ramp(this.masterGain.gain,     0.38, t)
        this._ramp(this.nodes.rumble.gain.gain, 0.18, t)
        this._ramp(this.nodes.wash.gain.gain,   0.04, t)
        this._ramp(this.nodes.foam.gain.gain,   0.0, t)
        this._ramp(this.nodes.pressure.gain.gain, 0.16, t)
        this.nodes.bubbleVolume = 0.08
        break
      case DIVE_PHASES.ABYSS:
      default:
        this._ramp(this.masterGain.gain,     0.28, t)
        this._ramp(this.nodes.rumble.gain.gain, 0.12, t)
        this._ramp(this.nodes.wash.gain.gain,   0.0, t)
        this._ramp(this.nodes.foam.gain.gain,   0.0, t)
        this._ramp(this.nodes.pressure.gain.gain, 0.22, t)
        this.nodes.bubbleVolume = 0.03
        break
    }
  }

  _ramp(param, value, t, rampTime = 2.5) {
    try {
      param.cancelScheduledValues(t)
      param.setValueAtTime(param.value, t)
      param.linearRampToValueAtTime(value, t + rampTime)
    } catch {}
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume()
  }

  destroy() {
    if (this.ctx) this.ctx.close()
  }
}

const soundEngine = new OceanSoundEngine()

// ─── SOUND MANAGER COMPONENT ─────────────────────────────────────────────────

function OceanSound() {
  const divePhase           = useGameStore(s => s.divePhase)
  const surfaceWaveIntensity = useGameStore(s => s.surfaceWaveIntensity)
  const initialized          = useRef(false)

  useEffect(() => {
    const onInteraction = () => {
      if (initialized.current) return
      soundEngine.init()
      soundEngine.updateForPhase(divePhase, surfaceWaveIntensity)
      initialized.current = true
    }
    window.addEventListener('click', onInteraction, { once: true })
    window.addEventListener('keydown', onInteraction, { once: true })
    return () => {
      window.removeEventListener('click', onInteraction)
      window.removeEventListener('keydown', onInteraction)
    }
  }, [])

  useEffect(() => {
    if (!initialized.current) return
    soundEngine.resume()
    soundEngine.updateForPhase(divePhase, surfaceWaveIntensity)
  }, [divePhase, surfaceWaveIntensity])

  return null
}

// ─── LIGHTING ────────────────────────────────────────────────────────────────

function Sunlight() {
  const divePhase        = useGameStore(s => s.divePhase)
  const sunlightIntensity = useGameStore(s => s.sunlightIntensity)
  const ref              = useRef()

  useFrame(({ clock }) => {
    if (!ref.current) return
    // Gently animate sun position (slow arc)
    const t = clock.elapsedTime * 0.008
    ref.current.position.set(
      55 + Math.sin(t) * 8,
      85,
      28 + Math.cos(t) * 5
    )
  })

  const intensity = useMemo(() => {
    switch (divePhase) {
      case DIVE_PHASES.HARBOR:          return 1.35 * sunlightIntensity
      case DIVE_PHASES.SURFACE:         return 1.1 * sunlightIntensity
      case DIVE_PHASES.PERISCOPE_DEPTH: return 0.72 * sunlightIntensity
      case DIVE_PHASES.SHALLOW:         return 0.42 * sunlightIntensity
      case DIVE_PHASES.DEEP:            return 0.12 * sunlightIntensity
      default:                          return 0.03 * sunlightIntensity
    }
  }, [divePhase, sunlightIntensity])

  return (
    <group>
      <directionalLight
        ref={ref}
        position={[55, 85, 28]}
        intensity={intensity}
        color="#fff5d8"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={400}
        shadow-camera-near={0.5}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
      />
      <hemisphereLight
        intensity={0.18 + intensity * 0.32}
        color="#90d8ff"
        groundColor="#0d2a3a"
      />
      <ambientLight intensity={0.09 + intensity * 0.09} color="#b4d6ee" />
    </group>
  )
}

// ─── PROCEDURAL SKY ──────────────────────────────────────────────────────────

function ProceduralSky() {
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase !== DIVE_PHASES.HARBOR && divePhase !== DIVE_PHASES.SURFACE) return null

  return (
    <group>
      {/* Sky dome — gradient from zenith to horizon */}
      <mesh position={[0, 0, 0]} renderOrder={-10}>
        <sphereGeometry args={[480, 32, 32]} />
        <meshBasicMaterial color="#87c8f5" side={THREE.BackSide} />
      </mesh>

      {/* Horizon band — lighter, misty */}
      <mesh position={[0, -60, 0]}>
        <cylinderGeometry args={[470, 490, 180, 32, 1, true]} />
        <meshBasicMaterial color="#c8e8f8" side={THREE.BackSide} transparent opacity={0.75} />
      </mesh>

      {/* Sun disc */}
      <mesh position={[95, 120, -245]}>
        <sphereGeometry args={[18, 32, 32]} />
        <meshBasicMaterial color="#fff8d8" />
      </mesh>
      {/* Sun corona glow */}
      <mesh position={[95, 120, -244]}>
        <sphereGeometry args={[28, 24, 24]} />
        <meshBasicMaterial color="#ffe88a" transparent opacity={0.18} />
      </mesh>
      <pointLight position={[95, 120, -235]} intensity={3.2} color="#ffe3a1" distance={700} />

      {/* Atmospheric horizon glow */}
      <mesh position={[0, 8, -260]}>
        <planeGeometry args={[1100, 120]} />
        <meshBasicMaterial color="#d8f0ff" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  )
}

// ─── ANIMATED CLOUDS ─────────────────────────────────────────────────────────

function AnimatedClouds() {
  const divePhase  = useGameStore(s => s.divePhase)
  const cloudsRef  = useRef()

  const clouds = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 700,
    y: 80 + Math.random() * 60,
    z: -120 - Math.random() * 200,
    sx: 28 + Math.random() * 55,
    sy: 10 + Math.random() * 18,
    sz: 22 + Math.random() * 38,
    speed: 0.8 + Math.random() * 1.2,
    opacity: 0.55 + Math.random() * 0.38,
    tint: Math.random() > 0.7 ? '#e8f4ff' : '#ffffff',
  })), [])

  useFrame(({ clock }) => {
    if (!cloudsRef.current) return
    const t = clock.elapsedTime
    cloudsRef.current.children.forEach((cloud, i) => {
      const c = clouds[i]
      // Drift clouds slowly to the right
      cloud.position.x = c.x + (t * c.speed * 0.4) % 800 - 400
      // Subtle vertical bob
      cloud.position.y = c.y + Math.sin(t * 0.08 + i) * 1.8
    })
  })

  if (divePhase !== DIVE_PHASES.HARBOR && divePhase !== DIVE_PHASES.SURFACE) return null

  return (
    <group ref={cloudsRef}>
      {clouds.map(c => (
        <mesh key={c.id} position={[c.x, c.y, c.z]}>
          <sphereGeometry args={[1, 7, 7]} />
          <meshBasicMaterial
            color={c.tint}
            transparent
            opacity={c.opacity}
            depthWrite={false}
          />
          {/* Scale non-uniformly to get cloud-puff shape */}
          <group scale={[c.sx, c.sy, c.sz]} />
        </mesh>
      ))}
    </group>
  )
}

// A better cloud using instanced meshes (ellipsoid puffs)
function CloudLayer() {
  const divePhase = useGameStore(s => s.divePhase)
  const groupRef  = useRef()

  const cloudDefs = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    id: i,
    cx: (Math.random() - 0.5) * 620,
    cy: 85 + Math.random() * 55,
    cz: -150 - Math.random() * 220,
    puffs: Array.from({ length: 4 + Math.floor(Math.random() * 5) }, (_, j) => ({
      dx: (Math.random() - 0.5) * 40,
      dy: (Math.random() - 0.5) * 8,
      dz: (Math.random() - 0.5) * 20,
      sx: 15 + Math.random() * 28,
      sy: 7  + Math.random() * 12,
      sz: 12 + Math.random() * 20,
    })),
    speed: 0.5 + Math.random() * 1.0,
    baseX: (Math.random() - 0.5) * 620,
  })), [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    groupRef.current.children.forEach((cloudGroup, i) => {
      const cd = cloudDefs[i]
      const drift = (cd.baseX + t * cd.speed * 0.35)
      const wrapped = ((drift + 400) % 800) - 400
      cloudGroup.position.x = wrapped
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
              <sphereGeometry args={[1, 8, 8]} />
              <meshBasicMaterial color="#f0f8ff" transparent opacity={0.72} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// ─── SURFACE GLOW ────────────────────────────────────────────────────────────

function SurfaceGlow() {
  const sunlight  = useGameStore(s => s.sunlightIntensity)
  const divePhase = useGameStore(s => s.divePhase)
  const meshRef   = useRef()

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    // Subtle pulse
    meshRef.current.material.opacity =
      (divePhase === DIVE_PHASES.HARBOR ? 0.012 : 0.018) +
      Math.sin(clock.elapsedTime * 0.4) * 0.004
  })

  if (sunlight < 0.2 || divePhase === DIVE_PHASES.ABYSS || divePhase === DIVE_PHASES.DEEP) {
    return null
  }

  return (
    <mesh ref={meshRef} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[560, 560, 1, 1]} />
      <meshBasicMaterial
        color="#cbefff"
        transparent
        opacity={0.015}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}

// ─── WATER SPRAY PARTICLES ────────────────────────────────────────────────────
// Visible at surface — small particles at wave crests

function WaterSpray() {
  const divePhase           = useGameStore(s => s.divePhase)
  const surfaceWaveIntensity = useGameStore(s => s.surfaceWaveIntensity)
  const sprayRef             = useRef()
  const count                = 280

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 200
      pos[i * 3 + 1] = Math.random() * 3
      pos[i * 3 + 2] = (Math.random() - 0.5) * 200
      vel[i * 3]     = (Math.random() - 0.5) * 0.08
      vel[i * 3 + 1] = 0.02 + Math.random() * 0.06
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.08
    }
    return { positions: pos, velocities: vel }
  }, [])

  useFrame(() => {
    if (!sprayRef.current) return
    const arr = sprayRef.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      arr[i * 3]     += velocities[i * 3]
      arr[i * 3 + 1] += velocities[i * 3 + 1] - 0.018  // gravity
      arr[i * 3 + 2] += velocities[i * 3 + 2]
      // Reset when fallen below surface
      if (arr[i * 3 + 1] < -0.5) {
        arr[i * 3]     = (Math.random() - 0.5) * 200
        arr[i * 3 + 1] = Math.random() * 0.5
        arr[i * 3 + 2] = (Math.random() - 0.5) * 200
        velocities[i * 3]     = (Math.random() - 0.5) * 0.06 * surfaceWaveIntensity
        velocities[i * 3 + 1] = 0.02 + Math.random() * 0.07 * surfaceWaveIntensity
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.06 * surfaceWaveIntensity
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
      <pointsMaterial
        size={0.12}
        color="#dff8ff"
        transparent
        opacity={0.45 * surfaceWaveIntensity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ─── HARBOR BACKDROP ─────────────────────────────────────────────────────────

function HarborBackdrop() {
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase !== DIVE_PHASES.HARBOR && divePhase !== DIVE_PHASES.SURFACE) return null

  return (
    <group position={[0, 0, -145]}>
      {/* land base */}
      <mesh position={[0, 3, -10]} receiveShadow>
        <boxGeometry args={[320, 24, 60]} />
        <meshStandardMaterial color="#56786a" roughness={1} metalness={0.02} />
      </mesh>

      {/* breakwater */}
      <mesh position={[0, -2.5, 18]} receiveShadow>
        <boxGeometry args={[280, 8, 14]} />
        <meshStandardMaterial color="#6f767d" roughness={0.95} metalness={0.04} />
      </mesh>

      {/* docks */}
      {[-88, -42, 0, 44, 92].map((x, i) => (
        <group key={i} position={[x, 0, 4]}>
          <mesh position={[0, 1.2, 0]} receiveShadow castShadow>
            <boxGeometry args={[26, 5, 22]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#60717e' : '#536774'} roughness={0.92} metalness={0.05} />
          </mesh>
        </group>
      ))}

      {/* colorful port warehouses */}
      {[
        [-110, '#d98e5a', 18, 18, 20],
        [-72,  '#5fa8d3', 24, 20, 18],
        [-30,  '#d8b24d', 22, 16, 18],
        [18,   '#77b255', 26, 22, 20],
        [62,   '#c97979', 20, 18, 18],
        [104,  '#7b8bd6', 22, 20, 20],
      ].map(([x, color, w, h, d], i) => (
        <mesh key={i} position={[x, h / 2 + 2, -6 - (i % 2) * 4]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} roughness={0.88} metalness={0.03} />
        </mesh>
      ))}

      {/* administrative / industrial buildings */}
      {[
        [-130, '#d7d4cb', 16, 30, 24],
        [-92,  '#aab7c2', 18, 26, 20],
        [-10,  '#d1cec6', 15, 34, 18],
        [40,   '#b4c1cc', 16, 28, 18],
        [130,  '#cbc8bf', 20, 32, 22],
      ].map(([x, color, w, h, d], i) => (
        <mesh key={i} position={[x, h / 2 + 2, -18 - (i % 3) * 5]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} roughness={0.9} metalness={0.02} />
        </mesh>
      ))}

      {/* cranes */}
      {[-108, -62, -16, 30, 72, 118].map((x, i) => (
        <group key={i} position={[x, 16, 6]}>
          <mesh castShadow>
            <boxGeometry args={[1.8, 32, 1.8]} />
            <meshStandardMaterial color="#d6a43d" roughness={0.75} metalness={0.2} />
          </mesh>
          <mesh position={[8, 12, 0]} castShadow>
            <boxGeometry args={[18, 1.4, 1.4]} />
            <meshStandardMaterial color="#d6a43d" roughness={0.75} metalness={0.2} />
          </mesh>
          <mesh position={[16, 5.5, 0]} castShadow>
            <boxGeometry args={[1.1, 12, 1.1]} />
            <meshStandardMaterial color="#d6a43d" roughness={0.75} metalness={0.2} />
          </mesh>
          <mesh position={[0, 15.5, 0]}>
            <sphereGeometry args={[0.55, 8, 8]} />
            <meshBasicMaterial color="#ffdd8c" />
          </mesh>
        </group>
      ))}

      {/* container stacks */}
      {[
        [-84, 10], [-72, 10], [-60, 10],
        [-12, 11], [0, 11],  [12, 11],
        [74, 10],  [86, 10], [98, 10],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 1.2, z]}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[10, 3, 4]} />
            <meshStandardMaterial
              color={['#e25555', '#4096d1', '#59a14f', '#e39f3d', '#7d68c9'][i % 5]}
              roughness={0.85} metalness={0.08}
            />
          </mesh>
          {i % 2 === 0 && (
            <mesh position={[0, 3.1, 0]}>
              <boxGeometry args={[10, 3, 4]} />
              <meshStandardMaterial
                color={['#d84f7c', '#4aa8a1', '#d1c24e', '#687ccf'][i % 4]}
                roughness={0.85} metalness={0.08}
              />
            </mesh>
          )}
        </group>
      ))}

      {/* harbor lights */}
      {[-126, -100, -74, -48, -20, 6, 34, 62, 90, 118].map((x, i) => (
        <group key={i} position={[x, 15 + (i % 2) * 3, 14]}>
          <mesh>
            <sphereGeometry args={[0.45, 10, 10]} />
            <meshBasicMaterial color="#ffe6a6" />
          </mesh>
          <pointLight color="#ffd89a" intensity={0.55} distance={30} />
        </group>
      ))}
    </group>
  )
}

function DistantHills() {
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase !== DIVE_PHASES.HARBOR && divePhase !== DIVE_PHASES.SURFACE) return null

  return (
    <group position={[0, 18, -230]}>
      {[-180, -110, -40, 45, 125].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]}>
          <coneGeometry args={[50 + i * 6, 60 + i * 5, 4]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#4f6e60' : '#607d68'} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// ─── GOD RAYS ────────────────────────────────────────────────────────────────

function GodRays() {
  const sunlightIntensity = useGameStore(s => s.sunlightIntensity)
  const divePhase         = useGameStore(s => s.divePhase)
  const groupRef          = useRef()

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    groupRef.current.children.forEach((ray, i) => {
      // Animated opacity flicker
      ray.material.opacity = (0.008 + Math.sin(clock.elapsedTime * 0.5 + i * 0.8) * 0.004) * sunlightIntensity
    })
  })

  if (
    divePhase === DIVE_PHASES.HARBOR ||
    divePhase === DIVE_PHASES.DEEP ||
    divePhase === DIVE_PHASES.ABYSS
  ) return null

  return (
    <group ref={groupRef}>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh
          key={i}
          position={[-55 + i * 10, -10, -30 + (i % 3) * 12]}
          rotation={[-Math.PI / 2.6, 0, 0.1 + i * 0.04]}
        >
          <planeGeometry args={[7, 58]} />
          <meshBasicMaterial
            color="#8fdcff"
            transparent
            opacity={0.01 * sunlightIntensity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

// ─── SUSPENDED PARTICLES ─────────────────────────────────────────────────────

function SuspendedParticles() {
  const pointsRef = useRef()
  const divePhase = useGameStore(s => s.divePhase)
  const count     = divePhase === DIVE_PHASES.HARBOR ? 220 : 1600

  const positions = useMemo(() => {
    const p = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      p[i * 3]     = (Math.random() - 0.5) * 280
      p[i * 3 + 1] = -Math.random() * 95
      p[i * 3 + 2] = (Math.random() - 0.5) * 280
    }
    return p
  }, [count])

  useFrame(({ clock }) => {
    if (!pointsRef.current) return
    const arr = pointsRef.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += Math.sin(clock.elapsedTime * 0.22 + i) * 0.0014
      arr[i * 3]     += Math.cos(clock.elapsedTime * 0.07 + i) * 0.0005
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

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(440, 440, 140, 140)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const h =
        Math.sin(x * 0.035) * 1.8 +
        Math.cos(y * 0.028) * 1.5 +
        Math.sin((x + y) * 0.018) * 2.6 +
        Math.cos(Math.sqrt(x * x + y * y) * 0.02) * 1.2
      pos.setZ(i, h)
    }
    geo.computeVertexNormals()
    return geo
  }, [])

  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.SURFACE) return null

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -38, 0]} receiveShadow>
      <meshStandardMaterial color="#0e2420" roughness={1} metalness={0.02} />
    </mesh>
  )
}

function KelpForest() {
  const divePhase = useGameStore(s => s.divePhase)
  const kelp = useMemo(() => Array.from({ length: 55 }, (_, i) => ({
    x: (Math.random() - 0.5) * 190,
    z: (Math.random() - 0.5) * 190,
    h: 4 + Math.random() * 9,
    s: 0.7 + Math.random() * 0.9,
    id: i,
  })), [])

  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.SURFACE) return null

  return (
    <group position={[0, -33, 0]}>
      {kelp.map(k => (
        <mesh key={k.id} position={[k.x, k.h / 2, k.z]} castShadow>
          <cylinderGeometry args={[0.07 * k.s, 0.14 * k.s, k.h, 6]} />
          <meshStandardMaterial color="#1a5535" roughness={0.95} metalness={0.02} />
        </mesh>
      ))}
    </group>
  )
}

function FishSchool() {
  const divePhase = useGameStore(s => s.divePhase)
  const groupRef  = useRef()

  const fish = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    id: i,
    phase: Math.random() * Math.PI * 2,
    radius: 8 + Math.random() * 12,
    speed: 0.3 + Math.random() * 0.35,
    y: -10 - Math.random() * 12,
  })), [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime
    groupRef.current.children.forEach((child, i) => {
      const f = fish[i]
      const a = t * f.speed + f.phase
      child.position.set(Math.cos(a) * f.radius, f.y + Math.sin(a * 2) * 0.9, Math.sin(a) * f.radius)
      child.rotation.y = -a + Math.PI / 2
    })
  })

  if (divePhase === DIVE_PHASES.HARBOR) return null

  return (
    <group ref={groupRef} position={[18, 0, -12]}>
      {fish.map(f => (
        <mesh key={f.id}>
          <coneGeometry args={[0.18, 0.72, 6]} />
          <meshStandardMaterial color="#8aa7b8" roughness={0.7} metalness={0.08} />
        </mesh>
      ))}
    </group>
  )
}

function ThermalVents() {
  const divePhase = useGameStore(s => s.divePhase)
  if (divePhase === DIVE_PHASES.HARBOR || divePhase === DIVE_PHASES.SURFACE) return null

  return (
    <group position={[-55, -35, 42]}>
      <mesh>
        <coneGeometry args={[3.2, 10, 8]} />
        <meshStandardMaterial color="#2a2a28" roughness={1} />
      </mesh>
      <mesh position={[0, 6.5, 0]}>
        <cylinderGeometry args={[0.35, 0.6, 8, 8]} />
        <meshStandardMaterial color="#3a3a34" roughness={1} />
      </mesh>
      <pointLight position={[0, 8, 0]} color="#ff8c42" intensity={0.9} distance={20} />
    </group>
  )
}

function BubbleColumns() {
  const divePhase    = useGameStore(s => s.divePhase)
  const groupRef     = useRef()

  const bubbleGroups = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
    id: i,
    x: -80 + i * 28,
    z: -30 + (i % 2) * 25,
  })), [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    // Animate bubble positions upward
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
        <group key={g.id} position={[g.x, -34, g.z]}>
          {Array.from({ length: 18 }, (_, i) => (
            <mesh key={i} position={[Math.sin(i) * 0.45, i * 1.2, Math.cos(i) * 0.45]}>
              <sphereGeometry args={[0.07 + (i % 3) * 0.025, 6, 6]} />
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
    let color = '#0a3b5c'
    let near  = 18
    let far   = 120

    switch (divePhase) {
      case DIVE_PHASES.HARBOR:
        color = '#8bbfdf'; near = 130; far = 400; break
      case DIVE_PHASES.SURFACE:
        color = '#79b2d8'; near = 100; far = 340; break
      case DIVE_PHASES.PERISCOPE_DEPTH:
        color = '#256b8a'; near = 30; far = 160; break
      case DIVE_PHASES.SHALLOW:
        color = '#114d68'; near = 22; far = 105; break
      case DIVE_PHASES.DEEP:
        color = '#06263e'; near = 12; far = 65; break
      case DIVE_PHASES.ABYSS:
      default:
        color = '#03121f'; near = 8; far = 38; break
    }

    scene.fog        = new THREE.Fog(color, near, far)
    scene.background = new THREE.Color(color)
  })

  return null
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
      <KelpForest />
      <FishSchool />
      <ThermalVents />
      <BubbleColumns />
    </group>
  )
}
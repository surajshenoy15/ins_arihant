import React, { useRef, Suspense, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { createXRStore, XR, useXR } from '@react-three/xr'
import * as THREE from 'three'

import UnderwaterEnvironment from '../components/Environment/UnderwaterEnvironment'
import VRControlPanel from '../components/HUD/VRControlPanel'
import SubmarineInterior from '../components/Interior/SubmarineInterior'
import SubmarineExterior from '../components/Interior/SubmarineExterior'
import PlayerController from '../components/Interior/PlayerController'
import CombatScene, { EnemySpawner } from '../components/Environment/CombatScene'
import { useGameStore, LIGHT_MODES, VIEW_MODES } from '../stores/gameStore'

// ─── Device detection ─────────────────────────────────────────────────────────
export const IS_QUEST  = /OculusBrowser|Quest/.test(navigator.userAgent)
export const IS_MOBILE = /Android|iPhone|iPad/.test(navigator.userAgent)
export const IS_LOW    = IS_QUEST || IS_MOBILE

// Post-processing — desktop only, imported normally (no top-level await)
// On Quest/mobile ScenePostFX returns null before these are used
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

const PERISCOPE_FOV = 22
const NORMAL_FOV    = 60
const sharedSubPosition = new THREE.Vector3(0, 0, 0)

// ─── XR Store ─────────────────────────────────────────────────────────────────
// Quest browser needs sessionInit with local-floor
const xrStore = createXRStore({
  hand:       false,
  controller: true,
  sessionInit: {
    optionalFeatures: ['local-floor', 'bounded-floor'],
    requiredFeatures: ['local'],
  },
})

// ─── Submarine Driver ─────────────────────────────────────────────────────────
function SubmarineDriver() {
  const keys       = useRef({})
  const throttle   = useRef(0)
  const speed      = useRef(useGameStore.getState().speed   ?? 0)
  const heading    = useRef(useGameStore.getState().heading ?? 0)
  const depth      = useRef(useGameStore.getState().depth   ?? 0)
  const yawRate    = useRef(0)
  const depthVel   = useRef(0)
  const setDriveState = useGameStore(s => s.setDriveState)

  useEffect(() => {
    const down = e => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyQ','KeyE','ShiftLeft'].includes(e.code))
        e.preventDefault()
      keys.current[e.code] = true
    }
    const up = e => { keys.current[e.code] = false }
    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup',   up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  useFrame((_, delta) => {
    const k = keys.current
    let throttleTarget = 0
    if (k.ArrowUp)   throttleTarget =  1
    if (k.ArrowDown) throttleTarget = -0.45

    throttle.current = THREE.MathUtils.lerp(throttle.current, throttleTarget, delta * 1.8)
    const desiredSpeed = throttle.current >= 0 ? throttle.current * 5 : throttle.current * 5
    speed.current = THREE.MathUtils.lerp(speed.current, desiredSpeed, delta * (desiredSpeed > speed.current ? 2.8 : 1.6))
    if (Math.abs(speed.current) < 0.03) speed.current = 0

    let rudder = 0
    if (k.ArrowLeft)  rudder = -1
    if (k.ArrowRight) rudder =  1

    const turnAuth = THREE.MathUtils.clamp(Math.abs(speed.current) / 8, 0.15, 1.0)
    yawRate.current = THREE.MathUtils.lerp(yawRate.current, rudder * turnAuth * 0.9, delta * 2.2)
    heading.current = (heading.current + yawRate.current * 60 * delta + 360) % 360

    let planeInput = 0
    if (k.KeyQ || k.Space)     planeInput = -1
    if (k.KeyE || k.ShiftLeft) planeInput =  1

    const depthAuth  = Math.max(0.65, THREE.MathUtils.clamp(Math.abs(speed.current) / 6, 0, 1.2))
    const targetDV   = planeInput * depthAuth * 18.0
    depthVel.current = THREE.MathUtils.lerp(depthVel.current, targetDV, delta * 2.4)
    if (planeInput === 0) depthVel.current = THREE.MathUtils.lerp(depthVel.current, 0, delta * 1.8)

    depth.current = THREE.MathUtils.clamp(depth.current + depthVel.current * delta, -450, 2)

    const hdgRad = THREE.MathUtils.degToRad(heading.current)
    sharedSubPosition.x += Math.cos(hdgRad) * speed.current * 0.55 * delta
    sharedSubPosition.z += Math.sin(hdgRad) * speed.current * 0.55 * delta
    sharedSubPosition.y  = depth.current * 0.05

    setDriveState({
      heading: heading.current, depth: depth.current, speed: speed.current,
      playerDriving: !!(k.ArrowUp||k.ArrowDown||k.ArrowLeft||k.ArrowRight||k.KeyQ||k.KeyE||k.Space||k.ShiftLeft),
    })
  })
  return null
}

// ─── Rigs ─────────────────────────────────────────────────────────────────────
function SubMovingRig({ children }) {
  const ref = useRef(); const lastPos = useRef(new THREE.Vector3()); const bankRef = useRef(0); const pitchRef = useRef(0)
  useFrame((_, delta) => {
    if (!ref.current) return
    const { heading, speed, surfaceWaveIntensity } = useGameStore.getState()
    ref.current.position.copy(sharedSubPosition)
    bankRef.current  = THREE.MathUtils.lerp(bankRef.current,  THREE.MathUtils.clamp(speed/18,-1,1)*0.02, delta*1.2)
    pitchRef.current = THREE.MathUtils.lerp(pitchRef.current, THREE.MathUtils.clamp((sharedSubPosition.y-lastPos.current.y)*2.4,-0.08,0.08), delta*2.0)
    const sway = 0.004*(0.2+(surfaceWaveIntensity??0)*0.8)
    ref.current.rotation.set(pitchRef.current, -THREE.MathUtils.degToRad(heading), bankRef.current + Math.sin(performance.now()*0.001*0.4)*sway)
    lastPos.current.copy(sharedSubPosition)
  })
  return <group ref={ref}>{children}</group>
}

function SubHullSway({ children }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime, waves = useGameStore.getState().surfaceWaveIntensity ?? 0
    const sway = 0.008*(0.2+waves*0.8)
    ref.current.rotation.z = Math.sin(t*0.4)*sway
    ref.current.rotation.x = Math.sin(t*0.3+1)*sway*0.6
    ref.current.position.y = Math.sin(t*0.5)*(0.02+waves*0.2)
  })
  return <group ref={ref}>{children}</group>
}

function OceanRig({ children }) {
  const ref = useRef()
  useFrame(() => {
    if (!ref.current) return
    const depth = useGameStore.getState().depth ?? 0
    ref.current.position.x = -sharedSubPosition.x
    ref.current.position.z = -sharedSubPosition.z
    ref.current.position.y = -depth * 0.2
  })
  return <group ref={ref}>{children}</group>
}

function ExteriorCameraChase() {
  const controlsRef   = useRef()
  const { camera }    = useThree()
  const followCamPos  = useRef(new THREE.Vector3(18, 9, 22))
  const playerDriving = useGameStore(s => s.playerDriving)
  const { isPresenting } = useXR()

  useEffect(() => { camera.position.set(18, 9, 22); camera.lookAt(0,0,0) }, [camera])

  useFrame((_, delta) => {
    if (isPresenting || !controlsRef.current) return
    const { heading } = useGameStore.getState()
    const hdgRad = THREE.MathUtils.degToRad(heading)
    if (playerDriving) {
      const desired = sharedSubPosition.clone().add(new THREE.Vector3(-Math.cos(hdgRad)*18, 7, -Math.sin(hdgRad)*18))
      followCamPos.current.lerp(desired, delta*2.0)
      camera.position.copy(followCamPos.current)
      controlsRef.current.target.lerp(sharedSubPosition, delta*3.0)
    } else {
      controlsRef.current.target.lerp(sharedSubPosition, delta*2.0)
    }
    controlsRef.current.update()
  })

  if (isPresenting) return null
  return <OrbitControls ref={controlsRef} makeDefault enablePan enableZoom enableRotate enableDamping dampingFactor={0.08} minDistance={8} maxDistance={60} maxPolarAngle={Math.PI*0.48} />
}

function GameTick() {
  const tick = useGameStore(s => s.tick)
  useFrame((_, d) => tick?.(d))
  return null
}

function PeriscopeCameraController({ active }) {
  const { camera } = useThree(); const { isPresenting } = useXR()
  const lerpedFov = useRef(NORMAL_FOV); const periscopeHdg = useGameStore(s => s.periscopeHeading)
  useFrame(() => {
    if (isPresenting) return
    if (!active) { lerpedFov.current = THREE.MathUtils.lerp(lerpedFov.current, NORMAL_FOV, 0.1); camera.fov = lerpedFov.current; camera.updateProjectionMatrix(); return }
    camera.position.lerp(new THREE.Vector3(0, 3.5, 0), 0.1)
    camera.quaternion.setFromEuler(new THREE.Euler(-0.08, -(periscopeHdg*Math.PI)/180, 0, 'YXZ'))
    lerpedFov.current = THREE.MathUtils.lerp(lerpedFov.current, PERISCOPE_FOV, 0.09)
    camera.fov = lerpedFov.current; camera.updateProjectionMatrix()
  })
  return null
}

// ─── Scenes ───────────────────────────────────────────────────────────────────
function InteriorScene() {
  return (
    <>
      <PlayerController />
      <SubHullSway><SubmarineInterior /></SubHullSway>
      <group position={[0,-18,-42]} scale={[1.8,1.8,1.8]}>
        <OceanRig><UnderwaterEnvironment /></OceanRig>
      </group>
    </>
  )
}

function PeriscopeScene() {
  return (
    <>
      <PeriscopeCameraController active />
      <group position={[0,-18,-42]} scale={[1.8,1.8,1.8]}><OceanRig><UnderwaterEnvironment /></OceanRig></group>
      <SubMovingRig><SubmarineExterior /></SubMovingRig>
      <CombatScene />
      <directionalLight position={[55,85,28]} intensity={1.1} color="#fff5d8" castShadow={false} />
      <ambientLight intensity={0.4} color="#b4d6ee" />
    </>
  )
}

function ExteriorScene() {
  return (
    <>
      <ExteriorCameraChase />
      <SubMovingRig><SubmarineExterior /></SubMovingRig>
      <OceanRig><UnderwaterEnvironment /></OceanRig>
      <CombatScene />
      <directionalLight position={[55,85,28]} intensity={1.1} color="#fff5d8" castShadow={false} />
      <ambientLight intensity={0.35} color="#b4d6ee" />
      <pointLight position={[0,20,0]} intensity={0.5} color="#a0d8ef" distance={120} />
    </>
  )
}

function XRScene() {
  const vm = useGameStore(s => s.viewMode)
  const isInterior = vm === VIEW_MODES.INTERIOR || vm === 'interior'

  // Force interior on first VR entry
  useEffect(() => {
    const cur = useGameStore.getState().viewMode
    if (cur !== VIEW_MODES.INTERIOR && cur !== 'interior') {
      useGameStore.getState().setViewMode(VIEW_MODES.INTERIOR)
    }
  }, [])

  return (
    <>
      <color attach="background" args={['#06131f']} />
      <ambientLight intensity={1.2} color="#b4d6ee" />
      <directionalLight position={[20,30,10]} intensity={1.4} color="#fff5d8" castShadow={false} />

      {/* Drive controls work in VR too */}
      <SubmarineDriver />

      {isInterior ? (
        <>
          <PlayerController />
          <SubHullSway><SubmarineInterior /></SubHullSway>
          <group position={[0,-18,-42]} scale={[1.8,1.8,1.8]}>
            <OceanRig><UnderwaterEnvironment /></OceanRig>
          </group>
        </>
      ) : (
        <>
          <SubMovingRig><SubmarineExterior /></SubMovingRig>
          <OceanRig><UnderwaterEnvironment /></OceanRig>
          <directionalLight position={[55,85,28]} intensity={1.1} color="#fff5d8" castShadow={false} />
        </>
      )}

      {/* 3D floating control panel — visible in VR, follows controller gaze */}
      <VRControlPanel />
    </>
  )
}

// ─── Post FX — desktop only ───────────────────────────────────────────────────
function ScenePostFX({ bloomIntensity, vignetteDarkness, periscopeMode, isInterior, detonation, alarm }) {
  const { isPresenting } = useXR()
  // Skip ALL post-processing on Quest/mobile — multi-pass FBOs black-screen Adreno/Mali GPUs
  if (IS_LOW || isPresenting) return null
  return (
    <EffectComposer>
      <Bloom intensity={bloomIntensity} luminanceThreshold={periscopeMode?0.5:isInterior?0.78:detonation?0.15:0.6} luminanceSmoothing={0.92} mipmapBlur />
      <Vignette offset={0.22} darkness={vignetteDarkness} blendFunction={BlendFunction.NORMAL} />
      <ChromaticAberration offset={periscopeMode?new THREE.Vector2(0.001,0.001):detonation?new THREE.Vector2(0.008,0.008):alarm?new THREE.Vector2(0.002,0.002):new THREE.Vector2(0.0002,0.0002)} blendFunction={BlendFunction.NORMAL} />
    </EffectComposer>
  )
}

// ─── VR Button — fixed for Quest browser ─────────────────────────────────────
function VRButton({ setXRError }) {
  const [supported, setSupported] = useState(false)
  const [checking,  setChecking]  = useState(true)
  const [entering,  setEntering]  = useState(false)
  const [btnText,   setBtnText]   = useState('CHECKING XR...')

  useEffect(() => {
    let mounted = true
    async function checkXR() {
      try {
        // Some Quest firmware versions need a small delay
        await new Promise(r => setTimeout(r, 300))
        if (!navigator.xr) { if (mounted) { setSupported(false); setChecking(false); setBtnText('XR NOT AVAILABLE') } return }
        const ok = await navigator.xr.isSessionSupported('immersive-vr')
        if (mounted) { setSupported(ok); setChecking(false); setBtnText(ok ? '🥽 ENTER VR' : 'VR NOT SUPPORTED') }
      } catch(err) {
        console.error('XR check failed:', err)
        if (mounted) { setSupported(false); setChecking(false); setBtnText('XR CHECK FAILED'); setXRError?.(`XR: ${err.message}`) }
      }
    }
    checkXR()
    return () => { mounted = false }
  }, [])

  const handleEnterVR = async () => {
    if (entering || !supported) return
    try {
      setXRError?.(''); setEntering(true); setBtnText('STARTING VR...')

      // Quest browser: must call enterVR from a direct user gesture handler.
      // xrStore.enterVR() is the correct @react-three/xr v6 API.
      await xrStore.enterVR()
      setBtnText('🥽 IN VR')
    } catch(err) {
      console.error('VR entry failed:', err)
      const msg = err?.message || String(err)
      setBtnText('🥽 ENTER VR')
      setXRError?.(`VR failed: ${msg}`)
      // Show alert on Quest so user sees the actual error
      if (IS_QUEST) alert(`VR Entry Error:\n${msg}`)
    } finally {
      setEntering(false)
    }
  }

  if (checking) return <button disabled style={vrBtnStyle}>{btnText}</button>
  if (!supported) return null   // hide if not supported — don't confuse user

  return (
    <button onClick={handleEnterVR} disabled={entering} style={{
      ...vrBtnStyle,
      opacity: entering ? 0.7 : 1,
      borderColor: 'rgba(0,229,255,0.6)',
    }}>
      {btnText}
    </button>
  )
}

const vrBtnStyle = {
  position: 'fixed', bottom: IS_QUEST ? 16 : 28, right: IS_QUEST ? 16 : 28,
  zIndex: 950,
  padding: IS_QUEST ? '14px 24px' : '10px 22px',
  background: 'rgba(0,4,16,0.92)',
  border: '1px solid rgba(0,229,255,0.4)',
  borderRadius: 8, color: '#00e5ff',
  fontFamily: '"Share Tech Mono", monospace',
  fontSize: IS_QUEST ? 14 : 11, letterSpacing: 2, cursor: 'pointer',
  backdropFilter: 'blur(8px)',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
}

const xrErrorStyle = {
  position: 'fixed', left: 16, bottom: 80, maxWidth: 380, zIndex: 960,
  padding: '10px 12px', background: 'rgba(40,0,0,0.92)', color: '#ffd5d5',
  border: '1px solid rgba(255,80,80,0.5)', borderRadius: 8,
  fontFamily: 'monospace', fontSize: 11, lineHeight: 1.4, whiteSpace: 'pre-wrap',
}

// ─── XR Mode Switch ───────────────────────────────────────────────────────────
function XRModeSwitch({ isInterior, periscopeMode, bloomIntensity, vignetteDarkness, detonation, alarm }) {
  const { isPresenting } = useXR()
  if (isPresenting) return <XRScene />
  return (
    <>
      <EnemySpawner />
      {isInterior && !periscopeMode && <InteriorScene />}
      {isInterior &&  periscopeMode && <PeriscopeScene />}
      {!isInterior && <ExteriorScene />}
      <ScenePostFX bloomIntensity={bloomIntensity} vignetteDarkness={vignetteDarkness} periscopeMode={periscopeMode} isInterior={isInterior} detonation={detonation} alarm={alarm} />
    </>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function MainScene() {
  const [xrError, setXRError] = useState('')
  const lm                 = useGameStore(s => s.lightMode)
  const alarm              = useGameStore(s => s.alarmActive)
  const vm                 = useGameStore(s => s.viewMode)
  const periscopeMode      = useGameStore(s => s.periscopeMode)
  const interiorBrightness = useGameStore(s => s.interiorBrightness ?? 0.9)
  const torpedoInFlight    = useGameStore(s => s.torpedoInFlight)
  const brahmoInFlight     = useGameStore(s => s.brahmoInFlight)

  const detonation = !!(torpedoInFlight?.detonated || brahmoInFlight?.detonated)
  const isInterior = vm === VIEW_MODES.INTERIOR || vm === 'interior'

  const exposure = periscopeMode ? 1.1 : isInterior ? 1.15 + interiorBrightness * 0.35 : 1.0
  const bloomIntensity = detonation?2.8:periscopeMode?0.4:isInterior?0.18:lm===LIGHT_MODES.EMERGENCY?0.75:lm===LIGHT_MODES.COMBAT?0.55:0.3
  const vignetteDarkness = periscopeMode?0.0:isInterior?lm===LIGHT_MODES.STEALTH?0.45:lm===LIGHT_MODES.OFF?0.55:alarm?0.38:0.22:lm===LIGHT_MODES.STEALTH?0.82:lm===LIGHT_MODES.OFF?0.9:alarm?0.65:0.42

  return (
    <>
      <VRButton setXRError={setXRError} />
      {xrError && <div style={xrErrorStyle}>{xrError}</div>}

      <Canvas
        gl={{
          antialias:    !IS_LOW,
          alpha:        false,
          powerPreference: 'high-performance',
          toneMapping:  THREE.ACESFilmicToneMapping,
          toneMappingExposure: exposure,
          outputColorSpace: THREE.SRGBColorSpace,
          xrCompatible: true,
          failIfMajorPerformanceCaveat: false,
        }}
        dpr={IS_QUEST ? [1, 1.5] : IS_MOBILE ? [1, 2] : [1, window.devicePixelRatio]}
        camera={{ fov: periscopeMode ? PERISCOPE_FOV : isInterior ? 74 : 60, near: 0.05, far: IS_QUEST ? 200 : 600,
          position: isInterior ? [0, 1.7, 0] : [18, 9, 22] }}
        shadows={false}
        style={{ position: 'fixed', inset: 0, background: '#000810' }}
        onCreated={({ gl }) => {
          gl.setClearColor('#000810', 1)
          // Do NOT manually set gl.xr.enabled — @react-three/xr owns this
        }}
      >
        <XR store={xrStore}>
          <Suspense fallback={
            <mesh position={[0, 1.5, -2]}>
              <boxGeometry args={[0.5, 0.5, 0.5]} />
              <meshStandardMaterial color="#00e5ff" wireframe />
            </mesh>
          }>
            <GameTick />
            <SubmarineDriver />
            <XRModeSwitch isInterior={isInterior} periscopeMode={periscopeMode}
              bloomIntensity={bloomIntensity} vignetteDarkness={vignetteDarkness}
              detonation={detonation} alarm={alarm} />
          </Suspense>
        </XR>
      </Canvas>
    </>
  )
}
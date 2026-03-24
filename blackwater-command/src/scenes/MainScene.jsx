import React, { useRef, Suspense, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { createXRStore, XR, useXR } from '@react-three/xr'
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'

import UnderwaterEnvironment from '../components/Environment/UnderwaterEnvironment'
import SubmarineInterior from '../components/Interior/SubmarineInterior'
import SubmarineExterior from '../components/Interior/SubmarineExterior'
import PlayerController from '../components/Interior/PlayerController'
import CombatScene, { EnemySpawner } from '../components/Environment/CombatScene'
import { useGameStore, LIGHT_MODES, VIEW_MODES } from '../stores/gameStore'

const xrStore = createXRStore({
  hand: true,
  controller: true,
  sessionInit: {
    optionalFeatures: ['local-floor', 'hand-tracking'],
  },
})

const PERISCOPE_FOV = 22
const NORMAL_FOV = 60

const sharedSubPosition = new THREE.Vector3(0, 0, 0)

function SubmarineDriver() {
  const keys = useRef({})

  const throttle = useRef(0)
  const speed = useRef(useGameStore.getState().speed ?? 0)
  const heading = useRef(useGameStore.getState().heading ?? 0)
  const depth = useRef(useGameStore.getState().depth ?? 0)

  const yawRate = useRef(0)
  const depthVel = useRef(0)

  const setDriveState = useGameStore(s => s.setDriveState)

  useEffect(() => {
    const down = e => {
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Space',
          'KeyQ',
          'KeyE',
          'ShiftLeft',
        ].includes(e.code)
      ) {
        e.preventDefault()
      }
      keys.current[e.code] = true
    }

    const up = e => {
      keys.current[e.code] = false
    }

    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up)

    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((_, delta) => {
    const k = keys.current

    let throttleTarget = 0
    if (k.ArrowUp) throttleTarget = 1
    else if (k.ArrowDown) throttleTarget = -0.45

    throttle.current = THREE.MathUtils.lerp(throttle.current, throttleTarget, delta * 1.8)

    const maxForward = 18
    const maxReverse = -5
    const desiredSpeed =
      throttle.current >= 0
        ? throttle.current * maxForward
        : throttle.current * Math.abs(maxReverse)

    const accelRate = desiredSpeed > speed.current ? 2.8 : 1.6
    speed.current = THREE.MathUtils.lerp(speed.current, desiredSpeed, delta * accelRate)

    if (Math.abs(speed.current) < 0.03) speed.current = 0

    let rudder = 0
    if (k.ArrowLeft) rudder = -1
    if (k.ArrowRight) rudder = 1

    const turnAuthority = THREE.MathUtils.clamp(Math.abs(speed.current) / 8, 0.15, 1.0)
    const targetYawRate = rudder * turnAuthority * 0.9

    yawRate.current = THREE.MathUtils.lerp(yawRate.current, targetYawRate, delta * 2.2)
    heading.current = (heading.current + yawRate.current * 60 * delta + 360) % 360

    let planeInput = 0
    if (k.KeyQ || k.Space) planeInput = -1
    if (k.KeyE || k.ShiftLeft) planeInput = 1

    const minDiveAuthority = 0.65
    const speedDiveAuthority = THREE.MathUtils.clamp(Math.abs(speed.current) / 6, 0, 1.2)
    const depthAuthority = Math.max(minDiveAuthority, speedDiveAuthority)

    const targetDepthVel = planeInput * depthAuthority * 18.0

    depthVel.current = THREE.MathUtils.lerp(depthVel.current, targetDepthVel, delta * 2.4)

    if (planeInput === 0) {
      depthVel.current = THREE.MathUtils.lerp(depthVel.current, 0, delta * 1.8)
    }

    depth.current += depthVel.current * delta
    depth.current = THREE.MathUtils.clamp(depth.current, -450, 2)

    const hdgRad = THREE.MathUtils.degToRad(heading.current)
    const forwardX = Math.cos(hdgRad)
    const forwardZ = Math.sin(hdgRad)

    const SPEED_SCALE = 1.35
    const moveAmount = speed.current * SPEED_SCALE * delta

    sharedSubPosition.x += forwardX * moveAmount
    sharedSubPosition.z += forwardZ * moveAmount
    sharedSubPosition.y = depth.current * 0.05

    setDriveState({
      heading: heading.current,
      depth: depth.current,
      speed: speed.current,
      playerDriving: !!(
        k.ArrowUp ||
        k.ArrowDown ||
        k.ArrowLeft ||
        k.ArrowRight ||
        k.KeyQ ||
        k.KeyE ||
        k.Space ||
        k.ShiftLeft
      ),
    })
  })

  return null
}

function SubMovingRig({ children }) {
  const ref = useRef()
  const lastPos = useRef(new THREE.Vector3())
  const bankRef = useRef(0)
  const pitchRef = useRef(0)

  useFrame((_, delta) => {
    if (!ref.current) return

    const { heading, speed, surfaceWaveIntensity } = useGameStore.getState()
    const hdgRad = THREE.MathUtils.degToRad(heading)

    ref.current.position.copy(sharedSubPosition)

    const bankTarget = THREE.MathUtils.clamp(speed / 18, -1, 1) * 0.02
    bankRef.current = THREE.MathUtils.lerp(bankRef.current, bankTarget, delta * 1.2)

    const verticalDelta = sharedSubPosition.y - lastPos.current.y
    const pitchTarget = THREE.MathUtils.clamp(verticalDelta * 2.4, -0.08, 0.08)
    pitchRef.current = THREE.MathUtils.lerp(pitchRef.current, pitchTarget, delta * 2.0)

    const t = performance.now() * 0.001
    const sway = 0.004 * (0.2 + (surfaceWaveIntensity ?? 0) * 0.8)
    const oceanRoll = Math.sin(t * 0.4) * sway

    ref.current.rotation.set(
      pitchRef.current,
      -hdgRad,
      bankRef.current + oceanRoll
    )

    lastPos.current.copy(sharedSubPosition)
  })

  return <group ref={ref}>{children}</group>
}

function ExteriorCameraChase() {
  const controlsRef = useRef()
  const { camera } = useThree()
  const followCamPos = useRef(new THREE.Vector3(18, 9, 22))
  const playerDriving = useGameStore(s => s.playerDriving)
  const { isPresenting } = useXR()

  useEffect(() => {
    camera.position.set(18, 9, 22)
    camera.lookAt(0, 0, 0)
  }, [camera])

  useFrame((_, delta) => {
    if (isPresenting) return

    const { heading } = useGameStore.getState()
    const hdgRad = THREE.MathUtils.degToRad(heading)

    if (!controlsRef.current) return

    if (playerDriving) {
      const chaseOffset = new THREE.Vector3(
        -Math.cos(hdgRad) * 18,
        7,
        -Math.sin(hdgRad) * 18
      )

      const desired = sharedSubPosition.clone().add(chaseOffset)
      followCamPos.current.lerp(desired, delta * 2.0)
      camera.position.copy(followCamPos.current)
      controlsRef.current.target.lerp(sharedSubPosition, delta * 3.0)
    } else {
      controlsRef.current.target.lerp(sharedSubPosition, delta * 2.0)
    }

    controlsRef.current.update()
  })

  if (isPresenting) return null

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan
      enableZoom
      enableRotate
      enableDamping
      dampingFactor={0.08}
      minDistance={8}
      maxDistance={60}
      maxPolarAngle={Math.PI * 0.48}
    />
  )
}

function SubHullSway({ children }) {
  const ref = useRef()

  useFrame(({ clock }) => {
    if (!ref.current) return

    const t = clock.elapsedTime
    const waves = useGameStore.getState().surfaceWaveIntensity ?? 0
    const sway = 0.008 * (0.2 + waves * 0.8)

    ref.current.rotation.z = Math.sin(t * 0.4) * sway
    ref.current.rotation.x = Math.sin(t * 0.3 + 1) * sway * 0.6
    ref.current.position.y = Math.sin(t * 0.5) * (0.02 + waves * 0.2)
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

function GameTick() {
  const tick = useGameStore(s => s.tick)
  useFrame((_, d) => tick?.(d))
  return null
}

function PeriscopeCameraController({ active }) {
  const { camera } = useThree()
  const { isPresenting } = useXR()
  const lerpedFov = useRef(NORMAL_FOV)
  const periscopeHdg = useGameStore(s => s.periscopeHeading)

  useFrame(() => {
    if (isPresenting) return

    if (!active) {
      lerpedFov.current = THREE.MathUtils.lerp(lerpedFov.current, NORMAL_FOV, 0.1)
      camera.fov = lerpedFov.current
      camera.updateProjectionMatrix()
      return
    }

    camera.position.lerp(new THREE.Vector3(0, 3.5, 0), 0.1)
    const yaw = -(periscopeHdg * Math.PI) / 180
    camera.quaternion.setFromEuler(new THREE.Euler(-0.08, yaw, 0, 'YXZ'))

    lerpedFov.current = THREE.MathUtils.lerp(lerpedFov.current, PERISCOPE_FOV, 0.09)
    camera.fov = lerpedFov.current
    camera.updateProjectionMatrix()
  })

  return null
}

function InteriorScene() {
  return (
    <>
      <PlayerController />
      <SubHullSway>
        <SubmarineInterior />
      </SubHullSway>

      <group position={[0, -18, -42]} scale={[1.8, 1.8, 1.8]}>
        <OceanRig>
          <UnderwaterEnvironment />
        </OceanRig>
      </group>
    </>
  )
}

function PeriscopeScene() {
  return (
    <>
      <PeriscopeCameraController active />

      <group position={[0, -18, -42]} scale={[1.8, 1.8, 1.8]}>
        <OceanRig>
          <UnderwaterEnvironment />
        </OceanRig>
      </group>

      <SubMovingRig>
        <SubmarineExterior />
      </SubMovingRig>

      <CombatScene />
      <directionalLight position={[55, 85, 28]} intensity={1.1} color="#fff5d8" />
      <ambientLight intensity={0.4} color="#b4d6ee" />
    </>
  )
}

function ExteriorScene() {
  return (
    <>
      <ExteriorCameraChase />

      <SubMovingRig>
        <SubmarineExterior />
      </SubMovingRig>

      <OceanRig>
        <UnderwaterEnvironment />
      </OceanRig>

      <CombatScene />

      <directionalLight
        position={[55, 85, 28]}
        intensity={1.1}
        color="#fff5d8"
        castShadow
      />
      <ambientLight intensity={0.35} color="#b4d6ee" />
      <pointLight position={[0, 20, 0]} intensity={0.5} color="#a0d8ef" distance={120} />
    </>
  )
}

function VRButton() {
  const [supported, setSupported] = useState(false)
  const [checking, setChecking] = useState(true)
  const [entering, setEntering] = useState(false)

  useEffect(() => {
    let mounted = true

    async function checkXR() {
      try {
        if (!navigator.xr) {
          if (mounted) {
            setSupported(false)
            setChecking(false)
          }
          return
        }

        const ok = await navigator.xr.isSessionSupported('immersive-vr')
        if (mounted) {
          setSupported(ok)
          setChecking(false)
        }
      } catch (err) {
        console.error('XR support check failed:', err)
        if (mounted) {
          setSupported(false)
          setChecking(false)
        }
      }
    }

    checkXR()

    return () => {
      mounted = false
    }
  }, [])

  const handleEnterVR = async () => {
    try {
      setEntering(true)
      await xrStore.enterVR()
    } catch (err) {
      console.error('Failed to enter VR:', err)
      alert(`Failed to enter VR: ${err?.message || err}`)
    } finally {
      setEntering(false)
    }
  }

  if (checking) {
    return (
      <button
        disabled
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          zIndex: 500,
          padding: '10px 22px',
          background: 'rgba(0,4,16,0.92)',
          border: '1px solid rgba(0,229,255,0.4)',
          borderRadius: 6,
          color: '#00e5ff',
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: 11,
          letterSpacing: 2,
        }}
      >
        CHECKING XR...
      </button>
    )
  }

  if (!supported) return null

  return (
    <button
      onClick={handleEnterVR}
      disabled={entering}
      style={{
        position: 'fixed',
        bottom: 28,
        right: 28,
        zIndex: 500,
        padding: '10px 22px',
        background: 'rgba(0,4,16,0.92)',
        border: '1px solid rgba(0,229,255,0.4)',
        borderRadius: 6,
        color: '#00e5ff',
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: 11,
        letterSpacing: 2,
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
      }}
    >
      {entering ? 'ENTERING VR...' : '🥽 ENTER VR'}
    </button>
  )
}

function ScenePostFX({
  bloomIntensity,
  vignetteDarkness,
  periscopeMode,
  isInterior,
  detonation,
  alarm,
}) {
  const { isPresenting } = useXR()

  if (isPresenting) return null

  return (
    <EffectComposer>
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={
          periscopeMode
            ? 0.5
            : isInterior
              ? 0.78
              : detonation
                ? 0.15
                : 0.6
        }
        luminanceSmoothing={0.92}
        mipmapBlur
      />
      <Vignette
        offset={0.22}
        darkness={vignetteDarkness}
        blendFunction={BlendFunction.NORMAL}
      />
      <ChromaticAberration
        offset={
          periscopeMode
            ? new THREE.Vector2(0.001, 0.001)
            : detonation
              ? new THREE.Vector2(0.008, 0.008)
              : alarm
                ? new THREE.Vector2(0.002, 0.002)
                : new THREE.Vector2(0.0002, 0.0002)
        }
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  )
}

export default function MainScene() {
  const lm = useGameStore(s => s.lightMode)
  const alarm = useGameStore(s => s.alarmActive)
  const vm = useGameStore(s => s.viewMode)
  const periscopeMode = useGameStore(s => s.periscopeMode)
  const interiorBrightness = useGameStore(s => s.interiorBrightness ?? 0.9)
  const torpedoInFlight = useGameStore(s => s.torpedoInFlight)
  const brahmoInFlight = useGameStore(s => s.brahmoInFlight)

  const detonation = !!(torpedoInFlight?.detonated || brahmoInFlight?.detonated)
  const isInterior = vm === VIEW_MODES.INTERIOR || vm === 'interior'

  const exposure = periscopeMode
    ? 1.1
    : isInterior
      ? 1.15 + interiorBrightness * 0.35
      : 1.0

  const bloomIntensity = detonation
    ? 2.8
    : periscopeMode
      ? 0.4
      : isInterior
        ? 0.18
        : lm === LIGHT_MODES.EMERGENCY
          ? 0.75
          : lm === LIGHT_MODES.COMBAT
            ? 0.55
            : 0.3

  const vignetteDarkness = periscopeMode
    ? 0.0
    : isInterior
      ? lm === LIGHT_MODES.STEALTH
        ? 0.45
        : lm === LIGHT_MODES.OFF
          ? 0.55
          : alarm
            ? 0.38
            : 0.22
      : lm === LIGHT_MODES.STEALTH
        ? 0.82
        : lm === LIGHT_MODES.OFF
          ? 0.9
          : alarm
            ? 0.65
            : 0.42

  const cameraPos = isInterior ? [0, 1.7, 0] : [18, 9, 22]
  const cameraFov = periscopeMode ? PERISCOPE_FOV : isInterior ? 74 : 60

  return (
    <>
      <VRButton />

      <Canvas
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: exposure,
          outputColorSpace: THREE.SRGBColorSpace,
          xrCompatible: true,
        }}
        dpr={[1, 1.5]}
        camera={{ fov: cameraFov, near: 0.05, far: 600, position: cameraPos }}
        shadows
        style={{ position: 'fixed', inset: 0, background: '#000810' }}
        onCreated={({ gl }) => {
          gl.xr.enabled = true
        }}
      >
        <XR store={xrStore}>
          <Suspense
            fallback={
              <mesh>
                <boxGeometry args={[0.5, 0.5, 0.5]} />
                <meshStandardMaterial color="#00e5ff" wireframe />
              </mesh>
            }
          >
            <GameTick />
            <EnemySpawner />
            <SubmarineDriver />

            {isInterior && !periscopeMode && <InteriorScene />}
            {isInterior && periscopeMode && <PeriscopeScene />}
            {!isInterior && <ExteriorScene />}

            <ScenePostFX
              bloomIntensity={bloomIntensity}
              vignetteDarkness={vignetteDarkness}
              periscopeMode={periscopeMode}
              isInterior={isInterior}
              detonation={detonation}
              alarm={alarm}
            />
          </Suspense>
        </XR>
      </Canvas>
    </>
  )
}
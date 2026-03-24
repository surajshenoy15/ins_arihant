/**
 * VRControlPanel — 3D in-world UI for Quest VR mode
 * Floats in front of the player inside the submarine.
 * Uses @react-three/xr controller input + 3D mesh buttons.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { useXR } from '@react-three/xr'
import * as THREE from 'three'
import { useGameStore, LIGHT_MODES, VIEW_MODES } from '../../stores/gameStore'
import { speakReactive, indraVoice } from '../../systems/AIAssistant'
import { submarineAudio } from '../../systems/AudioManager'

// ─── 3D Button ────────────────────────────────────────────────────────────────
function VRButton({ position, label, sublabel, color = '#00e5ff', onPress, active = false, width = 0.18, height = 0.055 }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressedState] = useState(false)
  const pressedRef = useRef(false)

  const handlePress = useCallback(() => {
    setPressedState(true)
    pressedRef.current = true
    onPress?.()
    setTimeout(() => { setPressedState(false); pressedRef.current = false }, 200)
  }, [onPress])

  useFrame(() => {
    if (!meshRef.current) return
    const targetScale = pressed ? 0.88 : hovered ? 1.06 : 1
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.2)
  })

  const bgColor = pressed ? '#ffffff'
    : hovered  ? color
    : active   ? color + '44'
    : '#020c18'

  const borderColor = active || hovered ? color : '#1a3040'

  return (
    <group position={position}>
      {/* Button backing */}
      <mesh ref={meshRef} castShadow={false}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={handlePress}
      >
        <boxGeometry args={[width, height, 0.008]} />
        <meshStandardMaterial color={bgColor} emissive={bgColor} emissiveIntensity={active ? 0.4 : 0.15} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Border frame */}
      <mesh>
        <boxGeometry args={[width + 0.006, height + 0.006, 0.004]} />
        <meshStandardMaterial color={borderColor} emissive={borderColor} emissiveIntensity={0.6} roughness={0.3} metalness={0.8} />
      </mesh>
      {/* Label */}
      <Text position={[0, sublabel ? 0.008 : 0, 0.007]} fontSize={0.018} color={hovered || active ? color : '#a0c8d8'} anchorX="center" anchorY="middle" fontWeight="bold">
        {label}
      </Text>
      {sublabel && (
        <Text position={[0, -0.01, 0.007]} fontSize={0.01} color={color + '88'} anchorX="center" anchorY="middle">
          {sublabel}
        </Text>
      )}
    </group>
  )
}

// Controller interaction is handled by @react-three/xr's built-in pointer system
// via onPointerDown on mesh objects — no manual ray setup needed

// ─── Throttle slider ──────────────────────────────────────────────────────────
function ThrottleSlider({ position }) {
  const speed = useGameStore(s => s.speed)
  const pct   = Math.max(0, Math.min(1, (speed + 5) / 10))

  return (
    <group position={position}>
      <Text position={[0, 0.05, 0.005]} fontSize={0.014} color="rgba(0,229,255,0.6)" anchorX="center">THROTTLE</Text>
      {/* Track */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.16, 0.012, 0.006]} />
        <meshStandardMaterial color="#0a1820" roughness={0.8} />
      </mesh>
      {/* Fill */}
      <mesh position={[(-0.08 + pct * 0.16) / 2 - 0.08 + pct * 0.08, 0, 0.004]}>
        <boxGeometry args={[pct * 0.16, 0.01, 0.004]} />
        <meshStandardMaterial color={speed > 0 ? '#4cff8a' : '#ff6b6b'} emissive={speed > 0 ? '#4cff8a' : '#ff6b6b'} emissiveIntensity={0.5} />
      </mesh>
      <Text position={[0, -0.02, 0.005]} fontSize={0.014} color="#ffe066" anchorX="center">
        {speed.toFixed(1)} kn
      </Text>
    </group>
  )
}

// ─── Depth gauge ──────────────────────────────────────────────────────────────
function DepthGauge({ position }) {
  const depth = useGameStore(s => s.depth)
  const pct   = Math.min(1, Math.abs(depth) / 450)
  const color = Math.abs(depth) > 300 ? '#ff6b6b' : Math.abs(depth) > 150 ? '#ffcc44' : '#00e5ff'

  return (
    <group position={position}>
      <Text position={[0, 0.07, 0.005]} fontSize={0.014} color="rgba(0,229,255,0.6)" anchorX="center">DEPTH</Text>
      {/* Vertical track */}
      <mesh><boxGeometry args={[0.012, 0.12, 0.006]} /><meshStandardMaterial color="#0a1820" roughness={0.8} /></mesh>
      {/* Fill from top */}
      <mesh position={[0, 0.06 - pct * 0.06, 0.004]}>
        <boxGeometry args={[0.01, pct * 0.12, 0.004]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      <Text position={[0, -0.075, 0.005]} fontSize={0.014} color={color} anchorX="center">
        {Math.abs(depth).toFixed(0)}m
      </Text>
    </group>
  )
}

// ─── Status display ───────────────────────────────────────────────────────────
function VRStatusDisplay({ position }) {
  const depth    = useGameStore(s => s.depth)
  const speed    = useGameStore(s => s.speed)
  const heading  = useGameStore(s => s.heading)
  const hull     = useGameStore(s => s.hullIntegrity)
  const o2       = useGameStore(s => s.oxygenLevel)
  const reactor  = useGameStore(s => s.reactorTemp)
  const contacts = useGameStore(s => s.contacts)
  const hostile  = contacts.filter(c => c.hostile).length
  const torpedoes = useGameStore(s => s.torpedoCount)
  const brahmos  = useGameStore(s => s.brahmosMissiles)

  const rows = [
    [`HDG  ${String(Math.round(heading)).padStart(3,'0')}°`, `SPD  ${speed.toFixed(1)}kn`],
    [`DEP  ${Math.abs(depth).toFixed(0)}m`,                  `HULL ${hull.toFixed(0)}%`],
    [`O₂   ${o2.toFixed(0)}%`,                              `RCTR ${reactor.toFixed(0)}K`],
    [`TORP ${torpedoes}/6`,                                  `BRHM ${brahmos}/4`],
    [hostile > 0 ? `⚠ ${hostile} HOSTILE` : `CONTACTS: ${contacts.length}`, ''],
  ]

  return (
    <group position={position}>
      {/* Panel background */}
      <mesh>
        <boxGeometry args={[0.38, 0.18, 0.004]} />
        <meshStandardMaterial color="#020c18" roughness={0.9} metalness={0.3} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.386, 0.186, 0.002]} />
        <meshStandardMaterial color="#1a3a50" emissive="#1a3a50" emissiveIntensity={0.3} roughness={0.5} />
      </mesh>

      {/* Title */}
      <Text position={[0, 0.075, 0.004]} fontSize={0.014} color="#00e5ff" anchorX="center" letterSpacing={2}>
        INS ARIHANT • S73
      </Text>
      <mesh position={[0, 0.062, 0.004]}>
        <boxGeometry args={[0.34, 0.001, 0.001]} />
        <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={0.6} />
      </mesh>

      {rows.map((row, ri) => (
        <group key={ri} position={[0, 0.042 - ri * 0.025, 0.004]}>
          <Text position={[-0.09, 0, 0]} fontSize={0.013} color={row[0].includes('⚠') ? '#ff6b6b' : '#a0c8d8'} anchorX="left">{row[0]}</Text>
          {row[1] && <Text position={[0.04, 0, 0]} fontSize={0.013} color="#a0c8d8" anchorX="left">{row[1]}</Text>}
        </group>
      ))}
    </group>
  )
}

// ─── Main VR Control Panel ────────────────────────────────────────────────────
export default function VRControlPanel() {
  const { isPresenting } = useXR()
  const groupRef  = useRef()
  const vm        = useGameStore(s => s.viewMode)
  const isInterior = vm === VIEW_MODES.INTERIOR || vm === 'interior'
  const lightMode  = useGameStore(s => s.lightMode)
  const thermalOn  = useGameStore(s => s.thermalEnabled)
  const torpedoes  = useGameStore(s => s.torpedoCount)
  const brahmos    = useGameStore(s => s.brahmosMissiles)
  const contacts   = useGameStore(s => s.contacts)

  // Follow camera smoothly — panel floats in front-left of player
  useFrame(({ camera }) => {
    if (!groupRef.current || !isPresenting) return

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const right   = new THREE.Vector3(1, 0,  0).applyQuaternion(camera.quaternion)

    const target = camera.position.clone()
      .addScaledVector(forward, 0.65)   // 65cm in front
      .addScaledVector(right,  -0.28)   // 28cm to the left
      .add(new THREE.Vector3(0, -0.12, 0)) // 12cm below eye level

    groupRef.current.position.lerp(target, 0.04)

    // Face the camera
    groupRef.current.quaternion.slerp(camera.quaternion, 0.04)
  })

  const switchView = useCallback(() => {
    const nv = isInterior ? VIEW_MODES.EXTERIOR : VIEW_MODES.INTERIOR
    useGameStore.getState().setViewMode(nv)
    speakReactive(nv === VIEW_MODES.EXTERIOR ? 'exteriorView' : 'interiorView')
  }, [isInterior])

  const fireTorpedo = useCallback(() => {
    const s = useGameStore.getState()
    const tgt = s.contacts.find(c => c.hostile && c.tracked) || s.contacts.find(c => c.hostile)
    if (tgt && s.torpedoCount > 0) {
      s.fireTorpedo(tgt.id)
      submarineAudio?.playTorpedoLaunch?.()
      speakReactive('torpedoFired')
    } else {
      indraVoice.speak(s.torpedoCount <= 0 ? 'Tubes empty.' : 'No target.', 'warning')
    }
  }, [])

  const fireBrahmos = useCallback(() => {
    const s = useGameStore.getState()
    const tgt = s.contacts.find(c => c.hostile && c.tracked) || s.contacts.find(c => c.hostile)
    if (tgt && s.brahmosMissiles > 0) {
      s.fireBrahMos(tgt.id)
      submarineAudio?.playMissileLaunch?.()
      speakReactive('brahmosFired')
    } else {
      indraVoice.speak(s.brahmosMissiles <= 0 ? 'BrahMos empty.' : 'No target.', 'warning')
    }
  }, [])

  const trackContact = useCallback(() => {
    const s = useGameStore.getState()
    const tgt = s.contacts.find(c => c.hostile && !c.tracked)
    if (tgt) { s.trackContact(tgt.id); speakReactive('contactTracked') }
    else indraVoice.speak('No untracked hostiles.', 'info')
  }, [])

  const deployDecoy = useCallback(() => {
    const s = useGameStore.getState()
    if (s.decoyCount > 0) { s.deployDecoy(); speakReactive('decoyDeploy') }
    else indraVoice.speak('Decoys exhausted.', 'warning')
  }, [])

  const pingSonar = useCallback(() => {
    useGameStore.getState().triggerActiveSonar()
    speakReactive('sonarPing')
  }, [])

  const toggleThermal = useCallback(() => {
    useGameStore.getState().toggleThermal()
    speakReactive(useGameStore.getState().thermalEnabled ? 'thermalEnabled' : 'thermalDisabled')
  }, [])

  const togglePeriscope = useCallback(() => {
    useGameStore.getState().togglePeriscope?.()
  }, [])

  const setLight = useCallback((mode) => {
    useGameStore.getState().setLightMode(mode)
    speakReactive('lightChange', mode)
  }, [])

  const dive = useCallback(() => {
    const s = useGameStore.getState()
    s.initiateDive(-100)
    indraVoice.speak('Diving. Target depth one hundred metres.', 'info')
  }, [])

  const surface = useCallback(() => {
    useGameStore.getState().surfaceSubmarine()
    indraVoice.speak('Surfacing. Blow all ballast.', 'info')
  }, [])

  if (!isPresenting) return null

  return (
    <group ref={groupRef}>

      {/* ── Status panel ── */}
      <VRStatusDisplay position={[0, 0.14, 0]} />

      {/* ── Row 1: Navigation ── */}
      <Text position={[-0.09, 0.025, 0.003]} fontSize={0.011} color="rgba(0,229,255,0.4)" anchorX="left" letterSpacing={1}>NAVIGATION</Text>
      <VRButton position={[-0.16, 0.008, 0]} label="DIVE" sublabel="100m" color="#ffcc44" onPress={dive} width={0.095} />
      <VRButton position={[-0.055, 0.008, 0]} label="SURFACE" color="#4cff8a" onPress={surface} width={0.095} />
      <VRButton position={[0.055, 0.008, 0]} label="SONAR" color="#00e5ff" onPress={pingSonar} width={0.095} />
      <VRButton position={[0.16, 0.008, 0]} label={isInterior ? 'EXTERIOR' : 'INTERIOR'} color="#64ffda" onPress={switchView} width={0.095} />

      {/* ── Row 2: Weapons ── */}
      <Text position={[-0.09, -0.032, 0.003]} fontSize={0.011} color="rgba(255,107,107,0.5)" anchorX="left" letterSpacing={1}>WEAPONS</Text>
      <VRButton position={[-0.16, -0.05, 0]} label="TORPEDO" sublabel={`${torpedoes}/6`} color="#ff6b6b" onPress={fireTorpedo} width={0.095} />
      <VRButton position={[-0.055, -0.05, 0]} label="BRAHMOS" sublabel={`${brahmos}/4`} color="#ffcc44" onPress={fireBrahmos} width={0.095} />
      <VRButton position={[0.055, -0.05, 0]} label="TRACK" color="#ff9f43" onPress={trackContact} width={0.095} />
      <VRButton position={[0.16, -0.05, 0]} label="DECOY" color="#a29bfe" onPress={deployDecoy} width={0.095} />

      {/* ── Row 3: Systems ── */}
      <Text position={[-0.09, -0.092, 0.003]} fontSize={0.011} color="rgba(0,229,255,0.4)" anchorX="left" letterSpacing={1}>SYSTEMS</Text>
      <VRButton position={[-0.16, -0.11, 0]} label="NORMAL" color="#00e5ff" active={lightMode === LIGHT_MODES.NORMAL}    onPress={() => setLight(LIGHT_MODES.NORMAL)}    width={0.095} />
      <VRButton position={[-0.055, -0.11, 0]} label="STEALTH" color="#a29bfe" active={lightMode === LIGHT_MODES.STEALTH}  onPress={() => setLight(LIGHT_MODES.STEALTH)}   width={0.095} />
      <VRButton position={[0.055, -0.11, 0]} label="COMBAT"  color="#ff6b6b" active={lightMode === LIGHT_MODES.COMBAT}   onPress={() => setLight(LIGHT_MODES.COMBAT)}    width={0.095} />
      <VRButton position={[0.16, -0.11, 0]} label="THERMAL" color="#ff9f43" active={thermalOn}                           onPress={toggleThermal}                         width={0.095} />

      {/* ── Gauges ── */}
      <ThrottleSlider position={[-0.21, 0.008, 0]} />
      <DepthGauge     position={[-0.21, -0.07, 0]} />

      {/* ── Panel label ── */}
      <Text position={[0, -0.155, 0.003]} fontSize={0.01} color="rgba(0,229,255,0.25)" anchorX="center" letterSpacing={2}>
        POINT CONTROLLER AT BUTTONS • PULL TRIGGER TO PRESS
      </Text>
    </group>
  )
}
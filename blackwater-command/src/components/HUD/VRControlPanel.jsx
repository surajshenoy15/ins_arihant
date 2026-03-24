/**
 * VRControlPanel — Fixed 3D panel always visible in Quest VR
 * Mounted to a fixed position inside the submarine cockpit.
 * Uses XR pointer (point controller + trigger) to press buttons.
 */
import React, { useRef, useState, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { useXR } from '@react-three/xr'
import * as THREE from 'three'
import { useGameStore, LIGHT_MODES, VIEW_MODES } from '../../stores/gameStore'
import { speakReactive, indraVoice } from '../../systems/AIAssistant'
import { submarineAudio } from '../../systems/AudioManager'

// ─── Single 3D pressable button ───────────────────────────────────────────────
function VRBtn({ pos, w = 0.22, h = 0.07, label, sub, color = '#00e5ff', active = false, onPress }) {
  const ref  = useRef()
  const [hot, setHot] = useState(false)

  const press = useCallback((e) => {
    e.stopPropagation()
    onPress?.()
    // Brief scale pop
    if (ref.current) {
      ref.current.scale.set(0.9, 0.9, 0.9)
      setTimeout(() => ref.current?.scale.set(1, 1, 1), 140)
    }
  }, [onPress])

  const col = hot ? color : active ? color + '55' : '#020e1a'
  const brd = hot || active ? color : '#1c3a4a'

  return (
    <group position={pos}>
      {/* border */}
      <mesh>
        <boxGeometry args={[w + 0.008, h + 0.008, 0.009]} />
        <meshStandardMaterial color={brd} emissive={brd} emissiveIntensity={0.8} />
      </mesh>
      {/* face */}
      <mesh ref={ref}
        onPointerEnter={() => setHot(true)}
        onPointerLeave={() => setHot(false)}
        onPointerDown={press}
      >
        <boxGeometry args={[w, h, 0.012]} />
        <meshStandardMaterial color={col} emissive={active ? color : hot ? color : '#000'} emissiveIntensity={active ? 0.5 : hot ? 0.3 : 0} roughness={0.4} metalness={0.5} />
      </mesh>
      <Text position={[0, sub ? 0.012 : 0, 0.01]} fontSize={0.022} color={hot || active ? '#fff' : color} anchorX="center" anchorY="middle" fontWeight="bold" maxWidth={w * 0.9}>
        {label}
      </Text>
      {sub && (
        <Text position={[0, -0.016, 0.01]} fontSize={0.013} color={color + 'aa'} anchorX="center" anchorY="middle">
          {sub}
        </Text>
      )}
    </group>
  )
}

// ─── Section label ────────────────────────────────────────────────────────────
function Lbl({ pos, text, color = 'rgba(0,229,255,0.45)' }) {
  return (
    <Text position={pos} fontSize={0.016} color={color} anchorX="left" anchorY="middle" letterSpacing={0.08}>
      {text}
    </Text>
  )
}

// ─── Live status readout ──────────────────────────────────────────────────────
function VRStatus({ pos }) {
  const textRef = useRef()
  const depth    = useGameStore(s => s.depth)
  const speed    = useGameStore(s => s.speed)
  const heading  = useGameStore(s => s.heading)
  const hull     = useGameStore(s => s.hullIntegrity)
  const torp     = useGameStore(s => s.torpedoCount)
  const brahmos  = useGameStore(s => s.brahmosMissiles)
  const contacts = useGameStore(s => s.contacts)
  const hostile  = contacts.filter(c => c.hostile).length

  return (
    <group position={pos}>
      {/* bg panel */}
      <mesh>
        <boxGeometry args={[0.96, 0.095, 0.006]} />
        <meshStandardMaterial color="#020e1a" roughness={0.9} metalness={0.2} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.968, 0.103, 0.003]} />
        <meshStandardMaterial color="#0a3a55" emissive="#0a3a55" emissiveIntensity={0.4} />
      </mesh>

      {/* Left col */}
      <Text position={[-0.42, 0.022, 0.005]} fontSize={0.018} color="#ffe066" anchorX="left">
        {`HDG ${String(Math.round(heading)).padStart(3,'0')}°  SPD ${speed.toFixed(1)}kn`}
      </Text>
      <Text position={[-0.42, -0.018, 0.005]} fontSize={0.018} color={Math.abs(depth) > 300 ? '#ff6b6b' : '#00e5ff'} anchorX="left">
        {`DEP ${Math.abs(depth).toFixed(0)}m  HULL ${hull.toFixed(0)}%`}
      </Text>

      {/* Right col */}
      <Text position={[0.05, 0.022, 0.005]} fontSize={0.018} color="#4cff8a" anchorX="left">
        {`TORP ${torp}/6  BRH ${brahmos}/4`}
      </Text>
      <Text position={[0.05, -0.018, 0.005]} fontSize={0.018} color={hostile > 0 ? '#ff6b6b' : '#78909c'} anchorX="left">
        {hostile > 0 ? `⚠ ${hostile} HOSTILE CONTACT${hostile > 1 ? 'S' : ''}` : `CONTACTS: ${contacts.length} — ALL CLEAR`}
      </Text>
    </group>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function VRControlPanel() {
  const { isPresenting } = useXR()

  const vm         = useGameStore(s => s.viewMode)
  const lightMode  = useGameStore(s => s.lightMode)
  const thermalOn  = useGameStore(s => s.thermalEnabled)
  const periscopeOn = useGameStore(s => s.periscopeMode)
  const isInterior = vm === VIEW_MODES.INTERIOR || vm === 'interior'

  // ── Actions ────────────────────────────────────────────────────────────────
  const switchView = useCallback(() => {
    const nv = isInterior ? VIEW_MODES.EXTERIOR : VIEW_MODES.INTERIOR
    useGameStore.getState().setViewMode(nv)
    speakReactive(nv === VIEW_MODES.EXTERIOR ? 'exteriorView' : 'interiorView')
  }, [isInterior])

  const dive = useCallback(() => {
    useGameStore.getState().initiateDive(-100)
    indraVoice.speak('Diving. Target depth one hundred metres.', 'info')
  }, [])

  const surface = useCallback(() => {
    useGameStore.getState().surfaceSubmarine()
    indraVoice.speak('Surfacing. Blow all ballast.', 'info')
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
    speakReactive('periscopeUp')
  }, [])

  const fireTorpedo = useCallback(() => {
    const s = useGameStore.getState()
    const tgt = s.contacts.find(c => c.hostile && c.tracked) || s.contacts.find(c => c.hostile)
    if (tgt && s.torpedoCount > 0) {
      s.fireTorpedo(tgt.id)
      submarineAudio?.playTorpedoLaunch?.()
      speakReactive('torpedoFired')
    } else {
      indraVoice.speak(s.torpedoCount <= 0 ? 'Tubes empty.' : 'No target. Use TRACK first.', 'warning')
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

  const setLight = useCallback((mode) => {
    useGameStore.getState().setLightMode(mode)
    speakReactive('lightChange', mode)
  }, [])

  const nextScene = useCallback(() => {
    useGameStore.getState().advanceScene()
  }, [])

  if (!isPresenting) return null

  // ── Layout constants ────────────────────────────────────────────────────────
  // Panel is fixed inside the sub, on the console desk directly in front of player
  // Position: slightly below eye level, close enough to read, far enough to see all
  const PANEL_POS  = [0, 1.0, -1.1]   // right in front of seated player in cockpit
  const PANEL_ROT  = [-0.25, 0, 0]    // tilted up toward player like a real console

  // Button layout: 4 columns, rows spaced 0.1 apart
  const C = [-0.36, -0.12, 0.12, 0.36]  // column x positions
  const R = [0.15, 0.035, -0.085, -0.205, -0.325] // row y positions

  return (
    <group position={PANEL_POS} rotation={PANEL_ROT}>

      {/* ── Outer panel frame ── */}
      <mesh position={[0, 0, -0.008]}>
        <boxGeometry args={[1.02, 0.56, 0.014]} />
        <meshStandardMaterial color="#0a1825" roughness={0.8} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, -0.005]}>
        <boxGeometry args={[1.028, 0.568, 0.008]} />
        <meshStandardMaterial color="#0d3550" emissive="#0d3550" emissiveIntensity={0.3} />
      </mesh>

      {/* ── Title bar ── */}
      <mesh position={[0, 0.245, 0.001]}>
        <boxGeometry args={[1.02, 0.06, 0.005]} />
        <meshStandardMaterial color="#041525" roughness={0.9} />
      </mesh>
      <Text position={[-0.44, 0.245, 0.006]} fontSize={0.022} color="#00e5ff" anchorX="left" anchorY="middle" letterSpacing={0.1}>
        INS ARIHANT  S73  —  COMBAT CONTROL
      </Text>
      <Text position={[0.44, 0.245, 0.006]} fontSize={0.018} color="#ffe066" anchorX="right" anchorY="middle">
        {isInterior ? 'INTERIOR' : 'EXTERIOR'}
      </Text>

      {/* ── Status row ── */}
      <VRStatus pos={[0, 0.16, 0.002]} />

      {/* ── Section: NAVIGATION ── */}
      <Lbl pos={[-0.48, R[1] + 0.05, 0.004]} text="◈ NAVIGATION" color="rgba(0,229,255,0.5)" />
      <VRBtn pos={[C[0], R[1], 0.002]} label="DIVE" sub="100m" color="#ffcc44" onPress={dive} />
      <VRBtn pos={[C[1], R[1], 0.002]} label="SURFACE" color="#4cff8a" onPress={surface} />
      <VRBtn pos={[C[2], R[1], 0.002]} label="SONAR" sub="PING" color="#00e5ff" onPress={pingSonar} />
      <VRBtn pos={[C[3], R[1], 0.002]} label={isInterior ? '→ EXTERIOR' : '→ INTERIOR'} color="#64ffda" active={false} onPress={switchView} />

      {/* ── Section: SENSORS ── */}
      <Lbl pos={[-0.48, R[2] + 0.05, 0.004]} text="◈ SENSORS" color="rgba(0,229,255,0.5)" />
      <VRBtn pos={[C[0], R[2], 0.002]} label="THERMAL" color="#ff9f43" active={thermalOn} onPress={toggleThermal} />
      <VRBtn pos={[C[1], R[2], 0.002]} label="PERISCOPE" color="#a29bfe" active={periscopeOn} onPress={togglePeriscope} />
      <VRBtn pos={[C[2], R[2], 0.002]} label="TRACK" sub="HOSTILE" color="#ffd36a" onPress={trackContact} />
      <VRBtn pos={[C[3], R[2], 0.002]} label="DECOY" color="#a29bfe" onPress={deployDecoy} />

      {/* ── Section: WEAPONS ── */}
      <Lbl pos={[-0.48, R[3] + 0.05, 0.004]} text="◈ WEAPONS" color="rgba(255,107,107,0.6)" />
      <VRBtn pos={[C[0], R[3], 0.002]} label="TORPEDO" color="#ff6b6b" onPress={fireTorpedo} />
      <VRBtn pos={[C[1], R[3], 0.002]} label="BRAHMOS" color="#ffcc44" onPress={fireBrahmos} />

      {/* ── Section: LIGHTING ── */}
      <Lbl pos={[0.02, R[3] + 0.05, 0.004]} text="◈ LIGHTING" color="rgba(0,229,255,0.5)" />
      <VRBtn pos={[C[2], R[3], 0.002]} label="NORMAL" color="#00e5ff" active={lightMode === LIGHT_MODES.NORMAL} onPress={() => setLight(LIGHT_MODES.NORMAL)} />
      <VRBtn pos={[C[3], R[3], 0.002]} label="STEALTH" color="#a29bfe" active={lightMode === LIGHT_MODES.STEALTH} onPress={() => setLight(LIGHT_MODES.STEALTH)} />

      {/* ── Bottom row ── */}
      <VRBtn pos={[C[0], R[4], 0.002]} label="COMBAT" sub="STATIONS" color="#ff6b6b" active={lightMode === LIGHT_MODES.COMBAT} onPress={() => setLight(LIGHT_MODES.COMBAT)} />
      <VRBtn pos={[C[1], R[4], 0.002]} label="EMERGENCY" color="#ff4444" active={lightMode === LIGHT_MODES.EMERGENCY} onPress={() => setLight(LIGHT_MODES.EMERGENCY)} />
      <VRBtn pos={[C[2], R[4], 0.002]} label="LIGHTS OFF" color="#455a64" active={lightMode === LIGHT_MODES.OFF} onPress={() => setLight(LIGHT_MODES.OFF)} />
      <VRBtn pos={[C[3], R[4], 0.002]} label="▶ NEXT SCENE" color="#ffd600" onPress={nextScene} />

      {/* ── D-pad for movement ── */}
      {/* Up/Down throttle */}
      <Lbl pos={[-0.48, R[4] + 0.04, 0.004]} text="HELM" color="rgba(0,229,255,0.4)" />

      {/* ── Footer hint ── */}
      <mesh position={[0, -0.255, 0.001]}>
        <boxGeometry args={[1.02, 0.03, 0.003]} />
        <meshStandardMaterial color="#020c16" roughness={0.9} />
      </mesh>
      <Text position={[0, -0.255, 0.005]} fontSize={0.013} color="rgba(0,229,255,0.3)" anchorX="center" anchorY="middle" letterSpacing={0.05}>
        POINT CONTROLLER AT BUTTON  •  PULL TRIGGER TO ACTIVATE
      </Text>

      {/* ── Subtle glow light ── */}
      <pointLight position={[0, 0, 0.08]} color="#00e5ff" intensity={0.15} distance={1.2} />
    </group>
  )
}
import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore, DIVE_PHASES } from '../../stores/gameStore'
import { useSubmarineShake } from '../Environment/OceanSurfaceShader'

const IS_QUEST  = /OculusBrowser|Quest/.test(navigator.userAgent)
const IS_MOBILE = /Android|iPhone|iPad/.test(navigator.userAgent)
const IS_LOW    = IS_QUEST || IS_MOBILE

function Hull() {
  const s = useMemo(() => {
    const p = []
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      const x = (t - 0.5) * 22
      let r
      if (t < 0.15)      r = Math.sin((t / 0.15) * Math.PI / 2) * 2.2
      else if (t > 0.85) r = Math.sin(((1 - t) / 0.15) * Math.PI / 2) * 1.8
      else               r = 2.2
      p.push(new THREE.Vector2(r, x))
    }
    return p
  }, [])

  return (
    <mesh rotation={[0, 0, Math.PI / 2]}>
      <latheGeometry args={[s, IS_LOW ? 20 : 32]} />
      <meshStandardMaterial color="#141622" roughness={0.72} metalness={0.92} />
    </mesh>
  )
}

function IndianFlag({ width = 1.5, height = 0.54, zOffset = 0.001 }) {
  const stripeH = height / 3
  const chakraR = stripeH * 0.38
  return (
    <group>
      {[['#FF9933', stripeH], ['#F5F5F5', 0], ['#138808', -stripeH]].map(([color, y], i) => (
        <mesh key={i} position={[0, y, zOffset]}>
          <planeGeometry args={[width, stripeH]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0, 0, zOffset + 0.002]}>
        <ringGeometry args={[chakraR * 0.72, chakraR, 24]} />
        <meshStandardMaterial color="#000080" emissive="#0000aa" emissiveIntensity={1.0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => {
        const angle = (i / 24) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(angle)*chakraR*0.36, Math.sin(angle)*chakraR*0.36, zOffset+0.003]} rotation={[0,0,angle]}>
            <planeGeometry args={[chakraR*0.72, chakraR*0.04]} />
            <meshStandardMaterial color="#000080" emissive="#0000aa" emissiveIntensity={1.0} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        )
      })}
    </group>
  )
}

function Sail() {
  const SAIL_HALF_Z = 0.70
  const SAIL_HALF_X = 1.50
  const FLAG_W = 1.40, FLAG_H = 0.50, FLAG_Y = -0.30

  return (
    <group position={[1, 2.5, 0]}>
      <mesh>
        <boxGeometry args={[3, 2.5, 1.4]} />
        <meshStandardMaterial color="#15152a" roughness={0.6} metalness={0.9} />
      </mesh>
      <Text position={[0, 0.45, SAIL_HALF_Z + 0.01]} fontSize={0.42} color="#d8e6ff" anchorX="center" outlineWidth={0.015} outlineColor="#5ab8ff">S73</Text>
      <Text position={[0, 0.45, -(SAIL_HALF_Z + 0.01)]} rotation={[0, Math.PI, 0]} fontSize={0.42} color="#d8e6ff" anchorX="center" outlineWidth={0.015} outlineColor="#5ab8ff">S73</Text>
      <group position={[0, FLAG_Y, SAIL_HALF_Z]}>
        <IndianFlag width={FLAG_W} height={FLAG_H} zOffset={0.012} />
      </group>
      <group position={[0, FLAG_Y, -SAIL_HALF_Z]} rotation={[0, Math.PI, 0]}>
        <IndianFlag width={FLAG_W} height={FLAG_H} zOffset={0.012} />
      </group>
      <group position={[-SAIL_HALF_X, FLAG_Y, 0]} rotation={[0, -Math.PI/2, 0]}>
        <IndianFlag width={FLAG_W*0.72} height={FLAG_H*0.82} zOffset={0.012} />
      </group>
      <group position={[SAIL_HALF_X, FLAG_Y, 0]} rotation={[0, Math.PI/2, 0]}>
        <IndianFlag width={FLAG_W*0.72} height={FLAG_H*0.82} zOffset={0.012} />
      </group>
      <Text position={[0, -1.02, SAIL_HALF_Z + 0.01]} fontSize={0.18} color="#9fb0d8" anchorX="center">INS ARIHANT</Text>
      <Text position={[0, -1.02, -(SAIL_HALF_Z + 0.01)]} rotation={[0, Math.PI, 0]} fontSize={0.18} color="#9fb0d8" anchorX="center">INS ARIHANT</Text>
      <mesh position={[0.5, 1.8, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 1.5, 8]} />
        <meshStandardMaterial color="#222" metalness={0.9} />
      </mesh>
      <group position={[-0.45, 1.45, 0]}>
        <mesh><cylinderGeometry args={[0.05, 0.05, 2.1, IS_LOW ? 8 : 12]} /><meshStandardMaterial color="#2a313b" roughness={0.42} metalness={0.92} /></mesh>
        <mesh position={[0, 1.0, 0]}><cylinderGeometry args={[0.07, 0.07, 0.22, IS_LOW ? 10 : 14]} /><meshStandardMaterial color="#313844" roughness={0.35} metalness={0.94} /></mesh>
        <mesh position={[0.38, 1.06, 0]}><sphereGeometry args={[0.045, 10, 10]} /><meshStandardMaterial color="#dff6ff" emissive="#dff6ff" emissiveIntensity={0.35} metalness={0.7} roughness={0.18} /></mesh>
      </group>
    </group>
  )
}

function MissileHump() {
  return (
    <group position={[-3, 1.4, 0]}>
      <mesh>
        <capsuleGeometry args={[1.2, 4, IS_LOW ? 5 : 8, IS_LOW ? 10 : 16]} />
        <meshStandardMaterial color="#18182a" roughness={0.7} metalness={0.9} />
      </mesh>
      {[-1.2,-0.4,0.4,1.2].map((x,i) => (
        <mesh key={i} position={[x,1.2,0]}>
          <cylinderGeometry args={[0.25,0.25,0.1,IS_LOW?8:12]} />
          <meshStandardMaterial color="#222244" roughness={0.5} metalness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

function Propulsor() {
  const r  = useRef()
  const sp = useGameStore(s => s.speed)
  useFrame((_, d) => {
    if (r.current) r.current.rotation.x += sp * 0.05 * d
  })
  return (
    <group position={[-11.5, 0, 0]}>
      <mesh><cylinderGeometry args={[0.8,0.5,1.5,IS_LOW?10:16]} /><meshStandardMaterial color="#111128" roughness={0.5} metalness={0.95} /></mesh>
      <mesh ref={r} position={[0,-0.8,0]}>
        <torusGeometry args={[0.6,0.05,4,7]} />
        <meshStandardMaterial color="#2a2a3a" metalness={0.95} />
      </mesh>
    </group>
  )
}

function ControlSurfaces() {
  return (
    <group>
      <mesh position={[-10.5,0,1.8]}><boxGeometry args={[1.5,0.08,1.2]} /><meshStandardMaterial color="#1a1a2e" metalness={0.9} /></mesh>
      <mesh position={[-10.5,0,-1.8]}><boxGeometry args={[1.5,0.08,1.2]} /><meshStandardMaterial color="#1a1a2e" metalness={0.9} /></mesh>
      <mesh position={[-10.5,1,0]}><boxGeometry args={[1.5,1.2,0.08]} /><meshStandardMaterial color="#1a1a2e" metalness={0.9} /></mesh>
    </group>
  )
}

function TorpedoTubes() {
  return (
    <group position={[10,-0.3,0]}>
      {[[-0.3,0.3],[0.3,0.3],[-0.3,-0.3],[0.3,-0.3],[-0.3,0],[0.3,0]].map(([y,z],i) => (
        <mesh key={i} position={[0.5,y,z]} rotation={[0,0,Math.PI/2]}>
          <cylinderGeometry args={[0.12,0.12,0.5,IS_LOW?6:8]} />
          <meshStandardMaterial color="#0a0a18" metalness={0.95} roughness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

function BowHeadlights() {
  const depth = useGameStore(s => s.depth)
  const spotlightOn = useGameStore(s => s.spotlightOn)
  const active = spotlightOn || Math.abs(depth) > 5
  return (
    <group position={[10.6,0.1,0]}>
      {[0.55,-0.55].map((zPos,i) => (
        <group key={i} position={[0,0.28,zPos]}>
          <mesh>
            <cylinderGeometry args={[0.14,0.14,0.18,IS_LOW?12:18]} />
            <meshStandardMaterial color="#d9dee8" emissive={active?'#dff6ff':'#000000'} emissiveIntensity={active?2.5:0} metalness={0.9} roughness={0.3} />
          </mesh>
          {/* Quest: use pointLight instead of spotLight — spotLight can crash on some Quest firmware */}
          {active && <pointLight position={[3,-0.5,0]} color="#cfefff" intensity={active?8:0} distance={60} decay={1.8} />}
        </group>
      ))}
    </group>
  )
}

function SternLights() {
  const depth = useGameStore(s => s.depth)
  const active = Math.abs(depth) > 5
  return (
    <group position={[-11.9,0.35,0]}>
      <group position={[0,0,0.72]}>
        <mesh><sphereGeometry args={[0.09,IS_LOW?8:12,IS_LOW?8:12]} /><meshStandardMaterial color="#ff4d4d" emissive={active?'#ff2222':'#220000'} emissiveIntensity={active?2.4:0.2} /></mesh>
        {active && <pointLight color="#ff3b3b" intensity={1.8} distance={4} />}
      </group>
      <group position={[0,0,-0.72]}>
        <mesh><sphereGeometry args={[0.09,IS_LOW?8:12,IS_LOW?8:12]} /><meshStandardMaterial color="#44ff88" emissive={active?'#11ff66':'#00220c'} emissiveIntensity={active?2.4:0.2} /></mesh>
        {active && <pointLight color="#11ff66" intensity={1.8} distance={4} />}
      </group>
    </group>
  )
}

export default function SubmarineExterior() {
  const subRef = useRef()
  const divePhase = useGameStore(s => s.divePhase)
  const surfaceWaveIntensity = useGameStore(s => s.surfaceWaveIntensity)
  useSubmarineShake(subRef, divePhase, surfaceWaveIntensity)
  return (
    <group ref={subRef}>
      <Hull />
      <Sail />
      <MissileHump />
      <Propulsor />
      <ControlSurfaces />
      <TorpedoTubes />
      <BowHeadlights />
      <SternLights />
    </group>
  )
}
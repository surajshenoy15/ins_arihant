/**
 * VRDriver — moves the submarine using Quest thumbstick input
 * Left stick: throttle (forward/back) + strafe heading
 * Right stick: depth (up/down)
 * Mounts inside XRScene only when presenting
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import * as THREE from 'three'
import { useGameStore } from '../../stores/gameStore'

export default function VRDriver() {
  const { isPresenting, controllers } = useXR()
  const throttleRef = useRef(0)
  const yawRef      = useRef(0)
  const depthVelRef = useRef(0)

  const setDriveState = useGameStore(s => s.setDriveState)
  const speedRef   = useRef(useGameStore.getState().speed   ?? 0)
  const headingRef = useRef(useGameStore.getState().heading ?? 0)
  const depthRef   = useRef(useGameStore.getState().depth   ?? 0)

  useFrame((_, delta) => {
    if (!isPresenting) return

    // Read thumbstick axes from Quest controllers
    let lx = 0, ly = 0, rx = 0, ry = 0

    controllers?.forEach(ctrl => {
      try {
        const gp = ctrl.inputSource?.gamepad
        if (!gp?.axes) return
        const hand = ctrl.inputSource?.handedness
        // axes[2] = thumbstick X, axes[3] = thumbstick Y
        if (hand === 'left') {
          lx = Math.abs(gp.axes[2] ?? 0) > 0.15 ? (gp.axes[2] ?? 0) : 0
          ly = Math.abs(gp.axes[3] ?? 0) > 0.15 ? (gp.axes[3] ?? 0) : 0
        }
        if (hand === 'right') {
          rx = Math.abs(gp.axes[2] ?? 0) > 0.15 ? (gp.axes[2] ?? 0) : 0
          ry = Math.abs(gp.axes[3] ?? 0) > 0.15 ? (gp.axes[3] ?? 0) : 0
        }
      } catch(e) {}
    })

    // Left stick Y = throttle (push forward = dive faster / speed up)
    const throttleTarget = -ly   // negative Y = forward on most gamepads
    throttleRef.current  = THREE.MathUtils.lerp(throttleRef.current, throttleTarget, delta * 2.5)
    const desiredSpeed   = throttleRef.current * 5
    speedRef.current     = THREE.MathUtils.lerp(speedRef.current, desiredSpeed, delta * 2.2)
    if (Math.abs(speedRef.current) < 0.03) speedRef.current = 0

    // Left stick X = rudder / turn
    const turnAuth = THREE.MathUtils.clamp(Math.abs(speedRef.current) / 8, 0.15, 1.0)
    yawRef.current = THREE.MathUtils.lerp(yawRef.current, lx * turnAuth * 0.9, delta * 2.2)
    headingRef.current = (headingRef.current + yawRef.current * 60 * delta + 360) % 360

    // Right stick Y = depth control
    const depthTarget = ry * 18   // positive Y = dive on most gamepads
    depthVelRef.current = THREE.MathUtils.lerp(depthVelRef.current, depthTarget, delta * 2.4)
    if (Math.abs(ry) < 0.15) depthVelRef.current = THREE.MathUtils.lerp(depthVelRef.current, 0, delta * 1.8)
    depthRef.current = THREE.MathUtils.clamp(depthRef.current + depthVelRef.current * delta, -450, 2)

    setDriveState({
      heading: headingRef.current,
      depth:   depthRef.current,
      speed:   speedRef.current,
      playerDriving: Math.abs(lx) > 0.15 || Math.abs(ly) > 0.15 || Math.abs(ry) > 0.15,
    })
  })

  return null
}
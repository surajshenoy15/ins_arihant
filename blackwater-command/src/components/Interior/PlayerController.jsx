import React, { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '../../stores/gameStore'

const PERISCOPE_EYE = new THREE.Vector3(-0.1, 2.72, 0.62)
const PERISCOPE_FOV = 22
const NORMAL_FOV = 74
const SCOPE_ROTATE_SPEED = 0.55

export default function PlayerController() {
  const { camera } = useThree()

  const keys = useRef({})
  const controlsRef = useRef()
  const sway = useRef(0)
  const lerpedFov = useRef(NORMAL_FOV)
  const scopeYaw = useRef(0)
  const scopePitch = useRef(-0.06)
  const lastMouse = useRef({ x: 0, y: 0 })

  const togglePeriscope = useGameStore(s => s.togglePeriscope)
  const setPeriscopeHdg = useGameStore(s => s.setPeriscopeHeading)
  const periscopeMode = useGameStore(s => s.periscopeMode)
  const periscopeModeRef = useRef(periscopeMode)
  periscopeModeRef.current = periscopeMode

  useEffect(() => {
    camera.position.set(0, 1.7, 0)
    camera.near = 0.05
    camera.far = 200
    camera.updateProjectionMatrix()
  }, [camera])

  useEffect(() => {
    const onKeyDown = e => {
      keys.current[e.code] = true

      if (e.code === 'KeyP') {
        togglePeriscope()
        if (!periscopeModeRef.current) {
          const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
          scopeYaw.current = euler.y
          scopePitch.current = -0.06
        }
      }

      const store = useGameStore.getState()
      if (e.code === 'Digit9') store.decreaseInteriorBrightness?.()
      if (e.code === 'Digit0') store.increaseInteriorBrightness?.()
      if (e.code === 'KeyL') store.toggleInteriorFloodLights?.()
      if (e.code === 'KeyT') store.toggleThermal?.()
    }

    const onKeyUp = e => {
      keys.current[e.code] = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [camera, togglePeriscope])

  useEffect(() => {
    const onMouseMove = e => {
      if (!periscopeModeRef.current) return

      const dx = e.movementX ?? (e.clientX - lastMouse.current.x)
      const dy = e.movementY ?? (e.clientY - lastMouse.current.y)
      lastMouse.current = { x: e.clientX, y: e.clientY }

      scopeYaw.current -= dx * 0.003 * SCOPE_ROTATE_SPEED
      scopePitch.current -= dy * 0.003 * SCOPE_ROTATE_SPEED
      scopePitch.current = THREE.MathUtils.clamp(scopePitch.current, -0.35, 0.25)

      const deg = ((-scopeYaw.current * 180 / Math.PI) % 360 + 360) % 360
      setPeriscopeHdg(deg)
    }

    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [setPeriscopeHdg])

  useFrame((_, delta) => {
    const k = keys.current
    const isScope = periscopeModeRef.current

    if (isScope) {
      camera.position.lerp(PERISCOPE_EYE, 0.12)
      camera.quaternion.setFromEuler(
        new THREE.Euler(scopePitch.current, scopeYaw.current, 0, 'YXZ')
      )
      lerpedFov.current = THREE.MathUtils.lerp(lerpedFov.current, PERISCOPE_FOV, 0.08)
      camera.fov = lerpedFov.current
      camera.updateProjectionMatrix()

      if (controlsRef.current?.isLocked) controlsRef.current.unlock()
      return
    }

    lerpedFov.current = THREE.MathUtils.lerp(lerpedFov.current, NORMAL_FOV, 0.09)
    camera.fov = lerpedFov.current
    camera.updateProjectionMatrix()

    const dir = new THREE.Vector3()
    if (k.KeyW) dir.z -= 1
    if (k.KeyS) dir.z += 1
    if (k.KeyA) dir.x -= 1
    if (k.KeyD) dir.x += 1

    if (dir.length() > 0) {
      dir.normalize()

      const forward = new THREE.Vector3()
      camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()

      const right = new THREE.Vector3()
        .crossVectors(forward, new THREE.Vector3(0, 1, 0))
        .normalize()

      const move = new THREE.Vector3()
      move.addScaledVector(forward, -dir.z)
      move.addScaledVector(right, dir.x)
      move.multiplyScalar(3.2 * delta)

      camera.position.add(move)
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -4.6, 4.6)
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -2.2, 2.2)
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.8, 3.2)
    }

    sway.current += delta * 0.5
    camera.rotation.z = Math.sin(sway.current) * 0.004
  })

  return <PointerLockControls ref={controlsRef} makeDefault enabled={!periscopeMode} />
}
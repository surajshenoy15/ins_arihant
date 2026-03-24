import { useEffect, useRef } from 'react'
import { useGameStore, SCENES, LIGHT_MODES } from '../stores/gameStore'
import { runSceneDialogue } from '../systems/AIAssistant'
import { submarineAudio } from '../systems/AudioManager'

export default function SceneDirector() {
  const scene = useGameStore(s => s.currentScene)
  const prev = useRef(null)

  useEffect(() => {
    if (scene === prev.current) return
    prev.current = scene
    runSceneDialogue(scene)
    const S = useGameStore.getState

    switch (scene) {
      case SCENES.SYSTEMS_CHECK:
        // At harbor, surface level, no speed
        useGameStore.setState({ depth: 0, targetDepth: 0, speed: 0 })
        setTimeout(() => S().addContact('unknown'), 15000)
        break

      case SCENES.HARBOR_DEPARTURE:
        // Start moving, still at surface
        useGameStore.setState({ depth: 0, targetDepth: 0, speed: 5 })
        break

      case SCENES.SURFACE_TRANSIT:
        // Open sea, surface, faster
        useGameStore.setState({ depth: 0, targetDepth: 0, speed: 12 })
        break

      case SCENES.DIVE_SEQUENCE:
        // THE BIG DIVE — slow descent to 100m
        useGameStore.setState({ speed: 8 })
        S().initiateDive(-100)
        break

      case SCENES.SILENT_RUN:
        useGameStore.setState({ speed: 4, lightMode: LIGHT_MODES.STEALTH, targetDepth: -120 })
        break

      case SCENES.FIRST_CONTACT:
        setTimeout(() => { S().addContact('submarine'); submarineAudio.playSonarPing() }, 2000)
        useGameStore.setState({ targetDepth: -150 })
        break

      case SCENES.THREAT_ASSESSMENT:
        setTimeout(() => S().addContact('destroyer'), 3000)
        setTimeout(() => S().addContact('frigate'), 8000)
        break

      case SCENES.COMBAT_STATIONS:
        useGameStore.setState({ lightMode: LIGHT_MODES.COMBAT })
        submarineAudio.playAlarm()
        break

      case SCENES.TORPEDO_ENGAGEMENT:
        submarineAudio.playTorpedoLaunch()
        setTimeout(() => submarineAudio.playExplosion(), 4000)
        break

      case SCENES.BRAHMOS_STRIKE:
        submarineAudio.playMissileLaunch()
        setTimeout(() => submarineAudio.playExplosion(), 7000)
        break

      case SCENES.DAMAGE_CONTROL:
        S().triggerAlarm('torpedo_incoming')
        useGameStore.setState({ hullIntegrity: 85, targetDepth: -200 })
        submarineAudio.playAlarm()
        setTimeout(() => S().clearAlarm(), 12000)
        break

      case SCENES.DEEP_DIVE:
        useGameStore.setState({ targetDepth: -260, speed: 6, lightMode: LIGHT_MODES.STEALTH })
        break

      case SCENES.RECOVERY:
        useGameStore.setState({ targetDepth: -30, speed: 4 })
        break

      case SCENES.FINAL_STAND:
        setTimeout(() => { S().addContact('submarine'); S().addContact('destroyer'); S().addContact('frigate') }, 2000)
        useGameStore.setState({ lightMode: LIGHT_MODES.COMBAT })
        submarineAudio.playAlarm()
        break

      case SCENES.VICTORY:
        useGameStore.setState({ lightMode: LIGHT_MODES.NORMAL, speed: 8, targetDepth: 0 }) // Surface for victory
        S().clearAlarm()
        break
    }
  }, [scene])

  return null
}
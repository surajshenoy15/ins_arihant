import React, { useState, useEffect } from 'react'
import MainScene from './scenes/MainScene'
import HUDOverlay from './components/HUD/HUDOverlay'
import SonarDisplay from './components/Sonar/SonarDisplay'
import ThermalDisplay from './components/Thermal/ThermalDisplay'
import BiometricPanel from './components/Biometric/BiometricPanel'
import EmergencyEffects from './components/Emergency/EmergencyEffects'
import SceneDirector from './systems/SceneDirector'
import QuestHUD from './components/HUD/QuestHUD'
import { useGameStore, LIGHT_MODES, SCENES, VIEW_MODES } from './stores/gameStore'
import { runSceneDialogue, speakReactive, indraVoice, handleCommand } from './systems/AIAssistant'
import { submarineAudio } from './systems/AudioManager'

const IS_QUEST  = /OculusBrowser|Quest/.test(navigator.userAgent)
const IS_MOBILE = /Android|iPhone|iPad/.test(navigator.userAgent)
const IS_TOUCH  = IS_QUEST || IS_MOBILE

export default function App() {
  const [init, setInit] = useState(false)
  const auth = useGameStore(s => s.captainAuthenticated)
  const vm   = useGameStore(s => s.viewMode)
  const tif  = useGameStore(s => s.torpedoInFlight)
  const bif  = useGameStore(s => s.brahmoInFlight)

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (init) return
    setInit(true)
    runSceneDialogue(SCENES.BOOT)
  }, [init])

  // ── Keyboard shortcuts (desktop only) ────────────────────────────────────
  useEffect(() => {
    if (IS_TOUCH) return   // Quest/mobile: all controls via QuestHUD

    const onKey = e => {
      if (e.target.tagName === 'INPUT') return
      const S = useGameStore.getState

      switch (e.key) {
        case '1': S().setLightMode(LIGHT_MODES.NORMAL);     speakReactive('lightChange', LIGHT_MODES.NORMAL);     break
        case '2': S().setLightMode(LIGHT_MODES.STEALTH);    speakReactive('lightChange', LIGHT_MODES.STEALTH);    break
        case '3': S().setLightMode(LIGHT_MODES.COMBAT);     speakReactive('lightChange', LIGHT_MODES.COMBAT);     break
        case '4': S().setLightMode(LIGHT_MODES.EMERGENCY);  speakReactive('lightChange', LIGHT_MODES.EMERGENCY);  break
        case '5': S().setLightMode(LIGHT_MODES.OFF);        speakReactive('lightChange', LIGHT_MODES.OFF);        break
        case 't': case 'T': S().toggleThermal(); speakReactive(useGameStore.getState().thermalEnabled?'thermalEnabled':'thermalDisabled'); break
        case 'p': case 'P': S().triggerActiveSonar(); speakReactive('sonarPing'); submarineAudio?.playSonarPing?.(); break
        case 'v': case 'V': {
          const nv = S().viewMode === VIEW_MODES.INTERIOR ? VIEW_MODES.EXTERIOR : VIEW_MODES.INTERIOR
          S().setViewMode(nv); speakReactive(nv === VIEW_MODES.EXTERIOR ? 'exteriorView' : 'interiorView'); break
        }
        case 'l': case 'L': S().toggleSpotlight(); speakReactive(useGameStore.getState().spotlightOn?'spotlightOn':'spotlightOff'); break
        case 'f': case 'F': {
          const s = S(), tgt = s.contacts.find(c=>c.hostile&&c.tracked)||s.contacts.find(c=>c.hostile)
          if (tgt && s.torpedoCount > 0) { s.fireTorpedo(tgt.id); submarineAudio?.playTorpedoLaunch?.(); speakReactive('torpedoFired'); setTimeout(()=>submarineAudio?.playExplosion?.(),4000) }
          else if (s.torpedoCount<=0) indraVoice.speak('Torpedo tubes empty.','warning')
          else { const h=s.contacts.find(c=>c.hostile); if(h){s.trackContact(h.id);indraVoice.speak('Tracking '+h.name+'. Press F again.','info')} else indraVoice.speak('No hostile contacts.','warning') }
          break
        }
        case 'b': case 'B': {
          const s = S(), tgt = s.contacts.find(c=>c.hostile&&c.tracked)||s.contacts.find(c=>c.hostile)
          if (tgt && s.brahmosMissiles > 0) { s.fireBrahMos(tgt.id); submarineAudio?.playMissileLaunch?.(); speakReactive('brahmosFired'); setTimeout(()=>submarineAudio?.playExplosion?.(),7000) }
          else if (s.brahmosMissiles<=0) indraVoice.speak('BrahMos empty.','warning')
          else { const h=s.contacts.find(c=>c.hostile); if(h){s.trackContact(h.id);indraVoice.speak('Target acquired. Press B again.','info')} else indraVoice.speak('No target.','warning') }
          break
        }
        case 'c': case 'C': { const s=S(); if(s.decoyCount>0){s.deployDecoy();speakReactive('decoyDeploy')} else indraVoice.speak('Decoys exhausted.','warning'); break }
        case 'r': case 'R': { const u=S().contacts.find(c=>c.hostile&&!c.tracked); if(u){S().trackContact(u.id);indraVoice.speak('Tracking '+u.name+' bearing '+u.bearing.toFixed(0)+'.','info')} break }
        case 'n': case 'N': S().advanceScene(); setTimeout(()=>runSceneDialogue(useGameStore.getState().currentScene),900); break
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000810', overflow: 'hidden' }}>
      <SceneDirector />
      <MainScene />
      <BiometricPanel visible={!auth} />

      {auth && (
        <>
          {/* Desktop DOM overlays — hidden on Quest (causes compositing issues) */}
          {!IS_TOUCH && (
            <>
              <HUDOverlay />
              <SonarDisplay visible />
              <ThermalDisplay visible />
            </>
          )}

          <EmergencyEffects />

          {/* Missile in-flight indicators — simple CSS, safe on Quest */}
          {(tif || bif) && (
            <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:180, pointerEvents:'none', textAlign:'center' }}>
              {tif && !tif.detonated && <div style={missileStyle('#ff1744')}>⟫ TORPEDO RUNNING ⟪</div>}
              {tif?.detonated          && <div style={missileStyle('#ff6600',20)}>💥 TARGET DESTROYED</div>}
              {bif && !bif.detonated   && <div style={missileStyle('#FF9933')}>⟫ BRAHMOS MACH 2.8 ⟪</div>}
              {bif?.detonated          && <div style={missileStyle('#FF9933',20)}>💥 BRAHMOS IMPACT</div>}
            </div>
          )}

          {/* Exterior hint — desktop only */}
          {vm === 'exterior' && !IS_TOUCH && (
            <div style={{ position:'fixed', top:60, left:'50%', transform:'translateX(-50%)', zIndex:110,
              padding:'4px 16px', background:'rgba(0,4,16,0.8)', border:'1px solid rgba(100,255,218,0.2)',
              borderRadius:4, fontFamily:'var(--font-mono)', fontSize:10, color:'#64ffda', letterSpacing:2, pointerEvents:'none' }}>
              EXTERIOR VIEW — Scroll zoom • Drag orbit • V to return
            </div>
          )}
        </>
      )}

      {/* Quest / mobile full control HUD — rendered after auth too */}
      <QuestHUD />
    </div>
  )
}

const missileStyle = (color, size = 14) => ({
  fontFamily: 'var(--font-display)', fontSize: size, color,
  letterSpacing: 4, textShadow: `0 0 20px ${color}80`,
})
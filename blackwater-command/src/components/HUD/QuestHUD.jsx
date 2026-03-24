/**
 * QuestHUD — Full touch control panel for Quest browser / mobile
 * Replaces ALL keyboard shortcuts with on-screen buttons
 */
import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useGameStore, LIGHT_MODES, VIEW_MODES } from '../../stores/gameStore'
import { speakReactive, indraVoice, handleCommand } from '../../systems/AIAssistant'
import { submarineAudio } from '../../systems/AudioManager'

export const IS_QUEST  = /OculusBrowser|Quest/.test(navigator.userAgent)
export const IS_MOBILE = /Android|iPhone|iPad/.test(navigator.userAgent)
export const IS_TOUCH  = IS_QUEST || IS_MOBILE

const FONT = '"Share Tech Mono", monospace'

const BASE_BTN = {
  fontFamily: FONT,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,8,22,0.92)',
  border: '1px solid rgba(0,229,255,0.3)',
  borderRadius: 8, color: '#00e5ff',
  fontSize: 11, letterSpacing: 1,
  cursor: 'pointer', userSelect: 'none',
  WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation', backdropFilter: 'blur(8px)',
  padding: '0 10px', minWidth: 54, minHeight: 48,
  transition: 'all 0.1s', boxSizing: 'border-box',
}
const BTN_RED    = { ...BASE_BTN, border: '1px solid rgba(255,80,80,0.5)',    color: '#ff6b6b' }
const BTN_YELLOW = { ...BASE_BTN, border: '1px solid rgba(255,204,60,0.5)',   color: '#ffcc44' }
const BTN_GREEN  = { ...BASE_BTN, border: '1px solid rgba(76,255,138,0.45)', color: '#4cff8a' }
const BTN_PURPLE = { ...BASE_BTN, border: '1px solid rgba(162,155,254,0.5)', color: '#a29bfe' }

// ─── Reusable touch button ────────────────────────────────────────────────────
function Btn({ label, icon, variant = 'default', active = false, onPress, w, h = 48, size = 11 }) {
  const [down, setDown] = useState(false)
  const base = variant === 'red' ? BTN_RED
    : variant === 'yellow' ? BTN_YELLOW
    : variant === 'green'  ? BTN_GREEN
    : variant === 'purple' ? BTN_PURPLE
    : BASE_BTN

  const fire = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    setDown(true); onPress?.()
    setTimeout(() => setDown(false), 150)
  }, [onPress])

  return (
    <div onPointerDown={fire} style={{
      ...base,
      minHeight: h, width: w || 'auto', fontSize: size,
      background: active || down ? 'rgba(0,229,255,0.15)' : base.background,
      borderColor: active || down ? 'rgba(0,229,255,0.9)' : undefined,
      transform: down ? 'scale(0.92)' : 'scale(1)',
      opacity: down ? 0.75 : 1,
    }}>
      {icon && <span style={{ fontSize: 16, marginRight: label ? 5 : 0 }}>{icon}</span>}
      {label}
    </div>
  )
}

// ─── D-Pad (helm) ─────────────────────────────────────────────────────────────
function DrivePad() {
  const hold = useCallback((code) => {
    const fire = (down) => window.dispatchEvent(
      new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true })
    )
    fire(true)
    const up = () => {
      fire(false)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, [])

  const D = ({ code, icon, col, row }) => (
    <div onPointerDown={(e) => { e.preventDefault(); hold(code) }} style={{
      ...BASE_BTN, width: 52, height: 52, borderRadius: 8, fontSize: 22,
      gridColumn: col, gridRow: row,
    }}>{icon}</div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,52px)', gridTemplateRows: 'repeat(3,52px)', gap: 4, flexShrink: 0 }}>
      <D code="ArrowUp"    icon="▲" col={2} row={1} />
      <D code="ArrowLeft"  icon="◀" col={1} row={2} />
      <div style={{ ...BASE_BTN, width: 52, height: 52, borderRadius: 8, fontSize: 8, color: 'rgba(0,229,255,0.35)', gridColumn: 2, gridRow: 2 }}>HELM</div>
      <D code="ArrowRight" icon="▶" col={3} row={2} />
      <D code="ArrowDown"  icon="▼" col={2} row={3} />
    </div>
  )
}

// ─── Depth pad ────────────────────────────────────────────────────────────────
function DepthPad() {
  const hold = useCallback((code) => {
    const fire = (down) => window.dispatchEvent(
      new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true })
    )
    fire(true)
    const up = () => {
      fire(false)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
      <div onPointerDown={(e) => { e.preventDefault(); hold('KeyE') }}
        style={{ ...BTN_YELLOW, width: 52, height: 52, borderRadius: 8, fontSize: 22 }}>↑</div>
      <div style={{ fontFamily: FONT, fontSize: 8, color: 'rgba(0,229,255,0.35)', textAlign: 'center', padding: '2px 0' }}>DEPTH</div>
      <div onPointerDown={(e) => { e.preventDefault(); hold('KeyQ') }}
        style={{ ...BTN_YELLOW, width: 52, height: 52, borderRadius: 8, fontSize: 22 }}>↓</div>
    </div>
  )
}

// ─── INDRA AI panel ───────────────────────────────────────────────────────────
function AIVoicePanel() {
  const [listening,  setListening]  = useState(false)
  const [transcript, setTranscript] = useState('')
  const [lastReply,  setLastReply]  = useState('')
  const [supported,  setSupported]  = useState(false)
  const [textInput,  setTextInput]  = useState('')
  const recogRef = useRef(null)

  useEffect(() => {
    setSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition))
  }, [])

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setLastReply('Speech recognition unavailable. Use text input below.'); return }
    if (listening) { recogRef.current?.stop(); return }

    const r = new SR()
    recogRef.current = r
    r.lang = 'en-IN'; r.interimResults = false; r.maxAlternatives = 3

    r.onstart  = () => { setListening(true);  setTranscript('🎙 Listening...') }
    r.onend    = () => { setListening(false) }
    r.onerror  = (e) => { setListening(false); setTranscript(''); setLastReply(`Mic error: ${e.error}`) }
    r.onresult = (e) => {
      const best = e.results[0]?.[0]?.transcript || ''
      setTranscript(best)
      const orig = indraVoice.speak.bind(indraVoice)
      indraVoice.speak = (text, priority) => {
        setLastReply(text); orig(text, priority)
        setTimeout(() => { indraVoice.speak = orig }, 200)
      }
      handleCommand(best)
    }
    r.start()
  }, [listening])

  const submitText = useCallback(() => {
    if (!textInput.trim()) return
    const t = textInput.trim()
    setTranscript(t)
    const orig = indraVoice.speak.bind(indraVoice)
    indraVoice.speak = (text, priority) => {
      setLastReply(text); orig(text, priority)
      setTimeout(() => { indraVoice.speak = orig }, 200)
    }
    handleCommand(t)
    setTextInput('')
  }, [textInput])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Btn
        icon={listening ? '🔴' : '🎙️'}
        label={listening ? 'LISTENING — TAP TO STOP' : supported ? 'TAP TO SPEAK TO INDRA' : 'VOICE UNAVAILABLE'}
        variant={listening ? 'red' : 'default'}
        active={listening}
        onPress={startListening}
        h={50}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitText()}
          placeholder="Type command or question..."
          style={{
            flex: 1, fontFamily: FONT, fontSize: 11,
            background: 'rgba(0,8,22,0.92)', border: '1px solid rgba(0,229,255,0.25)',
            borderRadius: 6, color: '#00e5ff', padding: '0 10px',
            height: 42, outline: 'none', boxSizing: 'border-box',
          }}
        />
        <div onPointerDown={(e) => { e.preventDefault(); submitText() }}
          style={{ ...BASE_BTN, width: 44, height: 42, minHeight: 'unset', borderRadius: 6, fontSize: 18 }}>⮕</div>
      </div>
      {transcript && (
        <div style={{ fontSize: 9, color: 'rgba(0,229,255,0.55)', padding: '4px 8px', background: 'rgba(0,229,255,0.05)', borderRadius: 4, lineHeight: 1.6 }}>
          YOU: {transcript}
        </div>
      )}
      {lastReply && (
        <div style={{ fontSize: 9, color: '#ffe066', padding: '4px 8px', background: 'rgba(255,224,102,0.06)', borderRadius: 4, lineHeight: 1.6, wordBreak: 'break-word' }}>
          INDRA: {lastReply}
        </div>
      )}
      <div style={{ fontSize: 8, color: 'rgba(0,229,255,0.3)', lineHeight: 1.6 }}>
        Try: "dive 100 meters" · "fire torpedo" · "stealth mode" · "status report"
      </div>
    </div>
  )
}

// ─── Main Quest HUD ───────────────────────────────────────────────────────────
export default function QuestHUD() {
  const [tab,      setTab]      = useState('drive')
  const [expanded, setExpanded] = useState(true)

  const vm          = useGameStore(s => s.viewMode)
  const depth       = useGameStore(s => s.depth)
  const speed       = useGameStore(s => s.speed)
  const heading     = useGameStore(s => s.heading)
  const thermalOn   = useGameStore(s => s.thermalEnabled)
  const periscopeOn = useGameStore(s => s.periscopeMode)
  const lightMode   = useGameStore(s => s.lightMode)
  const torpedoes   = useGameStore(s => s.torpedoCount)
  const brahmos     = useGameStore(s => s.brahmosMissiles)
  const contacts    = useGameStore(s => s.contacts)
  const isInterior  = vm === VIEW_MODES.INTERIOR || vm === 'interior'
  const hostile     = contacts.filter(c => c.hostile).length

  const switchView = useCallback(() => {
    const nv = isInterior ? VIEW_MODES.EXTERIOR : VIEW_MODES.INTERIOR
    useGameStore.getState().setViewMode(nv)
    speakReactive(nv === VIEW_MODES.EXTERIOR ? 'exteriorView' : 'interiorView')
  }, [isInterior])

  const toggleThermal = useCallback(() => {
    useGameStore.getState().toggleThermal()
    speakReactive(useGameStore.getState().thermalEnabled ? 'thermalEnabled' : 'thermalDisabled')
  }, [])

  const togglePeriscope = useCallback(() => {
    useGameStore.getState().togglePeriscope?.()
    speakReactive('periscopeUp')
  }, [])

  const pingSonar = useCallback(() => {
    useGameStore.getState().triggerActiveSonar()
    speakReactive('sonarPing')
    submarineAudio?.playSonarPing?.()
  }, [])

  const fireTorpedo = useCallback(() => {
    const s = useGameStore.getState()
    const tgt = s.contacts.find(c => c.hostile && c.tracked) || s.contacts.find(c => c.hostile)
    if (tgt && s.torpedoCount > 0) {
      s.fireTorpedo(tgt.id)
      submarineAudio?.playTorpedoLaunch?.()
      speakReactive('torpedoFired')
    } else {
      indraVoice.speak(s.torpedoCount <= 0 ? 'Tubes empty, Captain.' : 'No target. Designate a contact first.', 'warning')
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

  const trackHostile = useCallback(() => {
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

  // Only show on touch devices
  if (!IS_TOUCH) return null

  const tabStyle = (t) => ({
    ...BASE_BTN, flex: 1, minHeight: 36, fontSize: 9, borderRadius: 0,
    background: tab === t ? 'rgba(0,229,255,0.08)' : 'rgba(0,8,22,0.92)',
    border: 'none',
    borderBottom: tab === t ? '2px solid #00e5ff' : '2px solid rgba(0,229,255,0.1)',
    color: tab === t ? '#00e5ff' : 'rgba(0,229,255,0.45)',
    letterSpacing: 0.5,
  })

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900, fontFamily: FONT, pointerEvents: 'auto' }}>

      {/* ── Status bar + view toggle (always visible) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(0,4,16,0.97)', borderTop: '1px solid rgba(0,229,255,0.2)',
        padding: '4px 10px', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'rgba(0,229,255,0.7)', flex: 1 }}>
          <span style={{ color: '#ffe066' }}>{String(Math.round(heading)).padStart(3,'0')}°</span>
          <span style={{ color: depth < -150 ? '#ff6b6b' : '#00e5ff' }}>{Math.abs(depth).toFixed(0)}m</span>
          <span style={{ color: '#4cff8a' }}>{speed.toFixed(1)}kn</span>
          {hostile > 0 && <span style={{ color: '#ff6b6b' }}>⚠ {hostile} HOSTILE</span>}
        </div>
        <div onPointerDown={(e) => { e.preventDefault(); switchView() }} style={{
          ...BASE_BTN, minWidth: 110, minHeight: 34, fontSize: 10,
          border: '1px solid rgba(0,229,255,0.6)', background: 'rgba(0,229,255,0.12)', padding: '0 10px',
        }}>
          {isInterior ? '🔭 EXTERIOR' : '🛳 INTERIOR'}
        </div>
        <div onPointerDown={(e) => { e.preventDefault(); setExpanded(x => !x) }} style={{
          ...BASE_BTN, minWidth: 36, minHeight: 34, fontSize: 16,
        }}>
          {expanded ? '▼' : '▲'}
        </div>
      </div>

      {/* ── Expandable panel ── */}
      {expanded && (
        <div style={{ background: 'rgba(0,4,16,0.97)', borderTop: '1px solid rgba(0,229,255,0.1)' }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
            {[['drive','⎋ DRIVE'],['tactical','⊕ TACT'],['weapons','⚔ WPN'],['lights','◉ LIGHT'],['ai','◈ INDRA']].map(([t, label]) => (
              <div key={t} onPointerDown={(e) => { e.preventDefault(); setTab(t) }} style={tabStyle(t)}>{label}</div>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: 10, minHeight: 140 }}>

            {tab === 'drive' && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                <DrivePad />
                <DepthPad />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <Btn icon="🔭" label={periscopeOn ? 'LOWER SCOPE' : 'PERISCOPE'} onPress={togglePeriscope} active={periscopeOn} h={44} />
                  <Btn icon={thermalOn ? '🌡' : '📡'} label={thermalOn ? 'THERMAL ON' : 'THERMAL'} onPress={toggleThermal} active={thermalOn} variant={thermalOn ? 'green' : 'default'} h={44} />
                  <Btn icon="📡" label="SONAR PING" onPress={pingSonar} variant="yellow" h={44} />
                </div>
              </div>
            )}

            {tab === 'tactical' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 9, color: 'rgba(0,229,255,0.5)', marginBottom: 2 }}>
                  CONTACTS: {contacts.length} total — {hostile} hostile
                </div>
                <div style={{ maxHeight: 80, overflowY: 'auto', marginBottom: 4 }}>
                  {contacts.slice(0, 6).map(c => (
                    <div key={c.id}
                      onPointerDown={(e) => { e.preventDefault(); useGameStore.getState().trackContact(c.id); speakReactive('contactTracked') }}
                      style={{
                        display: 'flex', justifyContent: 'space-between', padding: '4px 8px',
                        background: c.tracked ? 'rgba(255,80,80,0.12)' : 'rgba(0,229,255,0.04)',
                        border: `1px solid ${c.hostile ? 'rgba(255,80,80,0.3)' : 'rgba(0,229,255,0.15)'}`,
                        borderRadius: 4, marginBottom: 3, fontSize: 9,
                        color: c.hostile ? '#ff6b6b' : '#ffd36a', cursor: 'pointer',
                      }}>
                      <span>{c.name}</span>
                      <span>{c.bearing.toFixed(0)}° / {c.distance.toFixed(0)}m {c.tracked ? '[LOCKED]' : ''}</span>
                    </div>
                  ))}
                  {contacts.length === 0 && <div style={{ fontSize: 9, color: 'rgba(0,229,255,0.3)', padding: '8px 0' }}>No contacts</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn icon="🎯" label="TRACK" onPress={trackHostile} variant="yellow" h={44} />
                  <Btn icon="🔊" label="SONAR"  onPress={pingSonar}    variant="default" h={44} />
                  <Btn icon="🪄" label="DECOY"  onPress={deployDecoy}  variant="purple"  h={44} />
                </div>
              </div>
            )}

            {tab === 'weapons' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, fontSize: 9, color: 'rgba(0,229,255,0.5)' }}>
                    TORPEDOES<br />
                    <span style={{ fontSize: 22, color: torpedoes > 0 ? '#ff6b6b' : 'rgba(255,107,107,0.3)', fontWeight: 'bold' }}>{torpedoes}</span>
                    <span style={{ color: 'rgba(0,229,255,0.3)' }}>/6</span>
                  </div>
                  <div style={{ flex: 1, fontSize: 9, color: 'rgba(0,229,255,0.5)' }}>
                    BRAHMOS<br />
                    <span style={{ fontSize: 22, color: brahmos > 0 ? '#ffcc44' : 'rgba(255,204,68,0.3)', fontWeight: 'bold' }}>{brahmos}</span>
                    <span style={{ color: 'rgba(0,229,255,0.3)' }}>/4</span>
                  </div>
                </div>
                <Btn icon="🚀" label={`FIRE TORPEDO (${torpedoes} left)`} onPress={fireTorpedo} variant="red"    h={50} />
                <Btn icon="💥" label={`BRAHMOS STRIKE (${brahmos} left)`} onPress={fireBrahmos} variant="yellow" h={50} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn icon="🎯" label="LOCK TARGET"   onPress={trackHostile} h={44} />
                  <Btn icon="🪄" label="DEPLOY DECOY"  onPress={deployDecoy} variant="purple" h={44} />
                </div>
              </div>
            )}

            {tab === 'lights' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Btn label="NORMAL"    onPress={() => setLight(LIGHT_MODES.NORMAL)}     active={lightMode === LIGHT_MODES.NORMAL}     h={48} />
                <Btn label="STEALTH"   onPress={() => setLight(LIGHT_MODES.STEALTH)}    active={lightMode === LIGHT_MODES.STEALTH}    variant="purple" h={48} />
                <Btn label="COMBAT"    onPress={() => setLight(LIGHT_MODES.COMBAT)}     active={lightMode === LIGHT_MODES.COMBAT}     variant="red"    h={48} />
                <Btn label="EMERGENCY" onPress={() => setLight(LIGHT_MODES.EMERGENCY)}  active={lightMode === LIGHT_MODES.EMERGENCY}  variant="red"    h={48} />
                <Btn label="LIGHTS OFF" onPress={() => setLight(LIGHT_MODES.OFF)}       active={lightMode === LIGHT_MODES.OFF}        h={48} />
                <Btn label="SPOTLIGHT"  onPress={() => { useGameStore.getState().toggleSpotlight(); speakReactive('spotlightOn') }}
                  active={useGameStore.getState()?.spotlightOn} variant="yellow" h={48} />
              </div>
            )}

            {tab === 'ai' && <AIVoicePanel />}

          </div>
        </div>
      )}
    </div>
  )
}
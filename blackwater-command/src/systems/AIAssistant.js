/**
 * INS ARIHANT — AI System "INDRA"
 * Powered by Claude API — answers ANY question immediately
 * Commands are a fast-path override; everything else goes to Claude instantly
 */
import { useGameStore, SCENES, LIGHT_MODES } from '../stores/gameStore'

// ── INTERACTION GATE ──────────────────────────────────────────────────────────
let userHasInteracted = false
const pendingQueue = []

function flushPending() {
  while (pendingQueue.length > 0) {
    const { text, priority } = pendingQueue.shift()
    _doSpeak(text, priority)
  }
}

function ensureInteraction() {
  if (userHasInteracted) return
  const onInteract = () => {
    userHasInteracted = true
    const warm = new SpeechSynthesisUtterance('')
    warm.volume = 0
    window.speechSynthesis?.speak(warm)
    flushPending()
    window.removeEventListener('click',      onInteract)
    window.removeEventListener('keydown',    onInteract)
    window.removeEventListener('touchstart', onInteract)
  }
  window.addEventListener('click',      onInteract)
  window.addEventListener('keydown',    onInteract)
  window.addEventListener('touchstart', onInteract)
}

ensureInteraction()

// ── VOICE SYNTHESIS ───────────────────────────────────────────────────────────
class AIVoice {
  constructor() {
    this.synth = window.speechSynthesis
    this.voice = null
    this._ready = false
    this._init()
  }

  _init() {
    const load = () => {
      const voices = this.synth.getVoices()
      if (voices.length === 0) return

      this.voice =
        voices.find(v => v.name.includes('Google UK English Male')) ||
        voices.find(v => v.name.includes('Microsoft George')) ||
        voices.find(v => v.name.includes('Daniel')) ||
        voices.find(v => v.lang === 'en-IN') ||
        voices.find(v => v.lang === 'en-GB') ||
        voices.find(v => v.lang.startsWith('en')) ||
        voices[0]

      this._ready = true
    }

    load()
    this.synth.onvoiceschanged = load
    setTimeout(load, 200)
    setTimeout(load, 800)
  }

  speak(text, priority = 'normal') {
    if (!this.synth || !text) return
    useGameStore.getState().addAIMessage(text, priority)

    if (!userHasInteracted) {
      pendingQueue.push({ text, priority })
      return
    }

    _doSpeak(text, priority)
  }

  stop() { this.synth?.cancel() }
}

function _doSpeak(text, priority) {
  const synth = window.speechSynthesis
  if (!synth) return

  if (priority === 'critical') synth.cancel()

  const speak = (str) => {
    const u = new SpeechSynthesisUtterance(str)
    if (indraVoice._ready && indraVoice.voice) u.voice = indraVoice.voice
    u.rate   = 0.92
    u.pitch  = 0.86
    u.volume = 1.0
    u.lang   = 'en-GB'
    synth.speak(u)
  }

  // Split long text to avoid Chrome's ~15s cutoff bug
  if (text.length > 200) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
    sentences.forEach((s, i) => setTimeout(() => speak(s.trim()), i * 50))
    return
  }

  speak(text)
}

export const indraVoice = new AIVoice()

// ── SUBMARINE STATE SUMMARY ───────────────────────────────────────────────────
function getSubStateContext() {
  const s = useGameStore.getState()
  return `Current submarine state:
- Scene: ${s.currentScene}
- Depth: ${Math.abs(s.depth).toFixed(0)}m (${s.depth >= -1 ? 'SURFACE' : s.depth > -100 ? 'shallow' : s.depth > -250 ? 'deep' : 'abyss'})
- Speed: ${s.speed} knots, Heading: ${s.heading.toFixed(0)}°
- Hull: ${s.hullIntegrity}%, Reactor: ${s.reactorTemp}°K, O2: ${s.oxygenLevel}%
- Torpedoes: ${s.torpedoCount}/6, BrahMos: ${s.brahmosMissiles}/4, Decoys: ${s.decoyCount}/8
- Contacts: ${s.contacts.length} (${s.contacts.filter(c => c.hostile).length} hostile)
- Lighting: ${s.lightMode}, Alarm: ${s.alarmActive ? s.alarmType : 'none'}
- Dive phase: ${s.divePhase}
- Sonar: ${s.sonarMode}${s.thermalEnabled ? ', Thermal ON' : ''}`
}

// ── COMMAND FAST-PATH ─────────────────────────────────────────────────────────
// Only exact operational commands are intercepted here.
// Everything else — questions, general knowledge, anything ambiguous — goes to Claude.
function tryExecuteCommand(text) {
  const s = useGameStore.getState()
  const c = text.toLowerCase()

  // Dive / Surface
  if (/\b(dive|submerge|take us down|go down)\b/.test(c)) {
    const m = c.match(/(\d+)\s*(?:m|meters|metres)/)
    const target = m ? -parseInt(m[1]) : -100
    s.initiateDive(target)
    return `Initiating dive. Target depth ${Math.abs(target)} metres. Flooding ballast tanks.`
  }
  if (/\b(surface|come up|ascend|blow ballast)\b/.test(c)) {
    s.surfaceSubmarine()
    return `Emergency surface. Blowing all ballast. Rising.`
  }

  // Lighting — only when the word "light" or "mode" is also present
  if (/\bstealth\b/.test(c) && /\b(light|mode|rig)\b/.test(c)) { s.setLightMode(LIGHT_MODES.STEALTH); return "Stealth lighting engaged. Rig for ultra-quiet." }
  if (/\bcombat\b/.test(c) && /\b(light|station)\b/.test(c))   { s.setLightMode(LIGHT_MODES.COMBAT);  return "Combat lighting. Red stations. Weapons free." }
  if (/\b(emergency|red alert)\b/.test(c))                       { s.setLightMode(LIGHT_MODES.EMERGENCY); return "Emergency lighting! All stations report!" }
  if (/\b(normal light|lights on|standard light)\b/.test(c))     { s.setLightMode(LIGHT_MODES.NORMAL);    return "Standard lighting restored." }
  if (/\b(lights off|blackout)\b/.test(c))                       { s.setLightMode(LIGHT_MODES.OFF);       return "All lights secured. Running dark." }
  if (/\bspotlight\b/.test(c))                                    { s.toggleSpotlight(); return useGameStore.getState().spotlightOn ? "Exterior spotlight activated." : "Spotlight secured." }

  // Sonar — only explicit on/off commands
  if (/\bsonar\b/.test(c) && /\b(on|active|ping|activate)\b/.test(c)) { s.triggerActiveSonar(); return "Active sonar pulse transmitted. Our position is now exposed." }
  if (/\bpassive sonar\b/.test(c))                                      { return "Passive sonar engaged. Listening on all arrays." }

  // Thermal — only explicit toggle commands
  if (/\b(thermal on|enable thermal|activate thermal)\b/.test(c)) { if (!useGameStore.getState().thermalEnabled) s.toggleThermal(); return "Thermal imaging active." }
  if (/\b(thermal off|disable thermal)\b/.test(c))                 { if (useGameStore.getState().thermalEnabled) s.toggleThermal();  return "Thermal overlay secured." }

  // Weapons — explicit fire commands only
  if (/\b(fire torpedo|launch torpedo|shoot torpedo)\b/.test(c)) {
    const t = s.contacts.find(x => x.hostile && x.tracked) || s.contacts.find(x => x.hostile)
    if (t && s.torpedoCount > 0) { s.fireTorpedo(t.id); return "TORPEDO AWAY! Fish is running hot, straight, normal!" }
    if (s.torpedoCount <= 0) return "All torpedo tubes empty, Captain."
    return "No valid target. Track a contact first."
  }
  if (/\b(fire brahmos|launch brahmos|launch missile|fire missile)\b/.test(c)) {
    const t = s.contacts.find(x => x.hostile && x.tracked) || s.contacts.find(x => x.hostile)
    if (t && s.brahmosMissiles > 0) { s.fireBrahMos(t.id); return "BrahMos LAUNCHED! Mach 2.8 supersonic cruise missile away!" }
    if (s.brahmosMissiles <= 0) return "BrahMos magazine empty."
    return "No target available for BrahMos strike."
  }
  if (/\b(deploy decoy|launch decoy|countermeasure)\b/.test(c)) {
    if (s.decoyCount > 0) { s.deployDecoy(); return "Acoustic decoys deployed. Countermeasures active." }
    return "Decoy reserves exhausted."
  }

  // Track — explicit only
  if (/\b(track contact|lock on|lock target)\b/.test(c)) {
    const x = s.contacts.find(z => !z.tracked && z.hostile)
    if (x) { s.trackContact(x.id); return `Now tracking ${x.name} at bearing ${x.bearing.toFixed(0)}. Firing solution computing.` }
    return "No untracked hostile contacts to lock."
  }

  // View
  if (/\b(exterior view|outside view|look outside)\b/.test(c)) { s.setViewMode('exterior'); return "Switching to exterior camera." }
  if (/\b(interior view|inside view|return to cic)\b/.test(c)) { s.setViewMode('interior'); return "Returning to Combat Information Center." }

  // Periscope
  if (/\b(raise periscope|scope up|periscope up)\b/.test(c)) {
    s.togglePeriscope?.()
    return useGameStore.getState().periscopeMode ? "Periscope raised. Scanning the surface." : "Periscope lowered. Running deep."
  }

  // Status report — explicit only
  if (/\b(status report|sitrep|give me a report)\b/.test(c)) {
    return `INS Arihant status: Depth ${Math.abs(s.depth).toFixed(0)}m, Speed ${s.speed} knots, Heading ${s.heading.toFixed(0)}°. Hull ${s.hullIntegrity}%. Reactor ${s.reactorTemp}°K. ${s.contacts.length} contacts, ${s.contacts.filter(x => x.hostile).length} hostile. Torpedoes: ${s.torpedoCount}. BrahMos: ${s.brahmosMissiles}. All systems operational.`
  }

  // Scene advance — explicit only
  if (/\b(next scene|advance scene|continue mission|proceed to next)\b/.test(c) ||
      c === 'next' || c === 'proceed') {
    s.advanceScene()
    setTimeout(() => runSceneDialogue(useGameStore.getState().currentScene), 900)
    return null
  }

  // ── NO MATCH — let Claude handle it ──
  return null
}

// ── CLAUDE API CALL ───────────────────────────────────────────────────────────
// No global lock — each call is independent. Overlapping questions are fine.
async function askClaude(userText) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: `You are INDRA (Integrated Naval Defence & Reconnaissance Advisor), the AI aboard INS Arihant (S73), an Indian Navy nuclear submarine. Speak with calm authority and military precision.

CRITICAL: Answer ALL questions — general knowledge, science, history, maths, trivia, jokes, advice, anything. You are like Alexa but smarter and aboard a submarine. Always answer directly in 1-3 short sentences optimised for spoken voice (no markdown, no bullet points, no lists). Stay in character as a ship AI but NEVER refuse to answer because it isn't submarine-related.

For submarine operations, reference the current state. End critical warnings with "Captain". Occasionally say "Jai Hind." You are on patrol in the Bay of Bengal.

${getSubStateContext()}`,
        messages: [{ role: 'user', content: userText }],
      }),
    })

    if (!response.ok) throw new Error(`API ${response.status}`)

    const data = await response.json()
    const aiText = data.content?.[0]?.text?.trim() ||
                   'Systems interference. Repeat your question, Captain.'

    // Reactive side-effects from AI response
    const lower = aiText.toLowerCase()
    if (lower.includes('activating sonar') || lower.includes('sonar activated')) useGameStore.getState().triggerActiveSonar()
    if (lower.includes('stealth mode')     || lower.includes('stealth lighting'))  useGameStore.getState().setLightMode(LIGHT_MODES.STEALTH)
    if (lower.includes('combat stations'))                                          useGameStore.getState().setLightMode(LIGHT_MODES.COMBAT)

    indraVoice.speak(aiText, 'normal')
  } catch (err) {
    console.warn('INDRA API error:', err)
    // Minimal fallback — don't pretend to be broken for every error
    indraVoice.speak(
      'Comm channel interference. Try again in a moment, Captain.',
      'info'
    )
  }
}

// ── MAIN COMMAND HANDLER ──────────────────────────────────────────────────────
export async function handleCommand(userText) {
  if (!userText || userText.trim().length < 2) return

  // 1. Try instant command execution
  const commandResult = tryExecuteCommand(userText)
  if (commandResult !== null) {
    // commandResult === undefined means scene-advance with no speech
    if (commandResult) indraVoice.speak(commandResult, 'info')
    return true
  }

  // 2. Everything else → Claude, immediately, no lock
  askClaude(userText)   // intentionally NOT awaited — fire and forget for instant feel
  return true
}

// ── SCENE DIALOGUES ───────────────────────────────────────────────────────────
const DLG = {
  [SCENES.BOOT]: [
    { d: 1500,  t: "Nuclear reactor online. Steam turbines at full power.", p: 'info' },
    { d: 4500,  t: "Initializing INDRA — your intelligent combat advisor. I can answer any question and control all submarine systems. Just speak naturally.", p: 'info' },
    { d: 9000,  t: "INS Arihant, hull S73. We are currently at berth, Visakhapatnam Naval Dockyard. Awaiting your authentication, Captain.", p: 'normal' },
  ],
  [SCENES.AUTH]: [
    { d: 1000, t: "Place your hand on the scanner. Indian Naval Command requires biometric confirmation.", p: 'normal' },
  ],
  [SCENES.SYSTEMS_CHECK]: [
    { d: 1000,  t: "Authentication confirmed. Welcome aboard INS Arihant, Captain. I am INDRA. Ask me anything.", p: 'normal' },
    { d: 6000,  t: "Try speaking to me naturally. Say: status report, or ask: what are our weapons?", p: 'info' },
    { d: 14000, t: "Weapons loaded: six heavyweight torpedoes, four BrahMos supersonic cruise missiles, and twelve K-15 Sagarika ballistic missiles.", p: 'info' },
    { d: 22000, t: "All departments report ready. Say: next, or: continue mission, whenever you are ready to proceed.", p: 'normal' },
  ],
  [SCENES.HARBOR_DEPARTURE]: [
    { d: 1000,  t: "Casting off from Visakhapatnam Naval Dockyard. All lines clear.", p: 'normal' },
    { d: 5000,  t: "We are at the surface. The harbour is visible through the viewport.", p: 'info' },
    { d: 12000, t: "Clearing the harbour channel. Open sea ahead. The Bay of Bengal awaits.", p: 'normal' },
    { d: 18000, t: "Captain, say: dive to 100 meters, when you are ready to submerge.", p: 'info' },
    { d: 25000, t: "The Indian tricolour flies on our sail. Visakhapatnam grows smaller behind us. Jai Hind.", p: 'normal' },
  ],
  [SCENES.SURFACE_TRANSIT]: [
    { d: 1000,  t: "Surface transit. Speed twelve knots.", p: 'normal' },
    { d: 8000,  t: "Mission orders: proceed to patrol zone Alpha-7. Investigate hostile submarine activity.", p: 'warning' },
    { d: 15000, t: "Captain, we should dive before entering the patrol zone.", p: 'info' },
  ],
  [SCENES.DIVE_SEQUENCE]: [
    { d: 500,   t: "DIVE! DIVE! DIVE! Flood all main ballast tanks! Bow planes down fifteen degrees!", p: 'critical' },
    { d: 4000,  t: "Passing ten metres. Sunlight fading.", p: 'info' },
    { d: 10000, t: "Passing fifty metres. Pressure increasing on the hull.", p: 'info' },
    { d: 16000, t: "One hundred metres. Fully submerged. This is our domain now.", p: 'normal' },
    { d: 22000, t: "Trim satisfactory. Submarine is stable. Say: stealth mode, to rig for quiet.", p: 'info' },
  ],
  [SCENES.SILENT_RUN]: [
    { d: 1000,  t: "Silent running. Reducing all machinery noise.", p: 'warning' },
    { d: 6000,  t: "Speed four knots. We are a hole in the ocean.", p: 'info' },
    { d: 14000, t: "Hostile assets ahead. Recommend activating sonar. Say: turn on sonar.", p: 'info' },
  ],
  [SCENES.FIRST_CONTACT]: [
    { d: 1000,  t: "Contact! Sonar bearing zero-six-five! Mechanical transients — this is a submarine.", p: 'critical' },
    { d: 5000,  t: "Designating Sierra One. Nuclear signature. Does not match any friendly forces.", p: 'warning' },
    { d: 12000, t: "Say: track, to lock weapons. Then: fire torpedo, to engage.", p: 'critical' },
  ],
  [SCENES.THREAT_ASSESSMENT]: [
    { d: 1000,  t: "Multiple contacts. Enemy battle group entering our waters.", p: 'warning' },
    { d: 5000,  t: "Sierra Two — destroyer with active sonar. Sierra Three — frigate. They are hunting us.", p: 'critical' },
    { d: 12000, t: "This is an act of aggression against India. Recommend combat stations.", p: 'critical' },
  ],
  [SCENES.COMBAT_STATIONS]: [
    { d: 500,  t: "COMBAT STATIONS! All hands to battle positions! This is not a drill!", p: 'critical' },
    { d: 4000, t: "All weapons armed. Say: fire torpedo, or: fire BrahMos.", p: 'warning' },
  ],
  [SCENES.TORPEDO_ENGAGEMENT]: [
    { d: 500,   t: "Torpedo in the water! Fish is running hot, straight, and normal!", p: 'critical' },
    { d: 5000,  t: "IMPACT! Direct hit! Target is breaking apart! Good shooting, Captain!", p: 'critical' },
    { d: 12000, t: "Enemy destroyer has detected us. Evasive action recommended.", p: 'critical' },
  ],
  [SCENES.BRAHMOS_STRIKE]: [
    { d: 500,  t: "BrahMos launch sequence! Missile tube flooding!", p: 'critical' },
    { d: 3000, t: "MISSILE AWAY! BrahMos at Mach 2.8! Sea-skimming attack profile!", p: 'critical' },
    { d: 9000, t: "Terminal phase! IMPACT! Enemy vessel destroyed!", p: 'critical' },
  ],
  [SCENES.DAMAGE_CONTROL]: [
    { d: 500,   t: "INCOMING TORPEDO! Deploy countermeasures! Hard to starboard!", p: 'critical' },
    { d: 5000,  t: "Torpedo passing astern! Minor damage to port ballast.", p: 'warning' },
    { d: 12000, t: "Hull integrity holding. INS Arihant does not break. We fight on, Captain.", p: 'normal' },
  ],
  [SCENES.DEEP_DIVE]: [
    { d: 1000, t: "Emergency deep! Make depth two hundred fifty metres!", p: 'warning' },
    { d: 8000, t: "We are invisible down here. Their sonar cannot reach us.", p: 'normal' },
  ],
  [SCENES.RECOVERY]: [
    { d: 1000, t: "Indian merchant vessel under attack! Distress signal on emergency frequency!", p: 'critical' },
    { d: 6000, t: "We must protect our people, Captain.", p: 'warning' },
  ],
  [SCENES.FINAL_STAND]: [
    { d: 1000,  t: "Multiple hostile contacts converging. This is the final engagement.", p: 'critical' },
    { d: 6000,  t: "Every weapon we have, defending Indian waters.", p: 'normal' },
    { d: 12000, t: "Fire everything. Let them remember the name INS Arihant.", p: 'critical' },
  ],
  [SCENES.VICTORY]: [
    { d: 1000,  t: "All hostile contacts neutralized. The threat is over.", p: 'normal' },
    { d: 6000,  t: "Eastern Naval Command: Well done Arihant. Hostile group has withdrawn from Indian waters.", p: 'info' },
    { d: 14000, t: "Setting course for home. You have defended the sovereignty of India beneath the waves. Jai Hind, Captain. Jai Hind.", p: 'normal' },
  ],
}

let timers = []
export function clearDialogueQueue() { timers.forEach(clearTimeout); timers = [] }
export function runSceneDialogue(scene) {
  clearDialogueQueue()
  ;(DLG[scene] || []).forEach(l => {
    timers.push(setTimeout(() => indraVoice.speak(l.t, l.p), l.d))
  })
}

export function getLightChangeText(mode) {
  const map = {
    [LIGHT_MODES.STEALTH]:   'Stealth lighting.',
    [LIGHT_MODES.COMBAT]:    'Combat lighting.',
    [LIGHT_MODES.EMERGENCY]: 'Emergency lighting!',
    [LIGHT_MODES.NORMAL]:    'Standard lighting.',
    [LIGHT_MODES.OFF]:       'Lights off.',
  }
  return map[mode] || 'Lighting changed.'
}

export function speakReactive(key, arg) {
  const lines = {
    spotlightOn:     'Spotlight on.',
    spotlightOff:    'Spotlight off.',
    sonarPing:       'Active sonar pulse.',
    torpedoFired:    'Torpedo away!',
    brahmosFired:    'BrahMos launched!',
    decoyDeploy:     'Decoys deployed.',
    statusReport:    'All systems operational.',
    thermalEnabled:  'Thermal on.',
    thermalDisabled: 'Thermal off.',
    exteriorView:    'Exterior view.',
    interiorView:    'Interior view.',
    periscopeUp:     'Periscope raised. Scanning the surface.',
    contactTracked:  'Contact locked.',
  }
  if (key === 'lightChange') { indraVoice.speak(getLightChangeText(arg), 'info'); return }
  const text = lines[key]
  if (text) indraVoice.speak(text, 'info')
}
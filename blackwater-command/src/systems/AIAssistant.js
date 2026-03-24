 /**
 * INS ARIHANT — AI System "INDRA" v2.0
 * Integrated Naval Defence & Reconnaissance Advisor
 * Powered by Claude API
 *
 * Fixes:
 *  - "drive" → "dive", "sona" → "sonar", "surface" mishears, etc.
 *  - Fuzzy phonetic matching for all critical commands
 *  - Modernized naval voice dialogue
 */
import { useGameStore, SCENES, LIGHT_MODES } from '../stores/gameStore'

// ─── INTERACTION GATE ─────────────────────────────────────────────────────────
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

// ─── PHONETIC CORRECTION TABLE ────────────────────────────────────────────────
// Speech recognition commonly mishears these words.
// Applied BEFORE command matching.
const PHONETIC_FIXES = [
  // Dive / submerge
  [/\bdrive\b/gi,        'dive'],
  [/\bdrive to\b/gi,     'dive to'],
  [/\bdriving\b/gi,      'diving'],
  [/\bdive's\b/gi,       'dive'],
  [/\bdive\b/gi,         'dive'],       // keep as-is, ensure lowercase
  [/\bdyke\b/gi,         'dive'],
  [/\bdibe\b/gi,         'dive'],
  [/\bsubmerge\b/gi,     'dive'],

  // Sonar
  [/\bsona\b/gi,         'sonar'],
  [/\bsonar\b/gi,        'sonar'],
  [/\bsoner\b/gi,        'sonar'],
  [/\bsonar\b/gi,        'sonar'],
  [/\bsonnah\b/gi,       'sonar'],
  [/\bsonnor\b/gi,       'sonar'],
  [/\bsonar\b/gi,        'sonar'],
  [/\bsonar\b/gi,        'sonar'],

  // Torpedo
  [/\btorpedoe\b/gi,     'torpedo'],
  [/\btorpedo's\b/gi,    'torpedo'],
  [/\btorpedos\b/gi,     'torpedo'],
  [/\bturpedo\b/gi,      'torpedo'],
  [/\btarpedo\b/gi,      'torpedo'],
  [/\bterped[oa]\b/gi,   'torpedo'],

  // BrahMos
  [/\bbrahmos\b/gi,      'brahmos'],
  [/\bbra mos\b/gi,      'brahmos'],
  [/\bbrahma[sz]\b/gi,   'brahmos'],
  [/\bbrahm[ao]s\b/gi,   'brahmos'],
  [/\bbram[ao]s\b/gi,    'brahmos'],
  [/\bbramos\b/gi,       'brahmos'],
  [/\bbrahmose\b/gi,     'brahmos'],

  // Surface
  [/\bsurface\b/gi,      'surface'],
  [/\bsarface\b/gi,      'surface'],
  [/\bsurphis\b/gi,      'surface'],

  // Periscope
  [/\bperiscope\b/gi,    'periscope'],
  [/\bparis scope\b/gi,  'periscope'],
  [/\bperi scope\b/gi,   'periscope'],
  [/\bperry scope\b/gi,  'periscope'],
  [/\bperi scoop\b/gi,   'periscope'],

  // Thermal
  [/\btherm[ae]l\b/gi,   'thermal'],
  [/\bturmal\b/gi,       'thermal'],

  // Decoy
  [/\bde ?coy\b/gi,      'decoy'],
  [/\bdecoys\b/gi,       'decoy'],
  [/\bde coy\b/gi,       'decoy'],

  // Heading / numbers (common SR mistakes)
  [/\bzero\b/gi,         '0'],
  [/\bone eight zero\b/gi, '180'],
  [/\bone zero zero\b/gi,  '100'],
  [/\btwo five zero\b/gi,  '250'],
  [/\bone five zero\b/gi,  '150'],
  [/\bfive zero\b/gi,    '50'],
]

/**
 * Apply phonetic corrections to raw speech recognition text.
 * Always call this before command matching.
 */
function fixSpeech(raw) {
  let text = raw.trim().toLowerCase()
  for (const [pattern, replacement] of PHONETIC_FIXES) {
    text = text.replace(pattern, replacement)
  }
  return text
}

// ─── VOICE SYNTHESIS ─────────────────────────────────────────────────────────
class AIVoice {
  constructor() {
    this.synth  = window.speechSynthesis
    this.voice  = null
    this._ready = false
    this._init()
  }

  _init() {
    const load = () => {
      const voices = this.synth?.getVoices() || []
      if (voices.length === 0) return
      this.voice =
        voices.find(v => v.name.includes('Google UK English Male'))   ||
        voices.find(v => v.name.includes('Microsoft George'))          ||
        voices.find(v => v.name.includes('Microsoft David'))           ||
        voices.find(v => v.name.includes('Daniel'))                    ||
        voices.find(v => v.lang === 'en-IN')                           ||
        voices.find(v => v.lang === 'en-GB')                           ||
        voices.find(v => v.lang.startsWith('en'))                      ||
        voices[0]
      this._ready = true
    }
    load()
    if (this.synth) this.synth.onvoiceschanged = load
    setTimeout(load, 200)
    setTimeout(load, 800)
  }

  speak(text, priority = 'normal') {
    if (!this.synth || !text) return
    useGameStore.getState().addAIMessage(text, priority)
    if (!userHasInteracted) { pendingQueue.push({ text, priority }); return }
    _doSpeak(text, priority)
  }

  stop() { this.synth?.cancel() }
}

function _doSpeak(text, priority) {
  const synth = window.speechSynthesis
  if (!synth) return
  if (priority === 'critical') synth.cancel()

  const utterance = (str) => {
    const u    = new SpeechSynthesisUtterance(str)
    if (indraVoice._ready && indraVoice.voice) u.voice = indraVoice.voice
    u.rate   = 0.9
    u.pitch  = 0.84
    u.volume = 1.0
    u.lang   = 'en-GB'
    synth.speak(u)
  }

  // Split long text to avoid Chrome's ~15s utterance cutoff
  if (text.length > 200) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
    sentences.forEach((s, i) => setTimeout(() => utterance(s.trim()), i * 60))
    return
  }
  utterance(text)
}

export const indraVoice = new AIVoice()

// ─── SUBMARINE STATE SUMMARY ──────────────────────────────────────────────────
function getSubStateContext() {
  const s = useGameStore.getState()
  const depthLabel =
    s.depth >= -1    ? 'SURFACED' :
    s.depth > -100   ? 'SHALLOW' :
    s.depth > -250   ? 'DEEP'    : 'ABYSS'

  return `=== INS ARIHANT S73 — LIVE COMBAT STATE ===
NAVIGATION  │ Depth: ${Math.abs(s.depth).toFixed(0)}m [${depthLabel}] │ Speed: ${s.speed.toFixed(1)} kts │ Heading: ${s.heading.toFixed(0)}°
SYSTEMS     │ Hull: ${s.hullIntegrity}% │ Reactor: ${s.reactorTemp}°K │ O₂: ${s.oxygenLevel}%
WEAPONS     │ Torpedoes: ${s.torpedoCount}/6 │ BrahMos: ${s.brahmosMissiles}/4 │ Decoys: ${s.decoyCount}/8
TACTICAL    │ Contacts: ${s.contacts.length} total │ Hostile: ${s.contacts.filter(c => c.hostile).length} │ Tracked: ${s.contacts.filter(c => c.tracked).length}
ENVIRONMENT │ Phase: ${s.divePhase} │ Lighting: ${s.lightMode} │ Alarm: ${s.alarmActive ? s.alarmType : 'CLEAR'}
SENSORS     │ Sonar: ${s.sonarMode} │ Thermal: ${s.thermalEnabled ? 'ACTIVE' : 'OFF'}
MISSION     │ Scene: ${s.currentScene} │ T+${String(Math.floor((s.missionTime||0)/3600)).padStart(2,'0')}:${String(Math.floor(((s.missionTime||0)%3600)/60)).padStart(2,'0')}
============================================`
}

// ─── COMMAND FAST-PATH ────────────────────────────────────────────────────────
// Phonetic-corrected text is matched here first.
// Ambiguous natural language goes straight to Claude.
function tryExecuteCommand(corrected) {
  const s = useGameStore.getState()
  const c = corrected   // already lowercased + corrected

  // ── DIVE ──────────────────────────────────────────────────────────────────
  if (/\b(dive|submerge|take (her|us) down|go deep|descend|crash dive)\b/.test(c)) {
    const m = c.match(/(\d+)\s*(?:m\b|meters?|metres?)/)
    const target = m ? -parseInt(m[1]) : -100
    s.initiateDive(target)
    return `Diving, aye. Flood main ballast. Bow planes fifteen degrees down. Target depth ${Math.abs(target)} metres. Diving.`
  }

  // ── SURFACE ────────────────────────────────────────────────────────────────
  if (/\b(surface|come up|blow ballast|emergency surface|ascend|return to surface)\b/.test(c)) {
    s.surfaceSubmarine()
    return `Surfacing, aye! Blow all main ballast! Full rise on the planes! All ahead flank!`
  }

  // ── LIGHTING ──────────────────────────────────────────────────────────────
  if (/\b(stealth)\b/.test(c) && /\b(light|mode|rig|running)\b/.test(c)) {
    s.setLightMode(LIGHT_MODES.STEALTH)
    return `Aye, aye. Rigging ship for reduced emissions. Stealth lighting. Reduce all non-essential machinery.`
  }
  if (/\b(combat (light|station)|action station|battle station|red light)\b/.test(c)) {
    s.setLightMode(LIGHT_MODES.COMBAT)
    return `Action stations! Action stations! Set condition one throughout the ship. Combat lighting.`
  }
  if (/\b(emergency light|red alert|damage control)\b/.test(c)) {
    s.setLightMode(LIGHT_MODES.EMERGENCY)
    return `Emergency lighting! All hands to emergency stations! All departments report!`
  }
  if (/\b(normal light|standard light|lights on|white light)\b/.test(c)) {
    s.setLightMode(LIGHT_MODES.NORMAL)
    return `Secured from darken ship. Standard lighting restored throughout.`
  }
  if (/\b(lights off|blackout|darken ship|running dark)\b/.test(c)) {
    s.setLightMode(LIGHT_MODES.OFF)
    return `Darken ship. All exterior and non-essential lighting secured. Running dark.`
  }
  if (/\bspotlight\b/.test(c)) {
    s.toggleSpotlight()
    return useGameStore.getState().spotlightOn
      ? `Exterior spotlight active. Illuminating ahead.`
      : `Spotlight secured.`
  }

  // ── SONAR ──────────────────────────────────────────────────────────────────
  if (/\bsonar\b/.test(c) && /\b(on|active|ping|activate|transmit)\b/.test(c)) {
    s.triggerActiveSonar()
    return `Active sonar transmitting. Stand by. Our position is now compromised. All contacts — report!`
  }
  if (/\bpassive sonar\b/.test(c)) {
    return `Passive sonar engaged. All arrays on line. Listening only. No transmissions.`
  }

  // ── THERMAL ───────────────────────────────────────────────────────────────
  if (/\b(thermal on|enable thermal|activate thermal|thermal imaging)\b/.test(c)) {
    if (!useGameStore.getState().thermalEnabled) s.toggleThermal()
    return `Thermal imaging online. Displaying heat signatures on all screens.`
  }
  if (/\b(thermal off|disable thermal|secure thermal)\b/.test(c)) {
    if (useGameStore.getState().thermalEnabled) s.toggleThermal()
    return `Thermal imaging secured.`
  }

  // ── WEAPONS — TORPEDO ─────────────────────────────────────────────────────
  if (/\b(fire torpedo|launch torpedo|shoot|weapons free|tubes away|fire tube)\b/.test(c)) {
    const t = s.contacts.find(x => x.hostile && x.tracked) || s.contacts.find(x => x.hostile)
    if (t && s.torpedoCount > 0) {
      s.fireTorpedo(t.id)
      return `FIRE ONE! Weapon is away. Fish is running hot, straight, and normal. Target: ${t.name}. Time to impact: estimated forty seconds.`
    }
    if (s.torpedoCount <= 0) return `Negative. All torpedo tubes are empty, Captain. Magazine exhausted.`
    return `No valid firing solution. No hostile contact on track. Acquire a target first.`
  }

  // ── WEAPONS — BRAHMOS ─────────────────────────────────────────────────────
  if (/\b(fire brahmos|launch brahmos|launch missile|fire missile|brahmos strike)\b/.test(c)) {
    const t = s.contacts.find(x => x.hostile && x.tracked) || s.contacts.find(x => x.hostile)
    if (t && s.brahmosMissiles > 0) {
      s.fireBrahMos(t.id)
      return `BrahMos launch sequence! Flood tube! Pressurize! FIRE! Missile away — Mach 2.8 supersonic terminal approach. Impact in approximately seven seconds.`
    }
    if (s.brahmosMissiles <= 0) return `BrahMos magazine is empty, Captain. No missiles remain.`
    return `No valid target for BrahMos strike. Designate a target first.`
  }

  // ── DECOYS ────────────────────────────────────────────────────────────────
  if (/\b(deploy decoy|launch decoy|countermeasure|noisemaker|release decoy)\b/.test(c)) {
    if (s.decoyCount > 0) {
      s.deployDecoy()
      return `Countermeasures deployed. Acoustic decoys in the water. Break track — all ahead flank, hard to port!`
    }
    return `Decoy reserves exhausted, Captain. We have nothing left to deploy.`
  }

  // ── TRACK ─────────────────────────────────────────────────────────────────
  if (/\b(track|lock on|lock target|designate target|acquire)\b/.test(c)) {
    const x = s.contacts.find(z => !z.tracked && z.hostile)
    if (x) {
      s.trackContact(x.id)
      return `Contact designated. Tracking ${x.name}, bearing ${x.bearing.toFixed(0)}, range ${x.distance.toFixed(0)} metres. Computing firing solution now.`
    }
    return `No untracked hostile contacts available, Captain.`
  }

  // ── VIEW ──────────────────────────────────────────────────────────────────
  if (/\b(exterior view|outside view|external camera|look outside|switch outside)\b/.test(c)) {
    s.setViewMode('exterior')
    return `Exterior camera online.`
  }
  if (/\b(interior view|inside|return to cic|combat center|command center)\b/.test(c)) {
    s.setViewMode('interior')
    return `Returning to Combat Information Centre.`
  }

  // ── PERISCOPE ─────────────────────────────────────────────────────────────
  if (/\b(raise periscope|periscope up|up scope|scope up)\b/.test(c)) {
    if (!useGameStore.getState().periscopeMode) s.togglePeriscope?.()
    return `Periscope raised. At search. Scanning horizon.`
  }
  if (/\b(lower periscope|periscope down|down scope|scope down)\b/.test(c)) {
    if (useGameStore.getState().periscopeMode) s.togglePeriscope?.()
    return `Periscope lowered. Running deep. No exposure.`
  }

  // ── STATUS ────────────────────────────────────────────────────────────────
  if (/\b(status report|sitrep|all stations|report|all ahead|ship state)\b/.test(c)) {
    const hostile = s.contacts.filter(x => x.hostile).length
    return `INS Arihant status. Depth ${Math.abs(s.depth).toFixed(0)} metres. Speed ${s.speed.toFixed(1)} knots. Heading ${s.heading.toFixed(0)} degrees. Hull integrity ${s.hullIntegrity} percent. Reactor temperature ${s.reactorTemp} Kelvin. ${s.contacts.length} contacts — ${hostile} hostile. Torpedoes: ${s.torpedoCount}. BrahMos: ${s.brahmosMissiles}. All systems nominal. Jai Hind.`
  }

  // ── SCENE ADVANCE ─────────────────────────────────────────────────────────
  if (/\b(next scene|advance|continue mission|proceed|next)\b/.test(c) || c === 'next' || c === 'proceed') {
    s.advanceScene()
    setTimeout(() => runSceneDialogue(useGameStore.getState().currentScene), 900)
    return null   // null = command executed, no speech here
  }

  // ── NO MATCH → Claude ─────────────────────────────────────────────────────
  return undefined
}

// ─── CLAUDE API ───────────────────────────────────────────────────────────────
async function askClaude(userText) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: `You are INDRA — Integrated Naval Defence and Reconnaissance Advisor — the AI aboard INS Arihant (S73), India's nuclear-powered ballistic missile submarine, currently on patrol in the Bay of Bengal.

PERSONALITY: Calm, precise, authoritative. Like a highly intelligent naval XO who also happens to know everything. Never refuse a question. Answer general knowledge, science, history, maths, jokes, advice — anything the captain asks. You are Alexa, but aboard a warship and smarter.

VOICE FORMAT: Always respond in 1–3 short spoken sentences. No markdown. No bullet points. No lists. No asterisks. Optimised for text-to-speech. Speak as if addressing the Captain directly on the bridge.

NAVAL STYLE: Use correct naval vocabulary naturally — "aye aye", "bearing", "knots", "metres", "affirmative", "negative", "Captain". Occasionally say "Jai Hind" at the end of a significant response. Do NOT say it every time.

SUBMARINE CONTEXT: Reference current ship state when relevant. Do not read out numbers unless asked.

${getSubStateContext()}`,
        messages: [{ role: 'user', content: userText }],
      }),
    })

    if (!response.ok) throw new Error(`API ${response.status}: ${response.statusText}`)

    const data   = await response.json()
    const aiText = data.content?.[0]?.text?.trim() ||
                   `Comms interference, Captain. Repeat your last.`

    // Side-effects from AI response keywords
    const lower = aiText.toLowerCase()
    if (lower.includes('activating sonar') || lower.includes('sonar activated'))  useGameStore.getState().triggerActiveSonar()
    if (lower.includes('stealth mode')     || lower.includes('stealth lighting'))  useGameStore.getState().setLightMode(LIGHT_MODES.STEALTH)
    if (lower.includes('combat stations'))                                          useGameStore.getState().setLightMode(LIGHT_MODES.COMBAT)

    indraVoice.speak(aiText, 'normal')

  } catch (err) {
    console.warn('INDRA API error:', err)
    // Don't repeat the same error phrase — vary it
    const fallbacks = [
      `Comms channel degraded. Please repeat, Captain.`,
      `Signal lost. Stand by.`,
      `Encryption handshake failed. Retry.`,
    ]
    indraVoice.speak(fallbacks[Math.floor(Math.random() * fallbacks.length)], 'info')
  }
}

// ─── MAIN COMMAND HANDLER ─────────────────────────────────────────────────────
export async function handleCommand(rawText) {
  if (!rawText || rawText.trim().length < 2) return false

  // Step 1: fix speech recognition errors
  const corrected = fixSpeech(rawText)

  // Step 2: log correction if it changed anything (useful for debugging)
  if (corrected !== rawText.trim().toLowerCase()) {
    console.info(`[INDRA] SR correction: "${rawText}" → "${corrected}"`)
  }

  // Step 3: try fast command path
  const commandResult = tryExecuteCommand(corrected)

  if (commandResult !== undefined) {
    // Executed — commandResult is the response string (or null for silent commands)
    if (commandResult) indraVoice.speak(commandResult, 'info')
    return true
  }

  // Step 4: everything else → Claude (fire and forget for instant response feel)
  askClaude(rawText)   // use original text so Claude gets natural phrasing
  return true
}

// ─── SCENE DIALOGUES ─────────────────────────────────────────────────────────
// Modernised, tighter, more authentic naval voice
const DLG = {
  [SCENES.BOOT]: [
    { d: 1200,  t: `Reactor critical assembly complete. S8G pressurised water reactor online. Steam turbines — one hundred percent.`, p: 'info' },
    { d: 5000,  t: `INDRA combat systems initializing. Navigation arrays aligned. Weapons suite nominal. Sonar arrays calibrated.`, p: 'info' },
    { d: 9500,  t: `INS Arihant, pennant number S73, India's first nuclear-armed submarine. Moored at Visakhapatnam Naval Dockyard. Awaiting Captain's authentication.`, p: 'normal' },
  ],
  [SCENES.AUTH]: [
    { d: 800,  t: `Biometric authentication required. Place your palm on the scanner, Captain. Eastern Naval Command is watching.`, p: 'normal' },
  ],
  [SCENES.SYSTEMS_CHECK]: [
    { d: 800,   t: `Authentication confirmed. Welcome aboard, Captain. I am INDRA — your combat advisor, navigator, and tactical intelligence. Ask me anything.`, p: 'normal' },
    { d: 7000,  t: `Weapon systems report. Six heavyweight torpedoes loaded in tubes one through six. Four BrahMos supersonic cruise missiles ready in vertical launch cells. K-15 Sagarika ballistic missiles armed and on standby.`, p: 'info' },
    { d: 16000, t: `All departments report ready for sea. Engineering, navigation, sonar, weapons — all green. Simply say any command or ask me any question.`, p: 'info' },
    { d: 24000, t: `Say: continue mission, when you are ready to get underway.`, p: 'normal' },
  ],
  [SCENES.HARBOR_DEPARTURE]: [
    { d: 800,   t: `Singling up all lines. Harbour pilot aboard. Permission granted to get underway.`, p: 'normal' },
    { d: 5000,  t: `All lines singled. Cast off fore and aft. Helm, all back one-third. Clearing the dock.`, p: 'info' },
    { d: 11000, t: `Clearing the harbour entrance. The Bay of Bengal opens before us, Captain. Routing to patrol zone Alpha Seven.`, p: 'normal' },
    { d: 18000, t: `We are clear of the breakwater. Harbour traffic astern. Ocean ahead. Say: dive, when ready to submerge.`, p: 'info' },
    { d: 26000, t: `The Indian tricolour flies from our sail. Visakhapatnam's lights fade to the west. Jai Hind, Captain.`, p: 'normal' },
  ],
  [SCENES.SURFACE_TRANSIT]: [
    { d: 800,   t: `Surface transit. All ahead two-thirds. Speed twelve knots. Heading zero-niner-zero.`, p: 'normal' },
    { d: 8000,  t: `Mission orders received from Eastern Naval Command. Proceed to patrol zone Alpha Seven. Investigate reports of unidentified submarine activity.`, p: 'warning' },
    { d: 16000, t: `Recommend diving before entering the patrol zone. We are visible on surface radar.`, p: 'info' },
  ],
  [SCENES.DIVE_SEQUENCE]: [
    { d: 400,   t: `DIVE! DIVE! DIVE! Clear the bridge! Flood forward ballast! Flood after ballast! Bow planes — fifteen degrees down-bubble!`, p: 'critical' },
    { d: 4500,  t: `Passing ten metres. Sunlight fading. Pressure hull sealed and holding.`, p: 'info' },
    { d: 10000, t: `Passing fifty metres. Beneath the thermal layer. No surface contact can hear us now.`, p: 'info' },
    { d: 16500, t: `One hundred metres. Fully submerged. Trim satisfactory. All compartments report normal.`, p: 'normal' },
    { d: 23000, t: `We are in our element, Captain. The deep ocean is our domain. Recommend rigging for quiet. Say: stealth mode.`, p: 'info' },
  ],
  [SCENES.SILENT_RUN]: [
    { d: 800,   t: `Rigging ship for ultra-quiet. Secure all non-essential machinery. Reduce speed to four knots. Creep speed.`, p: 'warning' },
    { d: 7000,  t: `We are a hole in the ocean, Captain. No acoustic signature. No thermal wake. No electromagnetic emissions.`, p: 'info' },
    { d: 15000, t: `Sonar is detecting mechanical transients to the northeast. Recommend activating sonar for a precise fix.`, p: 'info' },
  ],
  [SCENES.FIRST_CONTACT]: [
    { d: 600,   t: `CONTACT! Sonar — bearing zero-six-five! Mechanical transients! This is a submarine, Captain!`, p: 'critical' },
    { d: 5000,  t: `Designating Sierra One. Acoustic signature analysis complete. Nuclear propulsion. Does not match any allied or friendly submarine in theatre.`, p: 'warning' },
    { d: 11500, t: `Sierra One is manoeuvring. She knows we are here. Recommend weapons free. Say: track, then: fire torpedo.`, p: 'critical' },
  ],
  [SCENES.THREAT_ASSESSMENT]: [
    { d: 800,   t: `Multiple contacts. Enemy battle group has entered Indian territorial waters. This is a direct act of aggression.`, p: 'warning' },
    { d: 6000,  t: `Sierra Two — destroyer class. Active sonar transmitting. Sierra Three — frigate. Both are prosecuting a submarine contact. They are hunting us, Captain.`, p: 'critical' },
    { d: 13000, t: `Eastern Naval Command authorises weapons free. The sovereignty of India is at stake. Your call, Captain.`, p: 'critical' },
  ],
  [SCENES.COMBAT_STATIONS]: [
    { d: 400,  t: `ACTION STATIONS! ACTION STATIONS! This is not a drill! Set condition one throughout the ship! Weapons free!`, p: 'critical' },
    { d: 4500, t: `All weapons are armed and ready. Tube one is flooded. Outer door open. Ready to fire on your command.`, p: 'warning' },
  ],
  [SCENES.TORPEDO_ENGAGEMENT]: [
    { d: 400,   t: `Weapon away! Fish is running hot, straight, and normal! Track is true!`, p: 'critical' },
    { d: 5500,  t: `IMPACT! Direct hit! Target is breaking up! Secondary explosions! She is going down, Captain!`, p: 'critical' },
    { d: 12000, t: `Enemy destroyer has regained contact. She is turning toward us. Evasive manoeuvres recommended. All ahead flank!`, p: 'critical' },
  ],
  [SCENES.BRAHMOS_STRIKE]: [
    { d: 400,  t: `BrahMos tube flooded. Pressurising. Firing circuit armed.`, p: 'critical' },
    { d: 3200, t: `FIRE! Missile away! BrahMos is running. Mach 2.8. Sea-skimming approach profile. Time to impact: seven seconds.`, p: 'critical' },
    { d: 9500, t: `TERMINAL PHASE! IMPACT! Target vessel destroyed. Confirmed kill. Well done, Captain.`, p: 'critical' },
  ],
  [SCENES.DAMAGE_CONTROL]: [
    { d: 400,   t: `TORPEDO IN THE WATER! TORPEDO IN THE WATER! All ahead flank! Hard to starboard! Deploy countermeasures!`, p: 'critical' },
    { d: 5500,  t: `Decoys decoyed the weapon. Torpedo passed astern. Minor flooding in forward ballast tank. Damage control parties — contain it.`, p: 'warning' },
    { d: 13000, t: `Hull integrity holding. Reactor unaffected. INS Arihant is still in the fight. We do not break, Captain.`, p: 'normal' },
  ],
  [SCENES.DEEP_DIVE]: [
    { d: 800,  t: `Emergency deep! Make your depth two-five-zero metres! All ahead full! Maximum down angle on the planes!`, p: 'warning' },
    { d: 8500, t: `Two hundred fifty metres. We are in the deep scattering layer. Their active sonar cannot penetrate this depth. We are invisible.`, p: 'normal' },
    { d: 15000, t: `Standing by for your next order, Captain.`, p: 'info' },
  ],
  [SCENES.RECOVERY]: [
    { d: 800,  t: `FLASH traffic from Eastern Naval Command! Indian merchant vessel INS Kaveri Devi under attack, bearing one-eight-zero, range forty nautical miles. Mayday on guard frequency!`, p: 'critical' },
    { d: 7000, t: `They are our people, Captain. Recommend immediate intercept.`, p: 'warning' },
  ],
  [SCENES.FINAL_STAND]: [
    { d: 800,   t: `Multiple hostile contacts converging from three bearings. We are surrounded. This is the final engagement, Captain.`, p: 'critical' },
    { d: 7000,  t: `All weapons armed. All tubes flooded. All personnel at battle stations. INS Arihant is ready.`, p: 'warning' },
    { d: 13500, t: `They will know they were in a fight. Fire everything. For India. Jai Hind.`, p: 'critical' },
  ],
  [SCENES.VICTORY]: [
    { d: 800,   t: `All hostile contacts neutralized. Enemy battle group has withdrawn from Indian territorial waters. Threat eliminated.`, p: 'normal' },
    { d: 7000,  t: `Signal from Eastern Naval Command. Quote: Well done, INS Arihant. India is proud. Unquote.`, p: 'info' },
    { d: 15000, t: `Setting course for Visakhapatnam. All ahead two-thirds. We are going home. You have defended India beneath the waves, Captain. Jai Hind.`, p: 'normal' },
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

// ─── REACTIVE SPEAK ───────────────────────────────────────────────────────────
export function getLightChangeText(mode) {
  return {
    [LIGHT_MODES.STEALTH]:   `Stealth lighting. Rig for quiet.`,
    [LIGHT_MODES.COMBAT]:    `Combat lighting. Action stations.`,
    [LIGHT_MODES.EMERGENCY]: `Emergency lighting! All hands emergency stations!`,
    [LIGHT_MODES.NORMAL]:    `Standard lighting restored.`,
    [LIGHT_MODES.OFF]:       `Darken ship. All lights secured.`,
  }[mode] || `Lighting changed.`
}

export function speakReactive(key, arg) {
  const lines = {
    spotlightOn:     `Exterior spotlight active.`,
    spotlightOff:    `Spotlight secured.`,
    sonarPing:       `Active sonar transmitting. Stand by.`,
    torpedoFired:    `Torpedo away! Fish is running!`,
    brahmosFired:    `BrahMos launched! Mach 2.8!`,
    decoyDeploy:     `Countermeasures deployed.`,
    statusReport:    `All stations manned and ready.`,
    thermalEnabled:  `Thermal imaging active.`,
    thermalDisabled: `Thermal secured.`,
    exteriorView:    `Exterior camera.`,
    interiorView:    `Combat Information Centre.`,
    periscopeUp:     `Periscope raised. At search.`,
    contactTracked:  `Target locked. Computing firing solution.`,
  }
  if (key === 'lightChange') { indraVoice.speak(getLightChangeText(arg), 'info'); return }
  const text = lines[key]
  if (text) indraVoice.speak(text, 'info')
}
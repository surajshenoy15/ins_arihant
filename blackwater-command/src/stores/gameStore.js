import { create } from 'zustand'

export const LIGHT_MODES = {
  NORMAL: 'normal',
  STEALTH: 'stealth',
  EMERGENCY: 'emergency',
  COMBAT: 'combat',
  OFF: 'off',
}

export const VIEW_MODES = {
  INTERIOR: 'interior',
  EXTERIOR: 'exterior',
}

export const DIVE_PHASES = {
  HARBOR: 'harbor',
  SURFACE: 'surface',
  PERISCOPE_DEPTH: 'periscope',
  SHALLOW: 'shallow',
  DEEP: 'deep',
  ABYSS: 'abyss',
}

export const SCENES = {
  BOOT: 'boot',
  AUTH: 'auth',
  SYSTEMS_CHECK: 'systems_check',
  HARBOR_DEPARTURE: 'harbor_departure',
  SURFACE_TRANSIT: 'surface_transit',
  DIVE_SEQUENCE: 'dive_sequence',
  SILENT_RUN: 'silent_run',
  FIRST_CONTACT: 'first_contact',
  THREAT_ASSESSMENT: 'threat_assessment',
  COMBAT_STATIONS: 'combat_stations',
  TORPEDO_ENGAGEMENT: 'torpedo_engagement',
  BRAHMOS_STRIKE: 'brahmos_strike',
  DAMAGE_CONTROL: 'damage_control',
  DEEP_DIVE: 'deep_dive',
  RECOVERY: 'recovery',
  FINAL_STAND: 'final_stand',
  VICTORY: 'victory',
}

export const SCENE_ORDER = Object.values(SCENES)

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

const mkContact = (id, type) => ({
  id,
  type,
  bearing:    Math.random() * 360,
  distance:   1200 + Math.random() * 7000,
  depth:      -40 - Math.random() * 350,
  speed:      3 + Math.random() * 16,
  confidence: 0.3 + Math.random() * 0.7,
  thermal:    Math.random() > 0.35,
  hostile:    ['submarine', 'destroyer', 'frigate'].includes(type),
  tracked:    false,
  echoTrail:  [],
  name:
    type === 'submarine'  ? 'HOSTILE SUB'
    : type === 'destroyer' ? 'ENEMY DESTROYER'
    : type === 'frigate'   ? 'ENEMY FRIGATE'
    :                        'UNKNOWN',
})

export const useGameStore = create((set, get) => ({

  // ── MISSION ──────────────────────────────────────────────────────────────
  currentScene: SCENES.BOOT,
  missionTime:  0,

  // ── SUBMARINE DRIVE STATE (owned by PlayerController, read by HUD/screens)
  depth:        0,
  targetDepth:  0,
  speed:        0,
  heading:      90,

  // ── PLAYER INPUT FLAGS — set by PlayerController each frame ──────────────
  // tick() checks these to know whether the player is actively driving
  playerDriving: false,   // true when any arrow key is held

  // ── DIVE STATE ───────────────────────────────────────────────────────────
  divePhase:            DIVE_PHASES.HARBOR,
  isDiving:             false,
  surfaceWaveIntensity: 1.0,
  sunlightIntensity:    1.0,
  waterClarity:         1.0,

  // ── PERISCOPE ────────────────────────────────────────────────────────────
  periscopeMode:    false,
  periscopeHeading: 0,

  // ── SUBMARINE SYSTEMS ────────────────────────────────────────────────────
  hullIntegrity: 100,
  reactorTemp:   345,
  oxygenLevel:   98,

  lightMode:             LIGHT_MODES.NORMAL,
  spotlightOn:           false,
  interiorBrightness:    1.0,
  interiorFloodLightsOn: true,

  viewMode:        VIEW_MODES.INTERIOR,
  sonarMode:       'passive',
  sonarPingActive: false,
  contacts:        [],
  thermalEnabled:  false,

  // ── WEAPONS ──────────────────────────────────────────────────────────────
  torpedoCount:    6,
  brahmosMissiles: 4,
  decoyCount:      8,
  torpedoInFlight: null,
  brahmoInFlight:  null,

  // ── UI STATE ─────────────────────────────────────────────────────────────
  alarmActive:          false,
  alarmType:            null,
  captainAuthenticated: false,
  sceneTransition:      null,
  aiMessages:           [],

  // ── ACTIONS ──────────────────────────────────────────────────────────────

  // Called by PlayerController every frame with current drive values
  setDriveState: ({ heading, depth, speed, playerDriving }) =>
    set({ heading, depth, speed, playerDriving: playerDriving ?? false }),

  setLightMode: mode => set({ lightMode: mode }),

  toggleSpotlight: () =>
    set(state => ({ spotlightOn: !state.spotlightOn })),

  setInteriorBrightness: value =>
    set({ interiorBrightness: clamp(value, 0.2, 1.5) }),

  increaseInteriorBrightness: () =>
    set(state => ({
      interiorBrightness: clamp((state.interiorBrightness ?? 1.0) + 0.1, 0.2, 1.5),
    })),

  decreaseInteriorBrightness: () =>
    set(state => ({
      interiorBrightness: clamp((state.interiorBrightness ?? 1.0) - 0.1, 0.2, 1.5),
    })),

  toggleInteriorFloodLights: () =>
    set(state => ({ interiorFloodLightsOn: !state.interiorFloodLightsOn })),

  setViewMode: mode => set({ viewMode: mode }),

  toggleThermal: () =>
    set(state => ({ thermalEnabled: !state.thermalEnabled })),

  // ── PERISCOPE ────────────────────────────────────────────────────────────

  togglePeriscope: () =>
    set(state => ({ periscopeMode: !state.periscopeMode })),

  setPeriscopeHeading: deg =>
    set({ periscopeHeading: ((deg % 360) + 360) % 360 }),

  // ── SONAR ────────────────────────────────────────────────────────────────

  triggerActiveSonar: () => {
    set({ sonarPingActive: true })
    setTimeout(() => set({ sonarPingActive: false }), 3000)
  },

  addContact: type => {
    set(state => ({
      contacts: [
        ...state.contacts,
        mkContact(
          `c-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          type
        ),
      ],
    }))
  },

  trackContact: id =>
    set(state => ({
      contacts: state.contacts.map(c =>
        c.id === id ? { ...c, tracked: true } : c
      ),
    })),

  removeContact: id =>
    set(state => ({
      contacts: state.contacts.filter(c => c.id !== id),
    })),

  deployDecoy: () =>
    set(state => ({ decoyCount: Math.max(0, state.decoyCount - 1) })),

  // ── DIVE CONTROL ─────────────────────────────────────────────────────────

  initiateDive: (targetD = -100) =>
    set({ isDiving: true, targetDepth: targetD }),

  surfaceSubmarine: () =>
    set({ isDiving: false, targetDepth: 0 }),

  updateDivePhase: () => {
    const d = Math.abs(get().depth)
    let phase, sunlight, clarity, waves

    if (d < 1) {
      phase    = get().currentScene === SCENES.HARBOR_DEPARTURE
                   ? DIVE_PHASES.HARBOR
                   : DIVE_PHASES.SURFACE
      sunlight = 1.0; clarity = 1.0; waves = 1.0
    } else if (d < 15) {
      phase    = DIVE_PHASES.PERISCOPE_DEPTH
      sunlight = 0.7; clarity = 0.9; waves = 0.3
    } else if (d < 100) {
      phase    = DIVE_PHASES.SHALLOW
      sunlight = 0.4 - (d / 100) * 0.3; clarity = 0.7; waves = 0
    } else if (d < 250) {
      phase    = DIVE_PHASES.DEEP
      sunlight = 0.08; clarity = 0.4; waves = 0
    } else {
      phase    = DIVE_PHASES.ABYSS
      sunlight = 0.02; clarity = 0.2; waves = 0
    }

    set({
      divePhase: phase,
      sunlightIntensity: sunlight,
      waterClarity: clarity,
      surfaceWaveIntensity: waves,
    })
  },

  // ── TORPEDO ──────────────────────────────────────────────────────────────

  fireTorpedo: targetId => {
    const state = get()
    if (state.torpedoCount <= 0) return false
    const target = state.contacts.find(c => c.id === targetId)
    set({
      torpedoCount: state.torpedoCount - 1,
      torpedoInFlight: {
        id:          `t-${Date.now()}`,
        targetId,
        bearing:     target?.bearing || state.heading,
        distance:    0,
        maxDistance: target?.distance || 5000,
        launched:    Date.now(),
        detonated:   false,
      },
    })
    setTimeout(() => {
      set(cur => ({
        torpedoInFlight: cur.torpedoInFlight
          ? { ...cur.torpedoInFlight, detonated: true }
          : null,
        contacts: cur.contacts.filter(c => c.id !== targetId),
      }))
      setTimeout(() => set({ torpedoInFlight: null }), 3500)
    }, 4000)
    return true
  },

  // ── BRAHMOS ──────────────────────────────────────────────────────────────

  fireBrahMos: targetId => {
    const state = get()
    if (state.brahmosMissiles <= 0) return false
    const target = state.contacts.find(c => c.id === targetId)
    set({
      brahmosMissiles: state.brahmosMissiles - 1,
      brahmoInFlight: {
        id:        `bm-${Date.now()}`,
        targetId,
        bearing:   target?.bearing || state.heading,
        launched:  Date.now(),
        detonated: false,
        phase:     'launch',
      },
    })
    setTimeout(() => set(cur => ({ brahmoInFlight: cur.brahmoInFlight ? { ...cur.brahmoInFlight, phase: 'cruise' }    : null })), 2000)
    setTimeout(() => set(cur => ({ brahmoInFlight: cur.brahmoInFlight ? { ...cur.brahmoInFlight, phase: 'terminal' }  : null })), 5000)
    setTimeout(() => {
      set(cur => ({
        brahmoInFlight: cur.brahmoInFlight ? { ...cur.brahmoInFlight, detonated: true } : null,
        contacts: cur.contacts.filter(c => c.id !== targetId),
      }))
      setTimeout(() => set({ brahmoInFlight: null }), 4000)
    }, 7000)
    return true
  },

  // ── ALARMS ───────────────────────────────────────────────────────────────

  triggerAlarm: type =>
    set({ alarmActive: true, alarmType: type, lightMode: LIGHT_MODES.EMERGENCY }),

  clearAlarm: () =>
    set({ alarmActive: false, alarmType: null }),

  // ── AUTH ─────────────────────────────────────────────────────────────────

  authenticateCaptain: () => set({ captainAuthenticated: true }),

  // ── SCENE ────────────────────────────────────────────────────────────────

  advanceScene: () => {
    const index = SCENE_ORDER.indexOf(get().currentScene)
    if (index < SCENE_ORDER.length - 1) {
      set({ sceneTransition: 'flash' })
      setTimeout(() => {
        set({ currentScene: SCENE_ORDER[index + 1], sceneTransition: null })
      }, 800)
    }
  },

  setScene: scene => {
    set({ sceneTransition: 'fade' })
    setTimeout(() => {
      set({ currentScene: scene, sceneTransition: null })
    }, 600)
  },

  // ── AI ───────────────────────────────────────────────────────────────────

  addAIMessage: (text, priority = 'normal') =>
    set(state => ({
      aiMessages: [
        ...state.aiMessages.slice(-60),
        {
          text,
          priority,
          timestamp: Date.now(),
          id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        },
      ],
    })),

  // ── GAME TICK ─────────────────────────────────────────────────────────────
  // IMPORTANT: tick() no longer touches heading / depth / speed.
  // Those are fully owned by PlayerController via setDriveState().
  // tick() only advances: missionTime, contacts animation, dive phase.

  tick: delta => {
    const state = get()

    set({
      missionTime: state.missionTime + delta,

      // Animate contacts (sonar tracks drifting) — independent of player drive
      contacts: state.contacts.map(c => ({
        ...c,
        bearing: (c.bearing + c.speed * 0.008 * delta + (Math.random() - 0.5) * 0.3 + 360) % 360,
        distance: Math.max(200, c.distance + (Math.random() - 0.5) * 5),
        echoTrail: [
          ...c.echoTrail.slice(-25),
          { bearing: c.bearing, distance: c.distance, t: Date.now() },
        ],
      })),
    })

    // Update dive phase lighting based on current depth
    // (depth was already written by PlayerController this frame)
    get().updateDivePhase()
  },
}))
import React, { useMemo, useRef } from 'react'
import { extend, useFrame } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore, DIVE_PHASES } from '../../stores/gameStore'

// ─── SUBMARINE MOTION EXPORT ─────────────────────────────────────────────────
// Import this in your Submarine component to drive wave-shake
export const submarineMotion = { x: 0, y: 0, rx: 0, rz: 0 }

// ─── VERTEX SHADER ───────────────────────────────────────────────────────────
const VERT = `
  precision highp float;

  varying vec2  vUv;
  varying vec3  vWorldPos;
  varying vec3  vNormalW;
  varying float vWaveHeight;
  varying float vCrestSharp;
  varying float vTroughDark;

  uniform float uTime;
  uniform float uWaveAmp;
  uniform float uWaveFreq;
  uniform float uWaveSpeed;
  uniform float uSmallWaveAmp;
  uniform float uChop;
  uniform float uSteepness;

  // Steep Gerstner wave — sharp crests, flat troughs (physically correct ocean)
  vec3 gerstner(vec2 p, vec2 d, float Q, float A, float L, float spd, float t) {
    float k   = 6.28318 / L;
    float c   = sqrt(9.81 / k) * spd;
    float phi = k * dot(d, p) - c * t;
    float QAk = Q * A * k;
    return vec3(d.x * QAk * cos(phi), A * sin(phi), d.y * QAk * cos(phi));
  }

  float waveField(vec2 p, float t) {
    float v = 0.0;
    v += sin( p.x * uWaveFreq           + t              ) * 0.62;
    v += cos( p.y * uWaveFreq * 1.18    - t * 1.07       ) * 0.44;
    v += sin((p.x + p.y) * uWaveFreq * 0.71 + t * 0.75  ) * 0.28;
    v += cos( p.x * uWaveFreq * 1.55    + t * 1.32       ) * 0.18;
    v += sin((p.x - p.y) * uWaveFreq * 0.45 - t * 0.62  ) * 0.14;
    return v;
  }

  float microRipple(vec2 p, float t) {
    float r = 0.0;
    r += sin(p.x * 4.8  + t * 2.4) * cos(p.y * 3.9  - t * 1.8) * 0.55;
    r += sin(p.x * 8.2  - t * 3.1) * sin(p.y * 7.1  + t * 2.2) * 0.28;
    r += cos(p.x * 13.5 + t * 4.0) * cos(p.y * 11.2 - t * 3.5) * 0.12;
    r += sin(p.x * 22.0 - t * 5.5) * sin(p.y * 19.0 + t * 4.8) * 0.05;
    return r * uSmallWaveAmp;
  }

  void main() {
    vUv      = uv;
    vec3 pos = position;
    float t  = uTime * uWaveSpeed;

    // 6 Gerstner waves — primary swell + cross swell + wind chop
    vec3 g1 = gerstner(pos.xz, normalize(vec2( 1.00,  0.20)), uSteepness,        2.8, 42.0, 1.00, t);
    vec3 g2 = gerstner(pos.xz, normalize(vec2( 0.85,  0.52)), uSteepness * 0.80, 2.0, 28.0, 1.05, t);
    vec3 g3 = gerstner(pos.xz, normalize(vec2(-0.30,  1.00)), uSteepness * 0.55, 1.4, 18.0, 0.90, t);
    vec3 g4 = gerstner(pos.xz, normalize(vec2( 0.60, -0.80)), uSteepness * 0.42, 1.0, 12.0, 1.12, t);
    vec3 g5 = gerstner(pos.xz, normalize(vec2( 1.20,  0.70)), uSteepness * 0.30, 0.6,  7.0, 1.30, t);
    vec3 g6 = gerstner(pos.xz, normalize(vec2(-0.80,  0.40)), uSteepness * 0.22, 0.4,  5.0, 0.95, t);
    vec3 gSum = g1 + g2 + g3 + g4 + g5 + g6;

    float meso  = waveField(pos.xz, t) * uWaveAmp;
    float micro = microRipple(pos.xz, t);
    float chop  = sin(pos.x * 1.1 + t * 2.2) * cos(pos.z * 0.95 - t * 1.7) * uChop
                + sin(pos.x * 0.6 - pos.z * 0.8 + t * 1.5) * uChop * 0.5;

    float totalY = meso + micro + chop + gSum.y * uWaveAmp * 0.55;
    vWaveHeight  = totalY;
    vCrestSharp  = smoothstep(0.30, 1.0, totalY);
    vTroughDark  = smoothstep(-1.0, 0.3, totalY);

    pos.y += totalY;
    pos.x += gSum.x * uWaveAmp * 0.28;
    pos.z += gSum.z * uWaveAmp * 0.28;

    // 4-sample central-difference normal
    float eps = 0.12;
    float hR  = waveField(pos.xz + vec2(eps, 0.0), t) * uWaveAmp + microRipple(pos.xz + vec2(eps, 0.0), t);
    float hL  = waveField(pos.xz - vec2(eps, 0.0), t) * uWaveAmp + microRipple(pos.xz - vec2(eps, 0.0), t);
    float hF  = waveField(pos.xz + vec2(0.0, eps), t) * uWaveAmp + microRipple(pos.xz + vec2(0.0, eps), t);
    float hB  = waveField(pos.xz - vec2(0.0, eps), t) * uWaveAmp + microRipple(pos.xz - vec2(0.0, eps), t);

    vec3 tanX = normalize(vec3(2.0 * eps, hR - hL, 0.0));
    vec3 tanZ = normalize(vec3(0.0, hF - hB, 2.0 * eps));
    vec3 n    = normalize(cross(tanZ, tanX));

    vec4 wp   = modelMatrix * vec4(pos, 1.0);
    vWorldPos = wp.xyz;
    vNormalW  = normalize(mat3(modelMatrix) * n);

    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

// ─── FRAGMENT SHADER ─────────────────────────────────────────────────────────
const FRAG = `
  precision highp float;

  varying vec2  vUv;
  varying vec3  vWorldPos;
  varying vec3  vNormalW;
  varying float vWaveHeight;
  varying float vCrestSharp;
  varying float vTroughDark;

  uniform float uTime;
  uniform float uSunlight;
  uniform float uDepthMix;
  uniform float uWaveAmp;
  uniform vec3  uColorDeep;
  uniform vec3  uColorMid;
  uniform vec3  uColorShallow;
  uniform vec3  uSkyColor;
  uniform vec3  uHorizonColor;
  uniform vec3  uSunDir;

  // ── Noise helpers
  float hash2(vec2 p) {
    p = fract(p * vec2(127.34, 311.78));
    p += dot(p, p + 18.3);
    return fract(p.x * p.y);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash2(i), hash2(i + vec2(1,0)), f.x),
      mix(hash2(i + vec2(0,1)), hash2(i + vec2(1,1)), f.x), f.y);
  }
  float fbm4(vec2 p) {
    float v = 0.0, a = 0.5;
    for(int i = 0; i < 4; i++) { v += a * noise2(p); p = p * 2.1 + vec2(3.7, 1.9); a *= 0.5; }
    return v;
  }

  // ── Micro normal perturbation (simulates normal map)
  vec3 detailNormal(vec2 uv, float t) {
    float eps = 0.0015;
    float h0  = fbm4(uv * 22.0 + t * 0.04);
    float hR  = fbm4((uv + vec2(eps,0)) * 22.0 + t * 0.04);
    float hU  = fbm4((uv + vec2(0,eps)) * 22.0 + t * 0.04);
    return normalize(vec3(-(hR-h0)/eps * 0.06, 1.0, -(hU-h0)/eps * 0.06));
  }

  // ── Foam: whitecap blobs
  float whitecap(vec2 uv, float t) {
    float f1 = fbm4(uv * 3.5 + vec2(t * 0.10, 0.0));
    float f2 = fbm4(uv * 7.0 - vec2(0.0, t * 0.08));
    return clamp(f1 * f2 * 3.8 - 0.55, 0.0, 1.0);
  }

  // ── Foam: elongated streaks behind crests
  float foamStreak(vec2 uv, float t) {
    vec2 sUv  = vec2(uv.x * 0.55 + t * 0.07, uv.y * 6.0);
    float s   = fbm4(sUv * 2.8) * fbm4(sUv * 6.5 + vec2(1.1, 0.6));
    float turb = noise2(vec2(uv.x * 2.8 - t * 0.12, uv.y * 1.6 + t * 0.05) * 9.0);
    return clamp(s * 2.8 + turb * 0.3 - 0.72, 0.0, 1.0);
  }

  // ── Foam: fine lacy edge on slopes
  float foamLace(vec2 uv, float t) {
    return noise2(uv * 60.0 + vec2(t * 0.22, 0.0)) * 0.5
         + noise2(uv * 38.0 - vec2(0.0, t * 0.18)) * 0.5;
  }

  void main() {
    float t = uTime;

    // Blend geometry normal with procedural detail normal for micro-detail
    vec3 geoN = normalize(vNormalW);
    vec3 detN = detailNormal(vUv * 12.0 + vec2(t * 0.035, t * 0.028), t);
    vec3 N    = normalize(geoN + vec3(detN.x * 0.55, 0.0, detN.z * 0.55));

    vec3 V    = normalize(cameraPosition - vWorldPos);
    vec3 L    = normalize(uSunDir);
    vec3 H    = normalize(L + V);

    float NdotV = max(dot(N, V), 0.001);
    float NdotL = max(dot(N, L), 0.0);
    float NdotH = max(dot(N, H), 0.0);

    // Schlick Fresnel (R0=0.02 for water)
    float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

    // Sky reflection: zenith darker, horizon paler (overcast sky like reference)
    float hf       = pow(1.0 - abs(V.y), 2.2);
    vec3 skyRefl   = mix(uSkyColor, uHorizonColor, hf);
    skyRefl       *= (0.55 + vTroughDark * 0.45);  // darker in troughs

    // Water body: very dark in troughs (reference photo is almost black there)
    vec3 waterBase = mix(uColorDeep * 0.25, uColorMid, vTroughDark * 0.85);
    waterBase      = mix(waterBase, uColorShallow, uDepthMix * 0.28 * vTroughDark);
    // Subsurface scatter: teal glow on lit crest faces
    waterBase     += vec3(0.0, 0.055, 0.05) * NdotL * uSunlight * vCrestSharp;

    // GGX-approximate specular (tight glint on water)
    float rough  = 0.035;
    float a2     = rough * rough;
    float dnom   = NdotH * NdotH * (a2 - 1.0) + 1.0;
    float D      = a2 / (3.14159 * dnom * dnom);
    float spec   = D * fresnel * NdotL * (0.5 + uSunlight * 1.1);
    // Soft scatter halo
    float specW  = pow(NdotH, 16.0) * 0.07 * uSunlight;
    // Micro-shimmer on ripples
    float sh     = sin(vUv.x * 260.0 + t * 3.5) * sin(vUv.y * 210.0 - t * 2.8) * 0.5 + 0.5;
    float shim   = sh * sh * 0.055 * uSunlight * vTroughDark;

    // ── FOAM (3 layers) ──────────────────────────────────────────────────────
    vec2 foamUv = vUv * 24.0;

    // 1. Whitecap blobs on crest peaks
    float wc    = vCrestSharp * whitecap(foamUv + vec2(t * 0.06, 0.0), t);

    // 2. Trailing foam streaks (elongated along wave travel)
    float st    = vCrestSharp * 0.75 * foamStreak(vUv * vec2(20.0, 9.0) + vec2(t * 0.055, 0.0), t);

    // 3. Fine lace on slopes (always slightly visible near crests)
    float lace  = smoothstep(0.08, 0.38, vWaveHeight) * foamLace(vUv * vec2(1.0, 0.5), t) * 0.32;

    float foamTotal = clamp(wc * 1.4 + st + lace, 0.0, 1.0);
    // Foam color: bright white core → blue-grey edges
    vec3 foamCol = mix(vec3(0.78, 0.85, 0.90), vec3(0.95, 0.97, 1.00), wc * 0.8 + st * 0.2);

    // ── COMPOSE ──────────────────────────────────────────────────────────────
    vec3 color = mix(waterBase, skyRefl, clamp(fresnel, 0.0, 0.85));

    // Specular on non-foam areas (foam is matte)
    float foamSuppression = 1.0 - foamTotal * 0.75;
    color += (spec + specW + shim) * foamSuppression;

    // Foam blend
    color = mix(color, foamCol, foamTotal * 0.92);

    // Atmospheric horizon haze
    float dist = length(vWorldPos.xz) / 340.0;
    color = mix(color, uHorizonColor * 0.88, clamp(dist * dist * 0.32, 0.0, 0.42));

    // Desaturate in low-light / overcast (matches grey-sky reference)
    float sat = 0.65 + uSunlight * 0.35;
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(lum), color, sat);

    gl_FragColor = vec4(color, 0.97);
  }
`

// ─── MATERIAL ────────────────────────────────────────────────────────────────

const OceanShaderMaterial = shaderMaterial(
  {
    uTime:         0,
    uWaveAmp:      0.55,
    uWaveFreq:     0.18,
    uWaveSpeed:    0.82,
    uSmallWaveAmp: 0.10,
    uChop:         0.24,
    uSteepness:    0.60,
    uSunlight:     1.0,
    uDepthMix:     1.0,
    uColorDeep:    new THREE.Color('#050d14'),  // very dark — almost black troughs
    uColorMid:     new THREE.Color('#0e3248'),
    uColorShallow: new THREE.Color('#1a5c7a'),
    uSkyColor:     new THREE.Color('#7aafc4'),  // overcast grey-blue
    uHorizonColor: new THREE.Color('#c2d8e2'),
    uSunDir:       new THREE.Vector3(0.4, 0.85, 0.2),
  },
  VERT,
  FRAG
)

extend({ OceanShaderMaterial })

// ─── SUBMARINE SHAKE HOOK ────────────────────────────────────────────────────
/**
 * useSubmarineShake(submarineRef, divePhase, surfaceWaveIntensity)
 *
 * Add this hook inside your Submarine component:
 *   const subRef = useRef()
 *   useSubmarineShake(subRef, divePhase, surfaceWaveIntensity)
 *   return <group ref={subRef}> ... submarine mesh ... </group>
 */
export function useSubmarineShake(submarineRef, divePhase, surfaceWaveIntensity) {
  const acc = useRef({ py: 0, px: 0, rx: 0, rz: 0 })

  useFrame(({ clock }) => {
    if (!submarineRef?.current) return
    const t  = clock.elapsedTime
    const wi = surfaceWaveIntensity ?? 1.0

    let mag = 0
    switch (divePhase) {
      case DIVE_PHASES.HARBOR:          mag = 0.045 * wi; break
      case DIVE_PHASES.SURFACE:         mag = 0.26  * wi; break
      case DIVE_PHASES.PERISCOPE_DEPTH: mag = 0.11  * wi; break
      case DIVE_PHASES.SHALLOW:         mag = 0.045 * wi; break
      default:                          mag = 0.0;         break
    }

    // Smooth to neutral when submerged
    if (mag < 0.001) {
      acc.current.py *= 0.91; acc.current.px *= 0.93
      acc.current.rx *= 0.91; acc.current.rz *= 0.92
    } else {
      // Primary heave: slow dominant swell
      const heave = Math.sin(t * 0.62) * mag * 1.9
                  + Math.sin(t * 1.08 + 0.9) * mag * 0.55
                  + Math.sin(t * 1.55 - 0.4) * mag * 0.22

      // Roll: cross-swell rocking
      const roll  = Math.sin(t * 0.52 + 0.3) * mag * 0.022
                  + Math.sin(t * 0.85 - 0.6) * mag * 0.009
                  + Math.sin(t * 1.28 + 1.1) * mag * 0.004

      // Pitch: fore-aft nodding
      const pitch = Math.sin(t * 0.70 + 1.3) * mag * 0.016
                  + Math.cos(t * 1.22) * mag * 0.006

      // Surge: forward/back motion from wave orbital
      const surge = Math.cos(t * 0.62) * mag * 0.5
                  + Math.cos(t * 1.08 + 0.5) * mag * 0.18

      // High-freq micro-jitter from chop
      const jY = (Math.random() - 0.5) * mag * 0.10
      const jX = (Math.random() - 0.5) * mag * 0.06

      const LP = 0.07
      acc.current.py += (heave + jY) * LP
      acc.current.px += (surge + jX) * LP
      acc.current.rx += pitch * LP
      acc.current.rz += roll  * LP

      // Decay (spring return)
      acc.current.py *= 0.935
      acc.current.px *= 0.952
      acc.current.rx *= 0.928
      acc.current.rz *= 0.938
    }

    submarineRef.current.position.y = acc.current.py
    submarineRef.current.position.x = acc.current.px
    submarineRef.current.rotation.x = acc.current.rx
    submarineRef.current.rotation.z = acc.current.rz

    // Publish for any external consumer
    Object.assign(submarineMotion, {
      x: acc.current.px, y: acc.current.py,
      rx: acc.current.rx, rz: acc.current.rz,
    })
  })
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function OceanSurfaceShader() {
  const matRef               = useRef()
  const surfaceWaveIntensity = useGameStore(s => s.surfaceWaveIntensity)
  const sunlightIntensity    = useGameStore(s => s.sunlightIntensity)
  const divePhase            = useGameStore(s => s.divePhase)

  const depthMix = useMemo(() => {
    switch (divePhase) {
      case DIVE_PHASES.HARBOR:          return 1.0
      case DIVE_PHASES.SURFACE:         return 0.85
      case DIVE_PHASES.PERISCOPE_DEPTH: return 0.62
      case DIVE_PHASES.SHALLOW:         return 0.42
      case DIVE_PHASES.DEEP:            return 0.20
      default:                          return 0.08
    }
  }, [divePhase])

  const { skyColor, horizonColor } = useMemo(() => {
    switch (divePhase) {
      case DIVE_PHASES.HARBOR:
        return { skyColor: new THREE.Color('#5ba8d0'), horizonColor: new THREE.Color('#b8daf0') }
      case DIVE_PHASES.SURFACE:
        // Grey overcast sky — matches reference photo
        return { skyColor: new THREE.Color('#8ab0c2'), horizonColor: new THREE.Color('#ccdde6') }
      default:
        return { skyColor: new THREE.Color('#1a4a6a'), horizonColor: new THREE.Color('#28788a') }
    }
  }, [divePhase])

  useFrame((state) => {
    if (!matRef.current) return
    const m = matRef.current
    const t = state.clock.elapsedTime

    const isHarbor  = divePhase === DIVE_PHASES.HARBOR
    const isSurface = divePhase === DIVE_PHASES.SURFACE

    m.uTime = t

    // Large open-ocean amplitude (reference shows 1.5-2m swells)
    m.uWaveAmp = isHarbor
      ? 0.07  + surfaceWaveIntensity * 0.04
      : isSurface
      ? 0.58  + surfaceWaveIntensity * 0.52
      : 0.28  + surfaceWaveIntensity * 0.20

    // Steepness: high = very sharp cusped crests (matching reference)
    m.uSteepness = isHarbor
      ? 0.22
      : isSurface
      ? 0.64 + surfaceWaveIntensity * 0.12
      : 0.34

    m.uChop = isHarbor
      ? 0.04 + surfaceWaveIntensity * 0.02
      : isSurface
      ? 0.30 + surfaceWaveIntensity * 0.20
      : 0.14 + surfaceWaveIntensity * 0.08

    m.uSmallWaveAmp = isHarbor ? 0.025 : isSurface ? 0.13 : 0.07
    m.uWaveSpeed    = isHarbor ? 0.45  : isSurface ? 0.80 : 0.62
    m.uSunlight     = sunlightIntensity
    m.uDepthMix     = depthMix
    m.uSkyColor     = skyColor
    m.uHorizonColor = horizonColor

    // Slowly drifting sun direction
    m.uSunDir = new THREE.Vector3(
      0.36 + Math.sin(t * 0.007) * 0.07,
      0.82,
      0.16 + Math.cos(t * 0.007) * 0.05
    ).normalize()
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      {/* 440 segments — sufficient for Gerstner crest sharpness */}
      <planeGeometry args={[660, 660, 440, 440]} />
      <oceanShaderMaterial ref={matRef} transparent side={THREE.DoubleSide} />
    </mesh>
  )
}
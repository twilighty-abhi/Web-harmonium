/**
 * Sample-based harmonium voice — same approach as Rajaraman Iyer’s Web Harmonium:
 * one looped harmonium WAV, pitch via BufferSource.detune (cents), optional octave
 * doubles for “reed” weight. Samples: rajaramaniyer.github.io (harmonium-kannan-orig.wav).
 */
import { getAudioContext, now } from './context.js'

export interface ReedGains {
  bass: number
  mid: number
  treble: number
}

interface Layer {
  src: AudioBufferSourceNode
  gain: GainNode
}

interface RunningNote {
  layers: Layer[]
}

const active = new Map<number, RunningNote>()

/** Matches webharmonium.html: loopStart / loopEnd (seconds). */
const LOOP_START_SEC = 0.5
const LOOP_END_SEC = 7.5

/**
 * Same as reference keyMap[i] with transpose baked into `midi`:
 * baseKeyMap[i] = -62 + i  →  detune cents = (-62 + midi) * 100
 * (middleC/rootKey init in their init()).
 */
function detuneCentsForMidi(midi: number): number {
  return (-62 + midi) * 100
}

let harmoniumBuffer: AudioBuffer | null = null

export function setHarmoniumBuffer(buf: AudioBuffer | null): void {
  harmoniumBuffer = buf
}

export function isHarmoniumLoaded(): boolean {
  return harmoniumBuffer != null
}

function loopEndForBuffer(buf: AudioBuffer): number {
  const cap = Math.min(LOOP_END_SEC, buf.duration - 0.03)
  return Math.max(LOOP_START_SEC + 0.12, cap)
}

export function noteOn(
  midi: number,
  velocity: number,
  reeds: ReedGains,
  dryBus: GainNode,
  wetBus: GainNode,
): void {
  if (!harmoniumBuffer) return
  const context = getAudioContext()
  const t = now()
  noteOff(midi, 0.02)

  const b = Math.max(0, Math.min(1, reeds.bass))
  const m = Math.max(0, Math.min(1, reeds.mid))
  const tr = Math.max(0, Math.min(1, reeds.treble))
  const reedAvg = (b + m + tr) / 3
  const reedGate = 0.12 + 0.88 * Math.min(1, reedAvg * 1.15)

  const wMap = new Map<number, number>()
  const add = (m: number, w: number): void => {
    if (m < 0 || m > 127) return
    wMap.set(m, (wMap.get(m) ?? 0) + w)
  }
  add(midi, 1)
  /* Octave doubles — similar to “Additional Reeds” / coupler (quiet upper & lower). */
  if (b > 0.28) add(midi - 12, 0.2 * b)
  if (tr > 0.28) add(midi + 12, 0.24 * tr)
  if (m > 0.55) add(midi + 12, 0.12 * m)

  const vel = Math.max(0.06, Math.min(1, velocity)) * reedGate * 0.38
  const loopEnd = loopEndForBuffer(harmoniumBuffer)

  const layers: Layer[] = []
  for (const [mNote, weight] of wMap) {
    const src = context.createBufferSource()
    src.buffer = harmoniumBuffer
    src.loop = true
    src.loopStart = LOOP_START_SEC
    src.loopEnd = loopEnd
    src.detune.value = detuneCentsForMidi(mNote)

    const g = context.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.002, vel * weight), t + 0.028)

    src.connect(g)
    g.connect(dryBus)
    g.connect(wetBus)
    src.start(t)
    layers.push({ src, gain: g })
  }

  if (layers.length) active.set(midi, { layers })
}

export function noteOff(midi: number, release = 0.28): void {
  const v = active.get(midi)
  if (!v) return
  const context = getAudioContext()
  const t = now()
  const stopT = t + release + 0.12
  for (const { src, gain } of v.layers) {
    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + release)
    try {
      src.stop(stopT)
    } catch {
      /* already stopped */
    }
  }
  active.delete(midi)
  window.setTimeout(() => {
    for (const { gain } of v.layers) {
      try {
        gain.disconnect()
      } catch {
        /* noop */
      }
    }
  }, Math.max(50, (stopT - context.currentTime) * 1000))
}

export function stopAllNotes(): void {
  for (const m of [...active.keys()]) noteOff(m, 0.06)
}

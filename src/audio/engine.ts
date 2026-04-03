import { getAudioContext, now } from './context.js'
import { createReverb } from './reverb.js'
import { noteOn, noteOff, stopAllNotes, type ReedGains } from './voice.js'
import { getReverbBuffer } from './samples.js'
import { state } from '../state.js'

let inited = false
let dryGain: GainNode | null = null
let wetGain: GainNode | null = null
let masterGain: GainNode | null = null
let convolver: ConvolverNode | null = null
let usingRecordedReverb = false

let droneOscs: OscillatorNode[] = []
let droneGain: GainNode | null = null

/** Build master + reverb routing (call after AudioContext resume). */
export function ensureAudioGraph(): void {
  ensureGraph()
}

function ensureGraph(): void {
  if (inited) return
  const ctx = getAudioContext()
  dryGain = ctx.createGain()
  wetGain = ctx.createGain()
  masterGain = ctx.createGain()
  convolver = createReverb(ctx)
  dryGain.connect(masterGain)
  wetGain.connect(convolver)
  convolver.connect(masterGain)
  masterGain.connect(ctx.destination)

  droneGain = ctx.createGain()
  droneGain.gain.value = 0
  droneGain.connect(dryGain)
  inited = true
  applyReverbBufferIfAvailable()
  syncLevels()
}

/** After sample pack loads, swap in harmonium-kannan IR (reverb.wav). */
export function applyReverbBufferIfAvailable(): void {
  if (!inited || !convolver) return
  const buf = getReverbBuffer()
  if (buf && !usingRecordedReverb) {
    convolver.buffer = buf
    usingRecordedReverb = true
  }
}

export function syncLevels(): void {
  ensureGraph()
  const m = masterGain!
  const d = dryGain!
  const w = wetGain!
  const wet = state.reverb
  m.gain.value = state.masterVolume
  d.gain.value = Math.cos((wet * Math.PI) / 2)
  w.gain.value = Math.sin((wet * Math.PI) / 2)
}

export function playNote(midi: number, velocity = 0.75): void {
  ensureGraph()
  syncLevels()
  const reeds: ReedGains = {
    bass: state.reedBass,
    mid: state.reedMid,
    treble: state.reedTreble,
  }
  noteOn(midi, velocity, reeds, dryGain!, wetGain!)
}

export function releaseNote(midi: number): void {
  noteOff(midi)
}

export function stopEveryVoice(): void {
  stopAllNotes()
}

export function updateDrone(): void {
  ensureGraph()
  const ctx = getAudioContext()
  const t = now()
  for (const o of droneOscs) {
    try {
      o.stop(t)
    } catch {
      /* noop */
    }
    o.disconnect()
  }
  droneOscs = []
  if (!state.droneOn || state.droneLevel < 0.001) {
    if (droneGain) droneGain.gain.setTargetAtTime(0, t, 0.05)
    return
  }
  const sa = 60 + state.transposeSemitones + state.octaveShift * 12
  const f = 440 * Math.pow(2, (sa - 69) / 12)
  const o1 = ctx.createOscillator()
  const o2 = ctx.createOscillator()
  o1.type = 'triangle'
  o2.type = 'sine'
  o1.frequency.value = f
  o2.frequency.value = f * 2
  const g1 = ctx.createGain()
  const g2 = ctx.createGain()
  g1.gain.value = 0.12 * state.droneLevel
  g2.gain.value = 0.04 * state.droneLevel
  o1.connect(g1)
  o2.connect(g2)
  g1.connect(droneGain!)
  g2.connect(droneGain!)
  o1.start(t)
  o2.start(t)
  droneOscs = [o1, o2]
  droneGain!.gain.setTargetAtTime(1, t, 0.08)
}

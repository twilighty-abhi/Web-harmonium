import { getAudioContext, now } from './context.js'

let intervalId: ReturnType<typeof setInterval> | null = null
let bpm = 72
let running = false

function click(): void {
  const ctx = getAudioContext()
  const t = now()
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.frequency.value = 1000
  o.type = 'square'
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
  o.connect(g)
  g.connect(ctx.destination)
  o.start(t)
  o.stop(t + 0.07)
}

export function startMetronome(beatsPerMinute: number): void {
  bpm = beatsPerMinute
  if (running) return
  running = true
  const periodMs = (60_000 / bpm) | 0
  click()
  intervalId = window.setInterval(() => click(), periodMs)
}

export function stopMetronome(): void {
  running = false
  if (intervalId != null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

export function setMetronomeBpm(beatsPerMinute: number): void {
  const was = running
  stopMetronome()
  bpm = beatsPerMinute
  if (was) startMetronome(bpm)
}

export type TutorialMode = 'watch' | 'playAlong' | 'youTry'

export interface AppState {
  transposeSemitones: number
  octaveShift: number
  reverb: number
  masterVolume: number
  reedBass: number
  reedMid: number
  reedTreble: number
  droneLevel: number
  droneOn: boolean
  reducedMotion: boolean
  /** BPM for tutorial / metronome */
  tutorialBpm: number
  playbackSpeed: number
  metronomeOn: boolean
  countInBars: number
  loopEnabled: boolean
  loopStartBeat: number
  loopEndBeat: number
  selectedSongId: string | null
  tutorialMode: TutorialMode
  activePreset: 'practice' | 'bright' | 'soft'
  /** Shift+key adds +12 MIDI for that press only — handled in input layer */
  shiftOctaveNudge: boolean
}

const listeners = new Set<() => void>()

export const state: AppState = {
  transposeSemitones: 0,
  octaveShift: 0,
  reverb: 0.25,
  masterVolume: 0.85,
  reedBass: 0.6,
  reedMid: 0.85,
  reedTreble: 0.55,
  droneLevel: 0.15,
  droneOn: false,
  reducedMotion: false,
  tutorialBpm: 72,
  playbackSpeed: 1,
  metronomeOn: false,
  countInBars: 1,
  loopEnabled: false,
  loopStartBeat: 0,
  loopEndBeat: 4,
  selectedSongId: null,
  tutorialMode: 'watch',
  activePreset: 'practice',
  shiftOctaveNudge: true,
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emit(): void {
  for (const fn of listeners) fn()
}

export function setState(partial: Partial<AppState>): void {
  Object.assign(state, partial)
  emit()
}

/** Sa reference for sargam labels: middle C + transpose + octave. */
export function saReferenceMidi(): number {
  return 60 + state.transposeSemitones + state.octaveShift * 12
}

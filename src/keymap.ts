/** Physical `code` values from KeyboardEvent.code — single source of truth. */

export type PhysicalCode =
  | 'KeyQ'
  | 'KeyW'
  | 'KeyE'
  | 'KeyR'
  | 'KeyT'
  | 'KeyY'
  | 'KeyU'
  | 'KeyI'
  | 'KeyO'
  | 'KeyP'
  | 'BracketLeft'
  | 'BracketRight'
  | 'Backslash'
  | 'KeyA'
  | 'KeyS'
  | 'KeyD'
  | 'KeyF'
  | 'KeyG'
  | 'KeyH'
  | 'KeyJ'
  | 'KeyK'
  | 'KeyL'
  | 'Semicolon'
  | 'Quote'
  | 'KeyZ'
  | 'KeyX'
  | 'KeyC'
  | 'KeyV'
  | 'KeyB'
  | 'KeyN'
  | 'KeyM'
  | 'Comma'
  | 'Period'
  | 'Slash'
  | 'Digit1'
  | 'Digit2'
  | 'Digit3'
  | 'Digit4'
  | 'Digit5'
  | 'Digit6'
  | 'Digit7'
  | 'Digit8'
  | 'Digit9'
  | 'Digit0'

export type KeyId = `k${number}`

export interface KeySlot {
  id: KeyId
  code: PhysicalCode
  /** Semitone offset from Q at current base (chromatic ladder). */
  chromaticOffset: number
}

/**
 * 42 keys ≈ 3½ octaves (standard professional harmonium span). Low → high matches
 * left-to-right on the keybed. Keyboard mapping runs Z→/ , then A→' , then Q→\\ , then 1→6.
 */
export const HARMONIUM_KEY_COUNT = 42

/** MIDI for chromaticOffset 0 when transpose=0 and octaveShift=0 (C3). */
export const HARMONIUM_BASE_MIDI = 48

const CODES_CHROMATIC_LOW_TO_HIGH: PhysicalCode[] = [
  'KeyZ',
  'KeyX',
  'KeyC',
  'KeyV',
  'KeyB',
  'KeyN',
  'KeyM',
  'Comma',
  'Period',
  'Slash',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyF',
  'KeyG',
  'KeyH',
  'KeyJ',
  'KeyK',
  'KeyL',
  'Semicolon',
  'Quote',
  'KeyQ',
  'KeyW',
  'KeyE',
  'KeyR',
  'KeyT',
  'KeyY',
  'KeyU',
  'KeyI',
  'KeyO',
  'KeyP',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
]

export const KEY_SLOTS: KeySlot[] = CODES_CHROMATIC_LOW_TO_HIGH.map((code, i) => ({
  id: `k${i}` as KeyId,
  code,
  chromaticOffset: i,
}))

const codeToSlot = new Map<PhysicalCode, KeySlot>()
const idToSlot = new Map<KeyId, KeySlot>()
for (const s of KEY_SLOTS) {
  codeToSlot.set(s.code, s)
  idToSlot.set(s.id, s)
}

export function slotByCode(code: string): KeySlot | undefined {
  return codeToSlot.get(code as PhysicalCode)
}

export function slotById(id: string): KeySlot | undefined {
  return idToSlot.get(id as KeyId)
}

export function midiForSlot(
  slot: KeySlot,
  transposeSemitones: number,
  octaveShift: number,
): number {
  return HARMONIUM_BASE_MIDI + slot.chromaticOffset + transposeSemitones + octaveShift * 12
}

const WESTERN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const

const SARGAM_MAJOR: Record<number, string> = {
  0: 'Sa',
  1: 're',
  2: 'Re',
  3: 'ga',
  4: 'Ga',
  5: 'Ma',
  6: 'Ma♯',
  7: 'Pa',
  8: 'dha',
  9: 'Dha',
  10: 'ni',
  11: 'Ni',
}

/** Bilaval-style labels relative to current Sa (tonic = midi % 12 from reference). */
export function labelsForMidi(midi: number, saMidi: number): { western: string; sargam: string } {
  const pc = ((midi % 12) + 12) % 12
  const western = WESTERN[pc]!
  const interval = ((midi - saMidi) % 12 + 12) % 12
  const sargam = SARGAM_MAJOR[interval] ?? '—'
  const oct = Math.floor(midi / 12) - 1
  return { western: `${western}${oct}`, sargam }
}

export function displayKeyLetter(code: PhysicalCode): string {
  const map: Partial<Record<PhysicalCode, string>> = {
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Digit1: '1',
    Digit2: '2',
    Digit3: '3',
    Digit4: '4',
    Digit5: '5',
    Digit6: '6',
    Digit7: '7',
    Digit8: '8',
    Digit9: '9',
    Digit0: '0',
  }
  if (map[code]) return map[code]!
  return code.replace('Key', '')
}

import type { Song, SongEvent } from './types.js'

export interface PhraseSegment {
  events: SongEvent[]
  /** Earliest beat in this phrase */
  startBeat: number
}

/** Break on rests longer than this (beats). */
const GAP_BREAK_BEATS = 0.45
/** Force a new phrase if span exceeds this (beats). */
const MAX_PHRASE_SPAN = 4.5

/**
 * Split song events into short phrases for teach → wait → retry flow.
 * Overlapping notes share the same phrase; long gaps start a new phrase.
 */
export function buildPhraseSegments(song: Song): PhraseSegment[] {
  const evs = [...song.events].sort((a, b) => a.t - b.t || a.midi - b.midi)
  if (evs.length === 0) return []

  const chunks: SongEvent[][] = []
  let cur: SongEvent[] = []
  let segStart = evs[0]!.t
  let lastEnd = evs[0]!.t + evs[0]!.duration

  const flush = () => {
    if (cur.length) chunks.push(cur)
    cur = []
  }

  for (const ev of evs) {
    const end = ev.t + ev.duration
    if (cur.length === 0) {
      cur.push(ev)
      segStart = ev.t
      lastEnd = end
      continue
    }
    const gap = ev.t - lastEnd
    const span = Math.max(lastEnd, end) - segStart
    if (gap > GAP_BREAK_BEATS || span > MAX_PHRASE_SPAN) {
      flush()
      cur.push(ev)
      segStart = ev.t
      lastEnd = end
    } else {
      cur.push(ev)
      lastEnd = Math.max(lastEnd, end)
    }
  }
  flush()

  return chunks.map((events) => ({
    events,
    startBeat: Math.min(...events.map((e) => e.t)),
  }))
}

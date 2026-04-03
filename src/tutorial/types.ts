export interface SongEvent {
  /** Beat index (quarter note = 1 beat). */
  t: number
  midi: number
  /** Duration in beats */
  duration: number
  sargam: string
  western: string
}

export interface Song {
  id: string
  title: string
  description: string
  bpm: number
  difficulty: 'easy' | 'medium'
  lengthBeats: number
  events: SongEvent[]
}

export interface SongIndexEntry {
  id: string
  title: string
  difficulty: string
}

import { playNote, playRagaNote, releaseNote, releaseRagaNote, syncLevels } from '../audio/engine.js'
import { state } from '../state.js'
import { buildPhraseSegments, type PhraseSegment } from './segments.js'
import type { Song, SongEvent } from './types.js'

export type PlayStatus = 'idle' | 'countIn' | 'playing' | 'paused' | 'mentorWait'

export type MentorPhase = 'off' | 'countIn' | 'demo' | 'wait' | 'fullRun'

export interface PlayerCallbacks {
  onBeat: (beat: number, eventHint: SongEvent | null) => void
  onHighlight: (midi: number | null, ev: SongEvent | null) => void
  onMatch: (ok: boolean, message: string) => void
  onEnd: () => void
  /** Phrase practice / full run milestones */
  onMentorPhase?: (phase: MentorPhase, message: string) => void
  /** After full run with mentor */
  onRating?: (percent: number, label: string, hits: number, total: number) => void
  /** 0–100 progress through mentor lesson (phrases + full run) */
  onMentorProgress?: (percent: number) => void
}

function eventHitKey(ev: SongEvent): string {
  return `${ev.t.toFixed(3)}:${ev.midi}`
}

export class TutorialPlayer {
  song: Song | null = null
  status: PlayStatus = 'idle'
  /** Wall-clock seconds when song beat 0 begins (after count-in). */
  private musicStartSec = 0
  private timeouts: number[] = []
  private raf = 0
  private countInBeats = 0
  private frozenBeat: number | null = null
  private readonly cb: PlayerCallbacks

  /** Mentor (play along / you try) */
  private useMentor = false
  private mentorSkipDemo = false
  private mentorPhase: MentorPhase = 'off'
  private mentorSegments: PhraseSegment[] = []
  private mentorSegmentIndex = 0
  /** Sorted events user must play in order for current phrase */
  private mentorExpected: SongEvent[] = []
  private mentorUserStep = 0
  private activeFullRunEv: SongEvent | null = null
  private fullRunHits = new Set<string>()
  private mentorFrozen: { segmentIndex: number; userStep: number } | null = null

  constructor(callbacks: PlayerCallbacks) {
    this.cb = callbacks
  }

  load(song: Song): void {
    this.stop()
    this.song = song
  }

  private nowSec(): number {
    return performance.now() / 1000
  }

  beatDurationSec(): number {
    const bpm = this.song?.bpm ?? state.tutorialBpm
    return 60 / (bpm * state.playbackSpeed)
  }

  private countInTotalBeats(): number {
    return Math.max(0, Math.round(state.countInBars * 4))
  }

  private clearTimeouts(): void {
    for (const id of this.timeouts) window.clearTimeout(id)
    this.timeouts = []
  }

  private pushTimeout(fn: () => void, ms: number): void {
    this.timeouts.push(window.setTimeout(fn, ms))
  }

  private emitMentorProgress(): void {
    if (!this.useMentor || !this.song || this.mentorSegments.length === 0) return
    const n = this.mentorSegments.length
    let p = 0
    if (this.mentorPhase === 'fullRun') {
      const b = Math.min(this.song.lengthBeats, Math.max(0, this.currentSongBeat()))
      p = 50 + (b / Math.max(0.001, this.song.lengthBeats)) * 50
    } else if (this.mentorPhase === 'wait') {
      p = ((this.mentorSegmentIndex + 0.55) / (n + 0.55)) * 50
    } else {
      p = (this.mentorSegmentIndex / Math.max(1, n + 0.55)) * 50
    }
    this.cb.onMentorProgress?.(Math.min(100, Math.round(p)))
  }

  currentBeat(): number {
    if (this.status === 'paused' && this.frozenBeat != null) return this.frozenBeat
    return this.beatFromClock()
  }

  private beatFromClock(): number {
    if (this.status === 'idle' || !this.song) return 0
    const bd = this.beatDurationSec()
    const t = this.nowSec()
    if (t < this.musicStartSec) {
      const ci = this.countInBeats
      const elapsed = t - (this.musicStartSec - ci * bd)
      return Math.max(0, elapsed / bd)
    }
    return this.countInBeats + (t - this.musicStartSec) / bd
  }

  currentSongBeat(): number {
    return Math.max(0, this.currentBeat() - this.countInBeats)
  }

  start(): void {
    if (!this.song) return
    this.stopPlaybackOnly()
    this.mentorFrozen = null

    if (state.ragaAmbient) {
      this.startRagaAmbientWatch()
      return
    }

    if (state.tutorialMode === 'playAlong' || state.tutorialMode === 'youTry') {
      this.startMentorFlow({ skipDemo: state.tutorialMode === 'youTry' })
      return
    }

    this.startClassicWatch()
  }

  /** Continuous loop: slow raga-style phrases, no count-in, seamless restarts. */
  private startRagaAmbientWatch(): void {
    if (!this.song) return
    this.useMentor = false
    this.mentorPhase = 'off'
    this.countInBeats = 0
    this.musicStartSec = this.nowSec()
    this.status = 'playing'
    this.scheduleRagaNotesOnce()
    this.loop()
  }

  private scheduleRagaNotesOnce(): void {
    if (!this.song || !state.ragaAmbient) return
    const bd = this.beatDurationSec()
    const scheduleAt = this.nowSec()
    this.musicStartSec = scheduleAt

    for (const ev of this.song.events) {
      const tOn = this.musicStartSec + ev.t * bd
      const tOnMs = Math.max(0, (tOn - scheduleAt) * 1000)
      const durSec = Math.max(0.15, ev.duration * bd * 0.97)
      const idOn = window.setTimeout(() => {
        if (this.status === 'idle' || this.status === 'paused') return
        syncLevels()
        playRagaNote(ev.midi, 0.17)
      }, tOnMs)
      const idOff = window.setTimeout(() => releaseRagaNote(ev.midi), tOnMs + durSec * 1000)
      this.timeouts.push(idOn, idOff)
    }

    const endT = this.musicStartSec + this.song.lengthBeats * bd
    const totalMs = Math.max(0, (endT - scheduleAt) * 1000) + 400
    this.timeouts.push(
      window.setTimeout(() => {
        if (this.status === 'idle' || this.status === 'paused') return
        if (!state.ragaAmbient || !this.song) {
          this.finishSongClassic()
          return
        }
        this.scheduleRagaNotesOnce()
      }, totalMs),
    )
  }

  private startMentorFlow(opts: { skipDemo: boolean }): void {
    if (!this.song) return
    this.useMentor = true
    this.mentorSkipDemo = opts.skipDemo
    this.mentorPhase = 'countIn'
    this.mentorSegments = buildPhraseSegments(this.song)
    this.fullRunHits.clear()

    if (this.mentorSegments.length === 0) {
      this.useMentor = false
      this.mentorPhase = 'off'
      return
    }

    this.mentorSegmentIndex = 0
    this.mentorUserStep = 0
    this.mentorExpected = []

    const bd = this.beatDurationSec()
    this.countInBeats = this.countInTotalBeats()
    const ci = this.countInBeats
    const t0 = this.nowSec()
    this.musicStartSec = t0 + ci * bd

    const intro = opts.skipDemo
      ? `${this.mentorSegments.length} phrases — play each when prompted (no demo).`
      : `I'll play each phrase, then you repeat it. ${this.mentorSegments.length} phrases, then we run the whole song together.`
    this.cb.onMentorPhase?.('countIn', intro)

    for (let i = 0; i < ci; i++) {
      const id = window.setTimeout(() => {
        syncLevels()
        playNote(72, 0.18)
        window.setTimeout(() => releaseNote(72), 70)
      }, i * bd * 1000)
      this.timeouts.push(id)
    }

    if (ci > 0) {
      this.status = 'countIn'
      this.pushTimeout(() => {
        if (this.status === 'idle' || this.status === 'paused') return
        this.kickMentorFirstPhrase()
      }, ci * bd * 1000)
      this.loop()
    } else {
      this.kickMentorFirstPhrase()
    }
    this.emitMentorProgress()
  }

  private kickMentorFirstPhrase(): void {
    cancelAnimationFrame(this.raf)
    this.mentorSegmentIndex = 0
    const label = this.mentorSkipDemo
      ? `Phrase 1 of ${this.mentorSegments.length} — play the highlighted notes in order.`
      : `Phrase 1 of ${this.mentorSegments.length} — listen…`
    this.cb.onMentorPhase?.('demo', label)
    if (this.mentorSkipDemo) {
      this.enterMentorWait()
    } else {
      this.playSegmentDemo(this.mentorSegments[0]!.events)
    }
    this.emitMentorProgress()
  }

  private playSegmentDemo(events: SongEvent[]): void {
    this.clearTimeouts()
    this.mentorPhase = 'demo'
    this.status = 'playing'
    const bd = this.beatDurationSec()
    const sorted = [...events].sort((a, b) => a.t - b.t || a.midi - b.midi)
    const tBase = Math.min(...sorted.map((e) => e.t))
    let maxEndSec = 0

    for (const ev of sorted) {
      const relOn = (ev.t - tBase) * bd
      const durSec = Math.max(0.1, ev.duration * bd * 0.9)
      maxEndSec = Math.max(maxEndSec, relOn + durSec)
      const tOnMs = Math.max(0, relOn * 1000)
      const idOn = window.setTimeout(() => {
        if (this.mentorPhase !== 'demo' || this.status === 'paused' || this.status === 'idle') return
        syncLevels()
        this.cb.onHighlight(ev.midi, ev)
        playNote(ev.midi, 0.5)
      }, tOnMs)
      const idOff = window.setTimeout(() => {
        releaseNote(ev.midi)
        if (this.mentorPhase === 'demo') this.cb.onHighlight(null, null)
      }, tOnMs + durSec * 1000)
      this.timeouts.push(idOn, idOff)
    }

    this.pushTimeout(() => {
      if (this.mentorPhase !== 'demo' || this.status === 'paused') return
      this.cb.onHighlight(null, null)
      this.enterMentorWait()
    }, maxEndSec * 1000 + 400)
  }

  private enterMentorWait(): void {
    cancelAnimationFrame(this.raf)
    this.mentorPhase = 'wait'
    this.status = 'mentorWait'
    const seg = this.mentorSegments[this.mentorSegmentIndex]
    if (!seg) return
    this.mentorExpected = [...seg.events].sort((a, b) => a.t - b.t || a.midi - b.midi)
    this.mentorUserStep = 0
    const n = this.mentorExpected.length
    this.cb.onMentorPhase?.(
      'wait',
      `Your turn — phrase ${this.mentorSegmentIndex + 1}/${this.mentorSegments.length}: play ${n} note${n === 1 ? '' : 's'} in order (${this.mentorSkipDemo ? 'no demo' : 'same as you heard'}). Wrong note restarts this phrase.`,
    )
    this.highlightMentorNext()
    this.emitMentorProgress()
  }

  private highlightMentorNext(): void {
    const ev = this.mentorExpected[this.mentorUserStep]
    if (ev) {
      this.cb.onHighlight(ev.midi, ev)
      this.cb.onBeat(this.mentorSegmentIndex, ev)
    } else {
      this.cb.onHighlight(null, null)
    }
  }

  private handleMentorWaitNote(midi: number): void {
    const ev = this.mentorExpected[this.mentorUserStep]
    if (!ev) return
    if (midi === ev.midi) {
      this.mentorUserStep++
      const left = this.mentorExpected.length - this.mentorUserStep
      if (left === 0) {
        this.cb.onMatch(true, 'Phrase complete!')
        this.advanceMentorAfterPhrase()
      } else {
        this.cb.onMatch(true, `Yes — ${this.mentorUserStep}/${this.mentorExpected.length}`)
        this.highlightMentorNext()
      }
    } else {
      this.mentorUserStep = 0
      this.cb.onMatch(
        false,
        `Expected ${ev.sargam} (${ev.western}) — try the whole phrase again from the first note.`,
      )
      this.highlightMentorNext()
    }
  }

  private advanceMentorAfterPhrase(): void {
    this.clearTimeouts()
    this.cb.onHighlight(null, null)
    this.mentorSegmentIndex++
    if (this.mentorSegmentIndex >= this.mentorSegments.length) {
      this.cb.onMentorPhase?.(
        'fullRun',
        'Phrases done. Final step: play the full song with me — match each note as it highlights.',
      )
      this.pushTimeout(() => this.startFullRunMentor(), 1200)
    } else {
      const next = this.mentorSegmentIndex + 1
      const total = this.mentorSegments.length
      this.cb.onMentorPhase?.(
        'demo',
        this.mentorSkipDemo
          ? `Phrase ${next} of ${total} — play when ready.`
          : `Phrase ${next} of ${total} — listen…`,
      )
      this.pushTimeout(() => {
        if (this.status === 'idle' || this.status === 'paused') return
        if (this.mentorSkipDemo) {
          this.enterMentorWait()
        } else {
          this.playSegmentDemo(this.mentorSegments[this.mentorSegmentIndex]!.events)
        }
      }, 650)
    }
    this.emitMentorProgress()
  }

  private startFullRunMentor(): void {
    if (!this.song) return
    this.clearTimeouts()
    cancelAnimationFrame(this.raf)
    this.mentorPhase = 'fullRun'
    this.fullRunHits.clear()
    const bd = this.beatDurationSec()
    this.countInBeats = 0
    const scheduleAt = this.nowSec()
    this.musicStartSec = scheduleAt
    this.status = 'playing'

    for (const ev of this.song.events) {
      const tOn = this.musicStartSec + ev.t * bd
      const tOnMs = Math.max(0, (tOn - scheduleAt) * 1000)
      const durSec = Math.max(0.1, ev.duration * bd * 0.92)
      const idOn = window.setTimeout(() => {
        if (this.status === 'idle' || this.status === 'paused') return
        syncLevels()
        playNote(ev.midi, 0.48)
      }, tOnMs)
      const idOff = window.setTimeout(() => releaseNote(ev.midi), tOnMs + durSec * 1000)
      this.timeouts.push(idOn, idOff)
    }

    const endT = this.musicStartSec + this.song.lengthBeats * bd
    const totalMs = Math.max(0, (endT - scheduleAt) * 1000) + 700
    this.pushTimeout(() => {
      if (this.status === 'idle' || this.status === 'paused') return
      this.finishMentorSession()
    }, totalMs)

    this.loop()
    this.emitMentorProgress()
  }

  private handleFullRunNote(midi: number): void {
    const ev = this.activeFullRunEv
    if (!ev) return
    if (midi === ev.midi) {
      const key = eventHitKey(ev)
      if (!this.fullRunHits.has(key)) {
        this.fullRunHits.add(key)
        this.cb.onMatch(true, '✓')
      }
    } else {
      this.cb.onMatch(false, 'Play the highlighted note')
    }
  }

  private finishMentorSession(): void {
    this.stopPlaybackOnly()
    this.status = 'idle'
    this.useMentor = false
    this.mentorPhase = 'off'
    const song = this.song
    const total = song?.events.length ?? 1
    const hits = this.fullRunHits.size
    const pct = Math.min(100, Math.round((hits / total) * 100))
    const label =
      pct >= 90
        ? 'Excellent'
        : pct >= 72
          ? 'Good work'
          : pct >= 50
            ? 'Solid — run it again'
            : 'Try another pass on the phrases'
    this.cb.onRating?.(pct, label, hits, total)
    this.cb.onMentorPhase?.('off', `Finished: ${hits}/${total} notes matched in the full run (${pct}%). ${label}.`)
    this.cb.onEnd()
  }

  private startClassicWatch(): void {
    if (!this.song) return
    this.useMentor = false
    this.mentorPhase = 'off'
    const bd = this.beatDurationSec()
    this.countInBeats = this.countInTotalBeats()
    const ci = this.countInBeats
    const t0 = this.nowSec()
    this.musicStartSec = t0 + ci * bd
    this.status = ci > 0 ? 'countIn' : 'playing'

    for (let i = 0; i < ci; i++) {
      const id = window.setTimeout(() => {
        syncLevels()
        playNote(72, 0.18)
        window.setTimeout(() => releaseNote(72), 70)
      }, i * bd * 1000)
      this.timeouts.push(id)
    }

    const scheduleTeacher = () => {
      if (!this.song) return
      syncLevels()
      const scheduleAt = this.nowSec()
      for (const ev of this.song.events) {
        const tOn = this.musicStartSec + ev.t * bd
        const tOnMs = Math.max(0, (tOn - scheduleAt) * 1000)
        const durSec = Math.max(0.1, ev.duration * bd * 0.92)
        if (state.tutorialMode === 'watch') {
          const idOn = window.setTimeout(() => {
            if (this.status === 'idle' || this.status === 'paused') return
            playNote(ev.midi, 0.52)
          }, tOnMs)
          const idOff = window.setTimeout(() => releaseNote(ev.midi), tOnMs + durSec * 1000)
          this.timeouts.push(idOn, idOff)
        }
      }
      const endT = this.musicStartSec + this.song.lengthBeats * bd
      const totalMs = Math.max(0, (endT - scheduleAt) * 1000) + 400
      this.timeouts.push(
        window.setTimeout(() => {
          if (this.status === 'idle' || this.status === 'paused') return
          this.finishSongClassic()
        }, totalMs),
      )
    }

    if (ci > 0) {
      this.timeouts.push(window.setTimeout(scheduleTeacher, ci * bd * 1000))
    } else {
      scheduleTeacher()
    }

    this.loop()
  }

  pause(): void {
    if (
      state.ragaAmbient &&
      (this.status === 'playing' || this.status === 'countIn')
    ) {
      this.clearTimeouts()
      cancelAnimationFrame(this.raf)
      this.frozenBeat = null
      this.status = 'paused'
      return
    }
    if (this.status === 'mentorWait') {
      this.mentorFrozen = {
        segmentIndex: this.mentorSegmentIndex,
        userStep: this.mentorUserStep,
      }
      this.frozenBeat = null
      this.status = 'paused'
      this.clearTimeouts()
      cancelAnimationFrame(this.raf)
      return
    }
    if (this.status !== 'playing' && this.status !== 'countIn') return
    this.frozenBeat = this.beatFromClock()
    this.status = 'paused'
    cancelAnimationFrame(this.raf)
    this.clearTimeouts()
  }

  resume(): void {
    if (this.status !== 'paused' || !this.song) return

    if (state.ragaAmbient) {
      this.frozenBeat = null
      this.status = 'playing'
      this.scheduleRagaNotesOnce()
      this.loop()
      return
    }

    if (this.mentorFrozen) {
      this.mentorSegmentIndex = this.mentorFrozen.segmentIndex
      this.mentorUserStep = this.mentorFrozen.userStep
      this.mentorFrozen = null
      const seg = this.mentorSegments[this.mentorSegmentIndex]
      if (seg) {
        this.mentorExpected = [...seg.events].sort((a, b) => a.t - b.t || a.midi - b.midi)
        this.status = 'mentorWait'
        this.mentorPhase = 'wait'
        this.highlightMentorNext()
        this.cb.onMentorPhase?.('wait', 'Paused — continue your phrase.')
      }
      return
    }

    const b = this.frozenBeat ?? this.beatFromClock()
    this.frozenBeat = null
    const bd = this.beatDurationSec()
    const now = this.nowSec()
    this.musicStartSec = now - (b - this.countInBeats) * bd
    this.status = 'playing'
    const song = this.song
    const ci = this.countInBeats
    const songBeat = b - ci

    syncLevels()
    for (const ev of song.events) {
      const end = ev.t + ev.duration
      if (ev.t < songBeat && songBeat < end) {
        playNote(ev.midi, 0.45)
        const leftSec = (end - songBeat) * bd
        this.timeouts.push(window.setTimeout(() => releaseNote(ev.midi), leftSec * 1000))
      } else if (ev.t >= songBeat) {
        const tOnMs = (ev.t - songBeat) * bd * 1000
        const durSec = Math.max(0.1, ev.duration * bd * 0.92)
        if (state.tutorialMode === 'watch' || (this.useMentor && this.mentorPhase === 'fullRun')) {
          this.timeouts.push(
            window.setTimeout(() => {
              if (this.status !== 'playing') return
              playNote(ev.midi, 0.52)
            }, tOnMs),
            window.setTimeout(() => releaseNote(ev.midi), tOnMs + durSec * 1000),
          )
        }
      }
    }
    const leftBeats = ci + song.lengthBeats - b
    this.timeouts.push(
      window.setTimeout(() => {
        if (this.status !== 'playing') return
        if (this.useMentor && this.mentorPhase === 'fullRun') this.finishMentorSession()
        else this.finishSongClassic()
      }, Math.max(200, leftBeats * bd * 1000 + 200)),
    )
    this.loop()
  }

  stop(): void {
    this.clearTimeouts()
    cancelAnimationFrame(this.raf)
    this.frozenBeat = null
    this.mentorFrozen = null
    this.useMentor = false
    this.mentorPhase = 'off'
    this.mentorExpected = []
    this.mentorUserStep = 0
    this.activeFullRunEv = null
    if (this.song) {
      for (const ev of this.song.events) releaseNote(ev.midi)
    }
    this.status = 'idle'
    this.cb.onHighlight(null, null)
  }

  private stopPlaybackOnly(): void {
    this.clearTimeouts()
    cancelAnimationFrame(this.raf)
    this.frozenBeat = null
    this.mentorFrozen = null
    this.useMentor = false
    this.mentorPhase = 'off'
    this.mentorExpected = []
    this.mentorUserStep = 0
    this.activeFullRunEv = null
    if (this.song) {
      for (const ev of this.song.events) releaseNote(ev.midi)
    }
    this.cb.onHighlight(null, null)
  }

  private finishSongClassic(): void {
    this.stopPlaybackOnly()
    this.status = 'idle'
    this.frozenBeat = null
    this.cb.onEnd()
  }

  reportUserNote(midi: number): void {
    const mentorMode = state.tutorialMode === 'playAlong' || state.tutorialMode === 'youTry'
    if (!mentorMode) return

    if (this.status === 'mentorWait' && this.mentorPhase === 'wait') {
      this.handleMentorWaitNote(midi)
      return
    }

    if (
      mentorMode &&
      this.mentorPhase === 'fullRun' &&
      this.status === 'playing' &&
      this.activeFullRunEv
    ) {
      this.handleFullRunNote(midi)
    }
  }

  private loop(): void {
    const tick = () => {
      if (this.status !== 'playing' && this.status !== 'countIn') return
      const song = this.song
      if (!song) return

      let b = this.currentBeat()
      const ci = this.countInBeats
      let songBeat = b - ci

      if (state.ragaAmbient && song.lengthBeats > 0) {
        songBeat =
          ((songBeat % song.lengthBeats) + song.lengthBeats) % song.lengthBeats
      }

      if (
        state.loopEnabled &&
        !state.ragaAmbient &&
        songBeat >= state.loopEndBeat &&
        state.loopEndBeat > state.loopStartBeat &&
        !this.useMentor
      ) {
        const loopLen = state.loopEndBeat - state.loopStartBeat
        const over = songBeat - state.loopStartBeat
        const wrapped = state.loopStartBeat + (over % loopLen)
        const t = this.nowSec()
        this.musicStartSec = t - wrapped * this.beatDurationSec()
        b = this.currentBeat()
        songBeat = b - ci
      }

      if (
        !state.ragaAmbient &&
        songBeat >= song.lengthBeats &&
        b >= ci + song.lengthBeats - 0.01 &&
        !(this.useMentor && this.mentorPhase === 'fullRun')
      ) {
        this.finishSongClassic()
        return
      }

      let currentEv: SongEvent | null = null
      for (const ev of song.events) {
        if (songBeat >= ev.t && songBeat < ev.t + ev.duration) {
          currentEv = ev
          break
        }
      }

      this.cb.onBeat(b, currentEv)
      this.cb.onHighlight(currentEv?.midi ?? null, currentEv)

      if (this.useMentor && this.mentorPhase === 'fullRun') {
        this.activeFullRunEv = currentEv
      } else {
        this.activeFullRunEv = null
      }

      if (this.nowSec() < this.musicStartSec) this.status = 'countIn'
      else if (this.status === 'countIn') this.status = 'playing'

      if (this.useMentor && this.mentorPhase === 'fullRun') {
        this.emitMentorProgress()
      }

      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }
}

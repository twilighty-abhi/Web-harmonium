import './styles.css'
import { resumeAudio } from './audio/context.js'
import {
  playNote,
  releaseNote,
  stopEveryVoice,
  syncLevels,
  updateDrone,
  ensureAudioGraph,
  applyReverbBufferIfAvailable,
} from './audio/engine.js'
import { loadHarmoniumSamplePack } from './audio/samples.js'
import { startMetronome, stopMetronome, setMetronomeBpm } from './audio/metronome.js'
import {
  KEY_SLOTS,
  midiForSlot,
  labelsForMidi,
  displayKeyLetter,
  type KeySlot,
} from './keymap.js'
import { state, subscribe, setState, saReferenceMidi } from './state.js'
import type { TutorialMode } from './state.js'
import { TutorialPlayer } from './tutorial/player.js'
import type { Song, SongIndexEntry } from './tutorial/types.js'

const pressedPhysical = new Set<string>()
let activeMidiFromUser = new Set<number>()
let loadedSong: Song | null = null
let songIndex: SongIndexEntry[] = []

function isBlackKey(slot: KeySlot): boolean {
  const m =
    midiForSlot(slot, state.transposeSemitones, state.octaveShift) % 12
  return [1, 3, 6, 8, 10].includes(m)
}

function slotForMidi(midi: number): KeySlot | undefined {
  return KEY_SLOTS.find(
    (s) => midiForSlot(s, state.transposeSemitones, state.octaveShift) === midi,
  )
}

function userMidiForSlot(slot: KeySlot): number {
  let m = midiForSlot(slot, state.transposeSemitones, state.octaveShift)
  /* Shift nudge handled at keydown */
  return m
}

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
<div class="start-overlay" id="start-overlay" role="dialog" aria-modal="true" aria-labelledby="start-title">
  <div class="start-card">
    <h1 id="start-title">Web Harmonium</h1>
    <p>Press Start to enable sound and load the harmonium samples (~2&nbsp;MB). One keybed row: <kbd>Z</kbd> = lowest (C3) → <kbd>6</kbd> = highest (F6). <kbd>Shift</kbd> + key raises an octave.</p>
    <p class="start-status" id="start-status" aria-live="polite"></p>
    <button type="button" id="btn-start-audio">Start</button>
  </div>
</div>
<div class="shell">
  <div class="stage-wrap">
    <div class="top-bar">
      <span class="logo">Web Harmonium</span>
      <span class="hint" id="legend-hint"></span>
    </div>
    <div class="instrument-stack">
      <div class="instrument-frame">
        <div class="keybed-divider" aria-hidden="true"></div>
        <div class="keyboard-deck">
          <div class="keys-label">Harmonium keybed (42 keys, 3½ octaves, low → high) — Sargam · Western · <kbd>Shift</kbd> + key = +1 octave</div>
          <div class="keys-felt" aria-hidden="true"></div>
          <div class="keys-bed">
            <div class="keys-rows" id="keys-rows"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="sound-strip" role="group" aria-label="Sound">
      <div class="sound-strip__item">
        <label class="sound-strip__label" for="rng-vol">Volume</label>
        <input type="range" id="rng-vol" min="0" max="1" step="0.01" aria-valuetext="" />
        <span class="sound-strip__value" id="lbl-vol-pct" aria-hidden="true"></span>
      </div>
      <div class="sound-strip__item">
        <label class="sound-strip__label" for="rng-rev">Reverb</label>
        <input type="range" id="rng-rev" min="0" max="1" step="0.01" aria-valuetext="" />
        <span class="sound-strip__value" id="lbl-rev-pct" aria-hidden="true"></span>
      </div>
      <button type="button" class="sound-strip__metro" id="btn-metro-quick" aria-pressed="false">
        Metronome
      </button>
    </div>
  </div>
  <button type="button" class="drawer-toggle" id="drawer-toggle" aria-expanded="true">Lessons panel</button>
  <aside class="drawer" id="drawer" aria-label="Tutorials and teacher">
    <h2>Assistant teacher</h2>
    <ul class="song-list" id="song-list"></ul>
    <p class="lesson-meta" id="lesson-desc">Choose a lesson.</p>
    <div class="mode-row" id="mode-row">
      <button type="button" data-mode="watch" class="active">Watch</button>
      <button type="button" data-mode="playAlong" title="Mentor plays each phrase, you repeat it, then full run with score">Play along</button>
      <button type="button" data-mode="youTry" title="Same steps without demo audio — read highlights only">You try</button>
    </div>
    <div class="transport">
      <button type="button" class="primary" id="btn-play">Play</button>
      <button type="button" id="btn-pause">Pause</button>
      <button type="button" id="btn-stop">Stop</button>
    </div>
    <div class="timeline" aria-hidden="true"><div class="timeline-bar" id="timeline-bar"></div></div>
    <p class="next-hint" id="next-hint"></p>
    <p class="feedback" id="feedback" role="status"></p>
    <div class="ctl-row ctl-row--lesson">
      <label>
        <span class="ctl-label-row"><span>BPM</span><span class="ctl-val" id="lbl-lesson-bpm" aria-live="polite"></span></span>
        <input type="range" id="rng-bpm" min="40" max="140" step="1" />
      </label>
      <label>
        <span class="ctl-label-row"><span>Speed</span><span class="ctl-val" id="lbl-lesson-speed" aria-live="polite"></span></span>
        <input type="range" id="rng-speed" min="0.5" max="1" step="0.05" />
      </label>
      <label>
        <span class="ctl-label-row"><span>Transpose</span><span class="ctl-val" id="lbl-lesson-trans" aria-live="polite"></span></span>
        <input type="range" id="rng-trans" min="-6" max="6" step="1" />
      </label>
      <label>
        <span class="ctl-label-row"><span>Octave</span><span class="ctl-val" id="lbl-lesson-oct" aria-live="polite"></span></span>
        <input type="range" id="rng-oct" min="-2" max="2" step="1" />
      </label>
      <label>Loop A <input type="number" id="inp-loop-a" min="0" max="64" step="0.5" /></label>
      <label>Loop B <input type="number" id="inp-loop-b" min="0" max="64" step="0.5" /></label>
      <label>
        <span class="ctl-label-row"><span>Count-in (bars)</span><span class="ctl-val" id="lbl-lesson-countin" aria-live="polite"></span></span>
        <input type="range" id="rng-countin" min="0" max="2" step="1" />
      </label>
    </div>
    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--muted);margin-bottom:0.5rem;">
      <input type="checkbox" id="chk-loop" /> Loop A–B
    </label>
    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--muted);margin-bottom:0.5rem;">
      <input type="checkbox" id="chk-metro" /> Metronome
    </label>
    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--muted);margin-bottom:0.5rem;">
      <input type="checkbox" id="chk-drone" /> Drone (Sa)
    </label>
    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--muted);margin-bottom:0.75rem;">
      <input type="checkbox" id="chk-motion" /> Reduce motion
    </label>
    <div class="presets">
      <label for="sel-preset" style="font-size:0.78rem;color:var(--muted);">Preset</label>
      <select id="sel-preset">
        <option value="practice">Practice</option>
        <option value="bright">Bright</option>
        <option value="soft">Soft</option>
      </select>
    </div>
    <div class="ctl-row" style="margin-top:0.75rem;">
      <label>
        <span class="ctl-label-row"><span>Reed bass</span><span class="ctl-val" id="lbl-lesson-bass" aria-live="polite"></span></span>
        <input type="range" id="rng-bass" min="0" max="1" step="0.01" />
      </label>
      <label>
        <span class="ctl-label-row"><span>Reed mid</span><span class="ctl-val" id="lbl-lesson-mid" aria-live="polite"></span></span>
        <input type="range" id="rng-mid" min="0" max="1" step="0.01" />
      </label>
      <label>
        <span class="ctl-label-row"><span>Reed treble</span><span class="ctl-val" id="lbl-lesson-treble" aria-live="polite"></span></span>
        <input type="range" id="rng-treble" min="0" max="1" step="0.01" />
      </label>
      <label>
        <span class="ctl-label-row"><span>Drone level</span><span class="ctl-val" id="lbl-lesson-drone-lvl" aria-live="polite"></span></span>
        <input type="range" id="rng-drone-lvl" min="0" max="1" step="0.01" />
      </label>
    </div>
  </aside>
</div>
`

const elStart = document.getElementById('start-overlay')!
const elKeysRows = document.getElementById('keys-rows')!
const elLegend = document.getElementById('legend-hint')!
const elSongList = document.getElementById('song-list')!
const elLessonDesc = document.getElementById('lesson-desc')!
const elTimelineBar = document.getElementById('timeline-bar')!
const elNextHint = document.getElementById('next-hint')!
const elFeedback = document.getElementById('feedback')!
const elDrawer = document.getElementById('drawer')!
const elDrawerToggle = document.getElementById('drawer-toggle')!

const keyElByCode = new Map<string, HTMLElement>()

function renderKeys(): void {
  elKeysRows.innerHTML = ''
  keyElByCode.clear()
  elKeysRows.classList.add('keys-rows--piano')
  const row = document.createElement('div')
  row.className = 'piano-row'
  const ordered = [...KEY_SLOTS].sort((a, b) => a.chromaticOffset - b.chromaticOffset)
  for (const slot of ordered) {
    const midi = userMidiForSlot(slot)
    const { western, sargam } = labelsForMidi(midi, saReferenceMidi())
    const letter = displayKeyLetter(slot.code)
    const black = isBlackKey(slot)
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `key-cap ${black ? 'black' : 'white'}`
    btn.dataset.code = slot.code
    btn.setAttribute('aria-label', `${letter} ${sargam} ${western}`)
    btn.innerHTML = `<span class="key-cap__face"><span class="letter">${letter}</span><span class="dual">${sargam} · ${western}</span></span>`
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      noteDown(slot)
    })
    btn.addEventListener('pointerup', () => noteUp(slot))
    btn.addEventListener('pointerleave', () => noteUp(slot))
    row.append(btn)
    keyElByCode.set(slot.code, btn)
  }
  elKeysRows.append(row)
  elLegend.textContent = `${KEY_SLOTS.length} keys (C3–F6) · low → high · Shift + key +1 octave`
}

function setKeyPressed(code: string, down: boolean): void {
  const el = keyElByCode.get(code)
  if (el) el.classList.toggle('pressed', down)
}

function setKeyTeach(midi: number | null): void {
  for (const [, el] of keyElByCode) {
    el.classList.remove('active-teach', 'match-ok')
  }
  if (midi == null) return
  const slot = slotForMidi(midi)
  if (slot) {
    const el = keyElByCode.get(slot.code)
    el?.classList.add('active-teach')
  }
}

function noteDown(slot: KeySlot): void {
  void resumeAudio()
  let midi = userMidiForSlot(slot)
  if (pressedPhysical.has('ShiftLeft') || pressedPhysical.has('ShiftRight')) {
    midi += 12
  }
  if (activeMidiFromUser.has(midi)) return
  activeMidiFromUser.add(midi)
  syncLevels()
  playNote(midi, 0.78)
  player.reportUserNote(midi)
}

function noteUp(slot: KeySlot): void {
  let midi = userMidiForSlot(slot)
  if (pressedPhysical.has('ShiftLeft') || pressedPhysical.has('ShiftRight')) {
    midi += 12
  }
  if (!activeMidiFromUser.has(midi)) return
  activeMidiFromUser.delete(midi)
  releaseNote(midi)
}

const player = new TutorialPlayer({
  onBeat: (beat, ev) => {
    const song = loadedSong
    if (!song) return
    const mentor = state.tutorialMode === 'playAlong' || state.tutorialMode === 'youTry'
    if (!mentor) {
      const ci = Math.round(state.countInBars * 4)
      const total = ci + song.lengthBeats
      const pct = Math.min(100, (beat / total) * 100)
      elTimelineBar.style.width = `${pct}%`
    }
    if (ev && !mentor) {
      elNextHint.textContent = `Next: ${ev.sargam} · ${ev.western}`
    }
  },
  onHighlight: (midi) => {
    setKeyTeach(midi)
  },
  onMatch: (ok, msg) => {
    elFeedback.textContent = msg
    elFeedback.style.color = ok ? 'var(--success)' : '#e8a0a0'
  },
  onMentorPhase: (_phase, message) => {
    elNextHint.textContent = message
  },
  onMentorProgress: (pct) => {
    elTimelineBar.style.width = `${pct}%`
  },
  onRating: (percent, label, hits, total) => {
    elFeedback.textContent = `Full run score: ${hits}/${total} notes (${percent}%). ${label}.`
    elFeedback.style.color =
      percent >= 72 ? 'var(--success)' : percent >= 50 ? 'var(--honey-light)' : '#e8a0a0'
  },
  onEnd: () => {
    if (state.tutorialMode === 'watch') {
      elFeedback.textContent = 'Lesson complete — pick another or replay.'
      elFeedback.style.color = 'var(--text)'
    }
    setKeyTeach(null)
    elTimelineBar.style.width = '0%'
  },
})

document.getElementById('btn-start-audio')!.addEventListener('click', async () => {
  const btn = document.getElementById('btn-start-audio') as HTMLButtonElement
  const status = document.getElementById('start-status')!
  btn.disabled = true
  status.textContent = 'Starting audio…'
  try {
    await resumeAudio()
    status.textContent = 'Loading harmonium samples…'
    await loadHarmoniumSamplePack()
    ensureAudioGraph()
    applyReverbBufferIfAvailable()
    syncLevels()
    elStart.classList.add('hidden')
    updateDrone()
  } catch (err) {
    console.error(err)
    status.textContent =
      'Could not load harmonium files. Use npm run dev / host from a server, or check your connection.'
    btn.disabled = false
  }
})

function onKeyDown(e: KeyboardEvent): void {
  if (e.repeat) return
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (e.code === 'Tab') return
  pressedPhysical.add(e.code)
  const slot = KEY_SLOTS.find((s) => s.code === e.code)
  if (slot) {
    e.preventDefault()
    noteDown(slot)
    setKeyPressed(slot.code, true)
  }
}

function onKeyUp(e: KeyboardEvent): void {
  pressedPhysical.delete(e.code)
  const slot = KEY_SLOTS.find((s) => s.code === e.code)
  if (slot) {
    e.preventDefault()
    noteUp(slot)
    setKeyPressed(slot.code, false)
  }
}

window.addEventListener('keydown', onKeyDown)
window.addEventListener('keyup', onKeyUp)
window.addEventListener('blur', () => {
  pressedPhysical.clear()
  for (const slot of KEY_SLOTS) {
    setKeyPressed(slot.code, false)
    const midi = userMidiForSlot(slot)
    const midiShift = midi + 12
    ;[midi, midiShift].forEach((m) => {
      if (activeMidiFromUser.has(m)) {
        activeMidiFromUser.delete(m)
        releaseNote(m)
      }
    })
  }
})

document.getElementById('mode-row')!.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('button')
  if (!t?.dataset.mode) return
  const mode = t.dataset.mode as TutorialMode
  player.stop()
  stopEveryVoice()
  setState({ tutorialMode: mode })
  document.querySelectorAll('#mode-row button').forEach((b) => b.classList.remove('active'))
  t.classList.add('active')
  elNextHint.textContent = ''
})

document.getElementById('btn-play')!.addEventListener('click', () => {
  void resumeAudio()
  if (!loadedSong) {
    elFeedback.textContent = 'Select a lesson first.'
    return
  }
  if (player.status === 'paused') player.resume()
  else player.start()
})

document.getElementById('btn-pause')!.addEventListener('click', () => player.pause())
document.getElementById('btn-stop')!.addEventListener('click', () => {
  player.stop()
  stopEveryVoice()
})

function bindRange(id: string, key: keyof typeof state, fn?: () => void): void {
  const el = document.getElementById(id) as HTMLInputElement
  el.value = String(state[key] as number)
  el.addEventListener('input', () => {
    const v = el.type === 'number' ? Number(el.value) : parseFloat(el.value)
    setState({ [key]: v } as Partial<typeof state>)
    syncLevels()
    fn?.()
    renderKeys()
    updateLessonSliderReadouts()
  })
}

function bindCheck(id: string, key: keyof typeof state, fn?: () => void): void {
  const el = document.getElementById(id) as HTMLInputElement
  el.checked = Boolean(state[key])
  el.addEventListener('change', () => {
    setState({ [key]: el.checked } as Partial<typeof state>)
    fn?.()
  })
}

function updateSoundReadouts(): void {
  const rev = Math.round(state.reverb * 100)
  const vol = Math.round(state.masterVolume * 100)
  const revInp = document.getElementById('rng-rev') as HTMLInputElement | null
  const volInp = document.getElementById('rng-vol') as HTMLInputElement | null
  document.getElementById('lbl-rev-pct')!.textContent = `${rev}%`
  document.getElementById('lbl-vol-pct')!.textContent = `${vol}%`
  if (revInp) revInp.setAttribute('aria-valuetext', `${rev} percent wet`)
  if (volInp) volInp.setAttribute('aria-valuetext', `${vol} percent`)
}

function signedInt(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function fmtSpeed(s: number): string {
  return String(Number(s.toFixed(2)))
}

function updateLessonSliderReadouts(): void {
  const set = (id: string, text: string) => {
    const el = document.getElementById(id)
    if (el) el.textContent = text
  }
  set('lbl-lesson-bpm', String(state.tutorialBpm))
  set('lbl-lesson-speed', fmtSpeed(state.playbackSpeed))
  set('lbl-lesson-trans', `${signedInt(state.transposeSemitones)} st`)
  set('lbl-lesson-oct', `${signedInt(state.octaveShift)} oct`)
  set('lbl-lesson-countin', String(state.countInBars))
  const pct = (x: number) => `${Math.round(x * 100)}%`
  set('lbl-lesson-bass', pct(state.reedBass))
  set('lbl-lesson-mid', pct(state.reedMid))
  set('lbl-lesson-treble', pct(state.reedTreble))
  set('lbl-lesson-drone-lvl', pct(state.droneLevel))

  const bpmInp = document.getElementById('rng-bpm') as HTMLInputElement | null
  const speedInp = document.getElementById('rng-speed') as HTMLInputElement | null
  const transInp = document.getElementById('rng-trans') as HTMLInputElement | null
  const octInp = document.getElementById('rng-oct') as HTMLInputElement | null
  const countInp = document.getElementById('rng-countin') as HTMLInputElement | null
  const bassInp = document.getElementById('rng-bass') as HTMLInputElement | null
  const midInp = document.getElementById('rng-mid') as HTMLInputElement | null
  const trebleInp = document.getElementById('rng-treble') as HTMLInputElement | null
  const droneInp = document.getElementById('rng-drone-lvl') as HTMLInputElement | null
  if (bpmInp) bpmInp.setAttribute('aria-valuetext', `${state.tutorialBpm} BPM`)
  if (speedInp) speedInp.setAttribute('aria-valuetext', fmtSpeed(state.playbackSpeed))
  if (transInp) transInp.setAttribute('aria-valuetext', `${signedInt(state.transposeSemitones)} semitones`)
  if (octInp) octInp.setAttribute('aria-valuetext', `${signedInt(state.octaveShift)} octaves`)
  if (countInp) countInp.setAttribute('aria-valuetext', `${state.countInBars} bars`)
  if (bassInp) bassInp.setAttribute('aria-valuetext', pct(state.reedBass))
  if (midInp) midInp.setAttribute('aria-valuetext', pct(state.reedMid))
  if (trebleInp) trebleInp.setAttribute('aria-valuetext', pct(state.reedTreble))
  if (droneInp) droneInp.setAttribute('aria-valuetext', pct(state.droneLevel))
}

function syncMetroQuickButton(): void {
  const btn = document.getElementById('btn-metro-quick')
  if (!btn) return
  btn.setAttribute('aria-pressed', String(state.metronomeOn))
  btn.classList.toggle('is-on', state.metronomeOn)
}

function syncControlsFromState(): void {
  ;(document.getElementById('rng-bpm') as HTMLInputElement).value = String(state.tutorialBpm)
  ;(document.getElementById('rng-speed') as HTMLInputElement).value = String(state.playbackSpeed)
  ;(document.getElementById('rng-trans') as HTMLInputElement).value = String(state.transposeSemitones)
  ;(document.getElementById('rng-oct') as HTMLInputElement).value = String(state.octaveShift)
  ;(document.getElementById('rng-rev') as HTMLInputElement).value = String(state.reverb)
  ;(document.getElementById('rng-vol') as HTMLInputElement).value = String(state.masterVolume)
  ;(document.getElementById('inp-loop-a') as HTMLInputElement).value = String(state.loopStartBeat)
  ;(document.getElementById('inp-loop-b') as HTMLInputElement).value = String(state.loopEndBeat)
  ;(document.getElementById('rng-countin') as HTMLInputElement).value = String(state.countInBars)
  ;(document.getElementById('chk-loop') as HTMLInputElement).checked = state.loopEnabled
  ;(document.getElementById('chk-metro') as HTMLInputElement).checked = state.metronomeOn
  ;(document.getElementById('chk-drone') as HTMLInputElement).checked = state.droneOn
  ;(document.getElementById('chk-motion') as HTMLInputElement).checked = state.reducedMotion
  ;(document.getElementById('rng-bass') as HTMLInputElement).value = String(state.reedBass)
  ;(document.getElementById('rng-mid') as HTMLInputElement).value = String(state.reedMid)
  ;(document.getElementById('rng-treble') as HTMLInputElement).value = String(state.reedTreble)
  ;(document.getElementById('rng-drone-lvl') as HTMLInputElement).value = String(state.droneLevel)
  ;(document.getElementById('sel-preset') as HTMLSelectElement).value = state.activePreset
  document.documentElement.classList.toggle('reduce-motion', state.reducedMotion)
  updateSoundReadouts()
  updateLessonSliderReadouts()
  syncMetroQuickButton()
}

async function loadSongIndex(): Promise<void> {
  const res = await fetch('/songs/index.json')
  songIndex = (await res.json()) as SongIndexEntry[]
  elSongList.innerHTML = ''
  for (const entry of songIndex) {
    const li = document.createElement('li')
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = `${entry.title} · ${entry.difficulty}`
    b.dataset.id = entry.id
    b.addEventListener('click', () => void selectSong(entry.id))
    li.append(b)
    elSongList.append(li)
  }
  if (songIndex[0]) await selectSong(songIndex[0].id)
}

async function selectSong(id: string): Promise<void> {
  const res = await fetch(`/songs/${id}.json`)
  loadedSong = (await res.json()) as Song
  player.load(loadedSong)
  state.selectedSongId = id
  elLessonDesc.textContent = loadedSong.description
  document.querySelectorAll('.song-list button').forEach((b) => {
    b.classList.toggle('selected', (b as HTMLButtonElement).dataset.id === id)
  })
  setState({ tutorialBpm: loadedSong.bpm })
  ;(document.getElementById('rng-bpm') as HTMLInputElement).value = String(loadedSong.bpm)
  updateLessonSliderReadouts()
  if (state.metronomeOn) setMetronomeBpm(loadedSong.bpm)
}

elDrawerToggle.addEventListener('click', () => {
  const collapsed = elDrawer.classList.toggle('collapsed-mobile')
  elDrawerToggle.setAttribute('aria-expanded', String(!collapsed))
})

bindRange('rng-bpm', 'tutorialBpm', () => {
  if (state.metronomeOn) setMetronomeBpm(state.tutorialBpm)
})
bindRange('rng-speed', 'playbackSpeed')
bindRange('rng-trans', 'transposeSemitones', () => updateDrone())
bindRange('rng-oct', 'octaveShift', () => updateDrone())
bindRange('rng-rev', 'reverb', () => updateSoundReadouts())
bindRange('rng-vol', 'masterVolume', () => updateSoundReadouts())
bindRange('rng-bass', 'reedBass')
bindRange('rng-mid', 'reedMid')
bindRange('rng-treble', 'reedTreble')
bindRange('rng-drone-lvl', 'droneLevel', () => updateDrone())
bindRange('rng-countin', 'countInBars')

;(document.getElementById('inp-loop-a') as HTMLInputElement).addEventListener('input', (e) => {
  setState({ loopStartBeat: Number((e.target as HTMLInputElement).value) })
})
;(document.getElementById('inp-loop-b') as HTMLInputElement).addEventListener('input', (e) => {
  setState({ loopEndBeat: Number((e.target as HTMLInputElement).value) })
})

bindCheck('chk-loop', 'loopEnabled')
bindCheck('chk-drone', 'droneOn', () => updateDrone())
bindCheck('chk-motion', 'reducedMotion', () => {
  document.documentElement.classList.toggle('reduce-motion', state.reducedMotion)
})

;(document.getElementById('chk-metro') as HTMLInputElement).addEventListener('change', (e) => {
  const on = (e.target as HTMLInputElement).checked
  setState({ metronomeOn: on })
  if (on) startMetronome(state.tutorialBpm)
  else stopMetronome()
  syncMetroQuickButton()
})

document.getElementById('btn-metro-quick')!.addEventListener('click', () => {
  const on = !state.metronomeOn
  setState({ metronomeOn: on })
  ;(document.getElementById('chk-metro') as HTMLInputElement).checked = on
  if (on) startMetronome(state.tutorialBpm)
  else stopMetronome()
  syncMetroQuickButton()
})

;(document.getElementById('sel-preset') as HTMLSelectElement).addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value as typeof state.activePreset
  setState({ activePreset: v })
  if (v === 'practice') {
    setState({ reedBass: 0.6, reedMid: 0.85, reedTreble: 0.55, reverb: 0.25 })
  } else if (v === 'bright') {
    setState({ reedBass: 0.35, reedMid: 0.7, reedTreble: 0.95, reverb: 0.18 })
  } else {
    setState({ reedBass: 0.75, reedMid: 0.6, reedTreble: 0.35, reverb: 0.42 })
  }
  syncLevels()
  syncControlsFromState()
})

subscribe(() => {
  syncLevels()
})

renderKeys()
syncControlsFromState()
void loadSongIndex()

# Web Harmonium

A browser-based Indian harmonium with realistic sample-based sound, 42 piano-style keys (C3–F6), and a built-in lesson system that teaches you songs phrase by phrase.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Vite](https://img.shields.io/badge/Vite-8-646CFF)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **42-key chromatic keybed** — matches a standard 3.5-octave professional harmonium, rendered as realistic ivory and ebony piano-style keys with red felt backing
- **Sample-based audio** — uses a real harmonium recording (harmonium-kannan-orig.wav) pitched via Web Audio API detune, with convolution reverb from a recorded impulse response
- **Three reed stops** — bass, mid, and treble knobs that blend octave-doubled layers like physical reed couplers
- **Drone (Sa)** — continuous tanpura-style drone with adjustable level
- **Keyboard mapping** — four rows of your QWERTY keyboard map chromatically from low to high (`Z`→`8`), with `Shift` + key for +1 octave
- **21 built-in lessons** — from Sargam scales to Bollywood classics and Western pop songs
- **Mentor-style teaching** — in Play Along / You Try modes, the teacher breaks each song into phrases, demos them, waits for you to play back correctly, then runs the full song with a score
- **Watch mode** — sit back and watch the keys light up as the song plays
- **Sound presets** — Practice, Bright, and Soft presets that adjust reed balance and reverb
- **Metronome** — built-in click with adjustable BPM
- **Loop A–B** — set start/end beat markers to drill a tricky section
- **Transpose and octave shift** — slide the pitch center without changing fingering
- **Responsive** — works on desktop and mobile; horizontal scroll on smaller screens
- **Accessible** — ARIA labels on every key, `aria-valuetext` on sliders, reduce-motion toggle

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (LTS recommended)

### Install and Run

```bash
git clone https://github.com/your-username/web-harmonium.git
cd web-harmonium
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and click **Start** to load the harmonium samples.

### Build for Production

```bash
npm run build
npm run preview   # preview the production build locally
```

The output goes to `dist/`. Deploy the entire folder to any static host (Vercel, Netlify, GitHub Pages, etc.). No server-side code required.

## Keyboard Layout

The 42 keys span four keyboard rows, low-to-high left-to-right:

| Row | Keys | Notes |
|-----|------|-------|
| Bottom | `Z X C V B N M , . /` | C3 – A3 |
| Home | `A S D F G H J K L ; '` | A#3 – G#4 |
| Top | `Q W E R T Y U I O P [ ] \` | A4 – A#5 |
| Number | `1 2 3 4 5 6 7 8` | B5 – F6 |

Hold **Shift** while pressing any key to raise that note by one octave.

## Lesson System

1. Pick a song from the sidebar
2. Choose a mode:
   - **Watch** — the teacher plays the whole song; keys light up
   - **Play Along** — the teacher demos each phrase, then waits for you to play it back; wrong notes restart the phrase; after all phrases, a full-run plays with scoring
   - **You Try** — same as Play Along but without the audio demo (highlights only)
3. Adjust BPM, speed, transpose, and loop range to taste
4. Hit **Play**

### Song List

**Easy:** Sargam Scale, Do-Re-Mi, Hot Cross Buns, Mary Had a Little Lamb, Twinkle Twinkle, Row Row Row Your Boat, Happy Birthday, Frere Jacques, You Are My Sunshine, Count on Me, Om Jai Jagadish Hare, Raghupati Raghav

**Medium:** Her (JVKE), Someone Like You (Adele), Fix You (Coldplay), The Scientist (Coldplay), Let Her Go (Passenger), We Don't Talk Anymore (Charlie Puth), Jana Gana Mana, Sare Jahan Se Achha, Vande Mataram

## Project Structure

```
web-harmonium/
├── index.html              # HTML shell
├── src/
│   ├── main.ts             # App entry — UI, events, keyboard input
│   ├── state.ts            # Centralized reactive state
│   ├── keymap.ts           # 42-key layout, MIDI math, Sargam labels
│   ├── styles.css          # All styles (wood frame, keys, sidebar)
│   ├── audio/
│   │   ├── context.ts      # AudioContext singleton
│   │   ├── engine.ts       # Master bus, reverb routing, drone
│   │   ├── voice.ts        # Sample-based note-on/off with reed layers
│   │   ├── reverb.ts       # Algorithmic reverb fallback (convolver)
│   │   ├── samples.ts      # WAV loader for harmonium + IR
│   │   └── metronome.ts    # Click track
│   └── tutorial/
│       ├── types.ts        # Song, SongEvent, callback interfaces
│       ├── player.ts       # Playback engine + mentor state machine
│       └── segments.ts     # Phrase segmentation for mentor flow
├── public/
│   ├── favicon.svg
│   ├── icons.svg           # SVG sprite
│   ├── harmonium/
│   │   ├── harmonium-kannan-orig.wav   # Source sample (~1.9 MB)
│   │   ├── reverb.wav                  # Impulse response (~1 MB)
│   │   └── LICENSE                     # MIT — Rajaraman Iyer
│   └── songs/
│       ├── index.json      # Song manifest
│       └── *.json          # Individual lesson files
├── package.json
├── tsconfig.json
├── LICENSE                 # MIT
└── README.md
```

## Tech Stack

- **TypeScript** (strict mode) — zero runtime dependencies
- **Vite 8** — dev server + production bundler
- **Web Audio API** — `AudioBufferSourceNode` with detune for pitch, `ConvolverNode` for reverb, `OscillatorNode` for drone and metronome

## Audio Credits

Harmonium sample (`harmonium-kannan-orig.wav`) and impulse response (`reverb.wav`) by **Rajaraman Iyer**, used under the MIT License. Original project: [rajaramaniyer.github.io](https://rajaramaniyer.github.io).

## License

This project is licensed under the [MIT License](LICENSE).

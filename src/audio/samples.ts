import { getAudioContext } from './context.js'
import { setHarmoniumBuffer } from './voice.js'

let reverbBuffer: AudioBuffer | null = null
let loadPromise: Promise<void> | null = null

export function getReverbBuffer(): AudioBuffer | null {
  return reverbBuffer
}

export function isSamplePackLoaded(): boolean {
  return reverbBuffer != null
}

/**
 * Loads harmonium + IR from `public/harmonium/` (bundled WAVs; MIT — see
 * `public/harmonium/LICENSE`, originally from rajaramaniyer.github.io).
 */
export function loadHarmoniumSamplePack(): Promise<void> {
  if (reverbBuffer != null) return Promise.resolve()
  if (loadPromise) return loadPromise

  const task = (async () => {
    const ctx = getAudioContext()
    const [harmBuf, revBuf] = await Promise.all([
      fetchDecode(ctx, '/harmonium/harmonium-kannan-orig.wav'),
      fetchDecode(ctx, '/harmonium/reverb.wav'),
    ])
    setHarmoniumBuffer(harmBuf)
    reverbBuffer = revBuf
  })()

  loadPromise = task.finally(() => {
    loadPromise = null
  })

  return loadPromise
}

async function fetchDecode(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const raw = await res.arrayBuffer()
  return await ctx.decodeAudioData(raw.slice(0))
}

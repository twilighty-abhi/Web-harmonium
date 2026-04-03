let ctx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
  }
  return ctx
}

export async function resumeAudio(): Promise<AudioContext> {
  const c = getAudioContext()
  if (c.state === 'suspended') await c.resume()
  return c
}

export function now(): number {
  return getAudioContext().currentTime
}

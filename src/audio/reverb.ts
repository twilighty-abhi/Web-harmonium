export function createReverb(
  context: AudioContext,
  duration = 2.4,
  decay = 2.5,
): ConvolverNode {
  const rate = context.sampleRate
  const length = Math.floor(rate * duration)
  const impulse = context.createBuffer(2, length, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }
  const conv = context.createConvolver()
  conv.buffer = impulse
  return conv
}

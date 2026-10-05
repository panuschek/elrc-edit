/** Waveform data: min/max per bucket of BUCKET samples, mixed down to mono. */
export interface Peaks {
  min: Float32Array
  max: Float32Array
  bucketsPerSecond: number
}

const BUCKET = 64

export interface DecodedAudio {
  duration: number // ms
  peaks: Peaks
}

export async function decodeAudio(file: File): Promise<DecodedAudio> {
  const data = await file.arrayBuffer()
  const ctx = new OfflineAudioContext(1, 1, 44100)
  const buffer = await ctx.decodeAudioData(data)
  return { duration: Math.round(buffer.duration * 1000), peaks: computePeaks(buffer) }
}

function computePeaks(buffer: AudioBuffer): Peaks {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  const count = Math.ceil(buffer.length / BUCKET)
  const min = new Float32Array(count)
  const max = new Float32Array(count)
  for (let b = 0; b < count; b++) {
    let lo = 0
    let hi = 0
    const end = Math.min(buffer.length, (b + 1) * BUCKET)
    for (let s = b * BUCKET; s < end; s++) {
      let v = 0
      for (const ch of channels) v += ch[s]
      v /= channels.length
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    min[b] = lo
    max[b] = hi
  }
  return { min, max, bucketsPerSecond: buffer.sampleRate / BUCKET }
}

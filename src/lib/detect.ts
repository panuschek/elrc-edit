import { decodeAudio, type DecodedAudio } from './audio'
import { looksLikeLrc, parseLrc } from './lrc'
import type { LyricsDoc } from './model'

export type Detected =
  | { kind: 'audio'; file: File; audio: DecodedAudio }
  | { kind: 'lyrics'; file: File; doc: LyricsDoc }
  | { kind: 'unknown'; file: File }

const MAX_LYRICS_SIZE = 2 * 1024 * 1024

/** Figures out what a file is from its contents, not its name. */
export async function detectFile(file: File): Promise<Detected> {
  if (file.size <= MAX_LYRICS_SIZE && !file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
    const text = await file.text().catch(() => '')
    if (looksLikeLrc(text)) return { kind: 'lyrics', file, doc: parseLrc(text) }
  }
  try {
    return { kind: 'audio', file, audio: await decodeAudio(file) }
  } catch {
    return { kind: 'unknown', file }
  }
}

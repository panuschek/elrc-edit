import type { LyricsDoc } from './model'

/** Saved work, keyed by the song file so it comes back when the same song is opened again. */
export interface SavedWork {
  doc: LyricsDoc
  lyricsName: string
  savedAt: number
}

export function songKey(file: File): string {
  return `elrc-edit:${file.name}:${file.size}`
}

export function loadWork(key: string): SavedWork | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as SavedWork) : null
  } catch {
    return null
  }
}

export function saveWork(key: string, work: SavedWork): void {
  try {
    localStorage.setItem(key, JSON.stringify(work))
  } catch {
    // Storage full or blocked: editing still works, it just won't be restored later.
  }
}

export function clearWork(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

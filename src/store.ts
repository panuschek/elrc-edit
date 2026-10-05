import { create } from 'zustand'
import type { Peaks } from './lib/audio'
import type { LyricsDoc } from './lib/model'

export interface Session {
  songFile: File
  songUrl: string
  /** Name without extension, used for the exported file. */
  songName: string
  duration: number
  peaks: Peaks
  storageKey: string
  lyricsName: string
}

/** Which popover is open in the line list. */
export type Editing = { lineId: string; wordId: string } | { lineId: string; wordId: null } | null

const HISTORY_LIMIT = 300

interface EditorState {
  session: Session | null
  doc: LyricsDoc
  past: LyricsDoc[]
  future: LyricsDoc[]
  /** Doc before the current drag / popover started; the whole gesture is one undo step. */
  gestureBase: LyricsDoc | null

  selectedLineId: string | null
  selectedWordId: string | null
  editing: Editing
  /** Bumped to ask the timeline to scroll to a time. */
  scrollRequest: { time: number; n: number } | null
  pxPerSec: number

  open: (session: Session, doc: LyricsDoc) => void
  close: () => void
  commit: (doc: LyricsDoc) => void
  beginGesture: () => void
  updateGesture: (doc: LyricsDoc) => void
  endGesture: () => void
  undo: () => void
  redo: () => void
  select: (lineId: string | null, wordId?: string | null, scroll?: boolean) => void
  setEditing: (editing: Editing) => void
  setZoom: (pxPerSec: number) => void
}

export const MIN_ZOOM = 5
export const MAX_ZOOM = 600

export const useEditor = create<EditorState>((set, get) => ({
  session: null,
  doc: { lines: [], trailer: [] },
  past: [],
  future: [],
  gestureBase: null,
  selectedLineId: null,
  selectedWordId: null,
  editing: null,
  scrollRequest: null,
  pxPerSec: 100,

  open: (session, doc) =>
    set({
      session, doc, past: [], future: [], gestureBase: null,
      selectedLineId: null, selectedWordId: null, editing: null, scrollRequest: null,
    }),

  close: () => {
    const { session } = get()
    if (session) URL.revokeObjectURL(session.songUrl)
    set({ session: null, doc: { lines: [], trailer: [] }, past: [], future: [], editing: null })
  },

  commit: (doc) => {
    const { doc: current, past, gestureBase } = get()
    if (doc === current) return
    if (gestureBase) {
      set({ doc })
      return
    }
    set({ doc, past: [...past, current].slice(-HISTORY_LIMIT), future: [] })
  },

  beginGesture: () => {
    if (!get().gestureBase) set({ gestureBase: get().doc })
  },

  updateGesture: (doc) => set({ doc }),

  endGesture: () => {
    const { gestureBase, doc, past } = get()
    if (!gestureBase) return
    if (gestureBase === doc) set({ gestureBase: null })
    else set({ gestureBase: null, past: [...past, gestureBase].slice(-HISTORY_LIMIT), future: [] })
  },

  undo: () => {
    const { past, future, doc } = get()
    if (!past.length) return
    set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future], editing: null })
  },

  redo: () => {
    const { past, future, doc } = get()
    if (!future.length) return
    set({ doc: future[0], future: future.slice(1), past: [...past, doc], editing: null })
  },

  select: (lineId, wordId = null, scroll = false) => {
    const line = get().doc.lines.find((l) => l.id === lineId)
    const update: Partial<EditorState> = { selectedLineId: lineId, selectedWordId: wordId }
    if (scroll && line) update.scrollRequest = { time: line.time, n: (get().scrollRequest?.n ?? 0) + 1 }
    set(update)
  },

  setEditing: (editing) => set({ editing }),

  setZoom: (pxPerSec) => set({ pxPerSec: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pxPerSec)) }),
}))

/** Finds a line (and optionally a word) by id, with their indexes. */
export function locate(doc: LyricsDoc, lineId: string | null, wordId?: string | null) {
  const i = doc.lines.findIndex((l) => l.id === lineId)
  if (i < 0) return null
  const k = wordId ? doc.lines[i].words.findIndex((w) => w.id === wordId) : -1
  return { i, k, line: doc.lines[i], word: k >= 0 ? doc.lines[i].words[k] : null }
}

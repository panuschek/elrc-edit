import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { LyricsDoc } from './lib/model'

/** One shared <audio> element for the whole app. Times are in ms. */
const audio = new Audio()
audio.preload = 'auto'
audio.preservesPitch = true

interface PlayerState {
  playing: boolean
  rate: number
  setRate: (rate: number) => void
}

export const usePlayer = create<PlayerState>((set) => ({
  playing: false,
  rate: 1,
  setRate: (rate) => {
    audio.playbackRate = rate
    set({ rate })
  },
}))

audio.addEventListener('play', () => usePlayer.setState({ playing: true }))
audio.addEventListener('pause', () => usePlayer.setState({ playing: false }))
audio.addEventListener('ended', () => usePlayer.setState({ playing: false }))

export const player = {
  load(url: string) {
    audio.pause()
    audio.src = url
    audio.playbackRate = usePlayer.getState().rate
  },
  unload() {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  },
  time(): number {
    return audio.currentTime * 1000
  },
  seek(ms: number) {
    audio.currentTime = Math.max(0, ms / 1000)
  },
  play() {
    void audio.play().catch(() => {})
  },
  pause() {
    audio.pause()
  },
  toggle() {
    if (audio.paused) this.play()
    else this.pause()
  },
  playFrom(ms: number) {
    this.seek(ms)
    this.play()
  },
}

/** Index of the line and word being sung at `t` (word -1 = before the first word / pause). */
export function positionAt(doc: LyricsDoc, t: number): { line: number; word: number } {
  let line = -1
  for (let i = 0; i < doc.lines.length; i++) {
    if (doc.lines[i].time <= t) line = i
    else break
  }
  if (line < 0) return { line: -1, word: -1 }
  let word = -1
  const words = doc.lines[line].words
  for (let k = 0; k < words.length; k++) {
    if (words[k].time <= t) word = k
    else break
  }
  return { line, word }
}

/** Calls `fn` on every animation frame while mounted. */
export function useAnimationFrame(fn: () => void) {
  useEffect(() => {
    let id = 0
    const loop = () => {
      fn()
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [fn])
}

/** The line/word ids being sung right now; only re-renders when they change. */
export function usePlaybackPosition(doc: LyricsDoc) {
  const [pos, setPos] = useState<{ lineId: string | null; wordId: string | null }>({ lineId: null, wordId: null })
  useEffect(() => {
    let id = 0
    const loop = () => {
      const p = positionAt(doc, player.time())
      const lineId = p.line >= 0 ? doc.lines[p.line].id : null
      const wordId = p.line >= 0 && p.word >= 0 ? doc.lines[p.line].words[p.word].id : null
      setPos((prev) => (prev.lineId === lineId && prev.wordId === wordId ? prev : { lineId, wordId }))
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [doc])
  return pos
}

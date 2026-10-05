import { useCallback, useEffect, useRef, useState } from 'react'
import { findOverlaps, setLineStart, setWordTime } from '../lib/edits'
import { serializeLrc } from '../lib/lrc'
import { saveWork } from '../lib/storage'
import { formatDuration, formatTag } from '../lib/time'
import { player, useAnimationFrame, usePlaybackPosition, usePlayer } from '../player'
import { locate, MAX_ZOOM, MIN_ZOOM, useEditor } from '../store'
import styles from './Editor.module.css'
import { LineList } from './LineList'
import { Timeline } from './Timeline'

const SPEEDS = [0.5, 0.75, 1]

export function Editor() {
  const session = useEditor((s) => s.session)!
  const doc = useEditor((s) => s.doc)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const pxPerSec = useEditor((s) => s.pxPerSec)
  const { playing, rate, setRate } = usePlayer()
  const position = usePlaybackPosition(doc)
  const timeRef = useRef<HTMLSpanElement>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const overlaps = findOverlaps(doc)

  useEffect(() => {
    player.load(session.songUrl)
    return () => player.unload()
  }, [session.songUrl])

  // Autosave in this browser.
  useEffect(() => {
    const id = setTimeout(() => {
      saveWork(session.storageKey, { doc, lyricsName: session.lyricsName, savedAt: Date.now() })
      setSavedAt(Date.now())
    }, 400)
    return () => clearTimeout(id)
  }, [doc, session])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 8000)
    return () => clearTimeout(id)
  }, [toast])

  useAnimationFrame(
    useCallback(() => {
      if (timeRef.current) timeRef.current.textContent = formatTag(player.time())
    }, []),
  )

  useKeyboardShortcuts()

  function save() {
    const blob = new Blob([serializeLrc(useEditor.getState().doc)], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    const name = `${session.songName}.lrc`
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    setToast(`Saved "${name}" to your Downloads folder. Send this file back to whoever gave you the song.`)
  }

  function showOverlap() {
    const line = doc.lines[overlaps[0].index]
    useEditor.getState().select(line.id, null, true)
    player.seek(line.time)
  }

  // Zoom slider works on a log scale so it feels even.
  const zoomToSlider = (z: number) => Math.log(z / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)
  const sliderToZoom = (v: number) => MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, v)

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <button
          type="button"
          className={styles.back}
          onClick={() => useEditor.getState().close()}
          title="Go back to choose a different song. Your work on this song stays saved in this browser."
        >
          ← Other song
        </button>
        <div className={styles.songName} title={session.songFile.name}>
          🎵 {session.songName}
        </div>

        <div className={styles.group}>
          <button type="button" className={styles.play} onClick={() => player.toggle()} title="Play / pause (Space)">
            {playing ? '⏸' : '▶'}
          </button>
          <span className={styles.time}>
            <span ref={timeRef}>00:00.00</span> / {formatDuration(session.duration)}
          </span>
        </div>

        <div className={styles.group} title="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.seg} ${rate === s ? styles.segOn : ''}`}
              onClick={() => setRate(s)}
            >
              {s}×
            </button>
          ))}
        </div>

        <div className={styles.group}>
          <button type="button" className={styles.icon} disabled={!canUndo} onClick={() => useEditor.getState().undo()} title="Undo (Ctrl+Z)">
            ↶ Undo
          </button>
          <button type="button" className={styles.icon} disabled={!canRedo} onClick={() => useEditor.getState().redo()} title="Redo (Ctrl+Shift+Z)">
            ↷ Redo
          </button>
        </div>

        <div className={styles.group} title="Zoom the waveform (or Ctrl + mouse wheel on it)">
          🔍
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={zoomToSlider(pxPerSec)}
            onChange={(e) => useEditor.getState().setZoom(sliderToZoom(Number(e.target.value)))}
            className={styles.zoom}
          />
        </div>

        <div className={styles.saveBox}>
          <button
            type="button"
            className={styles.save}
            disabled={overlaps.length > 0}
            onClick={save}
            title={overlaps.length ? 'Fix the overlapping lines first.' : 'Download the fixed lyrics file'}
          >
            💾 Save fixed lyrics
          </button>
          {savedAt && <span className={styles.autosaved}>Your progress is kept in this browser</span>}
        </div>
      </header>

      <div className={styles.hints}>
        <b>Space</b> play/pause · <b>Click</b> a word to jump there · <b>Double-click</b> a word to edit it ·{' '}
        <b>Drag</b> the bars under the waveform to fix timing (<b>⠿</b> moves a whole line) · <b>←/→</b> nudge the
        selected word · <b>Ctrl+Z</b> undo
      </div>

      {overlaps.length > 0 && (
        <div className={styles.banner}>
          ⚠{' '}
          {overlaps.length === 1
            ? `Lines ${overlaps[0].index} and ${overlaps[0].index + 1} overlap.`
            : `${overlaps.length} places where lines overlap (first: lines ${overlaps[0].index} and ${overlaps[0].index + 1}).`}{' '}
          Drag them apart under the waveform, or delete one. Saving is turned off until this is fixed.
          <button type="button" className={styles.bannerButton} onClick={showOverlap}>
            Show me
          </button>
        </div>
      )}

      <Timeline playingLineId={position.lineId} playingWordId={position.wordId} />

      <main className={styles.main}>
        <LineList playingLineId={position.lineId} playingWordId={position.wordId} />
      </main>

      {toast && (
        <div className={styles.toast} onClick={() => setToast(null)}>
          ✅ {toast}
        </div>
      )}
    </div>
  )
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const state = useEditor.getState()
      const mod = e.ctrlKey || e.metaKey
      const { doc, selectedLineId, selectedWordId, session } = state
      const pos = locate(doc, selectedLineId, selectedWordId)

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) state.redo()
        else state.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        state.redo()
      } else if (e.key === ' ') {
        e.preventDefault()
        player.toggle()
      } else if (e.key === 'Escape') {
        if (state.editing) state.setEditing(null)
        else state.select(null)
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && pos && session) {
        e.preventDefault()
        const step = (e.shiftKey ? 50 : 10) * (e.key === 'ArrowLeft' ? -1 : 1)
        if (pos.word) state.commit(setWordTime(doc, pos.i, pos.k, pos.word.time + step, session.duration).doc)
        else state.commit(setLineStart(doc, pos.i, pos.line.time + step, session.duration).doc)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const current = pos ? pos.i : -1
        const next = Math.min(doc.lines.length - 1, Math.max(0, current + (e.key === 'ArrowUp' ? -1 : 1)))
        const line = doc.lines[next]
        if (line) {
          state.select(line.id, null, true)
          player.seek(line.time)
        }
      } else if (e.key === 'Enter' && pos?.word) {
        e.preventDefault()
        state.setEditing({ lineId: pos.line.id, wordId: pos.word.id })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

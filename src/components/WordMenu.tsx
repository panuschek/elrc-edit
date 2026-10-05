import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  deleteWord, describeRange, insertWordAfter, insertWordBefore, lineStartBounds, setLineStart, setWordText,
  setWordTime, wordBounds,
} from '../lib/edits'
import type { LyricsDoc } from '../lib/model'
import { formatTag, parseUserTime } from '../lib/time'
import { player } from '../player'
import { locate, useEditor } from '../store'
import styles from './LineList.module.css'

/** Closes the popover when clicking outside it, and ends the undo gesture when it closes. */
function usePopover(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    useEditor.getState().beginGesture()
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) useEditor.getState().setEditing(null)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      closeRef.current()
      useEditor.getState().endGesture()
    }
  }, [])
  // Open towards the left if there's no room on the right.
  useLayoutEffect(() => {
    const el = ref.current
    if (el && el.getBoundingClientRect().right > window.innerWidth - 8) {
      el.style.left = 'auto'
      el.style.right = '0'
    }
  }, [])
  return ref
}

function TimeField({
  value, bounds, onChange,
}: {
  value: number
  bounds: [number, number]
  onChange: (ms: number) => void
}) {
  // Remounted (via key) whenever the value changes, so the text always starts from the current time.
  const [text, setText] = useState(formatTag(value))
  const [error, setError] = useState<string | null>(null)

  function apply() {
    const ms = parseUserTime(text)
    if (ms === null) {
      setError('Please type a time like 01:04.82')
      return
    }
    if (ms < bounds[0] || ms > bounds[1]) {
      setError(`Must be ${describeRange(bounds)}`)
      return
    }
    setError(null)
    onChange(ms)
  }

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>Start</span>
      <button type="button" className={styles.nudge} onClick={() => onChange(Math.max(bounds[0], value - 10))} title="10 ms earlier">
        −
      </button>
      <input
        className={styles.timeInput}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply()
        }}
      />
      <button type="button" className={styles.nudge} onClick={() => onChange(Math.min(bounds[1], value + 10))} title="10 ms later">
        +
      </button>
      <button type="button" className={styles.smallButton} onClick={() => player.playFrom(value)} title="Play from here">
        ▶
      </button>
      {error && <div className={styles.fieldError}>{error}</div>}
    </div>
  )
}

export function WordMenu({ lineId, wordId }: { lineId: string; wordId: string }) {
  const doc = useEditor((s) => s.doc)
  const duration = useEditor((s) => s.session!.duration)

  // When closing, a word left without text is removed (e.g. "insert word" then changed your mind).
  const ref = usePopover(() => {
    const state = useEditor.getState()
    const pos = locate(state.doc, lineId, wordId)
    if (pos?.word && !pos.word.text.trim()) state.updateGesture(deleteWord(state.doc, pos.i, pos.k))
  })

  const pos = locate(doc, lineId, wordId)
  if (!pos?.word) return null
  const { i, k, word, line } = pos
  const update = (d: LyricsDoc | null) => d && useEditor.getState().updateGesture(d)
  const close = () => useEditor.getState().setEditing(null)

  function insert(d: LyricsDoc | null, at: number) {
    if (!d) return
    update(d)
    const newWord = d.lines[i].words[at]
    useEditor.getState().select(lineId, newWord.id)
    useEditor.getState().setEditing({ lineId, wordId: newWord.id })
  }

  const canAfter = insertWordAfter(doc, i, k, duration) !== null
  const canBefore = k === 0 && insertWordBefore(doc, i, duration) !== null

  return (
    <div ref={ref} className={styles.popover} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Word</span>
        <input
          autoFocus
          className={styles.textInput}
          value={word.text}
          placeholder="type the word"
          onChange={(e) => update(setWordText(doc, i, k, e.target.value.replace(/\s+/g, ' ')))}
          onKeyDown={(e) => e.key === 'Enter' && close()}
        />
      </div>
      <TimeField
        key={word.time}
        value={word.time}
        bounds={wordBounds(doc, i, k, duration)}
        onChange={(ms) => update(setWordTime(doc, i, k, ms, duration).doc)}
      />
      <div className={styles.menuButtons}>
        {k === 0 && (
          <button type="button" className={styles.menuButton} disabled={!canBefore} onClick={() => insert(insertWordBefore(doc, i, duration), 0)}>
            ＋ Insert word before
          </button>
        )}
        <button
          type="button"
          className={styles.menuButton}
          disabled={!canAfter}
          title={canAfter ? undefined : 'This word is too short to fit another word after it.'}
          onClick={() => insert(insertWordAfter(doc, i, k, duration), k + 1)}
        >
          ＋ Insert word after
        </button>
        <button
          type="button"
          className={`${styles.menuButton} ${styles.danger}`}
          onClick={() => {
            update(deleteWord(doc, i, k))
            close()
          }}
        >
          🗑 Delete word
        </button>
        <button type="button" className={`${styles.menuButton} ${styles.done}`} onClick={close}>
          Done
        </button>
      </div>
      {line.words.length === 1 && <div className={styles.menuHint}>Deleting the only word turns this line into a pause.</div>}
    </div>
  )
}

export function LineStartMenu({ lineId }: { lineId: string }) {
  const doc = useEditor((s) => s.doc)
  const duration = useEditor((s) => s.session!.duration)
  const ref = usePopover(() => {})
  const pos = locate(doc, lineId)
  if (!pos) return null
  const close = () => useEditor.getState().setEditing(null)
  return (
    <div ref={ref} className={styles.popover} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className={styles.menuTitle}>When should this line appear?</div>
      <TimeField
        key={pos.line.time}
        value={pos.line.time}
        bounds={lineStartBounds(doc, pos.i, duration)}
        onChange={(ms) => useEditor.getState().updateGesture(setLineStart(doc, pos.i, ms, duration).doc)}
      />
      <div className={styles.menuHint}>It can appear before the first word is sung, but not after.</div>
      <div className={styles.menuButtons}>
        <button type="button" className={`${styles.menuButton} ${styles.done}`} onClick={close}>
          Done
        </button>
      </div>
    </div>
  )
}

import { memo, useEffect, useRef } from 'react'
import {
  addFirstWord, canInsertLineAfter, canInsertLineBefore, deleteLine, findOverlaps, insertLineAfter, insertLineBefore,
  lineWarnings,
} from '../lib/edits'
import type { Line, LyricsDoc } from '../lib/model'
import { formatTag } from '../lib/time'
import { player, usePlayer } from '../player'
import { useEditor, type Editing } from '../store'
import styles from './LineList.module.css'
import { LineStartMenu, WordMenu } from './WordMenu'

interface Props {
  playingLineId: string | null
  playingWordId: string | null
}

export function LineList({ playingLineId, playingWordId }: Props) {
  const doc = useEditor((s) => s.doc)
  const duration = useEditor((s) => s.session!.duration)
  const selectedLineId = useEditor((s) => s.selectedLineId)
  const selectedWordId = useEditor((s) => s.selectedWordId)
  const editing = useEditor((s) => s.editing)
  const playing = usePlayer((s) => s.playing)
  const listRef = useRef<HTMLDivElement>(null)

  const overlapping = new Set<number>()
  for (const o of findOverlaps(doc)) {
    overlapping.add(o.index)
    overlapping.add(o.index - 1)
  }

  // Follow playback.
  useEffect(() => {
    if (!playing || !playingLineId) return
    listRef.current?.querySelector(`[data-line="${playingLineId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [playingLineId, playing])

  // Show the selected line (e.g. after clicking it under the waveform).
  useEffect(() => {
    if (!selectedLineId) return
    const block = editing ? 'center' : 'nearest'
    listRef.current?.querySelector(`[data-line="${selectedLineId}"]`)?.scrollIntoView({ block, behavior: 'smooth' })
  }, [selectedLineId, selectedWordId, editing])

  if (doc.lines.length === 0) {
    return (
      <div className={styles.empty}>
        <p>There are no lines yet.</p>
        <button type="button" className={styles.bigAdd} onClick={() => commitAndSelect(insertLineBefore(doc), 0)}>
          ＋ Add first line
        </button>
      </div>
    )
  }

  return (
    <div ref={listRef} className={styles.list}>
      {doc.lines.map((line, i) => (
        <LineCard
          key={line.id}
          line={line}
          index={i}
          canInsertBelow={canInsertLineAfter(doc, i, duration)}
          canInsertAbove={i === 0 && canInsertLineBefore(doc)}
          warnings={lineWarnings(doc, i, duration).join('\n')}
          overlap={overlapping.has(i)}
          selected={line.id === selectedLineId}
          selectedWordId={line.id === selectedLineId ? selectedWordId : null}
          playing={line.id === playingLineId}
          playingWordId={line.id === playingLineId ? playingWordId : null}
          editing={editing && editing.lineId === line.id ? editing : null}
        />
      ))}
    </div>
  )
}

/** Commits a line insertion and selects the new line. */
function commitAndSelect(next: LyricsDoc | null, index: number) {
  if (!next) return
  const state = useEditor.getState()
  state.commit(next)
  state.select(next.lines[index].id, null, true)
  player.seek(next.lines[index].time)
}

interface CardProps {
  line: Line
  index: number
  canInsertBelow: boolean
  canInsertAbove: boolean
  warnings: string
  overlap: boolean
  selected: boolean
  selectedWordId: string | null
  playing: boolean
  playingWordId: string | null
  editing: Editing
}

const LineCard = memo(function LineCard({
  line, index, canInsertBelow, canInsertAbove, warnings, overlap, selected, selectedWordId, playing, playingWordId,
  editing,
}: CardProps) {
  const duration = useEditor.getState().session!.duration
  const i = index
  const s = () => useEditor.getState()

  const cls = [styles.card, selected && styles.selected, playing && styles.playing, overlap && styles.overlap]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={cls}
      data-line={line.id}
      onClick={() => {
        s().select(line.id, null, true)
        player.seek(line.time)
      }}
    >
      <div className={styles.header}>
        <span className={styles.lineNumber}>{i + 1}</span>
        <span className={styles.popoverAnchor}>
          <button
            type="button"
            className={styles.lineTime}
            title="Double-click to change when this line appears"
            onClick={(e) => {
              e.stopPropagation()
              s().select(line.id, null, true)
              player.seek(line.time)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              s().setEditing({ lineId: line.id, wordId: null })
            }}
          >
            {formatTag(line.time)}
          </button>
          {editing && editing.wordId === null && <LineStartMenu lineId={line.id} />}
        </span>
        {overlap && <span className={styles.overlapBadge}>overlaps another line</span>}
        {warnings && (
          <span className={styles.warning} title={warnings}>
            ⚠ check timing
          </span>
        )}
        <span className={styles.tools} onClick={(e) => e.stopPropagation()}>
          <button type="button" className={styles.tool} onClick={() => player.playFrom(line.time)} title="Play this line">
            ▶ Play
          </button>
          {i === 0 && (
            <button
              type="button"
              className={styles.tool}
              disabled={!canInsertAbove}
              title={canInsertAbove ? 'Insert an empty line above this one' : 'Not enough room before this line.'}
              onClick={() => commitAndSelect(insertLineBefore(s().doc), 0)}
            >
              ＋ Line above
            </button>
          )}
          <button
            type="button"
            className={styles.tool}
            disabled={!canInsertBelow}
            title={
              canInsertBelow
                ? 'Insert an empty line below this one'
                : 'Not enough room. Shorten this line or move the next one first.'
            }
            onClick={() => commitAndSelect(insertLineAfter(s().doc, i, duration), i + 1)}
          >
            ＋ Line below
          </button>
          <button
            type="button"
            className={`${styles.tool} ${styles.danger}`}
            title="Delete this line"
            onClick={() => s().commit(deleteLine(s().doc, i))}
          >
            🗑
          </button>
        </span>
      </div>

      <div className={styles.words}>
        {line.words.length === 0 && (
          <>
            <button
              type="button"
              className={styles.pauseChip}
              onDoubleClick={(e) => {
                e.stopPropagation()
                addWord(line, i)
              }}
            >
              (pause)
            </button>
            <button
              type="button"
              className={styles.addFirst}
              onClick={(e) => {
                e.stopPropagation()
                addWord(line, i)
              }}
            >
              ＋ Add first word
            </button>
          </>
        )}
        {line.words.map((w) => {
          const wcls = [
            styles.chip,
            w.id === selectedWordId && styles.chipSelected,
            w.id === playingWordId && styles.chipPlaying,
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <span key={w.id} className={styles.popoverAnchor}>
              <button
                type="button"
                className={wcls}
                title="Click to jump here · double-click to edit"
                onClick={(e) => {
                  e.stopPropagation()
                  s().select(line.id, w.id, true)
                  player.seek(w.time)
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  s().select(line.id, w.id)
                  s().setEditing({ lineId: line.id, wordId: w.id })
                }}
              >
                <span className={styles.chipTime}>{formatTag(w.time)}</span>
                <span className={w.text ? styles.chipText : styles.chipEmpty}>{w.text || '(empty)'}</span>
              </button>
              {editing && editing.wordId === w.id && <WordMenu lineId={line.id} wordId={w.id} />}
            </span>
          )
        })}
      </div>
    </div>
  )
})

function addWord(line: Line, i: number) {
  const state = useEditor.getState()
  state.beginGesture()
  const next = addFirstWord(state.doc, i)
  state.updateGesture(next)
  const word = next.lines[i].words[0]
  state.select(line.id, word.id)
  state.setEditing({ lineId: line.id, wordId: word.id })
}

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { moveLine, setLineStart, setWordTime, type TimingResult } from '../lib/edits'
import { lastAnchor, type Line, type LyricsDoc } from '../lib/model'
import { formatTag } from '../lib/time'
import { player, useAnimationFrame, usePlayer } from '../player'
import { useEditor } from '../store'
import styles from './Timeline.module.css'

const WAVE_HEIGHT = 120
const RULER_HEIGHT = 18
const ROW_HEIGHT = 56

interface Props {
  playingLineId: string | null
  playingWordId: string | null
}

interface DragLabel {
  x: number
  y: number
  text: string
  limited: boolean
}

/** A drag operation: given the doc at drag start and the mouse offset in ms, returns the new doc. */
type DragOp = (base: LyricsDoc, deltaMs: number) => (TimingResult & { time: number }) | null

export function Timeline({ playingLineId, playingWordId }: Props) {
  const session = useEditor((s) => s.session)!
  const doc = useEditor((s) => s.doc)
  const pxPerSec = useEditor((s) => s.pxPerSec)
  const selectedLineId = useEditor((s) => s.selectedLineId)
  const selectedWordId = useEditor((s) => s.selectedWordId)
  const scrollRequest = useEditor((s) => s.scrollRequest)
  const playing = usePlayer((s) => s.playing)

  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const [viewWidth, setViewWidth] = useState(1000)
  const [dragLabel, setDragLabel] = useState<DragLabel | null>(null)
  const dragging = useRef(false)
  const zoomAnchor = useRef<{ time: number; offset: number } | null>(null)
  const prevPps = useRef(pxPerSec)

  const { duration, peaks } = session
  const pps = pxPerSec
  const totalWidth = Math.ceil((duration / 1000) * pps)

  // --- waveform drawing (only the visible part) ------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const scroller = scrollRef.current
    if (!canvas || !scroller) return
    const dpr = window.devicePixelRatio || 1
    const w = scroller.clientWidth
    const h = WAVE_HEIGHT
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const css = getComputedStyle(scroller)
    const waveColor = css.getPropertyValue('--wave').trim()
    const rulerColor = css.getPropertyValue('--muted').trim()
    ctx.clearRect(0, 0, w, h)

    const left = scroller.scrollLeft
    const waveTop = RULER_HEIGHT
    const mid = waveTop + (h - waveTop) / 2
    const amp = (h - waveTop) / 2 - 2
    const bps = peaks.bucketsPerSecond
    ctx.fillStyle = waveColor
    for (let x = 0; x < w; x++) {
      const t0 = (left + x) / pps
      const t1 = (left + x + 1) / pps
      const b0 = Math.floor(t0 * bps)
      const b1 = Math.max(b0 + 1, Math.floor(t1 * bps))
      if (b0 >= peaks.min.length) break
      let lo = 0
      let hi = 0
      for (let b = b0; b < b1 && b < peaks.min.length; b++) {
        if (peaks.min[b] < lo) lo = peaks.min[b]
        if (peaks.max[b] > hi) hi = peaks.max[b]
      }
      const y0 = mid - hi * amp
      const y1 = mid - lo * amp
      ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0))
    }

    // Ruler: pick a tick spacing that leaves ~80px between labels.
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60]
    const step = steps.find((s) => s * pps >= 80) ?? 60
    ctx.fillStyle = rulerColor
    ctx.strokeStyle = rulerColor
    ctx.font = '11px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    const firstTick = Math.floor(left / pps / step) * step
    for (let t = firstTick; t * pps < left + w; t += step) {
      const x = Math.round(t * pps - left) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 12)
      ctx.lineTo(x, RULER_HEIGHT)
      ctx.stroke()
      ctx.fillText(formatTag(t * 1000).replace(/\.00$/, ''), x + 3, 1)
    }
  }, [peaks, pps])

  useLayoutEffect(() => {
    const scroller = scrollRef.current!
    const onResize = () => {
      setViewWidth(scroller.clientWidth)
      draw()
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(scroller)
    return () => ro.disconnect()
  }, [draw])

  // Keep the time under the mouse (wheel) or the view centre (slider) in place when zooming.
  useLayoutEffect(() => {
    const scroller = scrollRef.current!
    if (prevPps.current !== pps) {
      const anchor = zoomAnchor.current ?? {
        time: (scroller.scrollLeft + scroller.clientWidth / 2) / prevPps.current,
        offset: scroller.clientWidth / 2,
      }
      scroller.scrollLeft = anchor.time * pps - anchor.offset
      zoomAnchor.current = null
      prevPps.current = pps
    }
    draw()
  }, [pps, draw])

  // Scroll to a line when it's selected from the list.
  useEffect(() => {
    if (!scrollRequest) return
    const scroller = scrollRef.current!
    const left = (scrollRequest.time / 1000) * useEditor.getState().pxPerSec - scroller.clientWidth * 0.15
    scroller.scrollTo({ left, behavior: 'smooth' })
  }, [scrollRequest])

  // Wheel: Ctrl/⌘ zooms around the mouse, otherwise scroll sideways.
  useEffect(() => {
    const scroller = scrollRef.current!
    const onWheel = (e: WheelEvent) => {
      const state = useEditor.getState()
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const rect = scroller.getBoundingClientRect()
        const offset = e.clientX - rect.left
        zoomAnchor.current = { time: (scroller.scrollLeft + offset) / state.pxPerSec, offset }
        state.setZoom(state.pxPerSec * Math.exp(-e.deltaY * 0.002))
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        scroller.scrollLeft += e.deltaY
      }
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [])

  // Playhead position + following the playhead while playing.
  useAnimationFrame(
    useCallback(() => {
      const scroller = scrollRef.current
      const head = playheadRef.current
      if (!scroller || !head) return
      const x = (player.time() / 1000) * pps
      head.style.transform = `translateX(${x}px)`
      if (usePlayer.getState().playing && !dragging.current) {
        const w = scroller.clientWidth
        if (x < scroller.scrollLeft || x > scroller.scrollLeft + w * 0.9) scroller.scrollLeft = x - w * 0.1
      }
    }, [pps]),
  )

  // --- dragging ---------------------------------------------------------------------------
  const startDrag = useCallback(
    (e: React.PointerEvent, op: DragOp, onClick?: () => void) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const state = useEditor.getState()
      const base = state.doc
      const startX = e.clientX
      let moved = false
      state.beginGesture()
      dragging.current = true

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX
        if (!moved && Math.abs(dx) < 3) return
        moved = true
        const result = op(base, (dx / useEditor.getState().pxPerSec) * 1000)
        if (!result) return
        useEditor.getState().updateGesture(result.doc)
        setDragLabel({ x: ev.clientX, y: ev.clientY, text: formatTag(result.time), limited: result.limited })
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        dragging.current = false
        useEditor.getState().endGesture()
        setDragLabel(null)
        if (!moved) onClick?.()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [],
  )

  const handlers = useMemo<BarHandlers>(() => {
    const indexOf = (doc: LyricsDoc, lineId: string) => doc.lines.findIndex((l) => l.id === lineId)
    const selectLine = (line: Line) => {
      useEditor.getState().select(line.id)
      player.seek(line.time)
    }
    return {
      onMoveLine: (e, line) =>
        startDrag(
          e,
          (base, delta) => {
            const i = indexOf(base, line.id)
            const r = moveLine(base, i, delta, duration)
            return { ...r, time: r.doc.lines[i].time }
          },
          () => selectLine(line),
        ),
      onLineStart: (e, line) =>
        startDrag(
          e,
          (base, delta) => {
            const i = indexOf(base, line.id)
            const r = setLineStart(base, i, base.lines[i].time + delta, duration)
            return { ...r, time: r.doc.lines[i].time }
          },
          () => selectLine(line),
        ),
      onWordEdge: (e, line, k) => {
        useEditor.getState().select(line.id, line.words[k].id)
        startDrag(e, (base, delta) => {
          const i = indexOf(base, line.id)
          const r = setWordTime(base, i, k, base.lines[i].words[k].time + delta, duration)
          return { ...r, time: r.doc.lines[i].words[k].time }
        })
      },
      onWordClick: (line, k) => {
        useEditor.getState().select(line.id, line.words[k].id)
        player.seek(line.words[k].time)
      },
      onWordDoubleClick: (line, k) => {
        useEditor.getState().select(line.id, line.words[k].id)
        useEditor.getState().setEditing({ lineId: line.id, wordId: line.words[k].id })
      },
    }
  }, [startDrag, duration])

  // --- layout of the bars: overlapping lines (from the imported file) get extra rows -------
  const bars = useMemo(() => {
    const rowEnds: number[] = []
    return doc.lines.map((line, i) => {
      const next = doc.lines[i + 1]
      const anchor = lastAnchor(line)
      let end = next ? next.time : Math.max(duration, anchor + 500)
      if (end < anchor + 50) end = anchor + 500 // overlapping: show the line at a readable length
      let row = rowEnds.findIndex((e) => e <= line.time)
      if (row < 0) row = rowEnds.length
      rowEnds[row] = end
      const overlaps = (i > 0 && line.time < lastAnchor(doc.lines[i - 1])) || (!!next && next.time < anchor)
      return { line, index: i, end, row, overlaps }
    })
  }, [doc, duration])
  const rowCount = Math.max(1, ...bars.map((b) => b.row + 1))

  // Only render bars that are (nearly) visible.
  const [scrollLeft, setScrollLeft] = useState(0)
  const visStart = ((scrollLeft - viewWidth) / pps) * 1000
  const visEnd = ((scrollLeft + 2 * viewWidth) / pps) * 1000

  return (
    <div className={styles.wrap}>
      <div
        ref={scrollRef}
        className={styles.scroller}
        onScroll={(e) => {
          setScrollLeft(e.currentTarget.scrollLeft)
          draw()
        }}
      >
        <div className={styles.inner} style={{ width: totalWidth }}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            onPointerDown={(e) => {
              const rect = e.currentTarget.parentElement!.getBoundingClientRect()
              player.seek(((e.clientX - rect.left) / pps) * 1000)
            }}
          />
          <div className={styles.bars} style={{ height: rowCount * ROW_HEIGHT }}>
            {bars
              .filter((b) => b.end >= visStart && b.line.time <= visEnd)
              .map((b) => (
                <LineBar
                  key={b.line.id}
                  line={b.line}
                  number={b.index + 1}
                  end={b.end}
                  row={b.row}
                  pps={pps}
                  overlaps={b.overlaps}
                  selected={b.line.id === selectedLineId}
                  selectedWordId={b.line.id === selectedLineId ? selectedWordId : null}
                  playingWordId={b.line.id === playingLineId ? playingWordId : null}
                  playing={b.line.id === playingLineId}
                  handlers={handlers}
                />
              ))}
          </div>
          <div ref={playheadRef} className={`${styles.playhead} ${playing ? styles.playheadOn : ''}`} />
        </div>
      </div>
      {dragLabel && (
        <div
          className={`${styles.dragLabel} ${dragLabel.limited ? styles.dragLimited : ''}`}
          style={{ left: dragLabel.x + 12, top: dragLabel.y - 34 }}
        >
          {dragLabel.text}
          {dragLabel.limited && ' · can’t go further'}
        </div>
      )}
    </div>
  )
}

interface BarHandlers {
  onMoveLine: (e: React.PointerEvent, line: Line) => void
  onLineStart: (e: React.PointerEvent, line: Line) => void
  onWordEdge: (e: React.PointerEvent, line: Line, k: number) => void
  onWordClick: (line: Line, k: number) => void
  onWordDoubleClick: (line: Line, k: number) => void
}

interface BarProps {
  line: Line
  number: number
  end: number
  row: number
  pps: number
  overlaps: boolean
  selected: boolean
  selectedWordId: string | null
  playing: boolean
  playingWordId: string | null
  handlers: BarHandlers
}

const LineBar = memo(function LineBar({
  line, number, end, row, pps, overlaps, selected, selectedWordId, playing, playingWordId, handlers,
}: BarProps) {
  const px = (ms: number) => ((ms - line.time) / 1000) * pps
  const width = px(end)
  const words = line.words
  const leadIn = words.length ? px(words[0].time) : 0

  const cls = [styles.bar, selected && styles.barSelected, playing && styles.barPlaying, overlaps && styles.barOverlap]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={cls}
      style={{ left: (line.time / 1000) * pps, width, top: row * ROW_HEIGHT }}
      title={overlaps ? 'This line overlaps another line. Drag it so they no longer overlap, or delete one.' : undefined}
    >
      <div className={styles.strip} onPointerDown={(e) => handlers.onMoveLine(e, line)} title="Drag to move the whole line">
        <span className={styles.grip}>⠿</span>
        <span className={styles.number}>{number}</span>
      </div>
      <div
        className={styles.startHandle}
        onPointerDown={(e) => handlers.onLineStart(e, line)}
        title="Drag to change when the line appears"
      />
      <div className={styles.words}>
        {words.length === 0 && (
          <div className={styles.pause} onPointerDown={(e) => handlers.onMoveLine(e, line)}>
            (pause)
          </div>
        )}
        {leadIn > 0 && (
          <div
            className={styles.leadIn}
            style={{ width: leadIn }}
            onPointerDown={(e) => handlers.onMoveLine(e, line)}
            title="Line is shown before the first word. Drag to move the whole line."
          />
        )}
        {words.map((w, k) => {
          const left = px(w.time)
          const right = k + 1 < words.length ? px(words[k + 1].time) : width
          const wcls = [
            styles.word,
            w.id === selectedWordId && styles.wordSelected,
            w.id === playingWordId && styles.wordPlaying,
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div
              key={w.id}
              className={wcls}
              style={{ left, width: Math.max(0, right - left) }}
              onClick={() => handlers.onWordClick(line, k)}
              onDoubleClick={() => handlers.onWordDoubleClick(line, k)}
              title={`${w.text} · ${formatTag(w.time)}`}
            >
              {w.text}
            </div>
          )
        })}
        {words.map((w, k) => (
          <div
            key={`s-${w.id}`}
            className={`${styles.sep} ${w.id === selectedWordId ? styles.sepSelected : ''}`}
            style={{ left: px(w.time) }}
            onPointerDown={(e) => handlers.onWordEdge(e, line, k)}
            title={`Drag to change when "${w.text}" starts`}
          />
        ))}
      </div>
    </div>
  )
})

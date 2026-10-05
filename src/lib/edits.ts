/**
 * All edits as pure functions on the document. They enforce the timing rules:
 *   line start ≤ word 1 < word 2 < … < next line start   (each word at least MIN_WORD long)
 * so the editor can never create overlapping lines.
 *
 * Imported files may already break these rules. Each constraint is relaxed so an edit
 * never makes an existing violation worse, but can always move towards fixing it.
 */
import { lastAnchor, newId, type Line, type LyricsDoc } from './model'
import { formatTag, roundToFormat } from './time'

export const MIN_WORD = 50
/** Minimum room needed between lines to insert a new one. */
export const MIN_INSERT_GAP = 300

type Range = [number, number]

/** Allowed change of value `v` so that lo ≤ v + d ≤ hi, never worsening an existing violation. */
function range(v: number, lo: number, hi: number): Range {
  return [Math.min(lo - v, 0), Math.max(hi - v, 0)]
}

function intersect(...ranges: Range[]): Range {
  return [Math.max(...ranges.map((r) => r[0])), Math.min(...ranges.map((r) => r[1]))]
}

function clamp(d: number, [lo, hi]: Range): number {
  return Math.min(hi, Math.max(lo, d))
}

function prevBound(doc: LyricsDoc, i: number): number {
  return i > 0 ? lastAnchor(doc.lines[i - 1]) + MIN_WORD : 0
}

function nextBound(doc: LyricsDoc, i: number, duration: number): number {
  const next = doc.lines[i + 1]
  return (next ? next.time : duration) - MIN_WORD
}

function replaceLine(doc: LyricsDoc, i: number, line: Line): LyricsDoc {
  const lines = doc.lines.slice()
  lines[i] = line
  return { ...doc, lines }
}

// ---------------------------------------------------------------------------------------
// Timing changes. Each returns the new doc and whether the requested time had to be limited.

export interface TimingResult {
  doc: LyricsDoc
  limited: boolean
}

/** Moves the whole line (start and all words) by `delta` ms. */
export function moveLine(doc: LyricsDoc, i: number, delta: number, duration: number): TimingResult {
  const line = doc.lines[i]
  const allowed = intersect(
    range(line.time, prevBound(doc, i), Infinity),
    range(lastAnchor(line), -Infinity, nextBound(doc, i, duration)),
  )
  const d = roundToFormat(clamp(delta, allowed))
  return {
    doc: replaceLine(doc, i, {
      ...line,
      time: line.time + d,
      words: line.words.map((w) => ({ ...w, time: w.time + d })),
    }),
    limited: d !== roundToFormat(delta),
  }
}

/** Changes when the line appears, keeping its words where they are. */
export function setLineStart(doc: LyricsDoc, i: number, time: number, duration: number): TimingResult {
  const line = doc.lines[i]
  const upper = line.words.length ? line.words[0].time : nextBound(doc, i, duration)
  const allowed = intersect(range(line.time, prevBound(doc, i), Infinity), range(line.time, -Infinity, upper))
  const d = roundToFormat(clamp(time - line.time, allowed))
  return { doc: replaceLine(doc, i, { ...line, time: line.time + d }), limited: line.time + d !== roundToFormat(time) }
}

/** Allowed start-time range for word k of line i (for hints and inputs). */
export function wordBounds(doc: LyricsDoc, i: number, k: number, duration: number): Range {
  const line = doc.lines[i]
  const words = line.words
  const lo = k === 0 ? line.time : words[k - 1].time + MIN_WORD
  const hi = k === words.length - 1 ? nextBound(doc, i, duration) : words[k + 1].time - MIN_WORD
  const [dlo, dhi] = range(words[k].time, lo, hi)
  return [words[k].time + dlo, words[k].time + dhi]
}

/** Allowed range for the start of line i. */
export function lineStartBounds(doc: LyricsDoc, i: number, duration: number): Range {
  const line = doc.lines[i]
  const upper = line.words.length ? line.words[0].time : nextBound(doc, i, duration)
  const [dlo, dhi] = intersect(range(line.time, prevBound(doc, i), Infinity), range(line.time, -Infinity, upper))
  return [line.time + dlo, line.time + dhi]
}

export function setWordTime(doc: LyricsDoc, i: number, k: number, time: number, duration: number): TimingResult {
  const line = doc.lines[i]
  const [lo, hi] = wordBounds(doc, i, k, duration)
  const t = roundToFormat(Math.min(hi, Math.max(lo, time)))
  const words = line.words.slice()
  words[k] = { ...words[k], time: t }
  return { doc: replaceLine(doc, i, { ...line, words }), limited: t !== roundToFormat(time) }
}

export function describeRange([lo, hi]: Range): string {
  return `between ${formatTag(lo)} and ${formatTag(hi)}`
}

// ---------------------------------------------------------------------------------------
// Word edits

export function setWordText(doc: LyricsDoc, i: number, k: number, text: string): LyricsDoc {
  const line = doc.lines[i]
  const words = line.words.slice()
  words[k] = { ...words[k], text }
  return replaceLine(doc, i, { ...line, words })
}

/** End of word k: the next word, the next line, or the song end. */
function wordEnd(doc: LyricsDoc, i: number, k: number, duration: number): number {
  const words = doc.lines[i].words
  return k + 1 < words.length ? words[k + 1].time : (doc.lines[i + 1]?.time ?? duration)
}

/** Inserts a word after word k by splitting word k's time in half. Returns null if there's no room. */
export function insertWordAfter(doc: LyricsDoc, i: number, k: number, duration: number): LyricsDoc | null {
  const line = doc.lines[i]
  const start = line.words[k].time
  const room = wordEnd(doc, i, k, duration) - start
  if (room < 2 * MIN_WORD) return null
  const words = line.words.slice()
  words.splice(k + 1, 0, { id: newId(), text: '', time: roundToFormat(start + room / 2) })
  return replaceLine(doc, i, { ...line, words })
}

/** Inserts a word before the first word: uses the lead-in if there is one, else splits the first word. */
export function insertWordBefore(doc: LyricsDoc, i: number, duration: number): LyricsDoc | null {
  const line = doc.lines[i]
  const first = line.words[0]
  const words = line.words.slice()
  if (first.time - line.time >= MIN_WORD) {
    words.unshift({ id: newId(), text: '', time: line.time })
  } else {
    const room = wordEnd(doc, i, 0, duration) - first.time
    if (room < 2 * MIN_WORD) return null
    words[0] = { ...first, time: roundToFormat(first.time + room / 2) }
    words.unshift({ id: newId(), text: '', time: first.time })
  }
  return replaceLine(doc, i, { ...line, words })
}

/** Turns a pause into a line with one (empty) word at the line start. */
export function addFirstWord(doc: LyricsDoc, i: number): LyricsDoc {
  const line = doc.lines[i]
  return replaceLine(doc, i, { ...line, words: [{ id: newId(), text: '', time: line.time }] })
}

/** Deletes a word. Deleting the last one turns the line into a pause. */
export function deleteWord(doc: LyricsDoc, i: number, k: number): LyricsDoc {
  const line = doc.lines[i]
  return replaceLine(doc, i, { ...line, words: line.words.filter((_, j) => j !== k) })
}

// ---------------------------------------------------------------------------------------
// Line edits. New lines start as pauses.

function insertPauseAt(doc: LyricsDoc, index: number, time: number): LyricsDoc {
  const lines = doc.lines.slice()
  lines.splice(index, 0, { id: newId(), time: roundToFormat(time), words: [], prefix: [] })
  return { ...doc, lines }
}

/** Room for a new line after line i (between its last word and the next line). */
export function canInsertLineAfter(doc: LyricsDoc, i: number, duration: number): boolean {
  const end = doc.lines[i + 1]?.time ?? duration
  return end - lastAnchor(doc.lines[i]) >= MIN_INSERT_GAP
}

export function insertLineAfter(doc: LyricsDoc, i: number, duration: number): LyricsDoc | null {
  if (!canInsertLineAfter(doc, i, duration)) return null
  const start = lastAnchor(doc.lines[i])
  const end = doc.lines[i + 1]?.time ?? duration
  return insertPauseAt(doc, i + 1, start + (end - start) / 2)
}

export function canInsertLineBefore(doc: LyricsDoc): boolean {
  return doc.lines.length === 0 || doc.lines[0].time >= MIN_INSERT_GAP
}

/** Inserts a line before the first line (or the very first line of an empty document). */
export function insertLineBefore(doc: LyricsDoc): LyricsDoc | null {
  if (!canInsertLineBefore(doc)) return null
  if (doc.lines.length === 0) return insertPauseAt(doc, 0, 0)
  const first = doc.lines[0]
  const moved = insertPauseAt(doc, 0, first.time / 2)
  // Headers stay at the top of the file.
  moved.lines[0] = { ...moved.lines[0], prefix: first.prefix }
  moved.lines[1] = { ...moved.lines[1], prefix: [] }
  return moved
}

export function deleteLine(doc: LyricsDoc, i: number): LyricsDoc {
  const lines = doc.lines.slice()
  const [removed] = lines.splice(i, 1)
  let trailer = doc.trailer
  // Keep headers/untimed lines that came before the deleted line.
  if (removed.prefix.length) {
    if (lines[i]) lines[i] = { ...lines[i], prefix: [...removed.prefix, ...lines[i].prefix] }
    else trailer = [...removed.prefix, ...trailer]
  }
  return { lines, trailer }
}

// ---------------------------------------------------------------------------------------
// Problems in the document

export interface Overlap {
  /** Index of the line that starts too early (overlaps line index-1). */
  index: number
}

/** Lines that start before the previous line's last word: these block saving. */
export function findOverlaps(doc: LyricsDoc): Overlap[] {
  const out: Overlap[] = []
  for (let i = 1; i < doc.lines.length; i++) {
    if (doc.lines[i].time < lastAnchor(doc.lines[i - 1])) out.push({ index: i })
  }
  return out
}

/** Non-blocking timing problems per line (shown as warnings). */
export function lineWarnings(doc: LyricsDoc, i: number, duration: number): string[] {
  const line = doc.lines[i]
  const out: string[] = []
  const w = line.words
  if (w.length && w[0].time < line.time) out.push('The first word starts before the line appears.')
  for (let k = 1; k < w.length; k++) {
    if (w[k].time < w[k - 1].time) {
      out.push(`"${w[k].text}" starts before "${w[k - 1].text}".`)
    } else if (w[k].time - w[k - 1].time < MIN_WORD) {
      out.push(`"${w[k - 1].text}" is extremely short.`)
    }
  }
  if (w.some((x) => !x.text.trim())) out.push('A word has no text.')
  if (duration > 0 && lastAnchor(line) >= duration) out.push('This line is after the end of the song.')
  return out
}

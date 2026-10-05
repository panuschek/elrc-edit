import { newId, type Line, type LyricsDoc, type Word } from './model'
import { formatTag, parseTag } from './time'

const LINE_TAG = /^\[(\d+:\d{1,2}(?:[.:]\d{1,3})?)\](.*)$/
const WORD_TAG = /<(\d+:\d{1,2}(?:[.:]\d{1,3})?)>/g

/**
 * Parses an (enhanced) LRC file:
 *   [01:03.06]<01:03.06>You <01:03.32>have <01:03.70>the
 *   [02:10.50]                      ← a pause (empty line)
 * Anything without a leading time tag (headers like [ar:...], blank lines) is kept verbatim.
 */
export function parseLrc(text: string): LyricsDoc {
  const rawLines = text.replace(/^﻿/, '').split(/\r?\n/)
  // A trailing newline produces an empty last element that isn't a real line.
  if (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop()

  const lines: Line[] = []
  const plainText: Map<Line, string> = new Map()
  let pending: string[] = []

  for (const raw of rawLines) {
    const m = LINE_TAG.exec(raw.trimEnd())
    const time = m ? parseTag(m[1]) : null
    if (!m || time === null) {
      pending.push(raw)
      continue
    }
    const rest = m[2]
    const line: Line = { id: newId(), time, words: parseWords(rest, time), prefix: pending }
    pending = []
    if (line.words.length === 0 && rest.trim() !== '') plainText.set(line, rest.trim())
    lines.push(line)
  }

  // Stable sort by start time, so a messy file still yields a usable order.
  const sorted = lines
    .map((line, i) => ({ line, i }))
    .sort((a, b) => a.line.time - b.line.time || a.i - b.i)
    .map((x) => x.line)

  // Lines with text but no word timings: spread the words evenly until the next line.
  sorted.forEach((line, i) => {
    const text = plainText.get(line)
    if (!text) return
    const tokens = text.split(/\s+/)
    const end = sorted[i + 1]?.time ?? line.time + tokens.length * 400
    const step = Math.max(10, Math.floor((end - line.time) / (tokens.length + 1) / 10) * 10)
    line.words = tokens.map((t, k) => ({ id: newId(), text: t, time: line.time + k * step }))
  })

  return { lines: sorted, trailer: pending }
}

function parseWords(rest: string, lineTime: number): Word[] {
  const words: Word[] = []
  const tags = [...rest.matchAll(WORD_TAG)]
  if (tags.length === 0) return words

  const leading = rest.slice(0, tags[0].index).trim()
  if (leading) words.push({ id: newId(), text: leading, time: lineTime })

  tags.forEach((tag, k) => {
    const start = tag.index! + tag[0].length
    const end = k + 1 < tags.length ? tags[k + 1].index! : rest.length
    const text = rest.slice(start, end).trim()
    const time = parseTag(tag[1])!
    // A tag with no text after it (e.g. an old-style end tag) carries no word.
    if (text) words.push({ id: newId(), text, time })
  })
  return words
}

export function serializeLrc(doc: LyricsDoc): string {
  const out: string[] = []
  for (const line of doc.lines) {
    out.push(...line.prefix)
    const words = line.words.map((w) => `<${formatTag(w.time)}>${w.text}`).join(' ')
    out.push(`[${formatTag(line.time)}]${words}`)
  }
  out.push(...doc.trailer)
  return out.join('\n') + '\n'
}

/** Quick check used on the upload screen: does this text look like timed lyrics? */
export function looksLikeLrc(text: string): boolean {
  return text.split(/\r?\n/).some((l) => LINE_TAG.test(l.trim()))
}

export interface Word {
  id: string
  text: string
  /** Start time in ms. A word lasts until the next word (or the next line) starts. */
  time: number
}

export interface Line {
  id: string
  /** When the line appears, in ms. May be earlier than the first word. */
  time: number
  /** Empty means the line is a pause (blank screen). */
  words: Word[]
  /** Untimed lines from the file that came right before this line (headers, blank lines…), kept verbatim. */
  prefix: string[]
}

export interface LyricsDoc {
  lines: Line[]
  /** Untimed lines after the last timed line, kept verbatim. */
  trailer: string[]
}

let counter = 0
export function newId(): string {
  counter += 1
  return `${Date.now().toString(36)}-${counter.toString(36)}`
}

/** Start of the last word, or the line start for a pause: the line can't end before this. */
export function lastAnchor(line: Line): number {
  return line.words.length ? line.words[line.words.length - 1].time : line.time
}

/** When the line stops being shown: the next line's start, or the end of the song. */
export function lineEnd(doc: LyricsDoc, index: number, duration: number): number {
  const next = doc.lines[index + 1]
  return next ? next.time : Math.max(duration, lastAnchor(doc.lines[index]) + 1000)
}

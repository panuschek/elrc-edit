/** All times in the app are integer milliseconds. */

/** Parses "mm:ss.xx", "mm:ss.xxx", "mm:ss" (as found in LRC tags). Returns null if invalid. */
export function parseTag(tag: string): number | null {
  const m = /^(\d+):(\d{1,2})(?:[.:](\d{1,3}))?$/.exec(tag.trim())
  if (!m) return null
  const min = Number(m[1])
  const sec = Number(m[2])
  if (sec >= 60) return null
  const frac = m[3] ? Number(m[3].padEnd(3, '0')) : 0
  return (min * 60 + sec) * 1000 + frac
}

/** Formats as "mm:ss.xx" (hundredths), the format used in the exported files. */
export function formatTag(ms: number): string {
  const cs = Math.round(Math.max(0, ms) / 10)
  const min = Math.floor(cs / 6000)
  const sec = Math.floor((cs % 6000) / 100)
  const hundredths = cs % 100
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
}

/**
 * Lenient parser for times typed by people: "1:04.82", "01:04.8", "64.82", "64".
 * Returns null if it can't make sense of it.
 */
export function parseUserTime(input: string): number | null {
  const s = input.trim().replace(',', '.')
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000)
  const m = /^(\d+):(\d{1,2})(?:\.(\d+))?$/.exec(s)
  if (!m) return null
  const sec = Number(m[2])
  if (sec >= 60) return null
  const frac = m[3] ? Number(`0.${m[3]}`) : 0
  return Math.round((Number(m[1]) * 60 + sec + frac) * 1000)
}

/** Short "m:ss" form for durations shown to people. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Rounds to the hundredths the file format can store. */
export function roundToFormat(ms: number): number {
  return Math.round(ms / 10) * 10
}

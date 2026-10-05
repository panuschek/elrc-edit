import { describe, expect, it } from 'vitest'
import { parseLrc, serializeLrc } from './lrc'
import { formatTag, parseTag, parseUserTime } from './time'

const SAMPLE = `[01:03.06]<01:03.06>You <01:03.32>have <01:03.70>the <01:03.92>bravest <01:04.82>heart, <01:06.18>the <01:06.34>strongest <01:07.20>emotions.
[01:09.08]<01:09.08>After <01:09.60>all <01:09.92>the <01:10.24>harm <01:10.80>I've <01:11.02>caused, <01:12.36>you <01:12.54>still <01:13.18>want <01:13.38>my <01:13.58>lovin'.
[01:15.52]<01:15.52>I <01:15.66>think <01:16.18>I've <01:16.48>lost <01:16.88>your <01:17.24>love, <01:18.62>oh <01:18.80>baby, <01:19.48>it's <01:19.62>a <01:19.70>shame.
`

describe('time', () => {
  it('parses and formats tags', () => {
    expect(parseTag('01:03.06')).toBe(63060)
    expect(parseTag('1:03.5')).toBe(63500)
    expect(parseTag('01:03.065')).toBe(63065)
    expect(parseTag('01:03')).toBe(63000)
    expect(parseTag('ar:Someone')).toBeNull()
    expect(formatTag(63060)).toBe('01:03.06')
    expect(formatTag(63065)).toBe('01:03.07')
    expect(formatTag(6_000_000)).toBe('100:00.00')
  })

  it('parses times typed by people', () => {
    expect(parseUserTime('1:04.82')).toBe(64820)
    expect(parseUserTime('64.82')).toBe(64820)
    expect(parseUserTime('64,8')).toBe(64800)
    expect(parseUserTime('nope')).toBeNull()
  })
})

describe('parseLrc / serializeLrc', () => {
  it('round-trips the sample byte for byte', () => {
    expect(serializeLrc(parseLrc(SAMPLE))).toBe(SAMPLE)
  })

  it('parses words with start times', () => {
    const doc = parseLrc(SAMPLE)
    expect(doc.lines).toHaveLength(3)
    expect(doc.lines[0].time).toBe(63060)
    expect(doc.lines[0].words.map((w) => w.text)).toEqual([
      'You', 'have', 'the', 'bravest', 'heart,', 'the', 'strongest', 'emotions.',
    ])
    expect(doc.lines[0].words[4].time).toBe(64820)
  })

  it('keeps headers, blank lines and pauses', () => {
    const text = `[ar:Someone]
[ti:A Song]

[00:01.00]<00:01.50>Hi <00:02.00>there
[00:05.00]
[00:06.00]<00:06.00>Bye
`
    const doc = parseLrc(text)
    expect(doc.lines).toHaveLength(3)
    expect(doc.lines[0].prefix).toEqual(['[ar:Someone]', '[ti:A Song]', ''])
    expect(doc.lines[0].time).toBe(1000)
    expect(doc.lines[0].words[0].time).toBe(1500)
    expect(doc.lines[1].words).toEqual([])
    expect(serializeLrc(doc)).toBe(text)
  })

  it('drops a trailing end tag (no text) instead of creating an empty word', () => {
    const doc = parseLrc('[00:01.00]<00:01.00>Hi <00:02.00>\n')
    expect(doc.lines[0].words.map((w) => w.text)).toEqual(['Hi'])
  })

  it('spreads words of plain (untimed) lines until the next line', () => {
    const doc = parseLrc('[00:01.00]one two three\n[00:05.00]<00:05.00>x\n')
    const times = doc.lines[0].words.map((w) => w.time)
    expect(times[0]).toBe(1000)
    expect(times[1]).toBeGreaterThan(times[0])
    expect(times[2]).toBeLessThan(5000)
  })

  it('sorts lines by start time', () => {
    const doc = parseLrc('[00:05.00]<00:05.00>b\n[00:01.00]<00:01.00>a\n')
    expect(doc.lines.map((l) => l.words[0].text)).toEqual(['a', 'b'])
  })
})

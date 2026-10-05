import { describe, expect, it } from 'vitest'
import {
  deleteLine, deleteWord, findOverlaps, insertLineAfter, insertLineBefore, insertWordAfter,
  insertWordBefore, moveLine, setLineStart, setWordTime,
} from './edits'
import { parseLrc, serializeLrc } from './lrc'

const DUR = 60_000
const doc = () =>
  parseLrc(`[ti:Test]
[00:10.00]<00:10.00>one <00:11.00>two <00:12.00>three
[00:15.00]<00:15.00>four <00:16.00>five
`)

describe('timing edits', () => {
  it('moves a whole line but not into its neighbours', () => {
    const r = moveLine(doc(), 1, -10_000, DUR)
    expect(r.limited).toBe(true)
    expect(r.doc.lines[1].time).toBe(12_050) // last word of line 1 starts at 12.00 + 50ms minimum
    expect(r.doc.lines[1].words[1].time).toBe(13_050)
  })

  it('moves the line start independently of the first word', () => {
    const r = setLineStart(doc(), 1, 14_000, DUR)
    expect(r.doc.lines[1].time).toBe(14_000)
    expect(r.doc.lines[1].words[0].time).toBe(15_000)
    // can't start after the first word
    expect(setLineStart(doc(), 1, 15_500, DUR).doc.lines[1].time).toBe(15_000)
  })

  it('keeps words in order', () => {
    const r = setWordTime(doc(), 0, 1, 20_000, DUR)
    expect(r.doc.lines[0].words[1].time).toBe(11_950)
    expect(r.limited).toBe(true)
    // the last word can't run into the next line
    expect(setWordTime(doc(), 0, 2, 16_000, DUR).doc.lines[0].words[2].time).toBe(14_950)
  })

  it('lets existing overlaps be fixed by dragging, but not made worse', () => {
    const bad = parseLrc('[00:10.00]<00:10.00>a <00:12.00>b\n[00:11.00]<00:11.00>c <00:13.00>d\n')
    expect(findOverlaps(bad)).toEqual([{ index: 1 }])
    expect(moveLine(bad, 1, -500, DUR).doc.lines[1].time).toBe(11_000) // can't get worse
    const fixed = moveLine(bad, 1, 2_000, DUR).doc
    expect(fixed.lines[1].time).toBe(13_000)
    expect(findOverlaps(fixed)).toEqual([])
  })
})

describe('word and line edits', () => {
  it('inserts a word halfway through the previous one', () => {
    const d = insertWordAfter(doc(), 0, 0, DUR)!
    expect(d.lines[0].words.map((w) => w.time)).toEqual([10_000, 10_500, 11_000, 12_000])
  })

  it('inserts a word before the first by splitting it when there is no lead-in', () => {
    const d = insertWordBefore(doc(), 0, DUR)!
    expect(d.lines[0].words.map((w) => w.time)).toEqual([10_000, 10_500, 11_000, 12_000])
    expect(d.lines[0].words[1].text).toBe('one')
  })

  it('turns a line into a pause when its last word is deleted', () => {
    let d = deleteWord(doc(), 1, 0)
    d = deleteWord(d, 1, 0)
    expect(serializeLrc(d)).toContain('[00:15.00]\n')
  })

  it('inserts pause lines between lines and at the top', () => {
    const d = insertLineAfter(doc(), 0, DUR)!
    expect(d.lines[1].time).toBe(13_500)
    expect(d.lines[1].words).toEqual([])
    const top = insertLineBefore(doc())!
    expect(top.lines[0].time).toBe(5_000)
    expect(serializeLrc(top).startsWith('[ti:Test]\n[00:05.00]\n')).toBe(true)
  })

  it('keeps headers when the first line is deleted', () => {
    expect(serializeLrc(deleteLine(doc(), 0)).startsWith('[ti:Test]\n[00:15.00]')).toBe(true)
  })
})

import { useRef, useState } from 'react'
import type { DecodedAudio } from '../lib/audio'
import { detectFile } from '../lib/detect'
import { lastAnchor, type LyricsDoc } from '../lib/model'
import { loadWork, songKey, type SavedWork } from '../lib/storage'
import { formatDuration } from '../lib/time'
import { useEditor } from '../store'
import styles from './UploadScreen.module.css'

interface Song {
  file: File
  audio: DecodedAudio
  url: string
}
interface Lyrics {
  file: File
  doc: LyricsDoc
}

type Slot = 'song' | 'lyrics'

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export function UploadScreen() {
  const open = useEditor((s) => s.open)
  const [song, setSong] = useState<Song | null>(null)
  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  const [busy, setBusy] = useState<Slot | null>(null)
  const [notes, setNotes] = useState<Partial<Record<Slot, string>>>({})
  const [errors, setErrors] = useState<Partial<Record<Slot, string>>>({})
  const [saved, setSaved] = useState<SavedWork | null>(null)
  const [savedDismissed, setSavedDismissed] = useState(false)
  const previewRef = useRef<HTMLAudioElement>(null)
  const [previewing, setPreviewing] = useState(false)

  /** droppedOn is null when files were dropped somewhere else on the page. */
  async function handleFiles(files: File[], droppedOn: Slot | null) {
    setNotes({})
    setErrors({})
    for (const file of files) {
      setBusy(droppedOn ?? 'song')
      const found = await detectFile(file)
      setBusy(null)
      if (found.kind === 'audio') {
        setSong((old) => {
          if (old) URL.revokeObjectURL(old.url)
          return { file, audio: found.audio, url: URL.createObjectURL(file) }
        })
        // Look for earlier work on this song.
        setSaved(loadWork(songKey(file)))
        setSavedDismissed(false)
        if (droppedOn === 'lyrics') setNotes((n) => ({ ...n, song: 'That was the song, so we put it in Step 1.' }))
      } else if (found.kind === 'lyrics') {
        setLyrics({ file, doc: found.doc })
        if (droppedOn === 'song') setNotes((n) => ({ ...n, lyrics: 'That was the lyrics file, so we put it in Step 2.' }))
      } else {
        setErrors((e) => ({
          ...e,
          [droppedOn ?? 'song']: `"${file.name}" doesn't look like a song or a lyrics file. Ask whoever gave you the files which one to use.`,
        }))
      }
    }
  }

  function start(useSaved: boolean) {
    if (!song) return
    previewRef.current?.pause()
    const doc = useSaved && saved ? saved.doc : lyrics?.doc
    if (!doc) return
    open(
      {
        songFile: song.file,
        songUrl: song.url,
        songName: baseName(song.file.name),
        duration: song.audio.duration,
        peaks: song.audio.peaks,
        storageKey: songKey(song.file),
        lyricsName: useSaved && saved ? saved.lyricsName : lyrics!.file.name,
      },
      doc,
    )
  }

  function togglePreview() {
    const el = previewRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  // Lyrics that run past the end of the song probably belong to a different song.
  const lastLyric = lyrics?.doc.lines.length ? lastAnchor(lyrics.doc.lines[lyrics.doc.lines.length - 1]) : 0
  const mismatch = song && lyrics && lastLyric > song.audio.duration
  const missing = !song && !lyrics ? 'Add the song and the lyrics file to continue' : !song ? 'Add the song to continue' : !lyrics ? 'Add the lyrics file to continue' : null
  const showSaved = saved && !savedDismissed

  const previewLines = lyrics?.doc.lines
    .filter((l) => l.words.length)
    .slice(0, 2)
    .map((l) => l.words.map((w) => w.text).join(' '))

  return (
    <div
      className={styles.page}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        void handleFiles([...e.dataTransfer.files], null)
      }}
    >
      <h1 className={styles.title}>Fix the lyrics for a karaoke song</h1>
      <p className={styles.lead}>You need two files for the same song. Add them below.</p>

      <div className={styles.boxes}>
        <DropBox
          step={1}
          title="The song"
          icon="🎵"
          explain="The music you'll hear."
          button="Choose song file"
          busy={busy === 'song'}
          done={!!song}
          note={notes.song}
          error={errors.song}
          onFiles={(f) => handleFiles(f, 'song')}
        >
          {song && (
            <>
              <div className={styles.fileName}>{song.file.name}</div>
              <div className={styles.detail}>
                Length {formatDuration(song.audio.duration)}
                <button type="button" className={styles.linkButton} onClick={togglePreview}>
                  {previewing ? '⏸ Stop' : '▶ Listen'}
                </button>
              </div>
              <audio
                ref={previewRef}
                src={song.url}
                onPlay={() => setPreviewing(true)}
                onPause={() => setPreviewing(false)}
              />
            </>
          )}
        </DropBox>

        <DropBox
          step={2}
          title="The lyrics"
          icon="📝"
          explain="The text with timings for the song."
          button="Choose lyrics file"
          busy={busy === 'lyrics'}
          done={!!lyrics}
          note={notes.lyrics}
          error={errors.lyrics}
          onFiles={(f) => handleFiles(f, 'lyrics')}
        >
          {lyrics && (
            <>
              <div className={styles.fileName}>{lyrics.file.name}</div>
              <div className={styles.detail}>{lyrics.doc.lines.length} lines</div>
              {previewLines && previewLines.length > 0 && (
                <blockquote className={styles.preview}>
                  {previewLines.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </blockquote>
              )}
            </>
          )}
        </DropBox>
      </div>

      {mismatch && (
        <div className={styles.warning}>
          ⚠ These lyrics seem to be for a longer song. Are you sure these two files belong together?
        </div>
      )}

      {showSaved && (
        <div className={styles.saved}>
          <div>
            <strong>You worked on this song before</strong> (last change{' '}
            {new Date(saved.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}).
            <br />
            Continue where you left off?
          </div>
          <div className={styles.savedButtons}>
            <button type="button" className={styles.primary} onClick={() => start(true)}>
              Continue where I left off
            </button>
            <button type="button" className={styles.secondary} onClick={() => setSavedDismissed(true)}>
              Start fresh
            </button>
          </div>
          {!lyrics && <p className={styles.small}>To start fresh, add the lyrics file in Step 2.</p>}
        </div>
      )}

      {!showSaved && (
        <div className={styles.startRow}>
          <button type="button" className={styles.primary} disabled={!!missing} onClick={() => start(false)}>
            Start editing →
          </button>
          {missing && <div className={styles.small}>{missing}</div>}
        </div>
      )}
    </div>
  )
}

interface DropBoxProps {
  step: number
  title: string
  icon: string
  explain: string
  button: string
  busy: boolean
  done: boolean
  note?: string
  error?: string
  onFiles: (files: File[]) => void
  children?: React.ReactNode
}

function DropBox({ step, title, icon, explain, button, busy, done, note, error, onFiles, children }: DropBoxProps) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      className={[styles.box, done && styles.done, over && styles.over, error && styles.error].filter(Boolean).join(' ')}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        onFiles([...e.dataTransfer.files])
      }}
    >
      <div className={styles.step}>
        Step {step}: {title} {done && '✅'}
      </div>
      <div className={styles.icon}>{icon}</div>
      {busy ? (
        <div className={styles.detail}>Reading the file…</div>
      ) : done ? (
        children
      ) : (
        <p className={styles.explain}>
          {explain}
          <br />
          Drag it here, or
        </p>
      )}
      <button type="button" className={done ? styles.secondary : styles.primary} onClick={() => input.current?.click()}>
        {done ? 'Choose a different file' : button}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      {note && <div className={styles.note}>{note}</div>}
      {error && <div className={styles.errorText}>{error}</div>}
    </div>
  )
}

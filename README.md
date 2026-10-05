# Karaoke Lyrics Fixer

A browser tool for fixing AI-generated enhanced LRC (word-timed lyrics) files.
Upload a song and its lyrics file, fix words and timings visually, and save the fixed `.lrc`.
Everything runs in the browser: no server, and files never leave the computer.

## For the people fixing songs

1. Open the site, add **the song** (Step 1) and **the lyrics file** (Step 2), then click **Start editing**.
2. Under the waveform, every line is a bar:
   - the vertical separators inside a bar are where each word starts. Drag them to fix word timing.
   - the small handle at the very left of a bar sets when the line appears (it can be before the first word).
   - drag the top strip (with **⠿**) to move the whole line.
3. Below that, every line is listed with its words. Click a word to jump there, **double-click** it to change its
   text or start time, delete it, or insert a word.
4. Hover a line for **▶ Play**, **＋ Line below** (inserts a pause line) and **🗑** (delete).
5. Click **💾 Save fixed lyrics** and send the downloaded file back.

Progress is saved in the browser automatically: open the same song again to continue.

## File format

```
[01:03.06]<01:03.06>You <01:03.32>have <01:03.70>the
[01:22.00]
```

- `[time]` is when the line appears; `<time>` is when each word starts. A word lasts until the next word starts,
  the last word until the next line starts. A line with no words is a pause (blank screen).
- Times are written as `mm:ss.xx`. Header lines like `[ti:...]` are kept unchanged.
- The editor never lets lines overlap. Overlapping lines in an imported file must be fixed (dragged apart or
  deleted) before saving.

## Development

```sh
npm install
npm run dev     # local dev server
npm test        # parser and editing-rule tests
npm run build   # static site in dist/
```

Stack: Vite, React, TypeScript, Zustand. The waveform is drawn on a canvas from the decoded audio.

## Deploying

Push to `main` on GitHub, then in the repository settings set **Pages → Source** to **GitHub Actions**.
The workflow in `.github/workflows/deploy.yml` tests, builds and publishes the site on every push.

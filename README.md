# lukebox

Luke's playlist, as a website. 239 tracks, 17 hours, 229 artists — searchable,
sortable, and one click from hearing any of it.

Same visual language as [dropline](https://github.com/Aidiotic/dropline) and
[clearline](https://github.com/Aidiotic/clearline): cream paper, ink, a clay
accent, and no chrome that isn't doing something.

---

## What it is

A static page over a playlist pasted out of Spotify. No account, no API key, no
build step, no server logic — three JavaScript modules, one stylesheet, and a
generated data file.

- **Search** across titles, artists and albums. Words are ANDed, matches are
  highlighted, and accents are folded, so `tiesto` finds *Tiësto* and `jeja`
  finds *Jéja*. Cyrillic and Japanese titles are left exactly as they are and
  match on their own characters.
- **Sort** by playlist order (the default — the sequence Luke built it in is
  information), title, artist, or length.
- **Artists** view groups the list by name, biggest first, which is the only way
  to notice that six of these are Nirvana.
- **Shuffle** picks out of whatever is currently on screen. Filter to `phonk`,
  hit shuffle, get phonk.
- **Every view is a link.** The search, the sort, the view and the selected
  track all live in the hash, so `#q=undertale&sort=length` is a thing you can
  send someone.
- **Know / don't know.** One button per row in the left gutter, cycling
  `unmarked → ✓ know → ? don't → unmarked`, with a running tab — `42 know ·
  17 don't · 180 left` and a two-colour meter — on one line beside the result
  count. Each of the three figures is also the filter for its own set, so
  "180 left" is a button that shows you the 180. Counts are over the whole
  catalogue, never the current search: a total that moves while you type is
  not a total.
- **Keyboard**: `/` to search, `j`/`k` or arrows to move, `y`/`n` to mark known
  or not (both advance a row, so a pass through the list is `j y y n y`), `x`
  to unmark, `enter` to open, `esc` to clear.
- Light and dark, following the system until you say otherwise.

## Marks are keyed by song, not by row

Marks live in `localStorage` under `lukebox.marks` and nothing about them
leaves the browser. They are keyed by a fingerprint of title + artists rather
than by row index, because the index is not stable — adding one song near the
top of the playlist and re-running `import.mjs` shifts every index below it,
and index-keyed marks would silently slide onto the wrong songs. Known rows
drop to regular weight on purpose: the list is most useful as the set of things
still to learn, so what is left should carry the visual weight.

## Why it links out instead of playing

The paste is metadata — titles, artists, albums, durations. There is no audio in
it and no Spotify track ids, so every row carries a search link to Spotify and
YouTube built from its own title and artist. That lands on the right track
essentially always, costs nothing to keep correct as the list changes, and
means the page needs no keys, no auth and no third-party script.

## Updating the list

Select the playlist in Spotify's desktop app, copy, paste over `luke_music.txt`,
and:

```bash
node import.mjs
```

That rewrites `src/tracks.js`. Nothing else needs touching.

### How the paste is parsed

Spotify's copied rows are a flat run of lines with no delimiters of their own.
What makes them parseable is the duration: exactly one per row, and nothing else
in the text looks like `m:ss`. So every duration line ends a track, and what came
before it is

```
title, artist [, artist]* [& artist], album?
```

with the separators on their own lines because they are their own elements in
Spotify's markup. The album is missing on the 33 rows that came from local files
rather than the catalogue. `import.mjs` throws rather than guessing if the file
ends mid-track, which is what a truncated copy looks like.

## Running it

ES modules need a real origin — `file://` will not do.

```bash
npx serve -l 4321 .
```

Then <http://localhost:4321>. Deploying is copying the directory to any static
host; GitHub Pages needs nothing configured beyond pointing at the branch.

## Layout

```
index.html        markup, and nothing else
style.css         the whole visual language
import.mjs        luke_music.txt → src/tracks.js
luke_music.txt    the original paste, kept so the import is reproducible
src/
  tracks.js       generated; one track per line so a diff reads
  util.js         pure — folding, matching, sorting, hash state
  marks.js        know / don't know, fingerprinted and stored locally
  ui.js           everything that touches the DOM
  app.js          state, events, keyboard
```

`util.js` holds no DOM and no globals, so the search behaviour can be reasoned
about — and tested — without a browser. `ui.js` is handed what to draw and never
reads app state. `app.js` owns the one state object and the one `update()` that
writes it, which is why the back button, a pasted link and the controls all
behave the same.

## Notes on the data

- Six tracks appear twice (*GigaChad Theme*, *Crab Rave*, *Candyland*,
  *Shockwave*, *Unstoppable*, *Wake Me Up*). They are left in — it is Luke's
  playlist and the duplicates are his.
- Two entries are hour-long mixes, which is why "shortest first" is a more
  useful sort than it sounds.
- The last track is *Never Gonna Give You Up*. Draw your own conclusions.

/* Which tracks you know.

   Marks are keyed by a fingerprint of title + artists rather than by row
   index, because the index is not stable: adding one song near the top of
   Luke's playlist and re-running import.mjs shifts every index below it, and
   index-keyed marks would silently slide onto the wrong songs. The
   fingerprint survives that, and survives a retitled album too. */

import { fold } from './util.js';

const KEY = 'lukebox.marks';

// The three states a row can be in. Cycling order is deliberate: the first
// press says the useful thing, and a third press undoes a mistake.
export const CYCLE = ['unrated', 'known', 'unknown'];

export function fingerprint(track) {
  return `${fold(track.title)}|${fold(track.artists.join(','))}`;
}

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    // Anything unrecognised in storage is dropped rather than trusted — this
    // is the one input to the app that a previous version might have written.
    const clean = {};
    for (const [fp, mark] of Object.entries(raw)) {
      if (mark === 'known' || mark === 'unknown') clean[fp] = mark;
    }
    return clean;
  } catch {
    return {}; // private mode, or storage full of something else
  }
}

export function save(marks) {
  try {
    localStorage.setItem(KEY, JSON.stringify(marks));
  } catch { /* private mode: marks live for the session and no longer */ }
}

// "unrated" is the absence of a mark, so it is stored as nothing at all.
export function set(marks, track, mark) {
  const next = { ...marks };
  const fp = fingerprint(track);
  if (mark === 'unrated') delete next[fp];
  else next[fp] = mark;
  return next;
}

export function get(marks, track) {
  return marks[fingerprint(track)] ?? 'unrated';
}

export function cycle(mark) {
  return CYCLE[(CYCLE.indexOf(mark) + 1) % CYCLE.length];
}

/* The running tab. Counted over the whole catalogue, not the current filter —
   a total that moves when you type a search is not a total. */
export function tally(tracks, marks) {
  const out = { known: 0, unknown: 0, unrated: 0, total: tracks.length };
  for (const track of tracks) out[get(marks, track)] += 1;
  return out;
}

/* Pure helpers. No DOM, no globals at load time — everything here is a
   function of its arguments, which is what makes the search behaviour easy to
   reason about when a query stops matching something it obviously should. */

/* Search has to work for a list that runs from "Where Is My Mind?" through
   "фрози" to "愛のカタマリー". Lowercasing plus NFD, with the combining marks
   dropped, folds "Tiësto" onto "tiesto" and "Jéja" onto "jeja" while leaving
   Cyrillic and Japanese exactly as they were — those scripts carry no
   combining marks here, so nothing of theirs is thrown away. */
export function fold(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
}

// Terms are ANDed. Quoting is not worth it for 239 rows; spaces are just
// spaces, and each word has to land somewhere in the track.
export function terms(query) {
  return fold(query).split(/\s+/).filter(Boolean);
}

// One folded haystack per track, built once, so filtering never re-folds.
export function haystack(track) {
  return fold([track.title, track.artists.join(' '), track.album ?? ''].join(' '));
}

export function matches(track, queryTerms) {
  return queryTerms.every((t) => track._hay.includes(t));
}

/* Where a term landed, in the *original* string. Folding normally leaves the
   two strings index-aligned — it lowercases, or removes a combining mark that
   NFD just introduced after its own base character — so a hit at folded index
   i is a hit at raw index i. A few characters do change length (ligatures,
   Turkish İ), and rather than carry an index map for a case this list doesn't
   contain, an unequal length simply turns highlighting off for that string.
   Ranges are merged so overlapping terms don't produce nested marks. */
export function hits(text, queryTerms) {
  if (!queryTerms.length) return [];
  const folded = fold(text);
  if (folded.length !== text.length) return [];
  const ranges = [];

  for (const term of queryTerms) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at === -1) break;
      ranges.push([at, at + term.length]);
      from = at + 1; // overlapping occurrences still count
    }
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged.filter(([s, e]) => e <= text.length && s < e);
}

export const SORTS = {
  // Luke's own sequencing. The default, because the order a playlist was
  // built in is information the other sorts throw away.
  order:  (a, b) => a.index - b.index,
  title:  (a, b) => collate(a.title, b.title) || a.index - b.index,
  artist: (a, b) => collate(a.artists[0], b.artists[0]) || collate(a.title, b.title),
  length: (a, b) => a.seconds - b.seconds || a.index - b.index,
};

// Intl gets "фрози" and "あんばー" into a sane place next to the Latin names
// instead of dumping them at the end by code point.
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const collate = (a, b) => collator.compare(a ?? '', b ?? '');

export function totalTime(tracks) {
  return tracks.reduce((n, t) => n + t.seconds, 0);
}

// "17h 6m" for the header, "6m" when there is no hour to show.
export function longDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function plural(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

// The artist index: every artist that appears anywhere, with their tracks,
// biggest first so the handful of repeats sit at the top where they are worth
// looking at, and alphabetically inside each tier.
export function byArtist(tracks) {
  const map = new Map();
  for (const track of tracks) {
    for (const name of track.artists) {
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(track);
    }
  }
  return [...map.entries()]
    .map(([name, list]) => ({ name, tracks: list, seconds: totalTime(list) }))
    .sort((a, b) => b.tracks.length - a.tracks.length || collate(a.name, b.name));
}

export function pick(list, random = Math.random) {
  return list.length ? list[Math.floor(random() * list.length)] : null;
}

/* Search links rather than stored ids: the paste has no Spotify URIs in it,
   and a search for title + artist lands on the right track essentially always
   while costing nothing to keep correct as the list changes. */
export function searchLinks(track) {
  const query = `${track.title} ${track.artists.join(' ')}`;
  return {
    spotify: `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
  };
}

/* State lives in the hash so any view — a search, a sort, one track — is a
   link you can send someone. Unknown keys are dropped rather than preserved:
   this is the whole state, not a bag to accumulate in. */
export function readHash(hash, defaults) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const state = { ...defaults };
  if (params.has('q')) state.q = params.get('q');
  // hasOwn, not a truthiness test: `#sort=constructor` would otherwise find
  // something on Object.prototype and pass for a real comparator.
  if (Object.hasOwn(SORTS, params.get('sort') ?? '')) state.sort = params.get('sort');
  if (['tracks', 'artists'].includes(params.get('view'))) state.view = params.get('view');
  if (['known', 'unknown', 'unrated'].includes(params.get('mark'))) state.mark = params.get('mark');
  // params.get returns null when absent and Number(null) is 0, which would
  // silently focus the first track on every cold load.
  const t = params.has('t') ? Number(params.get('t')) : NaN;
  state.focus = Number.isInteger(t) && t >= 0 ? t : null;
  return state;
}

export function writeHash(state, defaults) {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.sort !== defaults.sort) params.set('sort', state.sort);
  if (state.view !== defaults.view) params.set('view', state.view);
  if (state.mark !== defaults.mark) params.set('mark', state.mark);
  if (state.focus !== null && state.focus !== undefined) params.set('t', String(state.focus));
  const out = params.toString();
  return out ? `#${out}` : '';
}

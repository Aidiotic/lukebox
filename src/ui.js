/* Everything that touches the DOM.

   Rendering is wholesale: 239 rows is small enough that rebuilding the list
   beats reconciling it, and a full rebuild has no stale-state bugs in it.
   Nothing here reads app state — it is handed what to draw. */

import { hits, longDuration, plural, searchLinks, totalTime } from './util.js';
import { get as markOf } from './marks.js';

export const el = {};

export function bind() {
  const ids = [
    'app', 'live', 'statusline', 'search', 'clear', 'sort', 'shuffle',
    'view-tracks', 'view-artists', 'list', 'empty', 'count', 'theme',
    'tally', 'n-known', 'n-unknown', 'n-unrated', 'meter', 'reset',
  ];
  for (const id of ids) el[camel(id)] = document.getElementById(id);
  return el;
}

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/* Text with the matched parts wrapped. Built out of nodes rather than a
   string of HTML: these titles are somebody's file, and a track called
   `<img onerror=…>` should render as that text and nothing else. */
function marked(text, queryTerms) {
  const frag = document.createDocumentFragment();
  let at = 0;
  for (const [start, end] of hits(text, queryTerms)) {
    if (start > at) frag.append(text.slice(at, start));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(start, end);
    frag.append(mark);
    at = end;
  }
  if (at < text.length) frag.append(text.slice(at));
  return frag;
}

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

/* One row. The links are real anchors so they behave like links — middle
   click, long press, copy address — instead of click handlers pretending. */
function row(track, ctx) {
  const { queryTerms, focusIndex, marks } = ctx;
  const li = node('li', 'track');
  li.dataset.index = String(track.index);
  if (track.index === focusIndex) li.classList.add('is-focus');

  const mark = markOf(marks, track);
  li.dataset.mark = mark;
  li.append(markButton(track, mark));
  li.append(node('span', 'track-num', String(track.index + 1)));

  const main = node('div', 'track-main');
  const title = node('span', 'track-title');
  title.append(marked(track.title, queryTerms));
  main.append(title);

  const by = node('span', 'track-by');
  by.append(marked(track.artists.join(' · '), queryTerms));
  main.append(by);

  if (track.album && track.album !== track.title) {
    const album = node('span', 'track-album');
    album.append(marked(track.album, queryTerms));
    main.append(album);
  }
  li.append(main);

  li.append(node('span', 'track-time', track.duration));

  const links = node('span', 'track-links');
  const { spotify, youtube } = searchLinks(track);
  links.append(link(spotify, 'Spotify', track.title), link(youtube, 'YouTube', track.title));
  li.append(links);

  return li;
}

/* One button, three states, cycling. Two buttons per row would be clearer in
   the abstract and twice the furniture on 239 rows; the label carries the
   state and the next action so the cycle is not a guess for a screen reader. */
const GLYPH = { unrated: '', known: '✓', unknown: '?' };
const SAYS = {
  unrated: 'Not marked. Press to mark as known.',
  known: 'Marked as known. Press to mark as not known.',
  unknown: 'Marked as not known. Press to clear.',
};

function markButton(track, mark) {
  const b = node('button', 'mark', GLYPH[mark]);
  b.type = 'button';
  b.dataset.state = mark;
  b.setAttribute('aria-label', `${track.title}: ${SAYS[mark]}`);
  return b;
}

function link(href, label, trackTitle) {
  const a = node('a', 'track-link', label);
  a.href = href;
  a.target = '_blank';
  // Opener access is pointless for a search link and noreferrer keeps the
  // list of what somebody listens to out of another site's logs.
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-label', `Find “${trackTitle}” on ${label}`);
  return a;
}

export function renderTracks(tracks, ctx) {
  const list = el.list;
  list.replaceChildren();
  list.classList.remove('as-artists');
  for (const track of tracks) list.append(row(track, ctx));
  el.empty.hidden = tracks.length > 0;
}

/* The artist view earns its place on the repeats. 229 names across 239 tracks
   means most groups are one row, so the ones that are not go first and the
   singles fall in behind them — sorted upstream, drawn in the order given. */
export function renderArtists(groups, ctx) {
  const list = el.list;
  list.replaceChildren();
  list.classList.add('as-artists');

  for (const group of groups) {
    const li = node('li', 'group');

    const head = node('div', 'group-head');
    const name = node('h2', 'group-name');
    name.append(marked(group.name, ctx.queryTerms));
    head.append(name);
    head.append(node('span', 'group-meta',
      `${plural(group.tracks.length, 'track')} · ${longDuration(group.seconds)}`));
    li.append(head);

    const inner = node('ul', 'group-tracks');
    for (const track of group.tracks) inner.append(row(track, ctx));
    li.append(inner);

    list.append(li);
  }
  el.empty.hidden = groups.length > 0;
}

export function setStatus(all) {
  el.statusline.textContent =
    `${plural(all.length, 'track')} · ${longDuration(totalTime(all))} · ${plural(countArtists(all), 'artist')}`;
}

function countArtists(tracks) {
  return new Set(tracks.flatMap((t) => t.artists)).size;
}

// What the current filter leaves. Silent when nothing is filtered out — a
// count that never changes is noise.
export function setResult(shown, total) {
  el.count.textContent = shown.length === total
    ? ''
    : `${plural(shown.length, 'match', 'matches')} · ${longDuration(totalTime(shown))}`;
}

/* Re-drawing 239 rows to change one glyph would also throw away the focus
   ring on the button you just pressed, which breaks tabbing through the list.
   A track can appear in more than one row in the artist view — once per
   collaborator — so every copy is patched. */
export function patchMark(index, mark, title) {
  for (const li of el.list.querySelectorAll(`[data-index="${index}"]`)) {
    li.dataset.mark = mark;
    const b = li.querySelector('.mark');
    if (!b) continue;
    b.dataset.state = mark;
    b.textContent = GLYPH[mark];
    b.setAttribute('aria-label', `${title}: ${SAYS[mark]}`);
  }
}

/* The running tab: three figures and a two-colour meter, on one line. Each
   figure doubles as the filter for its own set, and the active one is pressed
   so you can see which slice you are looking at. */
export function setTally(counts, active) {
  el.nKnown.textContent = String(counts.known);
  el.nUnknown.textContent = String(counts.unknown);
  el.nUnrated.textContent = String(counts.unrated);

  const pct = (n) => `${(n / Math.max(1, counts.total)) * 100}%`;
  el.meter.querySelector('.m-known').style.width = pct(counts.known);
  el.meter.querySelector('.m-unknown').style.width = pct(counts.unknown);

  for (const seg of el.tally.querySelectorAll('.tally-seg')) {
    seg.setAttribute('aria-pressed', String(seg.dataset.mark === active));
  }

  // Nothing to reset until something has been marked.
  el.reset.hidden = counts.known + counts.unknown === 0;
  el.tally.dataset.empty = String(counts.known + counts.unknown === 0);
}

export function announce(text) {
  el.live.textContent = text;
}

// Bring a row into view without yanking the page when it is already visible.
export function reveal(index) {
  const target = el.list.querySelector(`[data-index="${index}"]`);
  if (!target) return;
  const box = target.getBoundingClientRect();
  const off = box.top < 80 || box.bottom > window.innerHeight - 40;
  if (off) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.add('is-flash');
  target.addEventListener('animationend', () => target.classList.remove('is-flash'), { once: true });
}

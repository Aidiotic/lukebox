/* Wiring. One state object, one render, and the hash as the single place
   state is written down — so the back button, a pasted link and the controls
   all end up going through the same path. */

import { TRACKS } from './tracks.js';
import * as ui from './ui.js';
import * as marking from './marks.js';
import {
  SORTS, byArtist, haystack, matches, pick, readHash, terms, writeHash,
} from './util.js';

const DEFAULTS = { q: '', sort: 'order', view: 'tracks', mark: 'all', focus: null };

// index is the position in Luke's playlist. It is the row's identity: the
// number on the left, the target of a permalink, and the tiebreak in a sort.
const CATALOGUE = TRACKS.map((track, index) => ({ ...track, index, _hay: haystack(track) }));
const BY_INDEX = new Map(CATALOGUE.map((t) => [t.index, t]));

let state = { ...DEFAULTS };
let shown = CATALOGUE;
let marks = {};

function main() {
  ui.bind();
  ui.setStatus(CATALOGUE);
  applyStoredTheme();
  marks = marking.load();

  state = readHash(location.hash, DEFAULTS);
  syncControls();
  render();
  if (state.focus !== null) ui.reveal(state.focus);

  ui.el.search.addEventListener('input', () => {
    // Typing rewrites the hash, but replaceState keeps every keystroke out of
    // the back stack — otherwise leaving the page means pressing back once
    // per character typed.
    update({ q: ui.el.search.value, focus: null }, { replace: true });
  });

  ui.el.clear.addEventListener('click', () => {
    update({ q: '', focus: null });
    ui.el.search.focus();
  });

  ui.el.sort.addEventListener('change', () => update({ sort: ui.el.sort.value }));

  ui.el.viewTracks.addEventListener('click', () => update({ view: 'tracks' }));
  ui.el.viewArtists.addEventListener('click', () => update({ view: 'artists' }));

  ui.el.shuffle.addEventListener('click', shuffle);
  ui.el.theme.addEventListener('click', cycleTheme);

  // A row click that is not on a link focuses the row, which is what makes
  // the permalink and the keyboard cursor agree with what you just clicked.
  ui.el.list.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;

    const button = e.target.closest('.mark');
    if (button) {
      const row = button.closest('.track');
      const track = BY_INDEX.get(Number(row.dataset.index));
      setMark(track, marking.cycle(marking.get(marks, track)));
      return;
    }

    const row = e.target.closest('.track');
    if (row) update({ focus: Number(row.dataset.index) }, { keepScroll: true });
  });

  // Each figure in the tab filters to its own set; pressing the active one
  // again goes back to everything.
  ui.el.tally.addEventListener('click', (e) => {
    const seg = e.target.closest('.tally-seg');
    if (!seg) return;
    update({ mark: state.mark === seg.dataset.mark ? 'all' : seg.dataset.mark, focus: null });
  });

  ui.el.reset.addEventListener('click', () => {
    const { known, unknown } = marking.tally(CATALOGUE, marks);
    if (!confirm(`Clear all ${known + unknown} marks? This cannot be undone.`)) return;
    marks = {};
    marking.save(marks);
    update({ mark: 'all' }, { keepScroll: true });
    ui.announce('Marks cleared.');
  });

  window.addEventListener('hashchange', () => {
    state = readHash(location.hash, DEFAULTS);
    syncControls();
    render();
    if (state.focus !== null) ui.reveal(state.focus);
  });

  window.addEventListener('keydown', onKey);
}

/* The one way state changes. Every caller hands over a patch; the hash, the
   controls and the list are brought back into agreement here. */
function update(patch, { replace = false, keepScroll = false } = {}) {
  state = { ...state, ...patch };
  const hash = writeHash(state, DEFAULTS);
  const url = location.pathname + location.search + hash;

  // Assigning location.hash fires hashchange, which would render twice and,
  // worse, jump the page to any element whose id matched. History API only.
  if (replace || keepScroll) history.replaceState(null, '', url);
  else history.pushState(null, '', url);

  syncControls();
  render();
}

/* Marking is the one change that does not go through update(): the hash does
   not carry marks, and while no mark filter is on, the row stays exactly where
   it is. Patching that row in place keeps the button you just pressed focused,
   which is what makes j/k/y/n work as a run. With a filter on, the row may no
   longer belong in the list at all, so the list is rebuilt. */
function setMark(track, mark) {
  marks = marking.set(marks, track, mark);
  marking.save(marks);

  if (state.mark === 'all') {
    ui.patchMark(track.index, mark, track.title);
    ui.setTally(marking.tally(CATALOGUE, marks), state.mark);
  } else {
    render();
  }
  ui.announce(`${track.title}: ${mark === 'unrated' ? 'not marked' : mark}`);
}

function syncControls() {
  if (ui.el.search.value !== state.q) ui.el.search.value = state.q;
  ui.el.sort.value = state.sort;
  ui.el.clear.hidden = state.q === '';
  ui.el.viewTracks.setAttribute('aria-pressed', String(state.view === 'tracks'));
  ui.el.viewArtists.setAttribute('aria-pressed', String(state.view === 'artists'));
  ui.el.app.dataset.view = state.view;
}

function render() {
  const queryTerms = terms(state.q);
  shown = CATALOGUE
    .filter((t) => matches(t, queryTerms))
    .filter((t) => state.mark === 'all' || marking.get(marks, t) === state.mark)
    .sort(SORTS[state.sort]);

  const ctx = { queryTerms, focusIndex: state.focus, marks };
  if (state.view === 'artists') ui.renderArtists(byArtist(shown), ctx);
  else ui.renderTracks(shown, ctx);

  ui.setResult(shown, CATALOGUE.length);
  ui.setTally(marking.tally(CATALOGUE, marks), state.mark);
}

/* Shuffle picks out of what is on screen, not out of the whole list. Filtering
   to "phonk" and hitting shuffle should give you phonk. */
function shuffle() {
  const track = pick(shown);
  if (!track) return;
  update({ focus: track.index }, { keepScroll: true });
  ui.reveal(track.index);
  ui.announce(`${track.title} by ${track.artists.join(', ')}`);
}

/* Keyboard. j/k because the list is long, / because every search box on the
   internet answers to it, and Enter to open the row you landed on. */
function onKey(e) {
  const typing = e.target.matches('input, select, textarea');

  if (e.key === '/' && !typing) {
    e.preventDefault();
    ui.el.search.select();
    return;
  }

  if (e.key === 'Escape') {
    if (state.q) update({ q: '', focus: null });
    if (typing) e.target.blur();
    return;
  }

  if (typing && e.key !== 'Enter') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[e.key];
  if (step) {
    e.preventDefault();
    move(step);
    return;
  }

  /* y / n mark the focused row and advance, so going through the list is
     j-y-y-n-y rather than a round trip to the mouse each time. x unmarks
     without moving, for when the answer was a mis-key. */
  const verdict = { y: 'known', n: 'unknown', x: 'unrated' }[e.key];
  if (verdict && state.focus !== null) {
    e.preventDefault();
    const track = BY_INDEX.get(state.focus);
    if (!track) return;
    setMark(track, verdict);
    if (verdict !== 'unrated' && state.mark === 'all') move(1);
    return;
  }

  if (e.key !== 'Enter') return;

  // Enter out of the search box means "take me to the results", not "open
  // something I have not looked at yet".
  if (state.focus === null) {
    if (!shown.length) return;
    e.preventDefault();
    update({ focus: shown[0].index }, { keepScroll: true });
    ui.reveal(shown[0].index);
    if (typing) ui.el.search.blur();
    return;
  }

  const open = ui.el.list.querySelector(`[data-index="${state.focus}"] .track-link`);
  if (open) { e.preventDefault(); open.click(); }
}

// Movement is through what is displayed, in display order — which in the
// artist view means a name can be passed through twice, once per group.
function move(step) {
  const rows = [...ui.el.list.querySelectorAll('.track')].map((r) => Number(r.dataset.index));
  if (!rows.length) return;
  const at = rows.indexOf(state.focus);
  const next = at === -1
    ? (step > 0 ? rows[0] : rows[rows.length - 1])
    : rows[Math.min(rows.length - 1, Math.max(0, at + step))];
  update({ focus: next }, { keepScroll: true });
  ui.reveal(next);
}

/* Theme: system, then light, then dark, then back. Stored because a choice
   that resets on reload is not a choice. */
const THEMES = ['system', 'light', 'dark'];

function applyStoredTheme() {
  setTheme(localStorage.getItem('lukebox.theme') ?? 'system');
}

function cycleTheme() {
  const now = document.documentElement.dataset.theme || 'system';
  setTheme(THEMES[(THEMES.indexOf(now) + 1) % THEMES.length]);
}

function setTheme(theme) {
  const value = THEMES.includes(theme) ? theme : 'system';
  document.documentElement.dataset.theme = value;
  ui.el.theme.textContent = value;
  ui.el.theme.setAttribute('aria-label', `Theme: ${value}. Click to change.`);
  try { localStorage.setItem('lukebox.theme', value); } catch { /* private mode */ }
}

main();

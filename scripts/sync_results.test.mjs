// scripts/sync_results.test.mjs
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { normalizeTeam, findFirebaseMatch, findFirebaseMatchForLive, resolveScores } from './sync_results.mjs';

// ─── normalizeTeam ─────────────────────────────────────────────────────────────

test('normalizeTeam: converts English names to Spanish aliases', () => {
  assert.equal(normalizeTeam('Korea Republic'), 'Corea del Sur');
  assert.equal(normalizeTeam('Czech Republic'), 'República Checa');
  assert.equal(normalizeTeam('United States'), 'Estados Unidos');
  assert.equal(normalizeTeam('Netherlands'), 'Países Bajos');
  assert.equal(normalizeTeam('Germany'), 'Alemania');
  assert.equal(normalizeTeam('France'), 'Francia');
  assert.equal(normalizeTeam('England'), 'Inglaterra');
  assert.equal(normalizeTeam('Switzerland'), 'Suiza');
  assert.equal(normalizeTeam('Morocco'), 'Marruecos');
  assert.equal(normalizeTeam('Ivory Coast'), 'Costa de Marfil');
  assert.equal(normalizeTeam('Bosnia-Herzegovina'), 'Bosnia');
  assert.equal(normalizeTeam('Bosnia and Herzegovina'), 'Bosnia');
});

test('normalizeTeam: already-Spanish names pass through unchanged', () => {
  assert.equal(normalizeTeam('Argentina'), 'Argentina');
  assert.equal(normalizeTeam('Brasil'), 'Brasil');
  assert.equal(normalizeTeam('Colombia'), 'Colombia');
});

test('normalizeTeam: case-insensitive', () => {
  assert.equal(normalizeTeam('korea republic'), 'Corea del Sur');
  assert.equal(normalizeTeam('GERMANY'), 'Alemania');
});

// ─── findFirebaseMatch (ESPN event shape) ─────────────────────────────────────

function makeEspnEvent(homeTeam, awayTeam, dateISO, homeScore = null, awayScore = null) {
  return {
    date: dateISO,
    competitions: [{
      competitors: [
        { team: { displayName: homeTeam }, score: homeScore },
        { team: { displayName: awayTeam }, score: awayScore },
      ],
    }],
  };
}

const firebaseMatches = [
  {
    id: 'abc',
    home: 'México',
    away: 'Sudáfrica',
    datetime: '2026-06-11T15:00:00.000-04:00',
    tournament: 'Mundial 2026',
    realHome: null,
    realAway: null,
  },
  {
    id: 'def',
    home: 'Corea del Sur',
    away: 'República Checa',
    datetime: '2026-06-11T22:00:00.000-04:00',
    tournament: 'Mundial 2026',
    realHome: null,
    realAway: null,
  },
  {
    id: 'ghi',
    home: 'Argentina',
    away: 'Francia',
    datetime: '2026-07-19T17:00:00.000-04:00',
    tournament: 'Mundial 2026',
    realHome: 3,
    realAway: 3,
  },
];

test('findFirebaseMatch: finds match by date and team names', () => {
  const event = makeEspnEvent('Mexico', 'South Africa', '2026-06-11T19:00:00Z', 2, 1);
  const result = findFirebaseMatch(event, firebaseMatches);
  assert.equal(result.id, 'abc');
});

test('findFirebaseMatch: returns null when no match exists', () => {
  const event = makeEspnEvent('Japan', 'Brazil', '2026-06-20T19:00:00Z', 1, 0);
  const result = findFirebaseMatch(event, firebaseMatches);
  assert.equal(result, null);
});

test('findFirebaseMatch: does not match games that already have a final result', () => {
  const event = makeEspnEvent('Argentina', 'France', '2026-07-19T21:00:00Z', 2, 2);
  const result = findFirebaseMatch(event, firebaseMatches);
  assert.equal(result, null);
});

test('findFirebaseMatch: handles ±1 day difference (UTC vs local)', () => {
  // Firebase stores datetime in UTC-4, ESPN gives UTC — the match should still work
  const event = makeEspnEvent('Mexico', 'South Africa', '2026-06-12T02:00:00Z', 1, 0);
  const result = findFirebaseMatch(event, firebaseMatches);
  assert.equal(result.id, 'abc');
});

test('findFirebaseMatch: matches when home/away order is swapped vs ESPN', () => {
  // Firebase stores Curazao(home) vs Ecuador(away); ESPN reports Ecuador(home) vs Curazao(away)
  const matches = [{
    id: 'swap', home: 'Curazao', away: 'Ecuador',
    datetime: '2026-06-21T00:00:00.000Z', tournament: 'Mundial 2026',
    realHome: null, realAway: null,
  }];
  const event = makeEspnEvent('Ecuador', 'Curaçao', '2026-06-21T00:00:00Z', 2, 1);
  const result = findFirebaseMatch(event, matches);
  assert.equal(result.id, 'swap');
});

// ─── resolveScores: align ESPN scores to the Firebase home/away orientation ───

test('resolveScores: same orientation keeps scores as-is', () => {
  const fm = { home: 'México', away: 'Sudáfrica' };
  // ESPN home=México 2, away=Sudáfrica 1
  assert.deepEqual(resolveScores(fm, 'México', 'Sudáfrica', 2, 1), { home: 2, away: 1 });
});

test('resolveScores: swapped orientation flips scores to match Firebase home/away', () => {
  const fm = { home: 'Curazao', away: 'Ecuador' };
  // ESPN home=Ecuador 2, away=Curazao 1 → for Firebase: Curazao(home)=1, Ecuador(away)=2
  assert.deepEqual(resolveScores(fm, 'Ecuador', 'Curazao', 2, 1), { home: 1, away: 2 });
});

// ─── findFirebaseMatchForLive (legacy football-data.org shape) ────────────────

test('findFirebaseMatchForLive: matches a live game', () => {
  const apiMatch = {
    utcDate: '2026-06-11T19:00:00Z',
    homeTeam: { name: 'Mexico' },
    awayTeam: { name: 'South Africa' },
    score: { fullTime: { home: null, away: null } },
    status: 'IN_PLAY',
  };
  const result = findFirebaseMatchForLive(apiMatch, firebaseMatches);
  assert.equal(result.id, 'abc');
});

test('findFirebaseMatchForLive: does not match if already has final result', () => {
  const apiMatch = {
    utcDate: '2026-07-19T21:00:00Z',
    homeTeam: { name: 'Argentina' },
    awayTeam: { name: 'France' },
    score: { fullTime: { home: null, away: null } },
    status: 'IN_PLAY',
  };
  const result = findFirebaseMatchForLive(apiMatch, firebaseMatches);
  assert.equal(result, null);
});

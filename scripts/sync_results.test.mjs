// scripts/sync_results.test.mjs
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { normalizeTeam, findFirebaseMatch, findFirebaseMatchForLive, resolveScores, matchOutcome, computeBracketUpdates, parsePeriods, resolveFinalUpdate } from './sync_results.mjs';

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

// ─── matchOutcome: winner / loser of a knockout match ─────────────────────────

test('matchOutcome: decisive result returns winner and loser', () => {
  assert.deepEqual(
    matchOutcome({ home: 'Brasil', away: 'Japón', realHome: 2, realAway: 0 }),
    { winner: 'Brasil', loser: 'Japón' });
  assert.deepEqual(
    matchOutcome({ home: 'Brasil', away: 'Japón', realHome: 0, realAway: 1 }),
    { winner: 'Japón', loser: 'Brasil' });
});

test('matchOutcome: draw uses `advances` (penalty winner)', () => {
  assert.deepEqual(
    matchOutcome({ home: 'Brasil', away: 'Japón', realHome: 1, realAway: 1, advances: 'Japón' }),
    { winner: 'Japón', loser: 'Brasil' });
});

test('matchOutcome: draw without `advances` is undecided', () => {
  assert.deepEqual(
    matchOutcome({ home: 'Brasil', away: 'Japón', realHome: 1, realAway: 1 }),
    { winner: null, loser: null });
});

test('matchOutcome: no result is undecided', () => {
  assert.deepEqual(
    matchOutcome({ home: 'Brasil', away: 'Japón', realHome: null, realAway: null }),
    { winner: null, loser: null });
  assert.deepEqual(matchOutcome(null), { winner: null, loser: null });
});

// ─── computeBracketUpdates: propagate winners through the bracket ──────────────

test('computeBracketUpdates: resolves an octavos slot from its two 16avos winners', () => {
  const matches = [
    { id: 'a', code: '16A', home: 'Alemania', away: 'Paraguay', realHome: 3, realAway: 0 },
    { id: 'b', code: '16B', home: 'Francia', away: 'Suecia', realHome: 1, realAway: 2 },
    { id: 'o', code: '8A', feedHome: '16A', feedAway: '16B', home: 'Ganador 16A', away: 'Ganador 16B' },
  ];
  const upd = computeBracketUpdates(matches);
  assert.deepEqual(upd['o'], { home: 'Alemania', away: 'Suecia' });
});

test('computeBracketUpdates: leaves placeholder when a feeder is undecided', () => {
  const matches = [
    { id: 'a', code: '16A', home: 'Alemania', away: 'Paraguay', realHome: null, realAway: null },
    { id: 'b', code: '16B', home: 'Francia', away: 'Suecia', realHome: 1, realAway: 2 },
    { id: 'o', code: '8A', feedHome: '16A', feedAway: '16B', home: 'Ganador 16A', away: 'Ganador 16B' },
  ];
  const upd = computeBracketUpdates(matches);
  // away resolves to Suecia, home stays placeholder → still an update for the away change
  assert.deepEqual(upd['o'], { home: 'Ganador 16A', away: 'Suecia' });
});

test('computeBracketUpdates: cascades octavos → cuartos in one call', () => {
  const matches = [
    { id: 'a', code: '16A', home: 'Alemania', away: 'Paraguay', realHome: 3, realAway: 0 },
    { id: 'b', code: '16B', home: 'Francia', away: 'Suecia', realHome: 1, realAway: 2 },
    { id: 'c', code: '16C', home: 'Sudáfrica', away: 'Canadá', realHome: 0, realAway: 2 },
    { id: 'd', code: '16D', home: 'Países Bajos', away: 'Marruecos', realHome: 1, realAway: 0 },
    { id: 'o1', code: '8A', feedHome: '16A', feedAway: '16B', home: 'Ganador 16A', away: 'Ganador 16B', realHome: 2, realAway: 1 },
    { id: 'o2', code: '8B', feedHome: '16C', feedAway: '16D', home: 'Ganador 16C', away: 'Ganador 16D', realHome: 0, realAway: 1 },
    { id: 'q', code: '4A', feedHome: '8A', feedAway: '8B', home: 'Ganador 8A', away: 'Ganador 8B' },
  ];
  const upd = computeBracketUpdates(matches);
  // 16A Alemania 3-0 → Alemania; 16B Francia 1-2 Suecia → Suecia
  assert.deepEqual(upd['o1'], { home: 'Alemania', away: 'Suecia' });
  // 16C Sudáfrica 0-2 Canadá → Canadá; 16D PB 1-0 Marruecos → Países Bajos
  assert.deepEqual(upd['o2'], { home: 'Canadá', away: 'Países Bajos' });
  // 8A: Alemania 2-1 Suecia → Alemania; 8B: Canadá 0-1 Países Bajos → Países Bajos
  assert.deepEqual(upd['q'], { home: 'Alemania', away: 'Países Bajos' });
});

test('computeBracketUpdates: loser feeder (L_) resolves third-place match', () => {
  const matches = [
    { id: 's1', code: '2A', home: 'Argentina', away: 'Brasil', realHome: 1, realAway: 0 },
    { id: 's2', code: '2B', home: 'Francia', away: 'España', realHome: 2, realAway: 3 },
    { id: 't', code: '3P', feedHome: 'L_2A', feedAway: 'L_2B', home: 'Perdedor 2A', away: 'Perdedor 2B' },
  ];
  const upd = computeBracketUpdates(matches);
  assert.deepEqual(upd['t'], { home: 'Brasil', away: 'Francia' });
});

test('computeBracketUpdates: returns no update for already-correct matches', () => {
  const matches = [
    { id: 'a', code: '16A', home: 'Alemania', away: 'Paraguay', realHome: 3, realAway: 0 },
    { id: 'b', code: '16B', home: 'Francia', away: 'Suecia', realHome: 1, realAway: 2 },
    { id: 'o', code: '8A', feedHome: '16A', feedAway: '16B', home: 'Alemania', away: 'Suecia' },
  ];
  const upd = computeBracketUpdates(matches);
  assert.equal(upd['o'], undefined);
});

// ─── parsePeriods: 90' / 120' / penales desde linescores de ESPN ──────────────

const ls = (...nums) => nums.map(n => ({ displayValue: String(n) }));

test('parsePeriods: solo 90 minutos (2 períodos)', () => {
  assert.deepEqual(
    parsePeriods(ls(2, 1), ls(0, 1)),
    { reg90: [3, 1], score120: null, pen: null });
});

test('parsePeriods: fue a alargue sin penales (4 períodos)', () => {
  // home 1ºT1 2ºT0 ET1 0 ET2 1 = 90'→1, 120'→2 ; away 1 1 0 0 = 90'→2, 120'→2
  assert.deepEqual(
    parsePeriods(ls(1, 0, 0, 1), ls(1, 1, 0, 0)),
    { reg90: [1, 2], score120: [2, 2], pen: null });
});

test('parsePeriods: penales (5 períodos) — final 2022 Argentina', () => {
  // Argentina [2,0,0,1,4] vs Francia [0,2,0,1,2]
  assert.deepEqual(
    parsePeriods(ls(2, 0, 0, 1, 4), ls(0, 2, 0, 1, 2)),
    { reg90: [2, 2], score120: [3, 3], pen: [4, 2] });
});

test('parsePeriods: datos inválidos o insuficientes → null', () => {
  assert.equal(parsePeriods(ls(1), ls(0)), null);
  assert.equal(parsePeriods(null, null), null);
  assert.equal(parsePeriods(ls('x', 1), ls(0, 0)), null);
});

// ─── resolveFinalUpdate: qué se escribe respetando "puntúa el 90'" ────────────

test('resolveFinalUpdate: grupos usa el score del scoreboard (es 90)', () => {
  assert.deepEqual(
    resolveFinalUpdate({ stage: 'Grupo C · Miami', scoreHome: 3, scoreAway: 1 }),
    { liveHome: null, liveAway: null, realHome: 3, realAway: 1 });
});

test('resolveFinalUpdate: KO regulación → real* = 90, sin extras', () => {
  assert.deepEqual(
    resolveFinalUpdate({ stage: 'Octavos', periods: { reg90: [2, 0], score120: null, pen: null }, winnerName: 'Francia' }),
    { liveHome: null, liveAway: null, realHome: 2, realAway: 0, advances: 'Francia' });
});

test('resolveFinalUpdate: KO con penales → real*=90, score120*, pen*, advances', () => {
  assert.deepEqual(
    resolveFinalUpdate({ stage: 'Final', periods: { reg90: [1, 1], score120: [2, 2], pen: [3, 4] }, winnerName: 'Argentina' }),
    { liveHome: null, liveAway: null, realHome: 1, realAway: 1, score120Home: 2, score120Away: 2, penHome: 3, penAway: 4, advances: 'Argentina' });
});

test('resolveFinalUpdate: KO sin desglose (summary falló) → no escribe score, solo advances', () => {
  assert.deepEqual(
    resolveFinalUpdate({ stage: 'Cuartos de Final', periods: null, winnerName: 'Brasil' }),
    { liveHome: null, liveAway: null, advances: 'Brasil' });
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

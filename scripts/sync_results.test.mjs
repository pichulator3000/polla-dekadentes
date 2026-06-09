// scripts/sync_results.test.mjs
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { normalizeTeam, findFirebaseMatch, findFirebaseMatchForLive } from './sync_results.mjs';

test('normalizeTeam: convierte nombre inglés a español', () => {
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
});

test('normalizeTeam: nombres ya en español pasan sin cambio', () => {
  assert.equal(normalizeTeam('Argentina'), 'Argentina');
  assert.equal(normalizeTeam('Brasil'), 'Brasil');
  assert.equal(normalizeTeam('Colombia'), 'Colombia');
});

test('normalizeTeam: case-insensitive', () => {
  assert.equal(normalizeTeam('korea republic'), 'Corea del Sur');
  assert.equal(normalizeTeam('GERMANY'), 'Alemania');
});

test('findFirebaseMatch: encuentra partido por fecha y equipos', () => {
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
  ];

  const apiMatch = {
    utcDate: '2026-06-11T19:00:00Z',
    homeTeam: { name: 'Mexico' },
    awayTeam: { name: 'South Africa' },
    score: { fullTime: { home: 2, away: 1 } },
    status: 'FINISHED',
  };

  const result = findFirebaseMatch(apiMatch, firebaseMatches);
  assert.equal(result.id, 'abc');
});

test('findFirebaseMatch: retorna null si no hay match', () => {
  const firebaseMatches = [
    {
      id: 'abc',
      home: 'Argentina',
      away: 'Brasil',
      datetime: '2026-06-15T21:00:00.000-04:00',
      tournament: 'Mundial 2026',
      realHome: null,
      realAway: null,
    },
  ];

  const apiMatch = {
    utcDate: '2026-06-11T19:00:00Z',
    homeTeam: { name: 'Mexico' },
    awayTeam: { name: 'South Africa' },
    score: { fullTime: { home: 2, away: 1 } },
    status: 'FINISHED',
  };

  const result = findFirebaseMatch(apiMatch, firebaseMatches);
  assert.equal(result, null);
});

test('findFirebaseMatch: no matchea partidos ya con resultado', () => {
  const firebaseMatches = [
    {
      id: 'abc',
      home: 'México',
      away: 'Sudáfrica',
      datetime: '2026-06-11T15:00:00.000-04:00',
      tournament: 'Mundial 2026',
      realHome: 2,
      realAway: 1,
    },
  ];

  const apiMatch = {
    utcDate: '2026-06-11T19:00:00Z',
    homeTeam: { name: 'Mexico' },
    awayTeam: { name: 'South Africa' },
    score: { fullTime: { home: 2, away: 1 } },
    status: 'FINISHED',
  };

  const result = findFirebaseMatch(apiMatch, firebaseMatches);
  assert.equal(result, null);
});

test('findFirebaseMatchForLive: matchea partido en vivo', () => {
  const firebaseMatches = [
    {
      id: 'abc',
      home: 'Argentina',
      away: 'Francia',
      datetime: '2026-07-19T17:00:00.000-04:00',
      tournament: 'Mundial 2026',
      realHome: null,
      realAway: null,
      liveHome: 1,
      liveAway: 0,
    },
  ];

  const apiMatch = {
    utcDate: '2026-07-19T21:00:00Z',
    homeTeam: { name: 'Argentina' },
    awayTeam: { name: 'France' },
    score: { fullTime: { home: null, away: null } },
    status: 'IN_PLAY',
  };

  const result = findFirebaseMatchForLive(apiMatch, firebaseMatches);
  assert.equal(result.id, 'abc');
});

test('findFirebaseMatchForLive: no matchea si ya tiene resultado final', () => {
  const firebaseMatches = [
    {
      id: 'abc',
      home: 'Argentina',
      away: 'Francia',
      datetime: '2026-07-19T17:00:00.000-04:00',
      tournament: 'Mundial 2026',
      realHome: 3,
      realAway: 3,
    },
  ];

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

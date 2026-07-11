import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { podioPointsFor } from './simulator.mjs';

const PTS = { champion: 100, runner: 50, scorer: 50 };

test('podioPointsFor: acierta los tres', () => {
  const user = { champion: 'Brasil', runner: 'Francia', scorer: 'Mbappé' };
  const of   = { champion: 'brasil', runner: 'FRANCIA', scorer: ' mbappé ' };
  const r = podioPointsFor(user, of, PTS);
  assert.deepEqual(r, { total: 200, champion: 100, runner: 50, scorer: 50 });
});

test('podioPointsFor: acierta solo campeón', () => {
  const user = { champion: 'Brasil', runner: 'Chile', scorer: 'X' };
  const of   = { champion: 'Brasil', runner: 'Francia', scorer: 'Mbappé' };
  const r = podioPointsFor(user, of, PTS);
  assert.deepEqual(r, { total: 100, champion: 100, runner: 0, scorer: 0 });
});

test('podioPointsFor: oficial vacío no da puntos', () => {
  const user = { champion: 'Brasil', runner: 'Francia', scorer: 'Mbappé' };
  const of   = { champion: '', runner: '', scorer: '' };
  assert.deepEqual(podioPointsFor(user, of, PTS), { total: 0, champion: 0, runner: 0, scorer: 0 });
});

test('podioPointsFor: userPodio u oficial null -> ceros', () => {
  assert.deepEqual(podioPointsFor(null, { champion: 'Brasil' }, PTS), { total: 0, champion: 0, runner: 0, scorer: 0 });
  assert.deepEqual(podioPointsFor({ champion: 'Brasil' }, null, PTS), { total: 0, champion: 0, runner: 0, scorer: 0 });
});

import { aliveTeams, predictedScorers } from './simulator.mjs';

test('aliveTeams: elimina perdedores de KO jugados, mantiene el resto', () => {
  const matches = [
    // grupo: no elimina a nadie aunque haya resultado
    { stage: 'Grupo A', home: 'Brasil', away: 'Serbia', realHome: 2, realAway: 0 },
    // KO jugado: gana Brasil, elimina a Chile
    { stage: 'Octavos', home: 'Brasil', away: 'Chile', realHome: 1, realAway: 0 },
    // KO por diferencia a favor de visita: elimina a Francia
    { stage: 'Octavos', home: 'Argentina', away: 'Francia', realHome: 3, realAway: 0 },
    // KO empate 90' -> decide advances: pasa Uruguay, elimina a España
    { stage: 'Cuartos de Final', home: 'España', away: 'Uruguay', realHome: 1, realAway: 1, advances: 'Uruguay' },
    // KO sin jugar: no elimina
    { stage: 'Semifinal', home: 'Por definir', away: 'Por definir', realHome: null, realAway: null },
  ];
  assert.deepEqual(aliveTeams(matches), ['Argentina', 'Brasil', 'Serbia', 'Uruguay']);
});

test('aliveTeams: ignora "Por definir" y no duplica', () => {
  const matches = [
    { stage: 'Grupo A', home: 'Brasil', away: 'Brasil', realHome: null, realAway: null },
    { stage: 'Semifinal', home: 'Por definir', away: 'Por definir', realHome: null, realAway: null },
  ];
  assert.deepEqual(aliveTeams(matches), ['Brasil']);
});

test('predictedScorers: distintos, sin vacíos, trim, ordenados', () => {
  const podios = [
    { scorer: 'Messi' }, { scorer: 'Messi' /* duplicado exacto se colapsa */ },
    { scorer: '  Haaland  ' }, { scorer: 'Mbappé' }, { scorer: '' }, { scorer: null }, {},
  ];
  assert.deepEqual(predictedScorers(podios), ['Haaland', 'Mbappé', 'Messi']);
});

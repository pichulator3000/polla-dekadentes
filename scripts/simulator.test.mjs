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

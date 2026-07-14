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

test('podioPointsFor: sin fuzzyScorer el goleador es estricto (no colapsa tildes/apellido)', () => {
  const user = { champion: '', runner: '', scorer: 'Kane' };
  const of   = { champion: '', runner: '', scorer: 'Harry Kane' };
  assert.deepEqual(podioPointsFor(user, of, PTS), { total: 0, champion: 0, runner: 0, scorer: 0 });
});

test('podioPointsFor: con canonTeam estandariza campeón/subcampeón (alias/tildes/typos)', () => {
  const canon = (raw) => {
    const alias = { brazil: 'Brasil', espana: 'España', spain: 'España' };
    const s = (raw || '').trim();
    const base = alias[s.toLowerCase()] || s;
    return base.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  };
  const of = { champion: 'Brasil', runner: 'España', scorer: '' };
  assert.equal(podioPointsFor({ champion: 'brazil' }, of, PTS, { canonTeam: canon }).champion, 100);
  assert.equal(podioPointsFor({ runner: 'espana'   }, of, PTS, { canonTeam: canon }).runner, 50);
  assert.equal(podioPointsFor({ runner: 'Spain'    }, of, PTS, { canonTeam: canon }).runner, 50);
  assert.equal(podioPointsFor({ champion: 'Chile'  }, of, PTS, { canonTeam: canon }).champion, 0);
});

test('podioPointsFor: con fuzzyScorer colapsa tildes y apellido', () => {
  const PTS2 = { champion: 100, runner: 50, scorer: 50 };
  const of = { champion: '', runner: '', scorer: 'Harry Kane' };
  assert.equal(podioPointsFor({ scorer: 'Kane'   }, of, PTS2, { fuzzyScorer: true }).scorer, 50);
  assert.equal(podioPointsFor({ scorer: 'kane'   }, of, PTS2, { fuzzyScorer: true }).scorer, 50);
  const of2 = { champion: '', runner: '', scorer: 'Mbappé' };
  assert.equal(podioPointsFor({ scorer: 'Mbappe' }, of2, PTS2, { fuzzyScorer: true }).scorer, 50);
  assert.equal(podioPointsFor({ scorer: 'Messi'  }, of2, PTS2, { fuzzyScorer: true }).scorer, 0);
});

import { aliveTeams, predictedScorers } from './simulator.mjs';

test('aliveTeams: con KO iniciado, solo equipos del KO no eliminados (grupo fuera)', () => {
  const matches = [
    // grupo: Serbia perdió y NO llegó al KO -> no debe aparecer como viva
    { stage: 'Grupo A', home: 'Brasil', away: 'Serbia', realHome: 2, realAway: 0 },
    // KO jugado: gana Brasil, elimina a Chile
    { stage: 'Octavos', home: 'Brasil', away: 'Chile', realHome: 1, realAway: 0 },
    // KO por diferencia a favor de local: elimina a Francia
    { stage: 'Octavos', home: 'Argentina', away: 'Francia', realHome: 3, realAway: 0 },
    // KO empate 90' -> decide advances: pasa Uruguay, elimina a España
    { stage: 'Cuartos de Final', home: 'España', away: 'Uruguay', realHome: 1, realAway: 1, advances: 'Uruguay' },
    // KO sin jugar: no elimina
    { stage: 'Semifinal', home: 'Por definir', away: 'Por definir', realHome: null, realAway: null },
  ];
  assert.deepEqual(aliveTeams(matches), ['Argentina', 'Brasil', 'Uruguay']);
});

test('aliveTeams: canonTeam excluye placeholders (Ganador/Perdedor/Por definir)', () => {
  // canonTeam simula el de la app: '' para no-países, minúsculas para países.
  const canon = (raw) => {
    const t = (raw || '').trim();
    if (!t || t === 'Por definir' || /^(Ganador|Perdedor)/i.test(t)) return '';
    return t.toLowerCase();
  };
  const matches = [
    { stage: 'Cuartos de Final', home: 'Brasil', away: 'Ganador 2A', realHome: null, realAway: null },
    { stage: 'Cuartos de Final', home: 'Argentina', away: 'Uruguay', realHome: 2, realAway: 0 }, // Uruguay eliminado
    { stage: 'Semifinal', home: 'Por definir', away: 'Por definir', realHome: null, realAway: null },
  ];
  assert.deepEqual(aliveTeams(matches, canon), ['Argentina', 'Brasil']);
});

test('aliveTeams: aún en fase de grupos (sin KO real) muestra todos', () => {
  const matches = [
    { stage: 'Grupo A', home: 'Brasil', away: 'Serbia', realHome: 2, realAway: 0 },
    { stage: 'Grupo B', home: 'Chile', away: 'Perú', realHome: null, realAway: null },
    { stage: 'Octavos', home: 'Por definir', away: 'Por definir', realHome: null, realAway: null },
  ];
  assert.deepEqual(aliveTeams(matches), ['Brasil', 'Chile', 'Perú', 'Serbia']);
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

test('predictedScorers: colapsa tildes y apellido, muestra el nombre más completo', () => {
  const podios = [
    { scorer: 'Kane' }, { scorer: 'Harry Kane' },       // apellido vs nombre completo
    { scorer: 'Mbappe' }, { scorer: 'Mbappé' },          // sin tilde vs con tilde
    { scorer: 'Julián Álvarez' }, { scorer: 'alvarez' }, // tilde + mayúsculas + apellido
  ];
  assert.deepEqual(predictedScorers(podios), ['Harry Kane', 'Julián Álvarez', 'Mbappé']);
});

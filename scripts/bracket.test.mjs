import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBracketTree, KO_STAGES } from './bracket.mjs';

// Mini bracket: 4 partidos R32 → 2 Octavos → 1 Cuartos (+ grupo y tercer puesto)
function sampleMatches() {
  return [
    // ruido: un partido de grupo que debe filtrarse
    { code: 'G1', stage: 'Grupo A', home: 'Chile', away: 'Perú' },
    // R32
    { code: 'R1', stage: 'Ronda de 32', home: 'Brasil', away: 'Corea' },
    { code: 'R2', stage: 'Ronda de 32', home: 'México', away: 'Holanda' },
    { code: 'R3', stage: 'Ronda de 32', home: 'Francia', away: 'Senegal' },
    { code: 'R4', stage: 'Ronda de 32', home: 'Japón', away: 'Argentina' },
    // Octavos
    { code: 'O1', stage: 'Octavos', feedHome: 'R1', feedAway: 'R2', home: 'Brasil', away: 'Holanda' },
    { code: 'O2', stage: 'Octavos', feedHome: 'R3', feedAway: 'R4', home: 'Francia', away: 'Argentina' },
    // Cuartos (final de este sub-árbol)
    { code: 'C1', stage: 'Cuartos de Final', feedHome: 'O1', feedAway: 'O2', home: 'Brasil', away: 'Argentina' },
  ];
}

test('KO_STAGES tiene las 5 rondas en orden', () => {
  assert.deepEqual(KO_STAGES, ['Ronda de 32','Octavos','Cuartos de Final','Semifinal','Final']);
});

test('columns: solo rondas KO no vacías, en orden', () => {
  const { columns } = buildBracketTree(sampleMatches());
  assert.deepEqual(columns.map(c => c.stage), ['Ronda de 32','Octavos','Cuartos de Final']);
  assert.equal(columns[0].matches.length, 4);
  assert.equal(columns[1].matches.length, 2);
  assert.equal(columns[2].matches.length, 1);
});

test('filtra partidos de grupo', () => {
  const { columns } = buildBracketTree(sampleMatches());
  const allCodes = columns.flatMap(c => c.matches.map(m => m.code));
  assert.ok(!allCodes.includes('G1'));
});

test('orden vertical: R32 sigue el árbol (R1,R2,R3,R4)', () => {
  // raíz = el de mayor ronda presente (Cuartos aquí). Sin Final, usa la ronda más alta como raíz.
  const { columns } = buildBracketTree(sampleMatches());
  const r32 = columns[0].matches.map(m => m.code);
  assert.deepEqual(r32, ['R1','R2','R3','R4']);
  const octavos = columns[1].matches.map(m => m.code);
  assert.deepEqual(octavos, ['O1','O2']);
});

test('tercer puesto se separa en thirdPlace', () => {
  const ms = sampleMatches();
  ms.push({ code: 'TP', stage: 'Tercer Puesto', feedHome: 'L_O1', feedAway: 'L_O2', home: 'Holanda', away: 'Francia' });
  const { columns, thirdPlace } = buildBracketTree(ms);
  assert.equal(thirdPlace.code, 'TP');
  const allCodes = columns.flatMap(c => c.matches.map(m => m.code));
  assert.ok(!allCodes.includes('TP'));
});

test('sin partidos KO devuelve columns vacío y thirdPlace null', () => {
  const { columns, thirdPlace } = buildBracketTree([{ code: 'G1', stage: 'Grupo A' }]);
  assert.deepEqual(columns, []);
  assert.equal(thirdPlace, null);
});

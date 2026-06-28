import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isGroupStage, matchAdvanceOutcome, playerAdvanceGuess, advancePoints } from './scoring.mjs';

const KO = (over = {}) => ({ id:'m1', code:'8A', stage:'Octavos', home:'Brasil', away:'Chile', realHome:null, realAway:null, ...over });
const pred = (o) => ({ matchId:'m1', userId:'u', predHome:0, predAway:0, ...o });

test('isGroupStage', () => {
  assert.equal(isGroupStage('Grupo A'), true);
  assert.equal(isGroupStage('Octavos'), false);
});

test('matchAdvanceOutcome: ganador en 90', () => {
  assert.deepEqual(matchAdvanceOutcome(KO({ realHome:2, realAway:1 })), { advancer:'Brasil', method:'90' });
});

test('matchAdvanceOutcome: empate 90, avanza por penales', () => {
  assert.deepEqual(
    matchAdvanceOutcome(KO({ realHome:1, realAway:1, score120Home:1, score120Away:1, penHome:4, penAway:2, advances:'Brasil' })),
    { advancer:'Brasil', method:'pen' });
});

test('matchAdvanceOutcome: empate 90, avanza en alargue', () => {
  assert.deepEqual(
    matchAdvanceOutcome(KO({ realHome:1, realAway:1, score120Home:2, score120Away:1, advances:'Brasil' })),
    { advancer:'Brasil', method:'120' });
});

test('matchAdvanceOutcome: sin resultado', () => {
  assert.deepEqual(matchAdvanceOutcome(KO()), { advancer:null, method:null });
});

test('playerAdvanceGuess: ganador implica 90', () => {
  assert.deepEqual(playerAdvanceGuess(pred({ predHome:2, predAway:0 }), KO()), { team:'Brasil', method:'90' });
  assert.deepEqual(playerAdvanceGuess(pred({ predHome:0, predAway:2 }), KO()), { team:'Chile', method:'90' });
});

test('playerAdvanceGuess: empate usa campos explicitos', () => {
  assert.deepEqual(
    playerAdvanceGuess(pred({ predHome:1, predAway:1, predAdvances:'Brasil', predMethod:'pen' }), KO()),
    { team:'Brasil', method:'pen' });
});

test('advancePoints: grupo -> 0', () => {
  const m = { id:'m1', stage:'Grupo A', home:'Brasil', away:'Chile', realHome:2, realAway:1 };
  assert.equal(advancePoints({ pred: pred({ predHome:2, predAway:1 }), match:m, allPreds:[pred({ predHome:2, predAway:1 })], pool:20 }), 0);
});

test('advancePoints: sin resultado -> null', () => {
  assert.equal(advancePoints({ pred: pred({ predHome:2, predAway:1 }), match:KO(), allPreds:[], pool:20 }), null);
});

test('advancePoints: ganador 90 acertado quien+como -> base*1.5', () => {
  const m = KO({ realHome:2, realAway:1 });
  const ps = [pred({ userId:'a', predHome:2, predAway:1 }), pred({ userId:'b', predHome:3, predAway:0 })];
  // N=2 aciertan Brasil; base=10; ambos predijeron ganador (metodo 90) y fue 90 -> 15
  assert.equal(advancePoints({ pred: ps[0], match:m, allPreds:ps, pool:20 }), 15);
});

test('advancePoints: ganador-predictor correcto pero fue penales -> solo base', () => {
  const m = KO({ realHome:1, realAway:1, penHome:4, penAway:2, advances:'Brasil' });
  const ps = [pred({ userId:'a', predHome:2, predAway:1 })]; // dijo Brasil gana en 90
  // acierta quien (Brasil) pero metodo 90 != pen -> base = 20/1 = 20
  assert.equal(advancePoints({ pred: ps[0], match:m, allPreds:ps, pool:20 }), 20);
});

test('advancePoints: empate-predictor quien+metodo correcto -> base*1.5', () => {
  const m = KO({ realHome:1, realAway:1, penHome:4, penAway:2, advances:'Brasil' });
  const ps = [pred({ userId:'a', predHome:1, predAway:1, predAdvances:'Brasil', predMethod:'pen' })];
  assert.equal(advancePoints({ pred: ps[0], match:m, allPreds:ps, pool:20 }), 30);
});

test('advancePoints: equipo correcto, metodo incorrecto -> base', () => {
  const m = KO({ realHome:1, realAway:1, penHome:4, penAway:2, advances:'Brasil' });
  const ps = [pred({ userId:'a', predHome:1, predAway:1, predAdvances:'Brasil', predMethod:'120' })];
  assert.equal(advancePoints({ pred: ps[0], match:m, allPreds:ps, pool:20 }), 20);
});

test('advancePoints: no acierta quien -> 0', () => {
  const m = KO({ realHome:2, realAway:1 });
  const ps = [pred({ userId:'a', predHome:0, predAway:2 })]; // dijo gana Chile
  assert.equal(advancePoints({ pred: ps[0], match:m, allPreds:ps, pool:20 }), 0);
});

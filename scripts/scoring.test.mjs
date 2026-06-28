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
  assert.equal(matchAdvanceOutcome(KO({ realHome:2, realAway:1 })), 'Brasil');
});
test('matchAdvanceOutcome: empate 90 usa advances', () => {
  assert.equal(matchAdvanceOutcome(KO({ realHome:1, realAway:1, advances:'Brasil' })), 'Brasil');
});
test('matchAdvanceOutcome: empate sin advances -> null', () => {
  assert.equal(matchAdvanceOutcome(KO({ realHome:1, realAway:1 })), null);
});
test('matchAdvanceOutcome: sin resultado -> null', () => {
  assert.equal(matchAdvanceOutcome(KO()), null);
});

test('playerAdvanceGuess: ganador', () => {
  assert.equal(playerAdvanceGuess(pred({ predHome:2, predAway:0 }), KO()), 'Brasil');
  assert.equal(playerAdvanceGuess(pred({ predHome:0, predAway:2 }), KO()), 'Chile');
});
test('playerAdvanceGuess: empate usa predAdvances', () => {
  assert.equal(playerAdvanceGuess(pred({ predHome:1, predAway:1, predAdvances:'Brasil' }), KO()), 'Brasil');
});
test('playerAdvanceGuess: empate sin predAdvances -> null', () => {
  assert.equal(playerAdvanceGuess(pred({ predHome:1, predAway:1 }), KO()), null);
});

test('advancePoints: grupo -> 0', () => {
  const m = { id:'m1', stage:'Grupo A', home:'Brasil', away:'Chile', realHome:2, realAway:1 };
  assert.equal(advancePoints({ pred: pred({ predHome:2, predAway:1 }), match:m, allPreds:[pred({ predHome:2, predAway:1 })], pool:20 }), 0);
});
test('advancePoints: sin resultado -> null', () => {
  assert.equal(advancePoints({ pred: pred({ predHome:2, predAway:1 }), match:KO(), allPreds:[], pool:20 }), null);
});
test('advancePoints: acierta quien pasa, reparto pool/N', () => {
  const m = KO({ realHome:2, realAway:1 });
  const ps = [pred({ userId:'a', predHome:2, predAway:1 }), pred({ userId:'b', predHome:3, predAway:0 })];
  assert.equal(advancePoints({ pred: ps[0], match:m, allPreds:ps, pool:20 }), 10);
});
test('advancePoints: empate-predictor acierta quien -> pool/N', () => {
  const m = KO({ realHome:1, realAway:1, advances:'Brasil' });
  const ps = [pred({ userId:'a', predHome:1, predAway:1, predAdvances:'Brasil' })];
  assert.equal(advancePoints({ pred: ps[0], match:m, allPreds:ps, pool:20 }), 20);
});
test('advancePoints: no acierta quien -> 0', () => {
  const m = KO({ realHome:2, realAway:1 });
  const ps = [pred({ userId:'a', predHome:0, predAway:2 })];
  assert.equal(advancePoints({ pred: ps[0], match:m, allPreds:ps, pool:20 }), 0);
});

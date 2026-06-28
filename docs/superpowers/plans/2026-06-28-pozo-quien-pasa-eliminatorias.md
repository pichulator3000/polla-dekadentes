# Pozo "quién pasa" en eliminatorias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un segundo pozo de puntos (default 20) por partido de fase final que se reparte entre quienes aciertan qué equipo avanza, con ×1.5 si también aciertan cómo (90' / 120' / penales).

**Architecture:** La lógica pura de puntaje vive en un módulo nuevo `scripts/scoring.mjs` (testeable con node:test). `index.html` la importa con un `<script type="module">` que la expone en `window`, y la usa en un helper `totalPoints()` que suma el pozo de resultado existente + el nuevo. La UI agrega inputs de "quién pasa / cómo" cuando el jugador predice empate en un KO.

**Tech Stack:** HTML/JS vanilla (global functions en `index.html`), Firebase Realtime DB, node:test para unit tests.

## Global Constraints

- Solo aplica a **partidos de fase final** (KO). Grupos → 0. Identificación de KO: `normStage(m.stage)` no empieza con "Grupo" (equivalente: presencia de `m.code`).
- Pozo `advancePool`: setting `pf/settings/advancePool`, default **20**.
- Métodos posibles: `'90'`, `'120'`, `'pen'`.
- Quién pasó realmente: gana local/visita si hay diferencia a los 90' (`realHome`/`realAway`); si empate a 90', `m.advances`.
- Cómo pasó realmente: `'pen'` si `penHome != null`; si no `'120'` si `score120Home != null`; si no `'90'`.
- Reparto: `base = advancePool / N` (N = acertadores de quién pasa), `×1.5` si además acierta método. Redondeo `Math.round(x*100)/100`.
- Campos de predicción nuevos (`predAdvances`, `predMethod`) **solo** presentes cuando el marcador predicho es empate; se limpian al cambiar a no-empate.

---

### Task 1: Módulo puro de puntaje `scripts/scoring.mjs`

**Files:**
- Create: `scripts/scoring.mjs`
- Test: `scripts/scoring.test.mjs`

**Interfaces:**
- Produces:
  - `isGroupStage(stage: string): boolean` — `true` si el stage es de grupos.
  - `matchAdvanceOutcome(m): { advancer: string|null, method: '90'|'120'|'pen'|null }` — quién pasó y cómo, según el partido finalizado.
  - `playerAdvanceGuess(pred, m): { team: string|null, method: '90'|'120'|'pen'|null }` — qué equipo/método predijo el jugador.
  - `advancePoints({ pred, match, allPreds, pool }): number|null` — puntos del pozo de avance para esa predicción. `null` si no aplica/sin resultado; `0` si no acierta.

- [ ] **Step 1: Write the failing test**

Create `scripts/scoring.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './scoring.mjs'` o exports indefinidos.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/scoring.mjs`:

```js
// Lógica pura del pozo "quién pasa" en eliminatorias.
// Sin dependencias de DOM/Firebase; testeable con node:test e importable desde index.html.

export function isGroupStage(stage) {
  return typeof stage === 'string' && stage.startsWith('Grupo');
}

// Quién pasó realmente y cómo. method: '90' (regulación), '120' (alargue), 'pen'.
export function matchAdvanceOutcome(m) {
  if (!m || m.realHome == null || m.realAway == null) return { advancer: null, method: null };
  let advancer = null;
  if (m.realHome > m.realAway) advancer = m.home;
  else if (m.realAway > m.realHome) advancer = m.away;
  else if (m.advances === m.home || m.advances === m.away) advancer = m.advances;
  if (advancer == null) return { advancer: null, method: null };
  let method = '90';
  if (m.penHome != null) method = 'pen';
  else if (m.score120Home != null) method = '120';
  return { advancer, method };
}

// Qué equipo/método apostó el jugador. Ganador => método '90' implícito.
export function playerAdvanceGuess(pred, m) {
  if (!pred || !m) return { team: null, method: null };
  if (pred.predHome > pred.predAway) return { team: m.home, method: '90' };
  if (pred.predAway > pred.predHome) return { team: m.away, method: '90' };
  return { team: pred.predAdvances ?? null, method: pred.predMethod ?? null };
}

// Puntos del pozo de avance para una predicción. null si no aplica/sin resultado.
export function advancePoints({ pred, match, allPreds, pool }) {
  if (!match || isGroupStage(match.stage)) return 0;
  const { advancer, method } = matchAdvanceOutcome(match);
  if (advancer == null) return null;
  const guess = playerAdvanceGuess(pred, match);
  if (guess.team !== advancer) return 0;
  const winners = (allPreds || []).filter(p => {
    if (p.matchId !== match.id) return false;
    return playerAdvanceGuess(p, match).team === advancer;
  });
  const n = winners.length || 1;
  const base = pool / n;
  const got = guess.method === method ? base * 1.5 : base;
  return Math.round(got * 100) / 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (todos los tests de `scoring.test.mjs` + los existentes de `sync_results.test.mjs`).

- [ ] **Step 5: Commit**

```bash
git add scripts/scoring.mjs scripts/scoring.test.mjs
git commit -m "feat(scoring): módulo puro del pozo quién pasa en eliminatorias

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Wiring del módulo en `index.html` + `getAdvancePool` + `totalPoints`

**Files:**
- Modify: `index.html` (tras los `<script src=...>` de CDN, antes del `<script>` principal en línea 1094; y junto a `getPoolForStage` ~línea 2963)

**Interfaces:**
- Consumes: `advancePoints`, `matchAdvanceOutcome`, `playerAdvanceGuess` (Task 1).
- Produces (globals en `index.html`):
  - `getAdvancePool(): number` — lee `pf/settings/advancePool`, default 20.
  - `calcAdvancePoints(pred, m, preds): number|null`.
  - `totalPoints(pred, m, preds): number` — `calcPoints + (calcAdvancePoints||0)`.

- [ ] **Step 1: Importar el módulo y exponerlo en window**

Insertar **después** de la línea 1092 (último `<script src=` de CDN) y **antes** de `<script>` (1094):

```html
<script type="module">
  import { advancePoints, matchAdvanceOutcome, playerAdvanceGuess } from './scripts/scoring.mjs';
  window.__scoring = { advancePoints, matchAdvanceOutcome, playerAdvanceGuess };
</script>
```

- [ ] **Step 2: Agregar helpers junto a getPoolForStage**

Insertar justo después de `getPoolForStage` (después de la línea 2971 `}`):

```js
const ADVANCE_POOL_DEFAULT = 20;
function getAdvancePool() {
  const v = CACHE.settings && CACHE.settings.advancePool;
  return (v != null && !isNaN(Number(v))) ? Number(v) : ADVANCE_POOL_DEFAULT;
}
// Pozo "quién pasa" (eliminatorias). Independiente del pozo de resultado.
function calcAdvancePoints(pred, match, allPreds) {
  if (!window.__scoring) return null;
  return window.__scoring.advancePoints({
    pred, match, allPreds: allPreds || CACHE.preds, pool: getAdvancePool()
  });
}
// Total de puntos de una predicción = pozo resultado (90') + pozo quién pasa.
function totalPoints(pred, match, allPreds) {
  return calcPoints(pred, match, allPreds) + (calcAdvancePoints(pred, match, allPreds) || 0);
}
```

- [ ] **Step 3: Verificar en browser que no hay errores de import**

Run: `python3 -m http.server 8000` (en la raíz del repo) y abrir `http://localhost:8000/index.html`.
Expected: la app carga sin errores en consola; en consola `window.__scoring.advancePoints` es una función.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(puntos): wiring del pozo quién pasa (getAdvancePool, calcAdvancePoints, totalPoints)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Usar `totalPoints` en los acumulados de jugador

**Files:**
- Modify: `index.html` (call sites de `calcPoints`)

**Interfaces:**
- Consumes: `totalPoints`, `calcPoints` (Task 2).

Reemplazar `calcPoints` por `totalPoints` **solo** en los sitios que representan el **total acumulado de un jugador** (ranking, KPIs Home, evolución, totales por jugador en stats/fixture). **Mantener** `calcPoints` en la proyección en vivo del 90' (línea ~2232, donde se usa `liveHome/liveAway` para mostrar el desglose del pozo de resultado) y en cualquier lugar que muestre específicamente "puntos del resultado".

Sitios a cambiar a `totalPoints` (verificar cada uno con su contexto antes de editar): líneas **1781, 1813, 1828, 2004**, y los acumulados en **3452, 3555, 3625, 3855, 3969** (ranking/stats/totales). Antes de cambiar cada uno, leer 5 líneas alrededor y confirmar que es un acumulado de jugador y no una proyección en vivo del resultado.

- [ ] **Step 1: Listar y clasificar los call sites**

Run: `grep -n "calcPoints" index.html`
Para cada resultado, leer el contexto y anotar: ¿es total de jugador (→ `totalPoints`) o desglose/proyección del resultado (→ dejar `calcPoints`)?

- [ ] **Step 2: Reemplazar en los acumulados**

Editar cada sitio clasificado como acumulado de jugador cambiando `calcPoints(` por `totalPoints(`. Ejemplo (línea ~1781):

```js
    return s + (m ? totalPoints(p, m, preds) : 0);
```

- [ ] **Step 3: Verificar en browser**

Run: app servida en `http://localhost:8000/index.html`. Con un partido KO finalizado con `advances` cargado y una predicción acertando quién pasa, el ranking y "Mis puntos" deben reflejar el pozo extra.
Expected: los totales suben en los partidos KO; los partidos de grupo no cambian.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(puntos): sumar pozo quién pasa en ranking, home y stats

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: UI de predicción — inputs "quién pasa / cómo" al predecir empate (KO)

**Files:**
- Modify: `index.html` (render de inputs del jugador en `renderMatches`, ~líneas 1717+; función de guardado de predicción que usa `RT.savePred`, ~línea 1184)

**Interfaces:**
- Consumes: `RT.savePred` (existente), `getStatus`, `normStage`.
- Produces: handler `saveAdvancePred(matchId)` y render condicional de los selectores.

- [ ] **Step 1: Localizar el render de inputs del jugador y el guardado**

Run: `grep -n "score-input\|savePred\|onchange=\"savePred\|function savePred\|renderMatches" index.html`
Leer el bloque donde se generan los inputs de marcador del jugador (partido `open`) dentro de `renderMatches` (~1717+) y la función que guarda la predicción del jugador (la que llama `RT.savePred`).

- [ ] **Step 2: Render condicional de los selectores (solo KO + empate)**

En el bloque de inputs del jugador para partidos `open`, después de los inputs de marcador, agregar (solo cuando `!isGroupStage(normStage(m.stage))`; usar `window.__scoring` no es necesario, basta `!normStage(m.stage).startsWith('Grupo')`):

```js
const isKO = !normStage(m.stage).startsWith('Grupo');
const isDrawPred = pred && pred.predHome != null && pred.predHome === pred.predAway;
const advUI = (isKO) ? `
  <div id="advBox_${m.id}" style="display:${isDrawPred ? 'block' : 'none'};margin-top:8px;background:#0f172a;border-radius:8px;padding:8px">
    <div style="font-size:10px;color:#94a3b8;text-align:center;margin-bottom:6px">Empate: ¿quién pasa y cómo?</div>
    <div style="display:flex;gap:6px;justify-content:center;margin-bottom:6px">
      <button type="button" onclick="setAdvPred('${m.id}','team','${m.home.replace(/'/g,"\\'")}')"
        class="adv-btn" data-adv-team="${m.id}" data-val="${m.home.replace(/'/g,"&#39;")}"
        style="flex:1;padding:6px;border-radius:6px;border:1px solid #334155;background:${pred?.predAdvances===m.home?'#1d4ed8':'#1e293b'};color:#f1f5f9;font-size:11px;font-weight:700">${m.home}</button>
      <button type="button" onclick="setAdvPred('${m.id}','team','${m.away.replace(/'/g,"\\'")}')"
        class="adv-btn" data-adv-team="${m.id}" data-val="${m.away.replace(/'/g,"&#39;")}"
        style="flex:1;padding:6px;border-radius:6px;border:1px solid #334155;background:${pred?.predAdvances===m.away?'#1d4ed8':'#1e293b'};color:#f1f5f9;font-size:11px;font-weight:700">${m.away}</button>
    </div>
    <div style="display:flex;gap:6px;justify-content:center">
      <button type="button" onclick="setAdvPred('${m.id}','method','120')"
        data-adv-method="${m.id}" data-val="120"
        style="flex:1;padding:6px;border-radius:6px;border:1px solid #334155;background:${pred?.predMethod==='120'?'#7c3aed':'#1e293b'};color:#f1f5f9;font-size:11px;font-weight:700">Alargue 120'</button>
      <button type="button" onclick="setAdvPred('${m.id}','method','pen')"
        data-adv-method="${m.id}" data-val="pen"
        style="flex:1;padding:6px;border-radius:6px;border:1px solid #334155;background:${pred?.predMethod==='pen'?'#7c3aed':'#1e293b'};color:#f1f5f9;font-size:11px;font-weight:700">Penales</button>
    </div>
  </div>` : '';
```

Insertar `${advUI}` en el template HTML justo debajo de los inputs de marcador del jugador.

- [ ] **Step 3: Handlers de guardado y toggle**

Agregar funciones globales (junto a la función que guarda la predicción del jugador):

```js
// Guarda equipo/método del pozo "quién pasa" en la predicción del jugador.
async function setAdvPred(matchId, field, value) {
  const uid = SESSION.userId;
  const m = CACHE.matches.find(x => x.id === matchId);
  if (!m) return;
  let pred = CACHE.preds.find(p => p.userId === uid && p.matchId === matchId);
  if (!pred) { pred = { userId: uid, matchId, predHome: 0, predAway: 0 }; }
  if (field === 'team') pred.predAdvances = value;
  if (field === 'method') pred.predMethod = value;
  await RT.savePred(pred);
}
```

En la función que guarda el **marcador** del jugador (la del `onchange` de los `score-input`), tras setear `predHome/predAway`: si el marcador **no** es empate, limpiar los campos de avance antes de guardar:

```js
  if (pred.predHome !== pred.predAway) { pred.predAdvances = null; pred.predMethod = null; }
```

Y tras guardar el marcador, mostrar/ocultar el box sin re-render completo:

```js
  const box = document.getElementById('advBox_' + matchId);
  if (box) box.style.display = (pred.predHome === pred.predAway && !normStage(m.stage).startsWith('Grupo')) ? 'block' : 'none';
```

(Nota: `RT.savePred` hace `.set` del objeto completo; al asignar `null` a `predAdvances`/`predMethod`, Firebase los elimina del nodo. Verificar que el objeto que se pasa a `savePred` incluye todos los campos esperados.)

- [ ] **Step 4: Verificar en browser**

Run: app en `http://localhost:8000/index.html`, login como jugador (no admin), un partido KO `open`.
Expected: al escribir un empate (ej. 1-1) aparece el box; elegir equipo y método los resalta; al cambiar a 2-1 el box desaparece y los campos se limpian (revisar en Firebase/consola). Recargar mantiene la selección.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(predicción): inputs quién pasa/cómo al predecir empate en eliminatorias

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: UI de resultado — mostrar puntos del pozo "quién pasa" en el partido finalizado

**Files:**
- Modify: `index.html` (zona de puntos del jugador en partidos KO finalizados, donde hoy se muestra `calcPoints` del resultado, ~líneas 1828/2232/3452)

**Interfaces:**
- Consumes: `calcAdvancePoints`, `matchAdvanceOutcome`, `playerAdvanceGuess`.

- [ ] **Step 1: Localizar la zona de puntos por partido del jugador**

Run: `grep -n "calcPoints(pred, m, preds)\|🥇\|exacto\|Tu pred" index.html`
Identificar el bloque que, en un partido finalizado, muestra al jugador sus puntos del resultado (badge 🥇/✅/❌ y puntaje).

- [ ] **Step 2: Agregar línea del pozo de avance**

En ese bloque, para partidos KO con resultado, calcular y mostrar (solo si `ap > 0`):

```js
const ap = calcAdvancePoints(pred, m, preds);
const apLine = (ap && ap > 0) ? (() => {
  const out = window.__scoring.matchAdvanceOutcome(m);
  const g = window.__scoring.playerAdvanceGuess(pred, m);
  const bonus = (g.method === out.method) ? ' ×1.5' : '';
  return `<div style="font-size:10px;color:#4ade80;text-align:center;margin-top:2px">+${ap.toFixed(2)} pts · quién pasa${bonus}</div>`;
})() : '';
```

Insertar `${apLine}` junto al puntaje del resultado en el template.

- [ ] **Step 3: Verificar en browser**

Run: app en `http://localhost:8000/index.html`, jugador con predicción que acierta quién pasa en un KO finalizado.
Expected: aparece "+X.XX pts · quién pasa" (con "×1.5" si acertó el método); en partidos de grupo no aparece.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(resultado): mostrar puntos del pozo quién pasa en partidos KO finalizados

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Admin (editar `advancePool`) + Reglas (explicación)

**Files:**
- Modify: `index.html` (`buildAdminPozos` ~zona de pozos por fase; `renderReglasPozos`)

**Interfaces:**
- Consumes: `getAdvancePool`, `RT.ref` / `saveStagePool` patrón existente.

- [ ] **Step 1: Localizar paneles de pozos**

Run: `grep -n "function buildAdminPozos\|function renderReglasPozos\|saveStagePool\|pf/settings/stagePoints" index.html`
Leer ambas funciones.

- [ ] **Step 2: Input de advancePool en Admin**

En `buildAdminPozos`, agregar (al final del panel) un input para el pozo de avance y su guardado:

```js
  html += `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #334155">
    <div style="font-size:12px;color:#94a3b8;margin-bottom:6px">🎟️ Pozo "quién pasa" (eliminatorias)</div>
    <div style="display:flex;gap:8px;align-items:center">
      <input id="advancePoolInput" type="number" value="${getAdvancePool()}"
        style="width:80px;padding:6px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#f1f5f9">
      <button onclick="saveAdvancePool()" style="padding:6px 10px;border-radius:6px;background:#7c3aed;color:#fff;border:none;font-weight:700">Guardar</button>
    </div>
    <div style="font-size:10px;color:#64748b;margin-top:4px">Se reparte entre quienes aciertan quién avanza; ×1.5 si aciertan cómo (90'/120'/penales).</div>
  </div>`;
```

Agregar la función global:

```js
async function saveAdvancePool() {
  const v = Number(document.getElementById('advancePoolInput').value);
  if (isNaN(v) || v < 0) { toast('Valor inválido', 'error'); return; }
  await RT.ref('pf/settings/advancePool').set(v);
  toast('Pozo "quién pasa" guardado', 'ok');
}
```

(Verificar el nombre real de la función toast/notificación en el archivo y ajustar.)

- [ ] **Step 3: Explicación en Reglas**

En `renderReglasPozos` (o el contenedor de la pestaña Reglas), agregar un bloque explicativo:

```js
  html += `<div style="margin-top:14px;background:#1e293b;border-radius:10px;padding:12px">
    <div style="font-weight:800;color:#facc15;margin-bottom:6px">🎟️ Pozo "quién pasa" (solo eliminatorias)</div>
    <div style="font-size:12px;color:#cbd5e1;line-height:1.5">
      Además del pozo por el resultado a los 90', cada partido de fase final reparte
      <b>${getAdvancePool()} puntos</b> entre todos los que aciertan <b>qué equipo avanza</b>.
      Si predices un ganador, estás diciendo que pasa <b>en los 90'</b>; si predices empate,
      eliges <b>qué equipo</b> pasa y <b>cómo</b> (alargue 120' o penales).
      Tu parte se multiplica por <b>×1.5</b> si además aciertas <b>cómo</b> avanzó.
    </div>
  </div>`;
```

- [ ] **Step 4: Verificar en browser**

Run: app en `http://localhost:8000/index.html`.
Expected: como admin, en Admin → Pozos aparece el input de "quién pasa"; cambiarlo a 30 y guardar actualiza los cálculos. En Reglas se ve la explicación con el valor actual.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(admin/reglas): editar pozo quién pasa y explicarlo en Reglas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de verificación final

- `npm test` verde (incluye `scoring.test.mjs` y `sync_results.test.mjs`).
- Probar manualmente el flujo completo: predecir empate + quién/cómo → cargar resultado KO (con `advances`/`pen`/`120`) → ver puntos en ranking, home, resultado del partido.
- Confirmar que grupos no se ven afectados.

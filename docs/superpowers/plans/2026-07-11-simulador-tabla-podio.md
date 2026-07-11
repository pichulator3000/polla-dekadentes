# Simulador de tabla (podio) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón en la pantalla de Ranking que abre un modal donde se elige campeón, subcampeón y goleador hipotéticos y se ve cómo quedaría la tabla, sin tocar datos reales.

**Architecture:** La lógica pura (equipos vivos, goleadores pronosticados, puntos de podio de un escenario) vive en un módulo nuevo `scripts/simulator.mjs`, testeable con `node:test` e importado a `index.html` como `window.__simulator` (mismo patrón que `scripts/scoring.mjs` → `window.__scoring`). La UI (botón + modal + tabla simulada) se agrega en `index.html`, reutilizando el patrón de overlays existente y una función `computeRankScores` extraída de `renderRanking` que se parametriza por un escenario de podio.

**Tech Stack:** HTML/JS vanilla (SPA de un archivo `index.html`), ES modules en `scripts/*.mjs`, `node:test` para tests puros. Sin frameworks ni dependencias nuevas.

## Global Constraints

- Todo el cálculo del simulador es **local y efímero**: nunca escribe en Firebase.
- No se modifica el scoring de partidos, ni el podio oficial real (`pf/settings/podioOficial`).
- Módulos en `scripts/*.mjs` sin dependencias de DOM/Firebase (puros, importables desde Node y desde el navegador).
- El patrón de comparación de nombres es case-insensitive con `.trim()`, igual que el código existente.
- Los tests puros corren con `npm test` (`node --test "scripts/**/*.test.mjs"`).
- La pantalla de Ranking usa `selectedRankTournament`; el simulador opera sobre ese mismo torneo seleccionado y solo aplica podio si `podioAplicaATorneo(selectedRankTournament)` es true.

---

### Task 1: Módulo `simulator.mjs` — `podioPointsFor`

**Files:**
- Create: `scripts/simulator.mjs`
- Test: `scripts/simulator.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `podioPointsFor(userPodio, oficial, pts) -> { total, champion, runner, scorer }`
    donde `userPodio = { champion, runner, scorer }` (strings, puede ser null),
    `oficial = { champion, runner, scorer }` (strings, puede ser null),
    `pts = { champion:Number, runner:Number, scorer:Number }`.

- [ ] **Step 1: Escribir el test que falla**

Create `scripts/simulator.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module './simulator.mjs'` (o `podioPointsFor is not a function`).

- [ ] **Step 3: Implementación mínima**

Create `scripts/simulator.mjs`:

```javascript
// Lógica pura del simulador de tabla (podio). Sin DOM/Firebase.
// Testeable con node:test e importable desde index.html.

// Puntos de podio de un usuario contra un "oficial" dado (real o simulado).
export function podioPointsFor(userPodio, oficial, pts) {
  const result = { total: 0, champion: 0, runner: 0, scorer: 0 };
  if (!userPodio || !oficial) return result;
  const eq = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
  if (oficial.champion && eq(userPodio.champion, oficial.champion)) { result.champion = pts.champion; result.total += pts.champion; }
  if (oficial.runner   && eq(userPodio.runner,   oficial.runner))   { result.runner   = pts.runner;   result.total += pts.runner; }
  if (oficial.scorer   && eq(userPodio.scorer,   oficial.scorer))   { result.scorer   = pts.scorer;   result.total += pts.scorer; }
  return result;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test`
Expected: PASS (todos los tests de `simulator.test.mjs` verdes).

- [ ] **Step 5: Commit**

```bash
git add scripts/simulator.mjs scripts/simulator.test.mjs
git commit -m "feat(simulador): podioPointsFor puro con tests"
```

---

### Task 2: Módulo `simulator.mjs` — `aliveTeams` y `predictedScorers`

**Files:**
- Modify: `scripts/simulator.mjs`
- Test: `scripts/simulator.test.mjs`

**Interfaces:**
- Consumes: `isGroupStage`, `matchAdvanceOutcome` de `./scoring.mjs`.
- Produces:
  - `aliveTeams(matches) -> string[]` — equipos que siguen en competencia, ordenados alfabéticamente. Un equipo se elimina si perdió un partido de eliminatoria (KO) ya jugado.
  - `predictedScorers(podios) -> string[]` — goleadores distintos no vacíos pronosticados, ordenados alfabéticamente. `podios = [{ scorer, ... }]`.

- [ ] **Step 1: Escribir los tests que fallan**

Append to `scripts/simulator.test.mjs`:

```javascript
import { aliveTeams, predictedScorers } from './simulator.mjs';

test('aliveTeams: elimina perdedores de KO jugados, mantiene el resto', () => {
  const matches = [
    // grupo: no elimina a nadie aunque haya resultado
    { stage: 'Grupo A', home: 'Brasil', away: 'Serbia', realHome: 2, realAway: 0 },
    // KO jugado: gana Brasil, elimina a Chile
    { stage: 'Octavos', home: 'Brasil', away: 'Chile', realHome: 1, realAway: 0 },
    // KO por diferencia a favor de visita: elimina a Francia
    { stage: 'Octavos', home: 'Argentina', away: 'Francia', realHome: 0, realAway: 3 },
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
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npm test`
Expected: FAIL — `aliveTeams is not a function` / `predictedScorers is not a function`.

- [ ] **Step 3: Implementación**

Add to the **top** of `scripts/simulator.mjs` (import) and append the functions:

```javascript
import { isGroupStage, matchAdvanceOutcome } from './scoring.mjs';

// Equipos que siguen en competencia: todos los que aparecen en partidos
// (excluyendo "Por definir") menos los que perdieron un KO ya jugado.
export function aliveTeams(matches) {
  const all = new Set();
  const eliminated = new Set();
  for (const m of (matches || [])) {
    for (const t of [m.home, m.away]) {
      if (t && t !== 'Por definir') all.add(t);
    }
    if (isGroupStage(m.stage)) continue;
    if (m.realHome == null || m.realAway == null) continue;
    const adv = matchAdvanceOutcome(m);
    if (adv == null) continue;
    const loser = adv === m.home ? m.away : (adv === m.away ? m.home : null);
    if (loser && loser !== 'Por definir') eliminated.add(loser);
  }
  return [...all].filter(t => !eliminated.has(t)).sort((a, b) => a.localeCompare(b));
}

// Goleadores distintos (texto libre) pronosticados por los usuarios.
export function predictedScorers(podios) {
  const set = new Set();
  for (const p of (podios || [])) {
    const s = ((p && p.scorer) || '').trim();
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npm test`
Expected: PASS (todos los tests de `simulator.test.mjs` verdes).

- [ ] **Step 5: Commit**

```bash
git add scripts/simulator.mjs scripts/simulator.test.mjs
git commit -m "feat(simulador): aliveTeams y predictedScorers con tests"
```

---

### Task 3: Importar el módulo en `index.html` y hacer que `calcPodioPoints` delegue

**Files:**
- Modify: `index.html` (bloque `<script type="module">` en ~1349-1356; `calcPodioPoints` en ~4043-4053)

**Interfaces:**
- Consumes: `window.__simulator.podioPointsFor` (Task 1).
- Produces: `window.__simulator = { podioPointsFor, aliveTeams, predictedScorers }` disponible para el resto del app.

- [ ] **Step 1: Añadir el import y exponer en window**

En `index.html`, dentro del bloque `<script type="module">` (junto a los otros imports), agregar:

```javascript
  import * as Simulator from './scripts/simulator.mjs';
  window.__simulator = Simulator;
```

(Colócalo junto a las líneas `import ... from './scripts/scoring.mjs';` / `window.__scoring = ...`.)

- [ ] **Step 2: Hacer que `calcPodioPoints` delegue en `podioPointsFor`**

Reemplazar el cuerpo de `calcPodioPoints` (~4043) por:

```javascript
function calcPodioPoints(userPodio) {
  if (!userPodio) return { total: 0, champion: 0, runner: 0, scorer: 0 };
  return window.__simulator.podioPointsFor(userPodio, getPodioOficial(), getPodioPoints());
}
```

- [ ] **Step 3: Verificar en el navegador que el ranking no cambió**

Run: `open index.html` (o recargar la app).
Expected: La pestaña Ranking carga igual que antes; los puntos de podio (columna 🏅) y los totales de cada jugador son idénticos a los previos. Sin errores en la consola (`window.__simulator` definido).

- [ ] **Step 4: Correr los tests**

Run: `npm test`
Expected: PASS (los tests puros siguen verdes; este cambio no rompe nada).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor(podio): calcPodioPoints delega en simulator.podioPointsFor"
```

---

### Task 4: Extraer `computeRankScores` de `renderRanking`

**Files:**
- Modify: `index.html` (`renderRanking` en ~4994-5032)

**Interfaces:**
- Produces:
  - `computeRankScores(doneOrLive, preds, users, incluyePodio, scenario) -> Array<{...u, pts, exact, correct, played, podioPts, penalty}>`
    ordenado por `pts` desc y `exact` desc. `scenario` = `null` → usa el podio oficial (`getPodioOficial()`); si es `{ champion, runner, scorer }` → usa ese escenario para los puntos de podio.

- [ ] **Step 1: Crear la función `computeRankScores`**

Insertar esta función en `index.html` justo **antes** de `function renderRanking()` (~4993):

```javascript
// Calcula los scores del ranking. scenario=null usa el podio oficial;
// scenario={champion,runner,scorer} simula un podio hipotético.
function computeRankScores(doneOrLive, preds, users, incluyePodio, scenario) {
  const podioPts = getPodioPoints();
  const oficial = scenario || getPodioOficial();
  return users.map(u => {
    const up = preds.filter(p => p.userId === u.id);
    let pts = 0, exact = 0, correct = 0, played = 0;
    up.forEach(p => {
      const m = doneOrLive.find(x => x.id === p.matchId);
      const rh = m ? (m.realHome ?? m.liveHome) : null;
      const ra = m ? (m.realAway ?? m.liveAway) : null;
      if (!m || rh == null) return;
      played++;
      pts += totalPoints(p, m, preds);
      if (p.predHome === rh && p.predAway === ra) { exact++; correct++; }
      else if (Math.sign(p.predHome - p.predAway) === Math.sign(rh - ra)) correct++;
    });
    let pp = 0;
    if (incluyePodio) {
      const myPodio = CACHE.podio.find(p => p.userId === u.id);
      pp = window.__simulator.podioPointsFor(myPodio, oficial, podioPts).total;
      pts += pp;
    }
    const penalty = cheatPenalty(u.name);
    pts -= penalty;
    return { ...u, pts, exact, correct, played, podioPts: pp, penalty };
  }).sort((a, b) => b.pts - a.pts || b.exact - a.exact);
}
```

- [ ] **Step 2: Usar la función en `renderRanking`**

En `renderRanking`, reemplazar el bloque que construye `const scores = users.map(...) ... .sort(...)` (actualmente ~5009-5032) por:

```javascript
  const scores = computeRankScores(doneOrLive, preds, users, incluyePodio, null);
```

(Dejar intactas las líneas anteriores que definen `users`, `matches`, `doneOrLive`, `hasLiveMatch`, `preds`, `incluyePodio`, y las posteriores que usan `scores`.)

- [ ] **Step 3: Verificar en el navegador que el ranking es idéntico**

Run: recargar la app y abrir la pestaña Ranking.
Expected: Orden, puntos totales, columna 🏅, exactos (🥇), aciertos (✅) y PJ idénticos a antes del cambio. Sin errores en consola.

- [ ] **Step 4: Correr los tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor(ranking): extraer computeRankScores parametrizable por escenario"
```

---

### Task 5: Botón "Simular tabla" + modal con inputs

**Files:**
- Modify: `index.html` (markup de `#tabRanking` ~1112-1115; agregar funciones `openSimulador`/`closeSimulador`/`_simOptionsHtml` cerca de `renderRanking`)

**Interfaces:**
- Consumes: `window.__simulator.aliveTeams`, `window.__simulator.predictedScorers`, `CACHE.matches`, `CACHE.podio`, `selectedRankTournament`, `podioAplicaATorneo`, `isTournamentHidden`.
- Produces:
  - `openSimulador()` — crea y muestra el overlay `#simuladorOverlay` con tres dropdowns poblados y un contenedor `#simuladorResult` vacío.
  - `closeSimulador()` — remueve `#simuladorOverlay`.

- [ ] **Step 1: Agregar el botón en la pantalla de Ranking**

En `index.html`, en el markup de `#tabRanking`, entre `<div id="rankingPills"...></div>` y `<div id="rankingTable"></div>` (~1114-1115), insertar:

```html
      <button onclick="openSimulador()" style="width:100%;margin-bottom:10px;padding:11px;border-radius:10px;border:1px solid rgba(56,189,248,0.35);background:linear-gradient(135deg,#0e2a44,#0f1b2d);color:#7dd3fc;font-weight:800;font-size:13px;cursor:pointer">🔮 Simular tabla (campeón · subcampeón · goleador)</button>
```

- [ ] **Step 2: Implementar `openSimulador`, `closeSimulador` y el helper de opciones**

Insertar en `index.html` justo **después** de `function renderRanking()` (tras su `}` de cierre, ~5097):

```javascript
// ══ Simulador de tabla (podio) ══
function _simSelectedMatches() {
  return selectedRankTournament === '__all__'
    ? CACHE.matches.filter(m => !isTournamentHidden(m.tournament || 'Sin Torneo'))
    : CACHE.matches.filter(m => (m.tournament || 'Sin Torneo') === selectedRankTournament && !isTournamentHidden(m.tournament || 'Sin Torneo'));
}

function _simOptions(list, selected) {
  return ['<option value="">— sin elegir —</option>']
    .concat(list.map(v => `<option value="${v.replace(/"/g, '&quot;')}"${v === selected ? ' selected' : ''}>${v}</option>`))
    .join('');
}

function openSimulador() {
  const matches = _simSelectedMatches();
  const teams = window.__simulator.aliveTeams(matches);
  const scorers = window.__simulator.predictedScorers(CACHE.podio);
  const selStyle = 'width:100%;padding:9px 10px;border-radius:8px;border:1.5px solid rgba(56,189,248,0.25);background:#0a0f1c;color:#e8edf5;font-size:14px;box-sizing:border-box';

  const overlay = document.createElement('div');
  overlay.id = 'simuladorOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9998;display:flex;align-items:flex-start;justify-content:center;backdrop-filter:blur(4px);overflow-y:auto;padding:20px 0';
  overlay.innerHTML =
    '<div style="background:#0f1b2d;border:1px solid rgba(56,189,248,0.2);border-radius:16px;padding:20px;max-width:460px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,0.5);margin:auto">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
        '<div style="font-size:17px;font-weight:900;color:#7dd3fc">🔮 Simular tabla</div>' +
        '<button onclick="closeSimulador()" style="background:transparent;border:none;color:#8899b0;font-size:20px;cursor:pointer;line-height:1">✕</button>' +
      '</div>' +
      '<div style="font-size:11.5px;color:#8899b0;margin-bottom:14px;line-height:1.5">Elige un escenario y mira cómo quedaría el ranking. No cambia nada real.</div>' +
      '<label style="font-size:12px;font-weight:700;color:#38bdf8">🥇 Campeón</label>' +
      `<select id="simChampion" style="${selStyle};margin:4px 0 12px">${_simOptions(teams, '')}</select>` +
      '<label style="font-size:12px;font-weight:700;color:#94a3b8">🥈 Subcampeón</label>' +
      `<select id="simRunner" style="${selStyle};margin:4px 0 12px">${_simOptions(teams, '')}</select>` +
      '<label style="font-size:12px;font-weight:700;color:#4ade80">⚽ Goleador</label>' +
      `<select id="simScorer" style="${selStyle};margin:4px 0 4px">${_simOptions(scorers, '')}</select>` +
      '<div style="font-size:10.5px;color:#64748b;margin-bottom:14px">Solo goleadores pronosticados por la gente.</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:16px">' +
        '<button onclick="runSimulador()" style="flex:2;padding:11px;border-radius:8px;border:none;background:#38bdf8;color:#0a0f1c;font-weight:800;cursor:pointer">Simular</button>' +
        '<button onclick="resetSimulador()" style="flex:1;padding:11px;border-radius:8px;border:1px solid rgba(56,189,248,0.25);background:transparent;color:#8899b0;font-weight:700;cursor:pointer">Reiniciar</button>' +
      '</div>' +
      '<div id="simuladorResult"></div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.onclick = e => { if (e.target === overlay) closeSimulador(); };
}

function closeSimulador() {
  const el = document.getElementById('simuladorOverlay');
  if (el) el.remove();
}
```

- [ ] **Step 3: Verificar en el navegador que el modal abre y puebla los inputs**

Run: recargar la app → pestaña Ranking → click "🔮 Simular tabla".
Expected: Se abre el modal. Los dropdowns de Campeón/Subcampeón listan solo equipos vivos (los perdedores de KO no aparecen). El dropdown de Goleador lista los goleadores pronosticados. La ✕ y el click afuera cierran el modal. (Los botones Simular/Reiniciar aún no hacen nada — se implementan en Task 6.)

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(simulador): botón en Ranking + modal con inputs poblados"
```

---

### Task 6: Calcular y renderizar la tabla simulada con deltas de posición

**Files:**
- Modify: `index.html` (agregar `runSimulador`/`resetSimulador` junto a `openSimulador`)

**Interfaces:**
- Consumes: `computeRankScores` (Task 4), `_simSelectedMatches` (Task 5), `podioAplicaATorneo`, `CACHE.users`, `CACHE.preds`, `currentUser`.
- Produces:
  - `runSimulador()` — lee los tres selects, calcula ranking simulado y baseline, y pinta `#simuladorResult` con la tabla reordenada y el cambio de posición.
  - `resetSimulador()` — resetea los selects a "— sin elegir —" y limpia `#simuladorResult`.

- [ ] **Step 1: Implementar `runSimulador` y `resetSimulador`**

Insertar en `index.html` después de `closeSimulador()` (Task 5):

```javascript
function runSimulador() {
  const scenario = {
    champion: document.getElementById('simChampion').value,
    runner:   document.getElementById('simRunner').value,
    scorer:   document.getElementById('simScorer').value,
  };
  const out = document.getElementById('simuladorResult');
  if (scenario.champion && scenario.runner && scenario.champion.toLowerCase() === scenario.runner.toLowerCase()) {
    out.innerHTML = '<div style="color:#f87171;font-size:12px;padding:8px 0">Campeón y subcampeón no pueden ser el mismo equipo.</div>';
    return;
  }

  const users = CACHE.users.filter(u => !u.isAdmin);
  const matches = _simSelectedMatches();
  const doneOrLive = matches.filter(m => m.realHome != null || (m.liveHome != null && m.liveAway != null));
  const preds = CACHE.preds;
  const incluyePodio = podioAplicaATorneo(selectedRankTournament);

  // Baseline (podio oficial actual) para calcular el cambio de posición.
  const base = computeRankScores(doneOrLive, preds, users, incluyePodio, null);
  const basePos = {};
  base.forEach((s, i) => { basePos[s.id] = i; });

  const sim = computeRankScores(doneOrLive, preds, users, incluyePodio, scenario);

  let rows = '';
  sim.forEach((s, i) => {
    const prev = basePos[s.id];
    const delta = prev == null ? 0 : prev - i; // >0 sube, <0 baja
    const deltaHtml = delta > 0
      ? `<span style="color:#4ade80">▲${delta}</span>`
      : delta < 0
        ? `<span style="color:#f87171">▼${-delta}</span>`
        : '<span style="color:#475569">=</span>';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    const isMine = s.id === currentUser.id;
    const bg = isMine ? '#1e3a5f' : (i % 2 === 0 ? '#1e293b' : '#182030');
    rows +=
      `<tr style="background:${bg}">` +
        `<td style="padding:9px 8px;font-weight:800">${medal}</td>` +
        `<td style="padding:9px 6px;font-weight:700">${s.name}${isMine ? ' <span style="color:#38bdf8;font-size:10px">(tú)</span>' : ''}</td>` +
        `<td style="padding:9px 6px;text-align:center;color:${s.podioPts > 0 ? '#38bdf8' : '#475569'};font-weight:700">${s.podioPts > 0 ? '+' + s.podioPts : '—'}</td>` +
        `<td style="padding:9px 6px;text-align:center;font-weight:900;color:#7dd3fc">${s.pts.toFixed(2)}</td>` +
        `<td style="padding:9px 8px;text-align:center;font-size:12px">${deltaHtml}</td>` +
      `</tr>`;
  });

  out.innerHTML =
    '<div style="font-size:12px;font-weight:800;color:#e8edf5;margin:6px 0 8px">Tabla simulada</div>' +
    '<div style="border:1px solid rgba(56,189,248,0.15);border-radius:10px;overflow:hidden">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr style="background:#0f172a;color:#64748b;font-size:10.5px;text-transform:uppercase">' +
          '<th style="padding:8px 8px;text-align:left">#</th>' +
          '<th style="padding:8px 6px;text-align:left">Jugador</th>' +
          '<th style="padding:8px 6px;text-align:center">🏅</th>' +
          '<th style="padding:8px 6px;text-align:center">Pts</th>' +
          '<th style="padding:8px 8px;text-align:center">Δ</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function resetSimulador() {
  ['simChampion', 'simRunner', 'simScorer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const out = document.getElementById('simuladorResult');
  if (out) out.innerHTML = '';
}
```

- [ ] **Step 2: Verificar el cálculo en el navegador**

Run: recargar la app → Ranking → "🔮 Simular tabla".
Verificaciones:
- Elegir un campeón que **alguien** pronosticó y click **Simular**: ese jugador suma +100 en la columna 🏅 y su total sube; la columna Δ muestra ▲ para quien sube y ▼ para quien baja.
- Elegir campeón = subcampeón: muestra el mensaje de error y no renderiza tabla.
- Dejar los tres en "— sin elegir —" y Simular: la tabla simulada coincide en puntos con el ranking real y todos los Δ son "=".
- **Reiniciar**: limpia los selects y borra la tabla simulada.
- Confirmar que el ranking real (pestaña Ranking detrás del modal) **no cambió** tras simular.

- [ ] **Step 3: Correr los tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(simulador): tabla simulada con deltas de posición y reinicio"
```

---

## Notas de verificación final

- `npm test` verde (módulo puro `simulator.mjs`).
- El ranking real es idéntico al de antes (Tasks 3 y 4 son refactors sin cambio de comportamiento).
- El simulador nunca escribe en Firebase (todo se calcula en memoria a partir de `CACHE`).

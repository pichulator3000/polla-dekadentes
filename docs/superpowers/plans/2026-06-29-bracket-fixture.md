# Vista Bracket en Fixture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una vista gráfica de llaves (bracket) en la pestaña Fixture, alternable con la vista lista actual mediante pills.

**Architecture:** La construcción del árbol (lógica pura) vive en un módulo nuevo `scripts/bracket.mjs`, testeable con `node:test` e importado al browser vía `window.__bracket` (mismo patrón que `scripts/scoring.mjs` → `window.__scoring`). El render del árbol y el switch de vista viven en `index.html`, reutilizando `resolveBracketDisplay()`, `koResultExtra()` y `window.__scoring.matchAdvanceOutcome()`.

**Tech Stack:** JavaScript vanilla (ES modules), `node:test` para la lógica pura, HTML/CSS inline en `index.html`. Sin frameworks ni dependencias nuevas.

## Global Constraints

- No agregar dependencias npm. Solo módulos ES nativos.
- La lógica pura no toca DOM ni Firebase (testeable aislada), igual que `scripts/scoring.mjs`.
- El bracket es **solo oficial** y **read-only** (tocar una celda no hace nada).
- No modificar la lógica de la vista lista existente; solo agregar el switch y la rama alternativa.
- Rondas KO en orden: `Ronda de 32` → `Octavos` → `Cuartos de Final` → `Semifinal` → `Final`, más `Tercer Puesto` aparte.
- Los partidos que llegan a `buildBracketTree` deben tener `stage` ya normalizado con `normStage()` (mismo criterio que `calcAdvancePoints` en index.html:3338).

---

### Task 1: Lógica pura del árbol — `scripts/bracket.mjs`

**Files:**
- Create: `scripts/bracket.mjs`
- Test: `scripts/bracket.test.mjs`

**Interfaces:**
- Consumes: nada (módulo independiente; los partidos llegan con `stage` ya normalizado).
- Produces:
  - `export const KO_STAGES` — `['Ronda de 32','Octavos','Cuartos de Final','Semifinal','Final']`
  - `export function buildBracketTree(matches)` → `{ columns, thirdPlace }` donde:
    - `columns`: array de `{ stage: string, matches: Match[] }`, solo rondas no vacías, en orden `KO_STAGES`. Dentro de cada columna, `matches` ordenados verticalmente para que cada partido quede centrado frente a sus dos alimentadores.
    - `thirdPlace`: el `Match` de `Tercer Puesto` o `null`.
  - Cada `Match` es el mismo objeto de entrada (no se clona ni se mutan campos).

- [ ] **Step 1: Write the failing test**

Crear `scripts/bracket.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './bracket.mjs'` o `buildBracketTree is not a function`.

- [ ] **Step 3: Write minimal implementation**

Crear `scripts/bracket.mjs`:

```js
// Construcción pura del árbol de llaves para la vista bracket del Fixture.
// Sin dependencias de DOM/Firebase; testeable con node:test e importable desde index.html.
// Espera partidos con `stage` ya normalizado (mismo criterio que normStage en index.html).

export const KO_STAGES = ['Ronda de 32', 'Octavos', 'Cuartos de Final', 'Semifinal', 'Final'];

// Código del partido alimentador desde un spec tipo "ABC" o "L_ABC" (perdedor).
function feedCode(spec) {
  if (!spec) return null;
  return spec.startsWith('L_') ? spec.slice(2) : spec;
}

// matches: array de partidos con .code/.stage(normalizado)/.feedHome/.feedAway/.home/.away/...
// Devuelve { columns: [{stage, matches[]}], thirdPlace: Match|null }.
export function buildBracketTree(matches) {
  const ko = (matches || []).filter(
    m => KO_STAGES.includes(m.stage) || m.stage === 'Tercer Puesto'
  );
  const byCode = {};
  for (const m of ko) if (m.code) byCode[m.code] = m;

  const thirdPlace = ko.find(m => m.stage === 'Tercer Puesto') || null;
  const mainMatches = ko.filter(m => m.stage !== 'Tercer Puesto');

  const childOf = (m, side) => {
    const code = feedCode(side === 'home' ? m.feedHome : m.feedAway);
    return code && byCode[code] ? byCode[code] : null;
  };

  // Raíz = la Final si existe; si no, la ronda más alta presente.
  let root = mainMatches.find(m => m.stage === 'Final') || null;
  if (!root) {
    for (let i = KO_STAGES.length - 1; i >= 0 && !root; i--) {
      root = mainMatches.find(m => m.stage === KO_STAGES[i]) || null;
    }
  }

  // DFS desde la raíz para fijar el orden vertical de las hojas.
  const leafOrder = [];
  const seen = new Set();
  const dfs = (m) => {
    if (!m || seen.has(m.code)) return;
    seen.add(m.code);
    const h = childOf(m, 'home');
    const a = childOf(m, 'away');
    if (!h && !a) { leafOrder.push(m.code); return; }
    dfs(h);
    dfs(a);
  };
  dfs(root);

  // Posición de cada partido: hojas por su orden DFS; padres = promedio de hijos.
  const pos = new Map();
  leafOrder.forEach((code, i) => pos.set(code, i));
  let changed = true, guard = 0;
  while (changed && guard++ < 30) {
    changed = false;
    for (const m of mainMatches) {
      if (pos.has(m.code)) continue;
      const h = childOf(m, 'home'), a = childOf(m, 'away');
      const vals = [h, a]
        .map(c => (c && pos.has(c.code)) ? pos.get(c.code) : null)
        .filter(v => v != null);
      if (vals.length) {
        pos.set(m.code, vals.reduce((x, y) => x + y, 0) / vals.length);
        changed = true;
      }
    }
  }

  const columns = KO_STAGES
    .map(stage => ({ stage, matches: mainMatches.filter(m => m.stage === stage) }))
    .filter(c => c.matches.length > 0);

  for (const c of columns) {
    c.matches.sort((x, y) => (pos.get(x.code) ?? 0) - (pos.get(y.code) ?? 0));
  }

  return { columns, thirdPlace };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — todos los tests de `bracket.test.mjs` (más los existentes de scoring/sync siguen pasando).

- [ ] **Step 5: Commit**

```bash
git add scripts/bracket.mjs scripts/bracket.test.mjs
git commit -m "feat(bracket): lógica pura buildBracketTree + tests"
```

---

### Task 2: Switch de vista (pills) en Fixture — `index.html`

**Files:**
- Modify: `index.html` (import del módulo en el bloque `<script type="module">` ~1214; HTML del contenedor ~972; estado y funciones de UI cerca de la sección FIXTURE ~3292; rama en `renderMatches()` ~3776).

**Interfaces:**
- Consumes: `buildBracketTree`, `KO_STAGES` de `scripts/bracket.mjs` (Task 1).
- Produces:
  - `window.__bracket = { buildBracketTree, KO_STAGES }`
  - `let fixtureView` — `'list' | 'bracket'`, default `'list'`.
  - `function setFixtureView(v)` — setea `fixtureView` y re-renderiza.
  - `function tournamentHasKO(matches)` → `boolean` (hay al menos un KO en el torneo).
  - `function renderFixtureViewPills(hasKO)` — pinta/oculta `#fixtureViewPills`.
  - Contenedor HTML nuevo: `<div id="fixtureViewPills">`.

Verificación: este task es DOM/browser, sin harness de test automático (igual que el resto de `index.html`). Se valida abriendo la app en el navegador.

- [ ] **Step 1: Exponer el módulo en window**

En `index.html`, en el bloque `<script type="module">` (alrededor de la línea 1214-1216, junto a `window.__scoring`), agregar el import y la asignación:

```js
import { buildBracketTree, KO_STAGES } from './scripts/bracket.mjs';
window.__bracket = { buildBracketTree, KO_STAGES };
```

- [ ] **Step 2: Agregar el contenedor de pills en el HTML**

En `index.html`, justo después de `<div id="tournamentPills" ...></div>` (línea 972), agregar:

```html
      <div id="fixtureViewPills" style="display:none;gap:6px;margin-bottom:10px"></div>
```

- [ ] **Step 3: Agregar estado y funciones de UI**

En `index.html`, en la sección `// ═══ FIXTURE ═══` (cerca de la línea 3292, junto a `let selectedTournament`/`setTournament`), agregar:

```js
let fixtureView = 'list'; // 'list' | 'bracket'

function setFixtureView(v) {
  fixtureView = v;
  renderMatches();
}

// ¿El torneo tiene al menos un partido de fase final?
function tournamentHasKO(matches) {
  return matches.some(m => {
    const s = normStage(m.stage);
    return (window.__bracket.KO_STAGES.includes(s) || s === 'Tercer Puesto');
  });
}

function renderFixtureViewPills(hasKO) {
  const el = document.getElementById('fixtureViewPills');
  if (!hasKO) { el.style.display = 'none'; return; }
  const mk = (v, label) => {
    const active = fixtureView === v;
    const bg  = active ? '#0053e2' : '#1e293b';
    const col = active ? '#fff'    : '#94a3b8';
    const brd = active ? '#0053e2' : '#334155';
    return `<button onclick="setFixtureView('${v}')"
      style="padding:6px 14px;font-size:12px;font-weight:700;border-radius:20px;
      background:${bg};color:${col};border:1px solid ${brd};cursor:pointer;
      transition:all .15s">${label}</button>`;
  };
  el.innerHTML = mk('list', '📋 Lista') + mk('bracket', '🏆 Llaves');
  el.style.display = 'flex';
}
```

- [ ] **Step 4: Verificación manual**

Abrir `index.html` en el navegador (servidor local o archivo), entrar a Fixture con un torneo que tenga fase final.
Expected: aparecen dos pills "📋 Lista" / "🏆 Llaves" bajo las pills de torneo; "Lista" activa por defecto. Aún no hace nada al cambiar (se conecta en Task 3). En un torneo sin KO, las pills NO aparecen. (La rama de render llega en Task 3; aquí solo se confirma que las pills se pintan y `setFixtureView` no rompe la vista lista.)

Para que `renderFixtureViewPills` y `tournamentHasKO` se ejecuten, este step depende del Step 1 de Task 3 (la llamada dentro de `renderMatches`). Si se ejecuta este task aislado, agregar temporalmente la llamada o validar en conjunto con Task 3.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(bracket): pills Lista/Llaves y estado de vista en Fixture"
```

---

### Task 3: Render del bracket e integración — `index.html`

**Files:**
- Modify: `index.html` (funciones de render cerca de la sección FIXTURE ~3370; rama en `renderMatches()` ~3814 tras filtrar `matches`).

**Interfaces:**
- Consumes: `window.__bracket.buildBracketTree`, `resolveBracketDisplay()`, `koWentBeyond90(m)`, `koResultExtra(m)`, `window.__scoring.matchAdvanceOutcome(m)`, `tournamentHasKO()`, `renderFixtureViewPills()` (Task 2).
- Produces:
  - `function renderBracketCell(m)` → string HTML de una celda (2 filas equipo + pie opcional).
  - `function renderBracket(matches)` → string HTML del árbol completo (columnas + conectores + tercer puesto).
  - Rama nueva en `renderMatches()` que, si `fixtureView === 'bracket'` y hay KO, pinta el bracket en `#matchList` y retorna.

Verificación: DOM/browser, sin harness automático. Se valida en el navegador con datos reales.

- [ ] **Step 1: Conectar pills y rama de bracket en renderMatches()**

En `index.html`, dentro de `renderMatches()`, justo después de calcular `const matches = allMatches.filter(...)` (línea ~3814) y antes de agrupar por fase, insertar:

```js
  // ── Switch Lista / Llaves ──
  const hasKO = tournamentHasKO(matches);
  if (!hasKO && fixtureView === 'bracket') fixtureView = 'list';
  renderFixtureViewPills(hasKO);

  if (fixtureView === 'bracket' && hasKO) {
    const listEl = document.getElementById('matchList');
    listEl.innerHTML = renderBracket(matches);
    return;
  }
```

- [ ] **Step 2: Implementar renderBracketCell**

En `index.html`, en la sección FIXTURE (después de `resolveBracketDisplay()`, ~línea 3398), agregar:

```js
// Una celda del bracket: dos filas (bandera+país+marcador 90'), ganador en verde
// con ✓, perdedor atenuado, pie con penales/120' o estado "Por jugarse".
function renderBracketCell(m) {
  const winner = window.__scoring.matchAdvanceOutcome
    ? window.__scoring.matchAdvanceOutcome(m) : null;
  const played = m.realHome != null && m.realAway != null;

  const sideRow = (team, score, isWin) => {
    const cls = isWin ? 'bkr win' : (winner ? 'bkr lose' : 'bkr');
    const chk = isWin ? '<span class="bkchk">✓</span>' : '';
    const sc  = played ? `<span class="bksc">${score}</span>`
                       : `<span class="bksc" style="color:#475569">—</span>`;
    // flagImg() devuelve '' si el equipo no tiene bandera (ej. placeholder
    // "Ganador R1"); en ese caso no se muestra imagen, solo el nombre.
    return `<div class="${cls}"><span class="bkfl">${flagImg(team) || ''}</span>
      <span class="bknm">${team || '—'}</span>${chk}${sc}</div>`;
  };

  let foot = '';
  if (played && koWentBeyond90(m)) {
    foot = `<div class="bkmeta">${koResultExtra(m).replace(/<[^>]+>/g, '')}</div>`;
  } else if (!played) {
    foot = `<div class="bkmeta" style="color:#fbbf24">Por jugarse</div>`;
  }

  return `<div class="bkcell">
    ${sideRow(m.home, m.realHome, winner != null && winner === m.home)}
    ${sideRow(m.away, m.realAway, winner != null && winner === m.away)}
    ${foot}
  </div>`;
}
```

Nota: el proyecto usa `flagImg(team)` (index.html:1287), que devuelve un `<img>` de flagcdn o `''` si el equipo no tiene bandera (placeholders tipo "Ganador R1"). Se reutiliza para consistencia con la vista lista.

- [ ] **Step 3: Implementar renderBracket**

Justo después de `renderBracketCell`, agregar:

```js
// Árbol completo: columnas por ronda con conectores, scroll horizontal + zoom.
// Tercer puesto colgado al final, cerca de la Final.
function renderBracket(matches) {
  // Normalizar stage (mismo criterio que el resto de la app) y resolver lados.
  resolveBracketDisplay();
  const norm = matches.map(m => ({ ...m, stage: normStage(m.stage) }));
  const { columns, thirdPlace } = window.__bracket.buildBracketTree(norm);

  if (!columns.length) {
    return `<div style="text-align:center;color:#64748b;padding:24px">
      Aún no hay partidos de fase final.</div>`;
  }

  const labelOf = (stage) => ({
    'Ronda de 32': 'R32', 'Octavos': '8vos', 'Cuartos de Final': '4tos',
    'Semifinal': 'Semis', 'Final': 'Final'
  }[stage] || stage);

  const colHtml = columns.map((c, ci) => {
    const cells = c.matches.map(renderBracketCell).join(
      '<div class="bkspacer"></div>'
    );
    const conn = ci < columns.length - 1 ? '<div class="bkconn"></div>' : '';
    return `<div class="bkcol">
      <div class="bklabel">${labelOf(c.stage)}</div>
      <div class="bkcells">${cells}</div>
    </div>${conn}`;
  }).join('');

  const tpHtml = thirdPlace ? `
    <div class="bk3p">
      <div class="bk3plabel">🥉 Tercer Puesto</div>
      ${renderBracketCell(thirdPlace)}
    </div>` : '';

  return `
    <div class="bkwrap">
      <div class="bktree">${colHtml}</div>
      ${tpHtml}
    </div>`;
}
```

- [ ] **Step 4: Agregar los estilos CSS del bracket**

En `index.html`, dentro del `<style>` principal (o en un `<style>` nuevo cerca del fixture), agregar:

```css
.bkwrap { width:100%; }
.bktree {
  display:flex; align-items:stretch; min-width:max-content;
  overflow-x:auto; touch-action:pan-x pan-y pinch-zoom;
  padding:8px 4px; gap:0;
}
.bkcol { display:flex; flex-direction:column; min-width:160px; }
.bklabel {
  font-size:10px; color:#475569; text-transform:uppercase; letter-spacing:1px;
  text-align:center; margin-bottom:8px; font-weight:800;
}
.bkcells { display:flex; flex-direction:column; justify-content:space-around; flex:1; gap:14px; }
.bkspacer { flex:0 0 0; }
.bkconn { width:22px; flex:0 0 22px; }
.bkcell {
  background:#0f172a; border:1px solid #1e293b; border-radius:8px;
  overflow:hidden; align-self:center; width:150px;
}
.bkr { display:flex; align-items:center; gap:4px; padding:5px 7px; font-size:12px; color:#e2e8f0; }
.bkr + .bkr { border-top:1px solid #1e293b; }
.bkr.win { background:rgba(22,163,74,.12); color:#fff; font-weight:800; }
.bkr.lose { color:#64748b; }
.bkr.lose img { filter:grayscale(.6); opacity:.7; }
.bkfl { display:inline-flex; align-items:center; }
.bkfl img { margin:0 !important; }
.bknm { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bksc { font-weight:900; font-variant-numeric:tabular-nums; }
.bkchk { color:#4ade80; font-size:10px; }
.bkmeta { font-size:9px; color:#64748b; text-align:center; padding:3px; border-top:1px solid #1e293b; }
.bk3p {
  margin-top:14px; padding-top:12px; border-top:1px dashed #1e293b;
  display:flex; flex-direction:column; align-items:center; gap:6px;
}
.bk3plabel { font-size:11px; color:#94a3b8; font-weight:800; }
```

- [ ] **Step 5: Verificación manual**

Abrir `index.html` en el navegador, ir a Fixture en un torneo con fase final, tocar el pill "🏆 Llaves".
Expected:
- Se muestra el árbol con columnas R32 → … → Final, con scroll horizontal.
- Los partidos jugados muestran marcador, ganador en verde con ✓, perdedor atenuado.
- Penales/120' aparecen en el pie cuando aplica; "Por jugarse" en los aún no jugados.
- Lados sin definir muestran el placeholder de `resolveBracketDisplay()` (ej. "Ganador R1").
- El Tercer Puesto aparece colgado al final.
- Tocar "📋 Lista" vuelve a la vista lista intacta.
- En un torneo sin KO, no hay pills y se ve la lista normal.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(bracket): render del árbol de llaves e integración en renderMatches"
```

---

## Self-Review

**Spec coverage:**
- Switch de vista (pills Lista/Llaves) → Task 2. ✓
- Visibilidad de pills solo con KO → Task 2 (`tournamentHasKO`) + Task 3 (rama). ✓
- Construcción del árbol desde feeders → Task 1 (`buildBracketTree`). ✓
- Solo oficial, read-only → Tasks 1-3 (sin overlay de preds, sin onclick en celdas). ✓
- Densidad completa (marcador + ✓ + penales + "Por jugarse") → Task 3 (`renderBracketCell`). ✓
- Layout árbol + scroll/zoom → Task 3 (CSS `.bktree`). ✓
- Tercer puesto colgado de la Final → Task 1 (`thirdPlace`) + Task 3 (`.bk3p`). ✓
- Placeholders de lados sin definir → reutiliza `resolveBracketDisplay()` en Task 3. ✓
- No tocar lógica de lista → Tasks 2-3 solo agregan rama + `return`. ✓

**Placeholder scan:** Sin "TBD"/"TODO". Las notas de verificación señalan dependencias entre Task 2 y Task 3 (las pills no tienen efecto hasta conectar la rama en Task 3) y la verificación condicional de `flagFor`.

**Type consistency:** `buildBracketTree(matches) → {columns, thirdPlace}` consistente entre Task 1 (definición), Task 3 (consumo). `window.__bracket` expuesto en Task 2, usado en Tasks 2-3. `fixtureView`, `setFixtureView`, `tournamentHasKO`, `renderFixtureViewPills` definidos en Task 2 y usados en Task 3. `renderBracketCell`/`renderBracket` definidos y usados en Task 3.

## Notas de implementación confirmadas

- **Banderas**: se usa `flagImg(team)` (index.html:1287), `<img>` de flagcdn que devuelve `''` para placeholders sin bandera. Ya reflejado en Task 3.
- **Ubicación del `<style>`**: hay un único bloque `<style>` que abre en index.html:11. El CSS del bracket va dentro de ese bloque.

# Dashboard en vivo: pozo "quién pasa" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar el pozo "quién pasa" (eliminatorias) al Dashboard en vivo: corregir los totales proyectados, añadir una sección dedicada de distribución/pago y un badge en "Tu pronóstico".

**Architecture:** Cambios solo en `index.html`. Tres helpers nuevos junto a `_pointsAt` calculan el avanzador en vivo reutilizando `window.__scoring.playerAdvanceGuess` y `getAdvancePool()`. El resto son funciones de render de solo lectura que leen del objeto `LD` ya armado por `renderLiveDash`. No se toca `scripts/scoring.mjs`, admin ni persistencia.

**Tech Stack:** HTML/JS vanilla embebido en `index.html`; módulo ES `scripts/scoring.mjs` (sin cambios) expuesto en `window.__scoring`.

## Global Constraints

- Archivo único editable: `index.html`. NO modificar `scripts/scoring.mjs`, admin ni el flujo de guardado.
- Guarda de alcance (KO con pozo activo), copiada verbatim del spec:
  `!normStage(m.stage).startsWith('Grupo') && m.advancePozo !== false`
- Pozo de avance: `getAdvancePool()` (default 20). Acertadores mínimo 1.
- Redondeo de pago: `Math.round((pool / n) * 100) / 100` (igual que `advancePoints`).
- Colores: lado home = `col.L`, lado away = `col.V` (de `matchColors`).
- Empate en vivo sin `done` → avanzador indefinido (`null`), no marcar lado.
- Verificación manual en navegador (no hay harness de test para funciones de `index.html`); `scripts/scoring.test.mjs` sigue válido y debe seguir pasando.

---

### Task 1: Helpers de avance en vivo

**Files:**
- Modify: `index.html` (insertar tras `_pointsAt`, que termina en index.html:1483)

**Interfaces:**
- Consumes: `window.__scoring.playerAdvanceGuess(pred, m)`, `getAdvancePool()`, `normStage(stage)`, `getStatus(m)`.
- Produces:
  - `_ldAdvanceOn(m) -> boolean`
  - `_liveAdvancer(m, sh, sa) -> string|null` (nombre del equipo que avanza, o null)
  - `_advanceAt(pred, m, allPreds, sh, sa) -> number|null` (puntos de avance en vivo)

- [ ] **Step 1: Implementar los tres helpers**

Insertar justo después del cierre de `_pointsAt` (después de la línea `}` en index.html:1483):

```js
// ── Pozo "quién pasa" en el dashboard en vivo ──────────────────────────────
// Aplica solo a KO con el pozo activo (se añadió a mitad de torneo).
function _ldAdvanceOn(m){
  return !!m && !normStage(m.stage).startsWith('Grupo') && m.advancePozo !== false;
}
// Quién avanza según el marcador EN VIVO (sh-sa efectivos del dashboard).
// Empate sin partido cerrado → null (iría a alargue/penales: indefinido).
function _liveAdvancer(m, sh, sa){
  if (sh == null || sa == null) return null;
  if (sh > sa) return m.home;
  if (sa > sh) return m.away;
  if (getStatus(m) === 'done' && (m.advances === m.home || m.advances === m.away)) return m.advances;
  return null;
}
// Puntos del pozo de avance proyectados al marcador en vivo. Espeja advancePoints
// pero usando _liveAdvancer en vez de matchAdvanceOutcome. null si no aplica/indefinido.
function _advanceAt(pred, m, allPreds, sh, sa){
  if (!_ldAdvanceOn(m)) return 0;
  const adv = _liveAdvancer(m, sh, sa);
  if (adv == null) return null;
  const guess = window.__scoring.playerAdvanceGuess(pred, m);
  if (guess !== adv) return 0;
  const preds = allPreds || CACHE.preds;
  const n = preds.filter(p => p.matchId === m.id &&
    window.__scoring.playerAdvanceGuess(p, m) === adv).length || 1;
  return Math.round((getAdvancePool() / n) * 100) / 100;
}
```

- [ ] **Step 2: Verificar en navegador (consola)**

Abrir `index.html` en el navegador, loguearse, abrir un partido KO en el Dashboard en vivo y en la consola:

Run: `_ldAdvanceOn(LD.m)` → Expected: `true` en KO con pozo, `false` en grupo.
Run: `_liveAdvancer(LD.m, 1, 0)` → Expected: nombre de `LD.m.home`.
Run: `_liveAdvancer(LD.m, 1, 1)` → Expected: `null` (si el partido no está `done`).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(dash): helpers de avance en vivo (quién pasa)"
```

---

### Task 2: Corregir totales en vivo (proyección + tabla general)

**Files:**
- Modify: `index.html` — `_projRows` (index.html:2614-2621) y `ldRenderGeneral`/`calc` (index.html:2696-2712)

**Interfaces:**
- Consumes: `_advanceAt`, `calcAdvancePoints` (index.html:3036), `LD.sh`, `LD.sa`, `LD.m`.
- Produces: filas/totales que incluyen el pozo de avance.

- [ ] **Step 1: Sumar avance en `_projRows`**

En `_projRows` (index.html:2614), cambiar la línea de `pts`:

```js
pts: (_pointsAt(p,m,CACHE.preds,LD.sh,LD.sa) || 0) + (_advanceAt(p,m,CACHE.preds,LD.sh,LD.sa) || 0), me:p.userId===currentUser.id };
```

- [ ] **Step 2: Sumar avance en `ldRenderGeneral` → `calc`**

En `calc(useLive)` (index.html:2696), dentro del `up.forEach`, después de la línea
`pts += _pointsAt(p, m, CACHE.preds, rh, ra) || 0;` (index.html:2707) añadir:

```js
      // Pozo "quién pasa": en "antes" usa el resultado real; en vivo, el del dashboard.
      if (!useLive) pts += calcAdvancePoints(p, m) || 0;
      else if (m.id === LD.m.id) pts += _advanceAt(p, m, CACHE.preds, LD.sh, LD.sa) || 0;
      else pts += calcAdvancePoints(p, m) || 0;
```

- [ ] **Step 3: Verificar en navegador**

Dashboard de un partido KO con marcador en vivo a favor de un lado:
1. La proyección 🏆 muestra puntos mayores para quienes acertaron quién pasa (vs. solo resultado).
2. La tabla general en vivo (slide 2): el tag verde "+x.xx" y el movimiento ▲▼ reflejan también el pozo de avance.
3. En un partido de grupo, los totales no cambian respecto a antes.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "fix(dash): incluir pozo quién pasa en totales en vivo"
```

---

### Task 3: Sección dedicada "🎟️ ¿Quién pasa?"

**Files:**
- Modify: `index.html` — plantilla `ldBody` (index.html:2656-2658), llamadas de render (index.html:2682), y nueva función `ldRenderAdvance` (junto a `ldRenderPay`, ~index.html:2908)

**Interfaces:**
- Consumes: `LD` (`m`, `preds`, `col`, `sh`, `sa`, `hasScore`), `_ldAdvanceOn`, `_liveAdvancer`, `getAdvancePool`, `window.__scoring.playerAdvanceGuess`, `LD_BARMODE`, `_ldChips`.
- Produces: función global `ldRenderAdvance()` y detalle `showLdAdv(side)`; contenedores `#ldAdvSec`, `#ldAdvBar`, `#ldAdvPay`, `#ldAdvDetail`.

- [ ] **Step 1: Añadir el bloque HTML en la plantilla de `ldBody`**

En la plantilla (index.html:2645-2679), justo después del bloque de pagos que termina en
`<div class="ld-pay-foot">...</div>` (index.html:2658), insertar:

```js
    <div id="ldAdvSec"></div>
```

- [ ] **Step 2: Llamar a `ldRenderAdvance` en `renderLiveDash`**

En la lista de llamadas al final de `renderLiveDash` (index.html:2682), añadir `ldRenderAdvance();`:

```js
  _ldScore(); _ldMine(); _ldPotBanner(); _ldCallout();
  ldRenderBar(); ldRenderPay(); ldRenderAdvance(); ldRenderHeat(); ldRenderProj(); ldRenderGeneral(); _ldSwipeInit(); _ldAweonaos();
```

- [ ] **Step 3: Implementar `ldRenderAdvance` y `showLdAdv`**

Insertar después de `ldRenderPay` (que termina en index.html:2908):

```js
function ldRenderAdvance(){
  const host = document.getElementById('ldAdvSec');
  if (!host) return;
  const {m, preds, col, sh, sa, hasScore} = LD;
  if (!_ldAdvanceOn(m)) { host.innerHTML = ''; return; }
  const pool = getAdvancePool();
  const guess = p => window.__scoring.playerAdvanceGuess(p, m);
  const grp = { H:[], V:[] };
  preds.forEach(p => { const g = guess(p); if (g===m.home) grp.H.push(p); else if (g===m.away) grp.V.push(p); });
  LD.advGrp = grp;
  const total = (grp.H.length + grp.V.length) || 1;
  const liveAdv = hasScore ? _liveAdvancer(m, sh, sa) : null;
  const sides = [
    {k:'H', c:col.L, lbl:'Pasa '+m.home, team:m.home, arr:grp.H},
    {k:'V', c:col.V, lbl:'Pasa '+m.away, team:m.away, arr:grp.V},
  ];
  const barSegs = sides.filter(s => s.arr.length);
  const barHtml = barSegs.length
    ? barSegs.map(s => { const n=s.arr.length, pct=Math.round(n/total*100);
        return `<div class="ld-seg" style="flex:${n};background:${s.c}" onclick="showLdAdv('${s.k}')">${LD_BARMODE==='pct'?pct+'%':n}</div>`;
      }).join('')
    : '';
  const legHtml = barSegs.length
    ? barSegs.map(s => { const n=s.arr.length, pct=Math.round(n/total*100);
        return `<span style="color:${s.c}">● ${s.lbl} · ${LD_BARMODE==='pct'?pct+'%':n}</span>`; }).join('')
    : '<span style="color:#475569">Nadie ha pronosticado aún</span>';
  const tieLive = hasScore && sh===sa && liveAdv==null;
  const maxPer = Math.max(...sides.map(s=>s.arr.length?pool/s.arr.length:0),1);
  const payHtml = sides.map(s => {
    const n=s.arr.length, per=n?Math.round(pool/n*100)/100:0, hot=liveAdv===s.team;
    const amt = n ? `<div class="ld-pay-big" style="color:${s.c}">+${_fmtPts(per)}</div>`
                  : `<div class="ld-pay-none">nadie apostó</div>`;
    const tag = hot ? '<span class="ld-hot-tag">VA PASANDO</span>'
              : (tieLive ? '<span class="ld-hot-tag" style="background:#475569">indefinido</span>' : '');
    return `<div class="ld-pay-row${hot?' hot':''}">
      <div class="ld-pay-bar" style="background:${s.c};width:${n?per/maxPer*100:0}%"></div>
      <div class="ld-pay-ic" style="background:${s.c}"></div>
      <div class="ld-pay-info">
        <div class="ld-pay-lbl">${s.lbl}${tag}</div>
        <div class="ld-pay-sub">${n} ${n===1?'apostó':'apostaron'} · pozo ÷ ${n||'—'}</div>
      </div>
      <div class="ld-pay-amt">${amt}</div>
    </div>`;
  }).join('');
  host.innerHTML = `
    <div class="ld-sec">🎟️ ¿Quién pasa? <span class="ld-sub">pozo ${pool} pts${tieLive?' · empate':''}</span>
      <span class="ld-pill" id="ldAdvPill"><button class="${LD_BARMODE==='pct'?'on':''}" onclick="setLdBarMode('pct')">%</button><button class="${LD_BARMODE==='cnt'?'on':''}" onclick="setLdBarMode('cnt')">N°</button></span>
    </div>
    <div class="ld-bar" id="ldAdvBar">${barHtml}</div>
    <div class="ld-barleg" id="ldAdvLeg">${legHtml}</div>
    <div class="ld-detail" id="ldAdvDetail" style="display:none;margin-top:10px"></div>
    <div class="ld-pay" id="ldAdvPay" style="margin-top:10px">${payHtml}</div>
    <div class="ld-pay-foot">El pozo se reparte entre los que aciertan quién avanza · empate ⇒ vale tu elección de "quién pasa"</div>`;
}
function showLdAdv(k){
  const arr = (LD.advGrp && LD.advGrp[k]) || [];
  const lbl = k==='H' ? 'Pasa '+LD.m.home : 'Pasa '+LD.m.away;
  const d = document.getElementById('ldAdvDetail');
  if (!d) return;
  d.style.display='block';
  d.innerHTML = `<div class="ld-detail-title">${lbl} · ${arr.length}</div>${arr.length?_ldChips(arr):'<div class="ld-empty">Nadie</div>'}`;
  document.querySelectorAll('#ldAdvBar .ld-seg').forEach(s=>s.classList.toggle('sel', s.getAttribute('onclick').includes(`'${k}'`)));
}
```

- [ ] **Step 4: Incluir la barra de avance en el toggle `setLdBarMode`**

En `setLdBarMode` (index.html:2868-2872), añadir `ldRenderAdvance();` para que el toggle %/N° también re-renderice esta sección:

```js
function setLdBarMode(mode){
  LD_BARMODE = mode;
  document.querySelectorAll('#ldPill button, #ldAdvPill button').forEach(b=>b.classList.toggle('on', b.textContent.trim()===(mode==='pct'?'%':'N°')));
  ldRenderBar(); ldRenderHeat(); ldRenderAdvance();
}
```

- [ ] **Step 5: Verificar en navegador**

1. Partido KO con predicciones: aparece "🎟️ ¿Quién pasa?" tras "¿Cuánto paga?", con barra de dos lados, leyenda y filas de pago.
2. Marcador en vivo a favor de un lado → ese lado muestra "VA PASANDO"; tabla de pago coherente con `pozo ÷ acertadores`.
3. Marcador en vivo empatado → sub muestra "· empate" y los lados muestran "indefinido".
4. Toggle %/N° cambia también esta barra.
5. Click en un segmento → muestra los nombres (chips) de ese lado.
6. Partido de grupo → la sección no aparece.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(dash): sección ¿quién pasa? con distribución y pago"
```

---

### Task 4: Badge "quién pasa" en "Tu pronóstico"

**Files:**
- Modify: `index.html` — `_ldMine` (index.html:2798-2828)

**Interfaces:**
- Consumes: `LD` (`m`, `mine`, `sh`, `sa`, `hasScore`), `_ldAdvanceOn`, `_liveAdvancer`.
- Produces: línea de badge dentro de `.ld-mine` cuando aplica.

- [ ] **Step 1: Calcular el badge y añadirlo al HTML de `_ldMine`**

En `_ldMine`, antes del `el.innerHTML = ...` final (index.html:2821), insertar el cálculo del badge:

```js
  let advLine = '';
  if (_ldAdvanceOn(m) && mine.predHome === mine.predAway && mine.predAdvances){
    const liveAdv = hasScore ? _liveAdvancer(m, sh, sa) : null;
    const mark = liveAdv == null ? '' : (liveAdv === mine.predAdvances ? ' ✅' : ' ❌');
    advLine = `<div class="ld-mine-adv" style="font-size:11px;color:#facc15;margin-top:6px">🎟️ Apostaste que pasa <b>${mine.predAdvances}</b>${mark}</div>`;
  }
```

Luego, en el `el.innerHTML` (index.html:2821-2827), añadir `${advLine}` justo después de la línea del marcador (`<div class="ld-mine-sc">...</div>`):

```js
    <div class="ld-mine-sc">${flagBig(m.home,22)} <b>${mine.predHome}</b> <span class="ld-mine-dash">–</span> <b>${mine.predAway}</b> ${flagBig(m.away,22)}</div>
    ${advLine}
  </div>`;
```

- [ ] **Step 2: Verificar en navegador**

1. KO donde predijiste empate y elegiste quién pasa → aparece "🎟️ Apostaste que pasa {equipo}"; con marcador en vivo definido, ✅ si coincide / ❌ si no.
2. KO donde predijiste un ganador (no empate) → no aparece badge.
3. Empate en vivo (indefinido) → badge sin ✅/❌.
4. Partido de grupo → sin badge.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(dash): badge quién pasa en Tu pronóstico (solo empate)"
```

---

## Self-Review

- **Cobertura del spec:** Helpers (Task 1) ✓; corregir totales proyección+general (Task 2) ✓; sección dedicada con barra/pago/VA PASANDO/indefinido/chips (Task 3) ✓; badge solo-empate en Tu pronóstico (Task 4) ✓; casos borde (sin preds, empate en vivo, grupo, predAdvances ausente) cubiertos por las guardas en Tasks 1/3/4.
- **Sin placeholders:** todos los pasos de código muestran el código real.
- **Consistencia de tipos:** `_ldAdvanceOn`/`_liveAdvancer`/`_advanceAt` definidos en Task 1 y usados con la misma firma en Tasks 2-4; `playerAdvanceGuess` desde `window.__scoring`; reutiliza `_ldChips`, `_fmtPts`, `LD_BARMODE`, `col.L/col.V` ya existentes.

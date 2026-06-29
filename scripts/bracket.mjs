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

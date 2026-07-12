// Lógica pura del simulador de tabla (podio). Sin DOM/Firebase.
// Testeable con node:test e importable desde index.html.

import { isGroupStage, matchAdvanceOutcome } from './scoring.mjs';

// Quita tildes/diacríticos y pasa a minúsculas.
function stripAccents(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// True si el texto tiene alguna tilde/diacrítico (independiente de mayúsculas).
function hasAccent(s) {
  return (s || '') !== (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Clave para comparar goleadores de texto libre: apellido (último token) sin tildes.
// Colapsa "Kane" / "Harry Kane" y "Mbappe" / "Mbappé".
function scorerKey(s) {
  return stripAccents(s).split(/\s+/).filter(Boolean).pop() || '';
}

// Puntos de podio de un usuario contra un "oficial" dado (real o simulado).
// opts.fuzzyScorer=true compara el goleador por apellido sin tildes (para el simulador).
export function podioPointsFor(userPodio, oficial, pts, opts = {}) {
  const result = { total: 0, champion: 0, runner: 0, scorer: 0 };
  if (!userPodio || !oficial) return result;
  const eq = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
  const eqScorer = opts.fuzzyScorer
    ? (a, b) => { const ka = scorerKey(a); return ka !== '' && ka === scorerKey(b); }
    : eq;
  if (oficial.champion && eq(userPodio.champion, oficial.champion))       { result.champion = pts.champion; result.total += pts.champion; }
  if (oficial.runner   && eq(userPodio.runner,   oficial.runner))         { result.runner   = pts.runner;   result.total += pts.runner; }
  if (oficial.scorer   && eqScorer(userPodio.scorer, oficial.scorer))     { result.scorer   = pts.scorer;   result.total += pts.scorer; }
  return result;
}

// Equipos que siguen en competencia. Una vez iniciada la fase KO (hay partidos KO
// con equipos reales), solo cuentan los que llegaron al KO y no perdieron; los
// eliminados en fase de grupos quedan fuera. Si aún es fase de grupos (sin KO real),
// se muestran todos los equipos que aparecen en el fixture.
export function aliveTeams(matches) {
  const all = new Set();
  const koTeams = new Set();
  const eliminated = new Set();
  for (const m of (matches || [])) {
    for (const t of [m.home, m.away]) {
      if (t && t !== 'Por definir') all.add(t);
    }
    if (isGroupStage(m.stage)) continue;
    for (const t of [m.home, m.away]) {
      if (t && t !== 'Por definir') koTeams.add(t);
    }
    if (m.realHome == null || m.realAway == null) continue;
    const adv = matchAdvanceOutcome(m);
    if (adv == null) continue;
    const loser = adv === m.home ? m.away : (adv === m.away ? m.home : null);
    if (loser && loser !== 'Por definir') eliminated.add(loser);
  }
  const pool = koTeams.size > 0 ? koTeams : all;
  return [...pool].filter(t => !eliminated.has(t)).sort((a, b) => a.localeCompare(b));
}

// Goleadores distintos (texto libre) pronosticados por los usuarios. Colapsa
// variantes del mismo jugador (tildes / apellido) y muestra el nombre más completo.
export function predictedScorers(podios) {
  const byKey = new Map(); // clave -> display canónico
  for (const p of (podios || [])) {
    const s = ((p && p.scorer) || '').trim();
    if (!s) continue;
    const k = scorerKey(s);
    if (!k) continue;
    const cur = byKey.get(k);
    const better = !cur
      || s.length > cur.length
      || (s.length === cur.length && hasAccent(s) && !hasAccent(cur));
    if (better) byKey.set(k, s);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

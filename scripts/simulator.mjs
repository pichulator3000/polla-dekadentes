// Lógica pura del simulador de tabla (podio). Sin DOM/Firebase.
// Testeable con node:test e importable desde index.html.

import { isGroupStage, matchAdvanceOutcome } from './scoring.mjs';

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

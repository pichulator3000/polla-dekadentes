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

// canonTeam por defecto (para tests del módulo puro): '' para "Por definir",
// resto en minúsculas. La app inyecta uno que resuelve alias/tildes y filtra placeholders.
function defaultCanonTeam(raw) {
  const s = (raw || '').trim();
  if (!s || s.toLowerCase() === 'por definir') return '';
  return s.toLowerCase();
}

// Puntos de podio de un usuario contra un "oficial" dado (real o simulado).
// opts.canonTeam estandariza campeón/subcampeón (alias/tildes/typos).
// opts.fuzzyScorer compara el goleador por apellido sin tildes. Ambos para el simulador.
export function podioPointsFor(userPodio, oficial, pts, opts = {}) {
  const result = { total: 0, champion: 0, runner: 0, scorer: 0 };
  if (!userPodio || !oficial) return result;
  const eq = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
  const eqTeam = opts.canonTeam
    ? (a, b) => { const ka = opts.canonTeam(a); return ka !== '' && ka === opts.canonTeam(b); }
    : eq;
  const eqScorer = opts.fuzzyScorer
    ? (a, b) => { const ka = scorerKey(a); return ka !== '' && ka === scorerKey(b); }
    : eq;
  if (oficial.champion && eqTeam(userPodio.champion, oficial.champion))   { result.champion = pts.champion; result.total += pts.champion; }
  if (oficial.runner   && eqTeam(userPodio.runner,   oficial.runner))     { result.runner   = pts.runner;   result.total += pts.runner; }
  if (oficial.scorer   && eqScorer(userPodio.scorer, oficial.scorer))     { result.scorer   = pts.scorer;   result.total += pts.scorer; }
  return result;
}

// Equipos que siguen en competencia. Una vez iniciada la fase KO (hay partidos KO
// con equipos reales), solo cuentan los que llegaron al KO y no perdieron; los
// eliminados en fase de grupos quedan fuera. Si aún es fase de grupos (sin KO real),
// se muestran todos. canonTeam(raw)->'' descarta placeholders (Por definir/Ganador…)
// y colapsa variantes del mismo país; se muestra el primer nombre visto.
export function aliveTeams(matches, canonTeam = defaultCanonTeam) {
  const all = new Map();        // canonKey -> display
  const koTeams = new Map();
  const eliminated = new Set(); // canonKeys
  const add = (map, t) => { const k = canonTeam(t); if (k && !map.has(k)) map.set(k, t); };
  for (const m of (matches || [])) {
    add(all, m.home); add(all, m.away);
    if (isGroupStage(m.stage)) continue;
    add(koTeams, m.home); add(koTeams, m.away);
    if (m.realHome == null || m.realAway == null) continue;
    const adv = matchAdvanceOutcome(m);
    if (adv == null) continue;
    const loser = adv === m.home ? m.away : (adv === m.away ? m.home : null);
    const lk = canonTeam(loser);
    if (lk) eliminated.add(lk);
  }
  const pool = koTeams.size > 0 ? koTeams : all;
  return [...pool.entries()]
    .filter(([k]) => !eliminated.has(k))
    .map(([, disp]) => disp)
    .sort((a, b) => a.localeCompare(b));
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

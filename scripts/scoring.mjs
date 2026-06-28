// Lógica pura del pozo "quién pasa" en eliminatorias.
// Sin dependencias de DOM/Firebase; testeable con node:test e importable desde index.html.

export function isGroupStage(stage) {
  return typeof stage === 'string' && stage.startsWith('Grupo');
}

// Quién pasó realmente (string) o null. Gana local/visita por diferencia a los 90';
// si hubo empate a 90', usa m.advances.
export function matchAdvanceOutcome(m) {
  if (!m || m.realHome == null || m.realAway == null) return null;
  if (m.realHome > m.realAway) return m.home;
  if (m.realAway > m.realHome) return m.away;
  if (m.advances === m.home || m.advances === m.away) return m.advances;
  return null;
}

// Qué equipo apostó el jugador que pasa (string) o null. Ganador => ese equipo;
// empate => pred.predAdvances.
export function playerAdvanceGuess(pred, m) {
  if (!pred || !m) return null;
  if (pred.predHome > pred.predAway) return m.home;
  if (pred.predAway > pred.predHome) return m.away;
  return pred.predAdvances ?? null;
}

// Puntos del pozo de avance para una predicción. null si no aplica/sin resultado;
// 0 si no acierta; si acierta, pool repartido entre los N acertadores.
export function advancePoints({ pred, match, allPreds, pool }) {
  if (!match || isGroupStage(match.stage)) return 0;
  const advancer = matchAdvanceOutcome(match);
  if (advancer == null) return null;
  if (playerAdvanceGuess(pred, match) !== advancer) return 0;
  const n = (allPreds || []).filter(
    p => p.matchId === match.id && playerAdvanceGuess(p, match) === advancer
  ).length || 1;
  return Math.round((pool / n) * 100) / 100;
}

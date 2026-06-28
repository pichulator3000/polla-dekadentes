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

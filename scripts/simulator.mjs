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

// scripts/sync_results.mjs — FIFA World Cup scoreboard sync via ESPN API
// Free, no API key required, real-time updates.
//
// Usage:
//   node scripts/sync_results.mjs
//   DRY_RUN=1 node scripts/sync_results.mjs
//
// Required env vars:
//   FIREBASE_SERVICE_ACCOUNT  — JSON string of the service account key
//   FIREBASE_DATABASE_URL     — e.g. https://myproject-default-rtdb.firebaseio.com

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';

// ─── Team name aliases: English (ESPN) → Spanish (Firebase) ────────────────────

const TEAM_ALIASES = {
  'mexico': 'México',
  'south africa': 'Sudáfrica',
  'korea republic': 'Corea del Sur',
  'south korea': 'Corea del Sur',
  'czech republic': 'República Checa',
  'czechia': 'República Checa',
  'germany': 'Alemania',
  'saudi arabia': 'Arabia Saudita',
  'algeria': 'Argelia',
  'austria': 'Austria',
  'bosnia and herzegovina': 'Bosnia',
  'bosnia-herzegovina': 'Bosnia',
  'bosnia': 'Bosnia',
  'brazil': 'Brasil',
  'belgium': 'Bélgica',
  'cape verde': 'Cabo Verde',
  'canada': 'Canadá',
  "côte d'ivoire": 'Costa de Marfil',
  'ivory coast': 'Costa de Marfil',
  'croatia': 'Croacia',
  'curaçao': 'Curazao',
  'curacao': 'Curazao',
  'egypt': 'Egipto',
  'scotland': 'Escocia',
  'spain': 'España',
  'united states': 'Estados Unidos',
  'usa': 'Estados Unidos',
  'france': 'Francia',
  'haiti': 'Haití',
  'england': 'Inglaterra',
  'iraq': 'Irak',
  'iran': 'Irán',
  'japan': 'Japón',
  'jordan': 'Jordania',
  'morocco': 'Marruecos',
  'norway': 'Noruega',
  'new zealand': 'Nueva Zelanda',
  'panama': 'Panamá',
  'netherlands': 'Países Bajos',
  'holland': 'Países Bajos',
  'dr congo': 'RD Congo',
  'congo dr': 'RD Congo',
  'democratic republic of congo': 'RD Congo',
  'sweden': 'Suecia',
  'switzerland': 'Suiza',
  'turkey': 'Turquía',
  'türkiye': 'Turquía',
  'tunisia': 'Túnez',
  'uzbekistan': 'Uzbekistán',
};

/**
 * Translate an English team name (as returned by ESPN) to its Spanish Firebase alias.
 * If no alias is found, the original name is returned unchanged.
 */
export function normalizeTeam(name) {
  const key = name.toLowerCase().trim();
  return TEAM_ALIASES[key] ?? name;
}

// Normalize a string for comparison: lowercase, no accents, only [a-z0-9]
function normCompare(s) {
  return s.toLowerCase().trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// ─── Firebase matching helpers ─────────────────────────────────────────────────

/**
 * Given raw ESPN competitor data, find the matching Firebase match object.
 * Returns null if no match exists or the match already has a final result.
 */
export function findFirebaseMatch(espnEvent, firebaseMatches) {
  const comp = espnEvent.competitions?.[0];
  if (!comp) return null;

  const homeTeam = comp.competitors?.[0]?.team?.displayName;
  const awayTeam = comp.competitors?.[1]?.team?.displayName;
  if (!homeTeam || !awayTeam) return null;

  const apiHome = normalizeTeam(homeTeam);
  const apiAway = normalizeTeam(awayTeam);
  const eventDate = new Date(espnEvent.date);
  const apiDay = eventDate.toISOString().slice(0, 10);

  for (const fm of firebaseMatches) {
    if (fm.realHome != null && fm.realAway != null) continue;

    const fmDay = new Date(fm.datetime).toISOString().slice(0, 10);
    const dayDiff = Math.abs((new Date(apiDay) - new Date(fmDay)) / 86400000);
    if (dayDiff > 1) continue;

    // Match in either orientation: ESPN's home/away designation may be the
    // reverse of how the fixture was entered in Firebase. Scores are realigned
    // later via resolveScores().
    const sameOrder = normCompare(fm.home) === normCompare(apiHome) && normCompare(fm.away) === normCompare(apiAway);
    const swapOrder = normCompare(fm.home) === normCompare(apiAway) && normCompare(fm.away) === normCompare(apiHome);
    if (sameOrder || swapOrder) return fm;
  }
  return null;
}

/**
 * Align ESPN scores to the Firebase match's home/away orientation.
 * apiHome/apiAway are the (already normalized) ESPN team names.
 * Returns { home, away } scores ordered to match fm.home / fm.away.
 */
export function resolveScores(fm, apiHome, apiAway, homeScore, awayScore) {
  const swapped = normCompare(fm.home) !== normCompare(apiHome);
  return swapped ? { home: awayScore, away: homeScore } : { home: homeScore, away: awayScore };
}

// Legacy helper for tests that used the football-data.org shape.
// Accepts { homeTeam: { name }, awayTeam: { name }, utcDate } for backward compat.
export function findFirebaseMatchLegacy(apiMatch, firebaseMatches) {
  const fakeEvent = {
    date: apiMatch.utcDate,
    competitions: [{
      competitors: [
        { team: { displayName: apiMatch.homeTeam.name } },
        { team: { displayName: apiMatch.awayTeam.name } },
      ],
    }],
  };
  return findFirebaseMatch(fakeEvent, firebaseMatches);
}

// Alias so existing tests can import it (same logic, different name for semantic clarity)
export const findFirebaseMatchForLive = findFirebaseMatchLegacy;

// ─── Bracket propagation (llaves que se arman solas) ──────────────────────────
//
// Cada partido de fase final lleva un `code` único (16A…16P, 8A…8H, 4A…4D,
// 2A/2B, 3P, F1) y, salvo los 16avos, dos "feeders" que apuntan al code del que
// sale cada equipo:
//   feedHome/feedAway = "8A"   → ganador del partido 8A
//   feedHome/feedAway = "L_2A" → perdedor del partido 2A   (para el 3er puesto)
// Mientras el feeder no esté decidido se muestra "Ganador 8A" / "Perdedor 2A".

/**
 * Winner / loser of a knockout match, or nulls if still undecided.
 * Empates (penales) se resuelven con el campo `advances` (nombre del que avanza,
 * que el sync toma del flag `winner` de ESPN).
 */
export function matchOutcome(m) {
  if (!m || m.realHome == null || m.realAway == null) return { winner: null, loser: null };
  if (m.realHome > m.realAway) return { winner: m.home, loser: m.away };
  if (m.realAway > m.realHome) return { winner: m.away, loser: m.home };
  if (m.advances === m.home) return { winner: m.home, loser: m.away };
  if (m.advances === m.away) return { winner: m.away, loser: m.home };
  return { winner: null, loser: null };
}

// Resolve a feeder spec ("8A" winner, "L_2A" loser) to a team name, or a
// placeholder ("Ganador 8A" / "Perdedor 2A") while the feeder is undecided.
function resolveFeeder(spec, byCode) {
  const isLoser = spec.startsWith('L_');
  const code = isLoser ? spec.slice(2) : spec;
  const out = matchOutcome(byCode[code]);
  const name = isLoser ? out.loser : out.winner;
  return name ?? ((isLoser ? 'Perdedor ' : 'Ganador ') + code);
}

/**
 * Given every match, compute the home/away each bracket slot SHOULD show.
 * Returns { [matchId]: { home, away } } only for slots whose names changed.
 * Cascades 16avos → octavos → … → final in a single call (mutates the in-memory
 * match objects so later rounds see freshly-resolved teams).
 */
export function computeBracketUpdates(matches) {
  const byCode = {};
  for (const m of matches) if (m.code) byCode[m.code] = m;
  const updates = {};
  let changed = true, guard = 0;
  while (changed && guard++ < 12) {
    changed = false;
    for (const m of matches) {
      if (!m.feedHome && !m.feedAway) continue;
      const home = m.feedHome ? resolveFeeder(m.feedHome, byCode) : m.home;
      const away = m.feedAway ? resolveFeeder(m.feedAway, byCode) : m.away;
      if (home !== m.home || away !== m.away) {
        m.home = home; m.away = away;
        updates[m.id] = { home, away };
        changed = true;
      }
    }
  }
  return updates;
}

// ─── Clasificación de estados del scoreboard de ESPN ─────────────────────────
//
// ESPN reporta distintos `status.type.name` según cómo termina el partido:
//   STATUS_FULL_TIME   → terminó en los 90'
//   STATUS_FINAL_AET   → terminó en el alargue (extra time, sin penales)
//   STATUS_FINAL_PEN   → terminó en penales
//   STATUS_FINAL       → genérico terminado
// OJO: si un estado final no está en esta lista, el partido nunca escribe
// realHome/realAway ni limpia liveHome/liveAway → queda "en vivo" para siempre.

const FINAL_STATUSES = new Set([
  'STATUS_FINAL',
  'STATUS_FULL_TIME',
  'STATUS_FINAL_AET',
  'STATUS_FINAL_PEN',
]);

const LIVE_STATUSES = new Set([
  'STATUS_IN_PLAY',
  'STATUS_FIRST_HALF',
  'STATUS_SECOND_HALF',
  'STATUS_HALFTIME',
  'STATUS_DELAYED',
]);

export function isFinalStatus(status) { return FINAL_STATUSES.has(status); }
export function isLiveStatus(status)  { return LIVE_STATUSES.has(status); }

// ─── Marcador por fases (90' / alargue / penales) ────────────────────────────
//
// La polla SOLO puntúa el resultado a los 90'. ESPN entrega el marcador agregado
// (incluye alargue) en el scoreboard, pero el endpoint `summary` da el desglose por
// período en linescores: [1ºT, 2ºT, (ET1, ET2, (penales))]. De ahí sacamos:
//   90'  = ls[0] + ls[1]
//   120' = suma de los 4 primeros (si fue a alargue)
//   pen  = ls[4] (si fue a penales)

/**
 * Convierte los linescores de ESPN (ya orientados a home/away de Firebase) en
 * marcadores por fase. `homeLs`/`awayLs` son arrays de `{displayValue}`.
 * Devuelve { reg90:[h,a], score120:[h,a]|null, pen:[h,a]|null } o null si los datos
 * son insuficientes/ inválidos.
 */
export function parsePeriods(homeLs, awayLs) {
  const toNums = (arr) => (arr || []).map((x) => parseInt(x?.displayValue ?? x));
  const h = toNums(homeLs);
  const a = toNums(awayLs);
  if (h.length < 2 || a.length < 2 || h.some(Number.isNaN) || a.some(Number.isNaN)) return null;
  const reg90 = [h[0] + h[1], a[0] + a[1]];
  let score120 = null;
  let pen = null;
  if (h.length >= 4 && a.length >= 4) {
    score120 = [h[0] + h[1] + h[2] + h[3], a[0] + a[1] + a[2] + a[3]];
  }
  if (h.length >= 5 && a.length >= 5) {
    pen = [h[4], a[4]];
  }
  return { reg90, score120, pen };
}

/**
 * Calcula los campos a escribir para un partido FINAL respetando la regla "puntúa
 * el 90'".
 *  - Grupos: `realHome/realAway` = score del scoreboard (ya es 90').
 *  - Fase final con desglose: `realHome/realAway` = 90', y `score120*`/`pen*` si los
 *    hubo; `advances` = quién clasifica.
 *  - Fase final sin desglose confiable (`periods` null): NO se escribe el score (no se
 *    inventa un 90' incorrecto); solo se registra `advances` para armar la llave.
 * No incluye claves con valor undefined.
 */
export function resolveFinalUpdate({ stage, scoreHome, scoreAway, periods, winnerName }) {
  const isKnockout = !/^Grupo/i.test(stage || '');
  const upd = { liveHome: null, liveAway: null };
  if (!isKnockout) {
    upd.realHome = parseInt(scoreHome);
    upd.realAway = parseInt(scoreAway);
    return upd;
  }
  if (!periods) {
    if (winnerName) upd.advances = winnerName;
    return upd;
  }
  upd.realHome = periods.reg90[0];
  upd.realAway = periods.reg90[1];
  if (periods.score120) {
    upd.score120Home = periods.score120[0];
    upd.score120Away = periods.score120[1];
  }
  if (periods.pen) {
    upd.penHome = periods.pen[0];
    upd.penAway = periods.pen[1];
  }
  if (winnerName) upd.advances = winnerName;
  return upd;
}

/**
 * Pide el `summary` de un evento de ESPN y devuelve el desglose por fase
 * (parsePeriods) orientado al home/away del partido de Firebase. null si falla.
 */
async function fetchPeriodsForMatch(fbMatch, espnEventId) {
  try {
    const res = await fetch(`${ESPN_SUMMARY}?event=${espnEventId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    const comps = data?.header?.competitions?.[0]?.competitors ?? [];
    if (comps.length < 2) return null;
    const byTeam = {};
    for (const c of comps) {
      byTeam[normCompare(normalizeTeam(c.team?.displayName ?? ''))] = c.linescores;
    }
    return parsePeriods(byTeam[normCompare(fbMatch.home)], byTeam[normCompare(fbMatch.away)]);
  } catch {
    return null;
  }
}

// ─── Main runner ───────────────────────────────────────────────────────────────

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await run();
}

async function run() {
  const DRY_RUN = process.env.DRY_RUN === '1';

  const required = ['FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_DATABASE_URL'];
  for (const key of required) {
    if (!process.env[key]) { console.error(`Missing required env var: ${key}`); process.exit(1); }
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch {
    console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON'); process.exit(1);
  }

  const admin = await import('firebase-admin');
  admin.default.initializeApp({
    credential: admin.default.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
  const db = admin.default.database();

  // Load matches from Firebase
  const snap = await db.ref('pf/matches').once('value');
  const allMatches = Object.values(snap.val() ?? {});
  const mundialMatches = allMatches.filter(m => m.tournament === 'Mundial 2026');
  console.log(`Firebase: ${mundialMatches.length} partidos del Mundial 2026`);

  // ─── Self-heal: invariante "si hay resultado final, no hay live" ──────────────
  // Si un partido tiene realHome/realAway pero quedó con liveHome/liveAway colgados
  // (final cargado a mano, o un FINAL que el sync no alcanzó a capturar mientras el
  // partido aún estaba en vivo y luego salió de la ventana de ESPN), el frontend
  // muestra el live viejo como si siguiera en juego. Lo limpiamos en cada ciclo.
  let clearedStale = 0;
  for (const fm of mundialMatches) {
    const hasReal = fm.realHome != null && fm.realAway != null;
    const hasLive = fm.liveHome != null || fm.liveAway != null;
    if (!hasReal || !hasLive) continue;
    if (DRY_RUN) {
      console.log(`[dry-run CLEAR-LIVE] ${fm.home} ${fm.away} (real ${fm.realHome}-${fm.realAway}, live colgado ${fm.liveHome}-${fm.liveAway})`);
      continue;
    }
    await db.ref(`pf/matches/${fm.id}`).update({ liveHome: null, liveAway: null });
    console.log(`CLEAR-LIVE ${fm.home} ${fm.away} (real ${fm.realHome}-${fm.realAway})`);
    clearedStale++;
  }

  // ─── Armar las llaves: propagar ganadores/perdedores por el bracket ──────────
  // Cada partido de fase final apunta (via feedHome/feedAway + code) al que sale
  // su rival. Acá resolvemos los nombres reales en cascada y los persistimos para
  // que octavos→final se vayan completando solos a medida que entran resultados.
  const bracketUpdates = computeBracketUpdates(mundialMatches);
  let bracketResolved = 0;
  for (const [id, upd] of Object.entries(bracketUpdates)) {
    if (DRY_RUN) {
      console.log(`[dry-run BRACKET] ${id} → ${upd.home} vs ${upd.away}`);
      continue;
    }
    await db.ref(`pf/matches/${id}`).update(upd);
    console.log(`BRACKET ${id} → ${upd.home} vs ${upd.away}`);
    bracketResolved++;
  }

  // Fetch ESPN scoreboard sobre una ventana de días (no solo hoy). Así, si en un
  // ciclo anterior nos perdimos el FINAL de un partido (p.ej. terminó en alargue y
  // el estado quedó sin capturar), lo recuperamos: findFirebaseMatch ignora los que
  // ya tienen resultado, así que reprocesar días recientes es idempotente y barato.
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const today = new Date();
  const from = new Date(today); from.setUTCDate(from.getUTCDate() - 3);
  const res = await fetch(`${ESPN_BASE}?dates=${fmt(from)}-${fmt(today)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) { console.error(`ESPN fetch error: ${res.status}`); process.exit(1); }
  const data = await res.json();

  let updatedFinal = 0;
  let updatedLive = 0;

  for (const event of (data.events ?? [])) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const status = event.status?.type?.name;
    const homeTeam = comp.competitors?.[0]?.team?.displayName;
    const awayTeam = comp.competitors?.[1]?.team?.displayName;
    const homeScore = comp.competitors?.[0]?.score;
    const awayScore = comp.competitors?.[1]?.score;

    if (!homeTeam || !awayTeam) continue;
    if (homeScore == null || awayScore == null) continue;

    const fbMatch = findFirebaseMatch(event, mundialMatches);
    if (!fbMatch) {
      const espHome = normalizeTeam(homeTeam);
      const espAway = normalizeTeam(awayTeam);
      console.warn(`[sin match ${status}] ${espHome} ${homeScore}-${awayScore} ${espAway}`);
      continue;
    }

    // Align scores to the Firebase home/away orientation (ESPN may have them reversed)
    const { home: fbHomeScore, away: fbAwayScore } = resolveScores(
      fbMatch, normalizeTeam(homeTeam), normalizeTeam(awayTeam), homeScore, awayScore,
    );

    if (isFinalStatus(status)) {
      // La polla solo puntúa el 90'. Para fase final pedimos el desglose por período
      // (summary → linescores) y derivamos 90'/120'/penales; el `winner` de ESPN dice
      // quién clasifica (sirve para armar la llave aunque haya alargue o penales).
      const isKnockout = !/^Grupo/i.test(fbMatch.stage || '');
      const winnerComp = comp.competitors?.find(c => c.winner === true);
      const winnerName = winnerComp?.team?.displayName ? normalizeTeam(winnerComp.team.displayName) : null;
      const periods = isKnockout ? await fetchPeriodsForMatch(fbMatch, event.id) : null;

      const finalUpdate = resolveFinalUpdate({
        stage: fbMatch.stage,
        scoreHome: fbHomeScore,
        scoreAway: fbAwayScore,
        periods,
        winnerName,
      });

      const desc = 'realHome' in finalUpdate
        ? `${fbMatch.home} ${finalUpdate.realHome}-${finalUpdate.realAway} ${fbMatch.away} (90')`
          + (finalUpdate.score120Home != null ? ` · 120' ${finalUpdate.score120Home}-${finalUpdate.score120Away}` : '')
          + (finalUpdate.penHome != null ? ` · pen ${finalUpdate.penHome}-${finalUpdate.penAway}` : '')
        : `${fbMatch.home} vs ${fbMatch.away} (sin desglose 90' — pendiente)`;
      if (DRY_RUN) {
        console.log(`[dry-run FINAL] ${desc}${finalUpdate.advances ? ` · avanza ${finalUpdate.advances}` : ''}`);
        continue;
      }
      await db.ref(`pf/matches/${fbMatch.id}`).update(finalUpdate);
      console.log(`FINAL ${desc}${finalUpdate.advances ? ` · avanza ${finalUpdate.advances}` : ''}`);
      updatedFinal++;
    } else if (isLiveStatus(status)) {
      if (DRY_RUN) {
        console.log(`[dry-run LIVE] ${fbMatch.home} ${fbHomeScore}-${fbAwayScore} ${fbMatch.away}`);
        continue;
      }
      await db.ref(`pf/matches/${fbMatch.id}`).update({
        liveHome: parseInt(fbHomeScore),
        liveAway: parseInt(fbAwayScore),
      });
      console.log(`LIVE ${fbMatch.home} ${fbHomeScore}-${fbAwayScore} ${fbMatch.away}`);
      updatedLive++;
    }
  }

  console.log(`\nResumen: ${updatedFinal} finales, ${updatedLive} en vivo actualizados, ${clearedStale} live colgados limpiados, ${bracketResolved} llaves resueltas`);
  process.exit(0);
}

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

    if (normCompare(fm.home) === normCompare(apiHome) && normCompare(fm.away) === normCompare(apiAway)) return fm;
  }
  return null;
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

  // Fetch ESPN scoreboard
  const res = await fetch(ESPN_BASE, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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

    if (status === 'STATUS_FINAL' || status === 'STATUS_FULL_TIME') {
      if (DRY_RUN) {
        console.log(`[dry-run FINAL] ${fbMatch.home} ${homeScore}-${awayScore} ${fbMatch.away}`);
        continue;
      }
      await db.ref(`pf/matches/${fbMatch.id}`).update({
        realHome: parseInt(homeScore),
        realAway: parseInt(awayScore),
        liveHome: null,
        liveAway: null,
      });
      console.log(`FINAL ${fbMatch.home} ${homeScore}-${awayScore} ${fbMatch.away}`);
      updatedFinal++;
    } else if (status === 'STATUS_IN_PLAY' || status === 'STATUS_FIRST_HALF' || status === 'STATUS_SECOND_HALF' || status === 'STATUS_HALFTIME' || status === 'STATUS_DELAYED') {
      if (DRY_RUN) {
        console.log(`[dry-run LIVE] ${fbMatch.home} ${homeScore}-${awayScore} ${fbMatch.away}`);
        continue;
      }
      await db.ref(`pf/matches/${fbMatch.id}`).update({
        liveHome: parseInt(homeScore),
        liveAway: parseInt(awayScore),
      });
      console.log(`LIVE ${fbMatch.home} ${homeScore}-${awayScore} ${fbMatch.away}`);
      updatedLive++;
    }
  }

  console.log(`\nResumen: ${updatedFinal} finales, ${updatedLive} en vivo actualizados`);
  process.exit(0);
}

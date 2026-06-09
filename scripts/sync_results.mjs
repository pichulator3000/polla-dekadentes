// scripts/sync_results.mjs

// ─── Alias de equipos: inglés (football-data.org) → español (Firebase) ───────
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

export function normalizeTeam(name) {
  const key = name.toLowerCase().trim();
  return TEAM_ALIASES[key] ?? name;
}

// Retorna el partido de Firebase que corresponde al partido de la API,
// o null si no hay match o si ya tiene resultado.
export function findFirebaseMatch(apiMatch, firebaseMatches) {
  const apiDay = apiMatch.utcDate.slice(0, 10); // "YYYY-MM-DD" en UTC
  const apiHome = normalizeTeam(apiMatch.homeTeam.name);
  const apiAway = normalizeTeam(apiMatch.awayTeam.name);

  for (const fm of firebaseMatches) {
    // Ignorar si ya tiene resultado
    if (fm.realHome != null && fm.realAway != null) continue;

    // Comparar día (la fecha UTC del partido puede diferir ±1 día con UTC-4)
    const fmDay = new Date(fm.datetime).toISOString().slice(0, 10);
    const dayDiff = Math.abs(
      (new Date(apiDay) - new Date(fmDay)) / (1000 * 60 * 60 * 24)
    );
    if (dayDiff > 1) continue;

    if (fm.home === apiHome && fm.away === apiAway) return fm;
  }
  return null;
}

// ─── Ejecución principal ──────────────────────────────────────────────────────
if (process.argv[1] === new URL(import.meta.url).pathname) {
  await run();
}

async function run() {
  const admin = await import('firebase-admin');
  const DRY_RUN = process.env.DRY_RUN === '1';

  // Inicializar Firebase Admin
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.default.initializeApp({
    credential: admin.default.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
  const db = admin.default.database();

  // Obtener partidos finalizados del Mundial 2026 desde football-data.org
  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED', {
    headers: { 'X-Auth-Token': process.env.FDATA_API_KEY },
  });
  if (!res.ok) {
    console.error(`football-data.org error: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const { matches: apiMatches } = await res.json();
  console.log(`football-data.org: ${apiMatches.length} partidos finalizados`);

  // Obtener partidos del Mundial 2026 desde Firebase
  const snap = await db.ref('pf/matches').once('value');
  const allMatches = Object.values(snap.val() ?? {});
  const mundialMatches = allMatches.filter(m => m.tournament === 'Mundial 2026');
  console.log(`Firebase: ${mundialMatches.length} partidos del Mundial 2026`);

  let updated = 0;
  let unmatched = 0;

  for (const apiMatch of apiMatches) {
    const { home, away } = apiMatch.score.fullTime;
    if (home == null || away == null) continue;

    const fbMatch = findFirebaseMatch(apiMatch, mundialMatches);
    if (!fbMatch) {
      console.warn(`[sin match] ${apiMatch.homeTeam.name} vs ${apiMatch.awayTeam.name} (${apiMatch.utcDate.slice(0, 10)})`);
      unmatched++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`[dry-run] ${fbMatch.home} ${home}-${away} ${fbMatch.away} → id=${fbMatch.id}`);
      continue;
    }

    await db.ref(`pf/matches/${fbMatch.id}`).update({ realHome: home, realAway: away });
    console.log(`✓ ${fbMatch.home} ${home}-${away} ${fbMatch.away}`);
    updated++;
  }

  console.log(`\nResumen: ${updated} actualizados, ${unmatched} sin match`);
  process.exit(0);
}

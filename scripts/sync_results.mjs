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

export function findFirebaseMatchForLive(apiMatch, firebaseMatches) {
  const apiDay = apiMatch.utcDate.slice(0, 10);
  const apiHome = normalizeTeam(apiMatch.homeTeam.name);
  const apiAway = normalizeTeam(apiMatch.awayTeam.name);

  for (const fm of firebaseMatches) {
    if (fm.realHome != null && fm.realAway != null) continue;

    const fmDay = new Date(fm.datetime).toISOString().slice(0, 10);
    const dayDiff = Math.abs(
      (new Date(apiDay) - new Date(fmDay)) / (1000 * 60 * 60 * 24)
    );
    if (dayDiff > 1) continue;

    if (fm.home === apiHome && fm.away === apiAway) return fm;
  }
  return null;
}

// Lee los headers de throttling y espera si el cupo está bajo.
// Retorna los headers para que el caller pueda decidir si esperar antes del próximo request.
async function throttle(res) {
  const available = parseInt(res.headers.get('X-RequestsAvailable') ?? '1', 10);
  const resetIn   = parseInt(res.headers.get('X-RequestCounter-Reset') ?? '0', 10);
  console.log(`[throttle] requests available: ${available}, reset in: ${resetIn}s`);
  return { available, resetIn };
}

// Espera si el cupo está agotado, ANTES de hacer el próximo request.
async function waitForQuota(available, resetIn) {
  if (available < 2 && resetIn > 0) {
    const wait = (resetIn + 2) * 1000;
    console.log(`[throttle] cupo bajo (${available}) — esperando ${wait/1000}s antes del próximo request`);
    await new Promise(r => setTimeout(r, wait));
  }
}

// ─── Ejecución principal ──────────────────────────────────────────────────────
if (process.argv[1] === new URL(import.meta.url).pathname) {
  await run();
}

async function run() {
  const DRY_RUN = process.env.DRY_RUN === '1';

  const required = ['FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_DATABASE_URL', 'FDATA_API_KEY'];
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

  // Obtener partidos del Mundial 2026 desde Firebase
  const snap = await db.ref('pf/matches').once('value');
  const allMatches = Object.values(snap.val() ?? {});
  const mundialMatches = allMatches.filter(m => m.tournament === 'Mundial 2026');
  console.log(`Firebase: ${mundialMatches.length} partidos del Mundial 2026`);

  // ── Partidos terminados ──────────────────────────────────────────────────
  const finRes = await fetch(
    'https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED',
    { headers: { 'X-Auth-Token': process.env.FDATA_API_KEY } }
  );
  if (!finRes.ok) { console.error(`FINISHED fetch error: ${finRes.status}`); process.exit(1); }
  const finQuota = await throttle(finRes);
  const { matches: finishedMatches } = await finRes.json();
  console.log(`football-data.org: ${finishedMatches.length} partidos terminados`);

  let updatedFinal = 0;
  for (const apiMatch of finishedMatches) {
    const { home, away } = apiMatch.score?.fullTime ?? {};
    if (home == null || away == null) { console.warn(`[sin score] ${apiMatch.homeTeam.name} vs ${apiMatch.awayTeam.name} score=${JSON.stringify(apiMatch.score)}`); continue; }

    const apiHome = normalizeTeam(apiMatch.homeTeam.name);
    const apiAway = normalizeTeam(apiMatch.awayTeam.name);
    const fbMatch = findFirebaseMatch(apiMatch, mundialMatches);
    if (!fbMatch) {
      console.warn(`[sin match FINISHED] ${apiMatch.homeTeam.name}(${apiHome}) vs ${apiMatch.awayTeam.name}(${apiAway}) utcDate=${apiMatch.utcDate}`);
      // Debug: list Firebase matches for that day
      const apiDay = apiMatch.utcDate.slice(0, 10);
      const sameDay = mundialMatches.filter(fm => { const d = new Date(fm.datetime).toISOString().slice(0,10); return Math.abs((new Date(apiDay)-new Date(d))/86400000) <= 1; });
      console.warn(`  Firebase same day (${apiDay}): ${sameDay.length} matches`);
      sameDay.forEach(fm => console.warn(`    - ${fm.home} vs ${fm.away} (${fm.datetime}) real=${fm.realHome}`));
      continue;
    }

    if (DRY_RUN) {
      console.log(`[dry-run FINAL] ${fbMatch.home} ${home}-${away} ${fbMatch.away}`);
      continue;
    }

    await db.ref(`pf/matches/${fbMatch.id}`).update({
      realHome: home,
      realAway: away,
      liveHome: null,
      liveAway: null,
    });
    console.log(`✓ FINAL ${fbMatch.home} ${home}-${away} ${fbMatch.away}`);
    updatedFinal++;
  }

  // ── Partidos en vivo ─────────────────────────────────────────────────────
  await waitForQuota(finQuota.available, finQuota.resetIn);
  const liveRes = await fetch(
    'https://api.football-data.org/v4/competitions/WC/matches?status=IN_PLAY,PAUSED',
    { headers: { 'X-Auth-Token': process.env.FDATA_API_KEY } }
  );
  if (!liveRes.ok) { console.error(`IN_PLAY fetch error: ${liveRes.status}`); process.exit(1); }
  await throttle(liveRes);
  const { matches: liveMatches } = await liveRes.json();
  console.log(`football-data.org: ${liveMatches.length} partidos en vivo`);

  let updatedLive = 0;
  for (const apiMatch of liveMatches) {
    const score = apiMatch.score?.fullTime ?? {};
    const lh = score.home ?? 0;
    const la = score.away ?? 0;

    const fbMatch = findFirebaseMatchForLive(apiMatch, mundialMatches);
    if (!fbMatch) {
      console.warn(`[sin match LIVE] ${apiMatch.homeTeam.name} vs ${apiMatch.awayTeam.name}`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`[dry-run LIVE] ${fbMatch.home} ${lh}-${la} ${fbMatch.away}`);
      continue;
    }

    await db.ref(`pf/matches/${fbMatch.id}`).update({ liveHome: lh, liveAway: la });
    console.log(`🔴 LIVE ${fbMatch.home} ${lh}-${la} ${fbMatch.away}`);
    updatedLive++;
  }

  console.log(`\nResumen: ${updatedFinal} finales, ${updatedLive} en vivo actualizados`);
  process.exit(0);
}

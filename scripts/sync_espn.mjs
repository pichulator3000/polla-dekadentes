// scripts/sync_results.mjs — ESPN API (fifa.world)
// Gratis, sin API key, actualización en tiempo real

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

// Normaliza para comparación: lowercase, sin acentos, sin espacios extra
function normCompare(s) {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

// Mapeo de nombres ESPN → Firebase (español)
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

function translateTeam(name) {
  const key = name.toLowerCase().trim();
  return TEAM_ALIASES[key] ?? name;
}

function findFirebaseMatch(apiHome, apiAway, dayStr, firebaseMatches) {
  const nHome = normCompare(apiHome);
  const nAway = normCompare(apiAway);
  for (const fm of firebaseMatches) {
    if (fm.realHome != null && fm.realAway != null) continue;
    const fmDay = new Date(fm.datetime).toISOString().slice(0, 10);
    const dayDiff = Math.abs((new Date(dayStr) - new Date(fmDay)) / 86400000);
    if (dayDiff > 1) continue;
    if (normCompare(fm.home) === nHome && normCompare(fm.away) === nAway) return fm;
  }
  return null;
}

// ─── Ejecución principal ──────────────────────────────────────────────────────
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

  // Obtener partidos de Firebase
  const snap = await db.ref('pf/matches').once('value');
  const allMatches = Object.values(snap.val() ?? {});
  const mundialMatches = allMatches.filter(m => m.tournament === 'Mundial 2026');
  console.log(`Firebase: ${mundialMatches.length} partidos del Mundial 2026`);

  // Obtener scoreboard de ESPN
  const res = await fetch(ESPN_BASE, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) { console.error(`ESPN fetch error: ${res.status}`); process.exit(1); }
  const data = await res.json();

  let updatedFinal = 0;
  let updatedLive = 0;

  for (const event of data.events) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const status = event.status?.type?.name; // STATUS_FULL_TIME, STATUS_IN_PLAY, STATUS_SCHEDULED, etc.
    const homeTeam = comp.competitors?.[0]?.team?.displayName;
    const awayTeam = comp.competitors?.[1]?.team?.displayName;
    const homeScore = comp.competitors?.[0]?.score;
    const awayScore = comp.competitors?.[1]?.score;

    if (!homeTeam || !awayTeam) continue;

    // Traducir nombres a español
    const espHome = translateTeam(homeTeam);
    const espAway = translateTeam(awayTeam);

    // Fecha del evento
    const eventDate = new Date(event.date);
    const dayStr = eventDate.toISOString().slice(0, 10);

    if (status === 'STATUS_FULL_TIME' || status === 'STATUS_FINAL') {
      // Partido terminado → escribir realHome/realAway
      if (homeScore == null || awayScore == null) continue;
      const fbMatch = findFirebaseMatch(espHome, espAway, dayStr, mundialMatches);
      if (!fbMatch) {
        console.warn(`[sin match FINAL] ${espHome} ${homeScore}-${awayScore} ${espAway}`);
        // Debug
        const sameDay = mundialMatches.filter(fm => {
          const d = new Date(fm.datetime).toISOString().slice(0, 10);
          return Math.abs((new Date(dayStr) - new Date(d)) / 86400000) <= 1;
        });
        console.warn(`  Firebase same day: ${sameDay.length} matches`);
        sameDay.forEach(fm => console.warn(`    - ${fm.home} vs ${fm.away} (${fm.datetime})`));
        continue;
      }
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
      console.log(`✓ FINAL ${fbMatch.home} ${homeScore}-${awayScore} ${fbMatch.away}`);
      updatedFinal++;
    } else if (status === 'STATUS_IN_PLAY' || status === 'STATUS_HALFTIME' || status === 'STATUS_DELAYED') {
      // Partido en vivo → escribir liveHome/liveAway
      if (homeScore == null || awayScore == null) continue;
      const fbMatch = findFirebaseMatch(espHome, espAway, dayStr, mundialMatches);
      if (!fbMatch) {
        console.warn(`[sin match LIVE] ${espHome} ${homeScore}-${awayScore} ${espAway}`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`[dry-run LIVE] ${fbMatch.home} ${homeScore}-${awayScore} ${fbMatch.away}`);
        continue;
      }
      await db.ref(`pf/matches/${fbMatch.id}`).update({
        liveHome: parseInt(homeScore),
        liveAway: parseInt(awayScore),
      });
      console.log(`🔴 LIVE ${fbMatch.home} ${homeScore}-${awayScore} ${fbMatch.away}`);
      updatedLive++;
    }
  }

  // También procesar eventos EN vivo sin score (partido empezando)
  for (const event of data.events) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const status = event.status?.type?.name;
    if (status !== 'STATUS_IN_PLAY' && status !== 'STATUS_HALFTIME') continue;

    const homeTeam = comp.competitors?.[0]?.team?.displayName;
    const awayTeam = comp.competitors?.[1]?.team?.displayName;
    const homeScore = comp.competitors?.[0]?.score ?? 0;
    const awayScore = comp.competitors?.[1]?.score ?? 0;
    if (!homeTeam || !awayTeam) continue;

    const espHome = translateTeam(homeTeam);
    const espAway = translateTeam(awayTeam);
    const eventDate = new Date(event.date);
    const dayStr = eventDate.toISOString().slice(0, 10);

    const fbMatch = findFirebaseMatch(espHome, espAway, dayStr, mundialMatches);
    if (!fbMatch) continue;
    if (fbMatch.liveHome != null && fbMatch.liveAway != null) continue; // ya actualizado arriba

    if (DRY_RUN) {
      console.log(`[dry-run LIVE INIT] ${fbMatch.home} 0-0 ${fbMatch.away}`);
      continue;
    }
    await db.ref(`pf/matches/${fbMatch.id}`).update({
      liveHome: parseInt(homeScore),
      liveAway: parseInt(awayScore),
    });
    console.log(`🔴 LIVE ${fbMatch.home} ${homeScore}-${awayScore} ${fbMatch.away}`);
    updatedLive++;
  }

  console.log(`\nResumen: ${updatedFinal} finales, ${updatedLive} en vivo actualizados`);
  process.exit(0);
}

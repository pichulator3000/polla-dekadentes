// scripts/fix_knockout_dates.mjs — corrige fechas/horas de la FASE FINAL en Firebase.
//
// Las llaves (octavos, cuartos, semis, 3er puesto, final) quedaron con fechas
// erróneas en Firebase. Este script las reescribe usando el calendario REAL de la
// API de ESPN (misma fuente que scripts/sync_results.mjs). Solo toca `datetime` y
// `closesAtMs`; nunca marcadores, equipos ni llaves.
//
// Uso (por defecto NO escribe, solo muestra el plan):
//   FIREBASE_SERVICE_ACCOUNT='...' FIREBASE_DATABASE_URL='https://...' \
//     node scripts/fix_knockout_dates.mjs
//
// Para aplicar de verdad, añade APPLY=1:
//   APPLY=1 FIREBASE_SERVICE_ACCOUNT='...' FIREBASE_DATABASE_URL='https://...' \
//     node scripts/fix_knockout_dates.mjs
//
// Emparejamiento:
//   1) Partidos con equipos ya definidos (octavos, R32) → por nombre de equipo (exacto).
//   2) Rondas aún sin definir (cuartos/semis/3P/final) → por ronda, en orden
//      cronológico (se respeta el orden de llave ya guardado).

import { normalizeTeam } from './sync_results.mjs';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const KO_STAGES = ['Ronda de 32', 'Octavos', 'Cuartos de Final', 'Semifinal', 'Tercer Puesto', 'Final'];

const norm = s => (s || '').toLowerCase().trim()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

const isPlaceholder = name => !name || /^(ganador|perdedor)\s/i.test(name);

// Clasifica un evento de ESPN por su fecha LOCAL de Chile (evita que un partido
// nocturno cruce de día en UTC y caiga en la ronda equivocada).
function stageForDate(utcISO) {
  const d = new Date(utcISO).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // YYYY-MM-DD
  if (d <= '2026-07-03') return 'Ronda de 32';
  if (d <= '2026-07-07') return 'Octavos';
  if (d <= '2026-07-12') return 'Cuartos de Final';
  if (d <= '2026-07-15') return 'Semifinal';
  if (d === '2026-07-18') return 'Tercer Puesto';
  if (d === '2026-07-19') return 'Final';
  return null;
}

// Normaliza el `stage` de Firebase (puede venir decorado, ej "Octavos · Sede...").
function normStageFb(stage) {
  const s = stage || '';
  for (const ko of KO_STAGES) if (s === ko || s.startsWith(ko + ' ')) return ko;
  return null;
}

export async function fetchEspnKnockout() {
  const events = [];
  const start = Date.parse('2026-06-28T00:00:00Z');
  const end = Date.parse('2026-07-19T00:00:00Z');
  for (let t = start; t <= end; t += 86400000) {
    const ds = new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
    let data;
    try {
      const res = await fetch(`${ESPN_BASE}?dates=${ds}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      data = await res.json();
    } catch { continue; }
    for (const e of data.events || []) {
      const cs = e.competitions?.[0]?.competitors || [];
      const home = cs[0]?.team?.displayName;
      const away = cs[1]?.team?.displayName;
      events.push({
        date: e.date, // ISO UTC, ej "2026-07-04T17:00Z"
        home: home ? normalizeTeam(home) : null,
        away: away ? normalizeTeam(away) : null,
        stage: stageForDate(e.date),
        label: e.shortName || e.name || '',
        used: false,
      });
    }
  }
  return events;
}

// Construye el plan de cambios. `ko` = [{m, stage}], `espn` = eventos de ESPN.
// 1) equipos reales → match por nombre (exacto, cualquier orientación).
// 2) rondas sin definir → por ronda, en orden cronológico (zip).
export function buildPlan(ko, espn) {
  for (const e of espn) e.used = false;
  const plan = [];
  for (const { m, stage } of ko) {
    if (isPlaceholder(m.home) || isPlaceholder(m.away)) continue;
    const h = norm(m.home), a = norm(m.away);
    const ev = espn.find(e => !e.used && e.home && e.away &&
      ((norm(e.home) === h && norm(e.away) === a) || (norm(e.home) === a && norm(e.away) === h)));
    if (ev) { ev.used = true; plan.push({ m, stage, newDate: ev.date, via: 'equipos' }); }
  }
  const planned = new Set(plan.map(p => p.m.id));
  for (const stage of KO_STAGES) {
    const slots = ko.filter(x => x.stage === stage && !planned.has(x.m.id))
      .sort((x, y) => new Date(x.m.datetime || 0) - new Date(y.m.datetime || 0));
    const evs = espn.filter(e => e.stage === stage && !e.used)
      .sort((x, y) => new Date(x.date) - new Date(y.date));
    for (let i = 0; i < slots.length && i < evs.length; i++) {
      evs[i].used = true;
      plan.push({ m: slots[i].m, stage, newDate: evs[i].date, via: 'orden' });
    }
  }
  return plan;
}

const fmtCL = iso => new Date(iso).toLocaleString('es-CL', {
  timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

async function main() {
  const APPLY = process.env.APPLY === '1';
  for (const k of ['FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_DATABASE_URL']) {
    if (!process.env[k]) { console.error(`Falta env var: ${k}`); process.exit(1); }
  }
  let serviceAccount;
  try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); }
  catch { console.error('FIREBASE_SERVICE_ACCOUNT no es JSON válido'); process.exit(1); }

  const admin = await import('firebase-admin');
  admin.default.initializeApp({
    credential: admin.default.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
  const db = admin.default.database();

  const snap = await db.ref('pf/matches').once('value');
  const all = [];
  snap.forEach(ch => { all.push({ id: ch.key, ...ch.val() }); });

  const ko = all.map(m => ({ m, stage: normStageFb(m.stage) })).filter(x => x.stage);
  if (!ko.length) { console.error('No se encontraron partidos de fase final en pf/matches.'); process.exit(1); }

  const espn = await fetchEspnKnockout();
  const plan = buildPlan(ko, espn);

  // Reporte + aplicación
  plan.sort((a, b) => new Date(a.newDate) - new Date(b.newDate));
  let changed = 0;
  console.log(`\n${APPLY ? 'APLICANDO' : 'DRY-RUN (no escribe; usa APPLY=1 para aplicar)'} — ${plan.length} partidos de fase final\n`);
  for (const p of plan) {
    const before = p.m.datetime ? fmtCL(p.m.datetime) : '—';
    const after = fmtCL(p.newDate);
    const same = p.m.datetime && new Date(p.m.datetime).getTime() === new Date(p.newDate).getTime();
    const teams = `${p.m.home || '?'} vs ${p.m.away || '?'}`;
    console.log(`${same ? '  ok' : '  →→'} [${p.stage}] ${teams.padEnd(34)} ${before} → ${after} (${p.via})`);
    if (same) continue;
    changed++;
    if (APPLY) {
      await db.ref(`pf/matches/${p.m.id}`).update({
        datetime: p.newDate,
        closesAtMs: new Date(p.newDate).getTime(),
      });
    }
  }
  console.log(`\n${APPLY ? 'Actualizados' : 'A cambiar'}: ${changed}. Sin cambios: ${plan.length - changed}.`);
  process.exit(0);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(e => { console.error(e); process.exit(1); });
}

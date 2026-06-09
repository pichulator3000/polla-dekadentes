# Auto-sync Resultados Mundial 2026 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar automáticamente los resultados finales del Mundial 2026 desde football-data.org a Firebase Realtime Database usando un GitHub Actions workflow.

**Architecture:** Un script Node.js (`scripts/sync_results.mjs`) corre en GitHub Actions cada 5 minutos durante horario de partidos. Lee partidos finalizados de football-data.org, los empareja con los partidos en Firebase por fecha y nombre de equipo normalizado, y escribe `realHome`/`realAway` solo si el partido terminó y no hay resultado previo.

**Tech Stack:** Node.js 20, `firebase-admin`, `node-fetch` (built-in en Node 18+), GitHub Actions, football-data.org API v4.

---

## Archivos a crear/modificar

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `scripts/sync_results.mjs` | Crear | Script principal: fetch API + match + write Firebase |
| `scripts/sync_results.test.mjs` | Crear | Tests de normalización y matching |
| `.github/workflows/sync-results.yml` | Crear | Workflow de GitHub Actions |

---

## Task 1: Tests de normalización de equipos

**Files:**
- Create: `scripts/sync_results.test.mjs`

- [ ] **Step 1: Crear el archivo de tests**

```js
// scripts/sync_results.test.mjs
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { normalizeTeam, findFirebaseMatch } from './sync_results.mjs';

test('normalizeTeam: convierte nombre inglés a español', () => {
  assert.equal(normalizeTeam('Korea Republic'), 'Corea del Sur');
  assert.equal(normalizeTeam('Czech Republic'), 'República Checa');
  assert.equal(normalizeTeam('United States'), 'Estados Unidos');
  assert.equal(normalizeTeam('Netherlands'), 'Países Bajos');
  assert.equal(normalizeTeam('Germany'), 'Alemania');
  assert.equal(normalizeTeam('France'), 'Francia');
  assert.equal(normalizeTeam('England'), 'Inglaterra');
  assert.equal(normalizeTeam('Switzerland'), 'Suiza');
  assert.equal(normalizeTeam('Morocco'), 'Marruecos');
  assert.equal(normalizeTeam('Ivory Coast'), 'Costa de Marfil');
});

test('normalizeTeam: nombres ya en español pasan sin cambio', () => {
  assert.equal(normalizeTeam('Argentina'), 'Argentina');
  assert.equal(normalizeTeam('Brasil'), 'Brasil');
  assert.equal(normalizeTeam('Colombia'), 'Colombia');
});

test('normalizeTeam: case-insensitive', () => {
  assert.equal(normalizeTeam('korea republic'), 'Corea del Sur');
  assert.equal(normalizeTeam('GERMANY'), 'Alemania');
});

test('findFirebaseMatch: encuentra partido por fecha y equipos', () => {
  const firebaseMatches = [
    {
      id: 'abc',
      home: 'México',
      away: 'Sudáfrica',
      datetime: '2026-06-11T15:00:00.000-04:00',
      tournament: 'Mundial 2026',
      realHome: null,
      realAway: null,
    },
    {
      id: 'def',
      home: 'Corea del Sur',
      away: 'República Checa',
      datetime: '2026-06-11T22:00:00.000-04:00',
      tournament: 'Mundial 2026',
      realHome: null,
      realAway: null,
    },
  ];

  const apiMatch = {
    utcDate: '2026-06-11T19:00:00Z', // = 15:00 UTC-4
    homeTeam: { name: 'Mexico' },
    awayTeam: { name: 'South Africa' },
    score: { fullTime: { home: 2, away: 1 } },
    status: 'FINISHED',
  };

  const result = findFirebaseMatch(apiMatch, firebaseMatches);
  assert.equal(result.id, 'abc');
});

test('findFirebaseMatch: retorna null si no hay match', () => {
  const firebaseMatches = [
    {
      id: 'abc',
      home: 'Argentina',
      away: 'Brasil',
      datetime: '2026-06-15T21:00:00.000-04:00',
      tournament: 'Mundial 2026',
      realHome: null,
      realAway: null,
    },
  ];

  const apiMatch = {
    utcDate: '2026-06-11T19:00:00Z',
    homeTeam: { name: 'Mexico' },
    awayTeam: { name: 'South Africa' },
    score: { fullTime: { home: 2, away: 1 } },
    status: 'FINISHED',
  };

  const result = findFirebaseMatch(apiMatch, firebaseMatches);
  assert.equal(result, null);
});

test('findFirebaseMatch: no matchea partidos ya con resultado', () => {
  const firebaseMatches = [
    {
      id: 'abc',
      home: 'México',
      away: 'Sudáfrica',
      datetime: '2026-06-11T15:00:00.000-04:00',
      tournament: 'Mundial 2026',
      realHome: 2,
      realAway: 1,
    },
  ];

  const apiMatch = {
    utcDate: '2026-06-11T19:00:00Z',
    homeTeam: { name: 'Mexico' },
    awayTeam: { name: 'South Africa' },
    score: { fullTime: { home: 2, away: 1 } },
    status: 'FINISHED',
  };

  const result = findFirebaseMatch(apiMatch, firebaseMatches);
  assert.equal(result, null);
});
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```bash
node --test scripts/sync_results.test.mjs
```

Esperado: error `Cannot find module './sync_results.mjs'`

---

## Task 2: Script principal `sync_results.mjs`

**Files:**
- Create: `scripts/sync_results.mjs`

- [ ] **Step 1: Crear el script con la lógica de normalización y matching**

```js
// scripts/sync_results.mjs
import admin from 'firebase-admin';

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

// ─── Ejecución principal (se omite en tests por la condición import.meta) ────
if (process.argv[1] === new URL(import.meta.url).pathname) {
  await run();
}

async function run() {
  const DRY_RUN = process.env.DRY_RUN === '1';

  // Inicializar Firebase Admin
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
  const db = admin.database();

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
    if (home == null || away == null) continue; // score incompleto

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
```

- [ ] **Step 2: Correr los tests**

```bash
node --test scripts/sync_results.test.mjs
```

Esperado: todos los tests en verde (PASS).

- [ ] **Step 3: Commit**

```bash
git add scripts/sync_results.mjs scripts/sync_results.test.mjs
git commit -m "feat: add sync_results script with team normalization"
```

---

## Task 3: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/sync-results.yml`

- [ ] **Step 1: Crear el workflow**

```yaml
# .github/workflows/sync-results.yml
name: Sync Mundial 2026 Results

on:
  schedule:
    # 10:00–23:59 hora Chile (UTC-4) = 14:00–03:59 UTC
    - cron: '*/5 14-23 * * *'
    # 00:00–03:00 hora Chile (UTC-4) = 04:00–07:00 UTC
    - cron: '*/5 0-7 * * *'
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry run (no escribe en Firebase)'
        required: false
        default: 'false'
        type: boolean

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install firebase-admin

      - name: Run sync
        env:
          FDATA_API_KEY: ${{ secrets.FDATA_API_KEY }}
          FIREBASE_DATABASE_URL: ${{ secrets.FIREBASE_DATABASE_URL }}
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          DRY_RUN: ${{ github.event.inputs.dry_run == 'true' && '1' || '0' }}
        run: node scripts/sync_results.mjs
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/sync-results.yml
git commit -m "feat: add GitHub Actions workflow for auto-sync results"
```

---

## Task 4: Secrets setup (manual, una sola vez)

- [ ] **Step 1: Obtener API key de football-data.org**

1. Ir a https://www.football-data.org/client/register
2. Registrar cuenta gratuita
3. El API key llegará por email en minutos
4. Copiar el token (formato: `abcdef1234567890abcdef1234567890`)

- [ ] **Step 2: Obtener Service Account JSON de Firebase**

1. Ir a [Firebase Console](https://console.firebase.google.com) → proyecto `polla-dekadentes`
2. Engranaje ⚙️ → Configuración del proyecto → Cuentas de servicio
3. Click "Generar nueva clave privada" → descargar el JSON
4. El JSON se ve así:
   ```json
   {
     "type": "service_account",
     "project_id": "polla-dekadentes",
     "private_key_id": "...",
     "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...",
     "client_email": "firebase-adminsdk-...@polla-dekadentes.iam.gserviceaccount.com",
     ...
   }
   ```

- [ ] **Step 3: Agregar secrets en GitHub**

Ir a https://github.com/pichulator3000/polla-dekadentes/settings/secrets/actions → "New repository secret"

| Secret | Valor |
|---|---|
| `FDATA_API_KEY` | El token de football-data.org |
| `FIREBASE_DATABASE_URL` | `https://polla-dekadentes-default-rtdb.firebaseio.com` |
| `FIREBASE_SERVICE_ACCOUNT` | El contenido completo del JSON descargado (en una sola línea o con saltos de línea) |

> Nota: `FIREBASE_SERVICE_ACCOUNT` ya existe si el backup workflow funciona — verificar si está y solo agregar `FDATA_API_KEY` y `FIREBASE_DATABASE_URL` si falta.

- [ ] **Step 4: Verificar con dry-run**

Ir a https://github.com/pichulator3000/polla-dekadentes/actions → workflow "Sync Mundial 2026 Results" → "Run workflow" → activar "Dry run" → click "Run workflow"

Revisar los logs. Esperado:
```
football-data.org: N partidos finalizados
Firebase: M partidos del Mundial 2026
[dry-run] México 2-1 Sudáfrica → id=abc123
Resumen: 0 actualizados, 0 sin match
```

(0 actualizados es correcto en dry-run)

- [ ] **Step 5: Correr sin dry-run para verificar escritura real**

Una vez que el Mundial empiece y haya partidos finalizados:
1. Ir a Actions → "Run workflow" sin activar dry-run
2. Verificar en Firebase Console → Realtime Database → `pf/matches/{id}` que `realHome` y `realAway` tienen valores
3. Verificar en la app que el partido aparece como "✓ Fin" con puntos calculados

---

## Notas de troubleshooting

**Sin matches en dry-run:** football-data.org puede no tener el Mundial 2026 indexado hasta que empiece. El script simplemente no encontrará partidos — es seguro, no rompe nada.

**Partido "sin match" en logs:** Agregar el nombre del equipo al dict `TEAM_ALIASES` en `sync_results.mjs`. El log muestra el nombre exacto que devuelve la API.

**Error 403 en football-data.org:** El plan gratuito no incluye todas las competiciones. Verificar que el Mundial 2026 esté disponible en el tier gratuito — históricamente los Mundiales están incluidos en el free tier.

**`FIREBASE_SERVICE_ACCOUNT` ya existe:** El workflow de backup ya usa este secret. No es necesario volver a crearlo.

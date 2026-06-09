# Auto-sync de resultados — Mundial 2026

**Fecha:** 2026-06-09  
**Estado:** Aprobado (actualizado con live scores)  
**Contexto:** La app polla-dekadentes requiere que los admins ingresen resultados manualmente. El Mundial 2026 empieza el 11 de junio, se necesita sincronización automática con marcadores en vivo.

---

## Objetivo

Sincronizar automáticamente los resultados del Mundial 2026 desde football-data.org hacia Firebase Realtime Database:
- **Resultados finales** → se guardan en `realHome`/`realAway` al terminar el partido
- **Marcadores en vivo** → se guardan en `liveHome`/`liveAway` durante el partido; la tabla de posiciones los usa como puntuación provisional

---

## Arquitectura

```
[GitHub Actions Workflow]
        │
        ├── cada 5 min (10:00–03:00 UTC-4)
        └── dispatch manual
              │
              ▼
    [scripts/sync_results.mjs]
        │
        ├── GET football-data.org/v4/competitions/WC/matches?status=FINISHED
        │       → escribe realHome/realAway (no sobreescribe si ya existe)
        │
        ├── GET football-data.org/v4/competitions/WC/matches?status=IN_PLAY,PAUSED
        │       → escribe liveHome/liveAway
        │
        ├── GET Firebase pf/matches (partidos del Mundial 2026)
        │
        ├── Match por fecha + equipos normalizados (TEAM_ALIASES)
        │
        └── SET pf/matches/{id}
                  realHome/realAway  (partidos terminados)
                  liveHome/liveAway  (partidos en vivo; null cuando termina)
```

---

## Componentes

### `scripts/sync_results.mjs`

- Dos fetch a football-data.org: `status=FINISHED` y `status=IN_PLAY,PAUSED`
- Lee `pf/matches` de Firebase filtrando por `tournament === "Mundial 2026"`
- Normaliza nombres de equipos con `TEAM_ALIASES` (~50 entradas, inglés → español)
- Lógica de match: fecha (±1 día de tolerancia) + ambos equipos normalizados
- Reglas de escritura para **partidos terminados**:
  - Solo escribe si `status === FINISHED`
  - No sobreescribe `realHome`/`realAway` si ya hay resultado guardado
  - Cuando escribe `realHome`/`realAway`, también borra `liveHome`/`liveAway` (set null)
  - Si hay discrepancia entre valor guardado y API → loguea warning, no escribe
- Reglas de escritura para **partidos en vivo**:
  - Solo escribe `liveHome`/`liveAway` si `status === IN_PLAY || PAUSED`
  - Sobreescribe siempre (el marcador va cambiando durante el partido)
  - No escribe si `realHome` ya tiene valor (partido ya terminado en Firebase)

### `.github/workflows/sync-results.yml`

- Trigger `schedule`: dos entradas cron:
  - `*/5 14-23 * * *` UTC (= 10:00–19:59 UTC-4)
  - `*/5 0-7 * * *` UTC (= 20:00–03:00 UTC-4, madrugada siguiente)
- Trigger `workflow_dispatch` con input opcional `dry_run`
- Steps: checkout → setup Node 20 → npm install firebase-admin → run script
- Secrets: `FDATA_API_KEY`, `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT`

### GitHub Secrets

| Secret | Descripción |
|---|---|
| `FDATA_API_KEY` | API key de football-data.org (gratis) |
| `FIREBASE_DATABASE_URL` | `https://polla-dekadentes-default-rtdb.firebaseio.com` |
| `FIREBASE_SERVICE_ACCOUNT` | JSON del Service Account de Firebase |

---

## Cambios en Firebase (schema)

Campos nuevos en `pf/matches/{id}`:

| Campo | Tipo | Descripción |
|---|---|---|
| `liveHome` | number \| null | Goles local durante el partido (null si no hay partido en vivo) |
| `liveAway` | number \| null | Goles visita durante el partido |

Los campos `realHome`/`realAway` existentes no cambian.

---

## Lógica de normalización

```js
const TEAM_ALIASES = {
  'korea republic': 'Corea del Sur',
  'czech republic': 'República Checa',
  'united states': 'Estados Unidos',
  // ... ~50 entradas
};

function normalizeTeam(name) {
  return TEAM_ALIASES[name.toLowerCase().trim()] ?? name;
}
```

Match exitoso = misma fecha (±1 día) + ambos equipos normalizados coinciden con `home`/`away` en Firebase.

---

## Cambios en el frontend (index.html)

### `calcPoints(pred, match, allPreds)`

Actualmente retorna `null` si `match.realHome == null`. Se modifica para también calcular puntos provisionales si `match.liveHome != null`:

```js
function calcPoints(pred, match, allPreds) {
  const rh = match.realHome ?? match.liveHome;
  const ra = match.realAway ?? match.liveAway;
  if (rh == null || ra == null) return null;
  // ... resto igual usando rh/ra en vez de match.realHome/realAway
}
```

### `renderRanking()`

- Incluye partidos con `liveHome != null` (además de `realHome != null`) en el cálculo de puntos
- Si hay al menos un partido live, muestra banner: `⚡ Puntuación provisional — hay partidos en vivo`
- Puntos provisionales se muestran en amarillo/naranja en vez de azul para distinguirlos

### Match cards (fixture)

- Cuando `status === 'live'` y `liveHome != null`: muestra `liveHome - liveAway` en el badge del partido
- El badge "🔴 En vivo" existente se mantiene; se agrega el marcador al lado

---

## Flujo completo durante un partido

1. **Antes del partido** — `open`: inputs habilitados, sin marcador
2. **Al empezar** — `locked/live`: inputs bloqueados, badge "🔴 En vivo"
3. **Primer gol** — sync escribe `liveHome: 1, liveAway: 0`; todos los clientes ven `🔴 1-0`; tabla se actualiza provisionalmente
4. **Fin del partido** — sync escribe `realHome: 2, realAway: 1` y `liveHome: null, liveAway: null`; partido pasa a `done`; tabla muestra puntos definitivos

---

## Limitaciones

- football-data.org free tier: 10 req/min — 2 req/ejecución (FINISHED + IN_PLAY), muy por debajo
- GitHub Actions free tier: 2000 min/mes — ~430 min totales (dentro del límite)
- Los marcadores en vivo dependen de cuándo football-data.org los actualiza (no es instantáneo, puede haber 1-3 min de lag)
- La tabla provisional puede mostrar puntos distintos a los finales si hay goles tardíos en el último minuto

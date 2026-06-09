# Auto-sync de resultados — Mundial 2026

**Fecha:** 2026-06-09  
**Estado:** Aprobado  
**Contexto:** La app polla-dekadentes requiere que los admins ingresen resultados manualmente. El Mundial 2026 empieza el 11 de junio, se necesita sincronización automática.

---

## Objetivo

Sincronizar automáticamente los resultados finales de los partidos del Mundial 2026 desde football-data.org hacia Firebase Realtime Database, sin intervención manual del admin.

---

## Arquitectura

```
[GitHub Actions Workflow]
        │
        ├── cada 5 min (10:00–03:00 UTC-4)
        └── dispatch manual
              │
              ▼
    [sync_results.py]
        │
        ├── GET football-data.org/v4/competitions/WC/matches
        │       (solo status=FINISHED, jornada actual)
        │
        ├── GET Firebase pf/matches (todos los partidos del Mundial)
        │
        ├── Match por fecha + equipos normalizados (TEAM_ALIASES)
        │
        └── SET pf/matches/{id}/realHome + realAway
                (solo si partido terminado y no hay resultado previo)
```

---

## Componentes

### `sync_results.py`

- Llama a `football-data.org/v4/competitions/WC/matches?status=FINISHED`
- Lee `pf/matches` de Firebase filtrando por `tournament == "Mundial 2026"`
- Normaliza nombres de equipos con `TEAM_ALIASES` (dict ~30 entradas, inglés → español)
- Lógica de match: fecha (±1 día de tolerancia) + ambos equipos normalizados
- Reglas de escritura:
  - Solo escribe si `status == FINISHED` en football-data
  - No sobreescribe si ya hay un resultado guardado (safe by default)
  - Si hay discrepancia entre valor guardado y API → loguea warning, no escribe
  - Si un partido no matchea → loguea "unmatched", no escribe

### `.github/workflows/sync-results.yml`

- Trigger `schedule`: dos entradas cron:
  - `*/5 14-23 * * *` UTC (= 10:00–19:59 UTC-4)
  - `*/5 0-7 * * *` UTC (= 20:00–03:00 UTC-4, madrugada siguiente)  
  _(GitHub Actions usa UTC; 14:00 UTC = 10:00 UTC-4, 07:00 UTC = 03:00 UTC-4)_
- Trigger `workflow_dispatch`: para ejecución manual desde GitHub UI
- Steps: checkout → setup Python → pip install → run script
- Secrets requeridos: `FDATA_API_KEY`, `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT`

### GitHub Secrets

| Secret | Descripción |
|---|---|
| `FDATA_API_KEY` | API key de football-data.org (gratis, registrar en football-data.org) |
| `FIREBASE_DATABASE_URL` | URL del Realtime DB (`https://polla-dekadentes-default-rtdb.firebaseio.com`) |
| `FIREBASE_SERVICE_ACCOUNT` | JSON del Service Account de Firebase (con permisos de escritura en Realtime DB) |

---

## Lógica de normalización de equipos

```python
TEAM_ALIASES = {
    "korea republic": "Corea del Sur",
    "czech republic": "República Checa",
    "united states": "Estados Unidos",
    "usa": "Estados Unidos",
    # ... ~30 entradas
}

def normalize(name: str) -> str:
    key = name.lower().strip()
    return TEAM_ALIASES.get(key, name)
```

Match exitoso = misma fecha (día) + `normalize(home)` == nombre en Firebase + `normalize(away)` == nombre en Firebase.

Si no hay match exacto, intenta coincidencia parcial (uno de los equipos contiene el otro). Si sigue fallando, loguea y continúa.

---

## Flujo de datos en la app

Cuando el script escribe `realHome`/`realAway` en Firebase:
1. Los listeners `on('value')` en todos los clientes reciben el cambio
2. `CACHE.matches` se actualiza
3. La UI re-renderiza el partido como `done` con los puntos calculados

No se requiere ningún cambio en `index.html`.

---

## Dependencias Python

```
requests
firebase-admin
```

---

## Setup requerido (una sola vez)

1. Registrar cuenta en football-data.org → obtener API key gratuita
2. En Firebase Console → IAM → crear Service Account con rol "Firebase Realtime Database Admin" → descargar JSON
3. Agregar los 3 secrets en GitHub repo → Settings → Secrets → Actions
4. El workflow queda activo automáticamente desde el merge

---

## Limitaciones y consideraciones

- football-data.org free tier: 10 req/min — con schedule de 5 min esto es 1 req cada 5 min, muy por debajo del límite
- GitHub Actions free tier: 2000 min/mes — el workflow dura ~15s, corriendo 5 veces/hora × 17 horas × 64 días del Mundial ≈ 850 ejecuciones × 0.25 min ≈ 213 min. Dentro del límite.
- El script no arranca partidos (no toca `datetime` ni metadatos), solo escribe resultados finales
- Si football-data no tiene aún el partido del Mundial 2026 en su base de datos, el script simplemente no encuentra matches y no escribe nada — no rompe nada

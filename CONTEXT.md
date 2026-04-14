# Polla Dekadentes — Contexto del Proyecto

> **Para la IA:** Respuestas cortas, sin saludos ni despedidas. Ir directo al punto. Optimizar tokens.

---

## Qué es

App web de predicciones de fútbol para un grupo de amigos (polla = pool chileno). Cada partido tiene un pozo de 30 pts que se reparte entre los que aciertan el resultado. Marcador exacto = puntos × 2.

**Contexto actual:** Preparada para el Mundial 2026.

---

## Arquitectura

- **Un solo archivo:** `index.html` (~2543 líneas). Sin build system, sin package.json.
- **Repo:** `https://github.com/pichulator3000/polla-dekadentes` (rama `main`)
- **Stack:**
  - Vanilla HTML/CSS/JS + TailwindCSS (CDN)
  - Firebase Realtime Database (backend y persistencia)
  - Chart.js 4.4.4 (gráfico evolución de puntos)
  - SheetJS XLSX 0.20.2 (importar fixture desde Excel)
  - Web Crypto API (SHA-256 para passwords)

---

## Firebase — Estructura de datos

```
pf/
  users/{id}               → { id, code, name, passHash, rawPass, isAdmin }
  matches/{id}             → { id, home, away, datetime(ISO UTC), tournament, stage, realHome, realAway }
  preds/{userId}__{matchId} → { userId, matchId, predHome, predAway }
  podio/{userId}           → { userId, champion, runner, scorer }
  pending/{code}           → { id, code, name, passHash, rawPass, ts }
  settings/                → { regLocked, regApproval }
```

**Config Firebase** (hardcoded en el HTML):
- `projectId`: `polla-dekadentes`
- `databaseURL`: `https://polla-dekadentes-default-rtdb.firebaseio.com`

---

## Sistema de puntos

- Pozo fijo de **30 pts** por partido
- Se divide en partes iguales entre quienes aciertan el resultado (local/empate/visita)
- Marcador exacto → su parte × 2
- Sin predicción = 0 pts
- Predicciones cierran exactamente a la hora del partido

---

## Tabs / Pantallas

| Tab | ID | Descripción |
|---|---|---|
| Inicio | `home` | Bienvenida, KPIs (mis pts / promedio / exactos), gráfico evolución acumulada, próximos partidos con inputs de predicción |
| Fixture | `partidos` | Partidos agrupados por torneo (pills) y fase (acordeón `<details>`). Inputs de predicción o resultado (admin). Distribución de apuestas al cerrarse. Panel de predicciones por partido (solo admin, expandible). |
| Ranking | `ranking` | Tabla: pos, nombre, pts, exactos, correctos, PJ |
| Stats | `stats` | KPIs globales, tabla por jugador, tabla por equipo, distribución de apuestas, predicciones de podio (visible solo si el torneo ya empezó) |
| Podio | `podio` | Predecir campeón / subcampeón / goleador. Se bloquea al inicio del primer partido. Muestra predicciones de todos. |
| Reglas | `reglas` | Estático |
| Admin | `admin` | Solo admin. Resultados (ingresar/editar), gestión de usuarios, agregar partido manual, importar Excel, borrar todo. |
| Ajustes | `ajustes` | Editar perfil (nombre, contraseña). Modo PC / mostrar usuario. Admin extras: visor de predicciones por jugador, log de actividad, gestión de usuarios + cola de aprobación. |

---

## Estado global (JS)

```js
CACHE      // espejo local de Firebase: { users, matches, preds, podio, pending, settings }
LOADED     // { users, matches, preds, podio } — flags de carga inicial
dbReady    // true cuando los 4 LOADED son true
currentUser // usuario logueado
currentTab  // tab activo

SESSION    // localStorage 'pf_sess' — persistencia de login
PREFS      // localStorage 'pf_prefs' — { pcMode, showUser }
_revealed  // Set en memoria — claves de contraseñas reveladas (reset al recargar)
_openPredPanels // Set en memoria — paneles de predicciones abiertos en Fixture
```

---

## Funciones clave

| Función | Qué hace |
|---|---|
| `initFirebase()` | Monta todos los listeners de Firebase |
| `calcPoints(pred, match, allPreds)` | Lógica de puntuación |
| `getStatus(m)` | `'open'` \| `'live'` \| `'locked'` \| `'done'` |
| `isPodioLocked()` | true si ya empezó el primer partido |
| `renderMatches()` | Renderiza Fixture |
| `renderRanking()` | Renderiza Ranking |
| `renderStats()` | Renderiza Stats |
| `buildAdminGestion()` | Construye HTML del panel Admin |
| `renderAjustes()` | Renderiza Ajustes |
| `addMatch()` | Admin agrega partido manual |
| `importarExcel(input)` | Admin importa fixture desde Excel |
| `setResult(id)` | Admin guarda resultado oficial |
| `savePred(matchId)` | Usuario guarda predicción en Fixture |
| `saveUpcomingPred(matchId)` | Usuario guarda predicción desde Inicio |
| `saveFixturePred(userId, matchId)` | Admin edita predicción de un jugador (desde Fixture) |
| `debouncedRefresh()` | Refresca la tab activa 300ms después de cambio en Firebase |

---

## Admin — Importar Excel

Columnas esperadas (primera hoja):
```
local | visita | torneo | fase | fecha_hora_chile
```
- `fecha_hora_chile` se interpreta en zona horaria Chile (UTC-4), se convierte a ISO UTC al guardar
- Filas con "Por definir" o fechas vacías se omiten

---

## Autenticación

- Custom, sin Firebase Auth
- Password hasheada con SHA-256 (`hashPass()`)
- `rawPass` también se guarda en Firebase (para que admin pueda revelar contraseñas)
- Admin por defecto: código `admin`, contraseña `admin123`
- Registro: libre / cerrado / modo aprobación (toggle en Ajustes admin)

---

## Bugs conocidos / deuda técnica

- **`renderPredsViewer()` no existe** — es llamada desde `saveAjPredEdit()` (línea ~2196) pero fue eliminada en el commit `b0f9ecd`. El `#predsCard` en Ajustes también queda vacío. Hay que reimplementar o eliminar la llamada.
- **`predsPanel`** se usa en `renderMatches()` pero puede no estar definido en todos los paths del loop (depende del commit `b0f9ecd`).
- Timezone en `addMatch()`: usa offset hardcodeado `+4h` asumiendo Chile UTC-4 (ignora horario de verano).

---

## Colores / Design tokens

| Var | Uso |
|---|---|
| `#0f172a` | Fondo app |
| `#1e293b` | Cards |
| `#334155` | Borders |
| `#facc15` | Amarillo primario (acento, puntos) |
| `#4ade80` | Verde (correcto) |
| `#f87171` | Rojo (incorrecto) |
| `#60a5fa` | Azul (info) |
| `#c084fc` | Violeta (admin) |

---

## Git

- Rama: `main`
- Remote: `origin → https://github.com/pichulator3000/polla-dekadentes.git`
- Owner de repo: cuenta `pichulator3000` (también del mismo dueño)
- Colaborador activo: `raimundoopazol`
- Sin CI/CD

---

## Instrucciones para la IA

- Respuestas **cortas y directas**. Sin saludos, sin despedidas, sin resúmenes al final.
- El proyecto es **un solo `index.html`**. No crear archivos adicionales salvo que sea estrictamente necesario.
- Siempre **leer el archivo antes de editar**.
- Actualizar este `CONTEXT.md` cuando haya cambios estructurales relevantes (nuevas features, bugs resueltos, cambios de arquitectura).
- El lenguaje del código y UI es **español chileno** (informal).
- Hacer `git push` solo si el usuario lo pide explícitamente.

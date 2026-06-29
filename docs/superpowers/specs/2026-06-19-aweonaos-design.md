# Diseño — "Los aweonaos"

**Fecha:** 2026-06-19
**Archivo afectado:** `index.html` (app de un solo archivo)

## Objetivo

Mostrar, con tono jugado/bromista, quiénes **olvidaron pronosticar** un partido
("los aweonaos"). Es por partido: los aweonaos de un partido son los jugadores
que no dejaron pronóstico antes de que ese partido cerrara.

## Definición de "aweonao"

Para un partido `m`:

- Aplica **solo si el partido cerró**: `getStatus(m) !== 'open'` (live / locked / done).
- Aweonao = usuario **no-admin** sin pronóstico para `m`, es decir **no existe**
  `p` en `CACHE.preds` con `p.userId === u.id && p.matchId === m.id && p.predHome != null`.
- Se excluyen:
  - Partidos con equipos "Por definir" (`m.home === 'Por definir' || m.away === 'Por definir'`).
  - Torneos ocultos (`isTournamentHidden(m.tournament || 'Sin Torneo')`).
- Universo de jugadores: `CACHE.users.filter(u => !u.isAdmin)`.

## Arquitectura: un helper central, tres consumidores

Helpers nuevos (sin estado, derivan todo de `CACHE`):

- `aweonaosDeMatch(m)` → `User[]`
  - Si `getStatus(m) === 'open'` → retorna `[]`.
  - Si el partido es TBD u oculto → retorna `[]`.
  - Si no, retorna los jugadores no-admin sin pronóstico válido para `m`.

- `aweonaoStats(scope)` → `Array<{ id, name, olvidos }>`
  - `scope` = filtro de torneo del ranking (`selectedRankTournament`: `'__all__'`
    o un torneo puntual), reutilizando la misma lógica de filtrado que `renderRanking`.
  - Considera solo partidos **cerrados, no-TBD, no-ocultos** dentro del scope.
  - Por cada jugador no-admin: `olvidos` = cuántos de esos partidos no pronosticó.
  - Orden: `olvidos` desc, luego nombre asc.

Estos helpers se ubican junto a los demás helpers de partidos/predicciones en
`index.html` (cerca de `calcPoints` / `getStatus`).

## Consumidor 1 — Fixture

En `renderMatches` (dentro de `renderStageMatches`), para cada partido con
`status !== 'open'`, agregar una línea dentro de la `.card-match`:

- Con olvidos: `🧠 Aweonaos: Nombre1, Nombre2, …`
- Sin olvidos: `✅ No hubieron aweonaos este partido, todos pusieron sus pronósticos`

Estilo: línea pequeña (font ~11px), color tenue para el caso positivo y un rojo/ámbar
suave para destacar los nombres en el caso negativo. Se muestra para todos los
espectadores (jugadores y admin). Se ubica después de la fila de marcador/resultado.

## Consumidor 2 — Dashboard en vivo

En `renderLiveDash`, agregar una sección nueva (después de la tabla "Quién gana más
puntos"):

- Encabezado: `🧠 Aweonaos`.
- Cuerpo: chips con los nombres (mismo estilo `.ld-chip` del dashboard), o el mensaje
  positivo si no hubo aweonaos.
- Usa `aweonaosDeMatch(LD.m)`.

## Consumidor 3 — Ranking

En `renderRanking`, tras renderizar la tabla principal, agregar una **sección aparte
debajo**: `🧠 Los más aweonaos`.

- Mini-tabla ordenada por `olvidos` desc (solo jugadores con `olvidos >= 1`).
- Columnas: posición, nombre, `olvidos` (conteo, sin porcentaje).
- El primero del listado lleva un emoji de "aweonao mayor": 🤡.
- Si nadie tiene olvidos: `✅ Nadie ha olvidado pronosticar… por ahora`.
- Respeta el filtro de torneo activo del ranking (`selectedRankTournament`).

## Casos borde

- **Sin jugadores no-admin:** las secciones no muestran aweonaos (listas vacías →
  mensaje positivo / lista vacía).
- **Partido aún abierto:** no se muestra nada de aweonaos (todavía pueden pronosticar).
- **Jugador agregado después de que un partido cerró:** contará como aweonao de ese
  partido (no tenía pronóstico). Aceptado: es el comportamiento simple y esperado.
- **Re-render en vivo:** el dashboard se re-renderiza completo en `refreshActiveTab`;
  la sección de aweonaos se recalcula con él. Sin estado persistente.

## No incluido (YAGNI)

- No hay notificaciones ni "shaming" push.
- No se persiste nada nuevo en Firebase: todo se deriva de datos existentes
  (`CACHE.matches`, `CACHE.preds`, `CACHE.users`).
- No hay configuración de admin para esta feature.

## Verificación

- `node --check` sobre el script inline (sin errores de sintaxis).
- Prueba manual: un partido cerrado con un jugador sin pronóstico debe listarlo en
  fixture, dashboard y sumar en el ranking de aweonaos; un partido donde todos
  pronosticaron debe mostrar el mensaje positivo.

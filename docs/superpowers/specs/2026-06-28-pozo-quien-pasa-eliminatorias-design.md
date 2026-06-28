# Pozo "quién pasa" en eliminatorias (2º forma de repartir puntos)

**Fecha:** 2026-06-28
**Estado:** Diseño aprobado

## Problema / Objetivo

Hoy cada partido reparte un **pozo por fase** entre quienes aciertan el signo del
resultado a los 90' (local/empate/visita); el marcador exacto duplica la parte. En
eliminatorias eso deja fuera la pregunta natural de "¿quién pasa a la siguiente fase?".

Se agrega una **segunda forma de repartir puntos**, independiente y sumada a la
existente: un pozo de **20 puntos por partido de fase final** que se reparte a partes
iguales entre **todos** los que aciertan qué equipo avanza.

Clave: la predicción del resultado ya implica una predicción de "quién pasa".

- Quien predice un **ganador** está diciendo implícitamente que ese equipo pasa.
- Quien predice **empate** elige explícitamente el equipo que avanza.

**No** se pregunta ni se puntúa el **método** (90'/120'/penales): no hay ×1.5.

### Ejemplos

- Predijo Brasil 2-1 → "pasa Brasil". Brasil avanza (como sea) → acierta quién pasa.
- Predijo 1-1 + "pasa Brasil" y Brasil avanza → acierta quién pasa.
- Predijo Chile 2-1 pero pasó Brasil → no acierta, 0.

Fuera de alcance: cambiar el pozo de resultado (90') existente; predecir o puntuar el
método. Grupos no participan de este pozo.

## Contexto ya implementado (dependencias)

- En fase final solo puntúa el **90'** (`realHome/realAway`); existen `score120Home/
  score120Away`, `penHome/penAway` y `advances` (equipo que avanza), seteados por el
  sync (ver `2026-06-28-resultados-fase-final-90-alargue-penales-design.md`).
- `index.html` ya tiene la lógica de "quién pasa" para mostrar llaves
  (`resolveBracketDisplay` → `outcome(m)`): gana local/visita si hay diferencia a los
  90'; si hubo empate a los 90', manda `advances`. Esta lógica se reutiliza.
- Motor de puntos del resultado: `calcPoints` → `_pointsAt` (pozo/N, exacto ×2).

## Modelo de datos

**Predicción** (`pf/preds/{userId}__{matchId}`). Campo nuevo, **opcional**, solo
presente cuando el jugador predice **empate** en un partido de **fase final**:

| Campo | Valor |
|-------|-------|
| `predAdvances` | nombre del equipo que el jugador cree que avanza (`m.home` o `m.away`) |

El ganador-predictor no llena este campo: su "quién pasa" es el equipo que puso
ganador. Si el jugador cambia un marcador de empate a no-empate, `predAdvances` se
limpia. No existe campo de método.

**Partido**: sin campos nuevos (usa `advances`, `score120*`, `penHome/penAway`).

**Settings**: `pf/settings/advancePool` (number, default **20**), editable por admin,
único para todas las eliminatorias.

Las reglas de Firebase (`pf/preds`, `pf/settings`) no validan estructura, no requieren
cambios.

## Lógica de puntaje

Función pura nueva `calcAdvancePoints(pred, match, allPreds)`. Devuelve los puntos del
pozo de 20 para esa predicción, **independiente** del pozo de resultado.

- Aplica **solo a partidos de fase final finalizados**. Grupos → `0`. Partido sin
  resultado / `actualAdvancer` indefinido → `null`.
- Identificación de fase final: igual que el resto del código (KO si `normStage(m.stage)`
  no es un grupo, o presencia de `m.code`).

Pasos:

1. **Quién pasó (`actualAdvancer`)**: `matchAdvanceOutcome(m)`:
   - `realHome > realAway` → `m.home`
   - `realAway > realHome` → `m.away`
   - empate a 90' → `m.advances` (si es `m.home`/`m.away`); si no hay → `null`.
2. **Guess del jugador** (`playerAdvanceGuess`):
   - `predHome > predAway` → `m.home`
   - `predAway > predHome` → `m.away`
   - empate (`predHome === predAway`) → `pred.predAdvances`
3. **Acertadores** = predicciones cuyo equipo `=== actualAdvancer`. `N` = cantidad.
   Si el jugador no es acertador → `0`. Si acierta → `advancePool / N`.
4. Redondeo a 2 decimales (`Math.round(x*100)/100`). No hay multiplicador.

`N` se obtiene filtrando las predicciones del partido (orden de ~30 por partido, sin
necesidad de memoización dedicada). `advancePool` se lee de settings (default 20).

## Integración (`index.html`)

Helper `totalPoints(pred, m, preds) = calcPoints(pred,m,preds) + (calcAdvancePoints(pred,m,preds) || 0)`.

Reemplazar `calcPoints` por `totalPoints` en los sitios que representan el **total de
un jugador** (no la proyección específica del pozo de resultado):

- Ranking (suma de puntos por jugador).
- KPIs y gráfico de evolución en Home.
- Total por jugador / por partido en fixture y stats donde se muestre el acumulado.

Mantener `calcPoints` (sin el pozo de 20) en la **proyección en vivo del 90'**, que no
tiene aún `actualAdvancer`. Revisar los ~13 call sites de `calcPoints` uno a uno y
decidir total vs. resultado según lo que muestre cada uno.

## UI

**Predicción (fixture, partido de fase final abierto)**: al ingresar un marcador de
**empate**, aparece debajo del marcador un selector de equipo que avanza: 2 botones
(local / visita). Se guarda como el resto de la predicción. Al cambiar a marcador
no-empate, se oculta y se limpia `predAdvances`. **No hay selector de método.**

**Resultado (fixture, partido de fase final finalizado)**: en la zona de puntos del
jugador, además de los puntos del resultado, una línea `+X pts · quién pasa`.

**Reglas**: agregar la explicación del pozo de 20 (sin método/×1.5).

**Admin**: input para editar `advancePool` junto a los pozos por fase.

## Testing

- Unit (node:test) para las funciones puras de `scripts/scoring.mjs`:
  - `matchAdvanceOutcome`: ganador 90', empate con `advances`, empate sin `advances`,
    sin resultado.
  - `playerAdvanceGuess`: ganador, empate con `predAdvances`, empate sin `predAdvances`.
  - `advancePoints`: reparto `20/N`, acierta/no acierta, grupo → `0`, sin resultado →
    `null`.
- Manual: predecir empate en un KO, verificar el selector de equipo, cambiar a
  no-empate (se limpia), y verificar el cálculo del total con datos de ejemplo.

## Riesgos

- **Doble fuente de "quién pasa"** (cálculo a 90' vs. `advances`): se mitiga reusando
  exactamente la lógica `outcome(m)` ya usada para las llaves.
- **Empate-predictor sin equipo cargado** (datos viejos o input incompleto): guess con
  `predAdvances` `undefined` → no acierta → `0`. Sin error.

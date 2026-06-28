# Pozo "quién pasa" en eliminatorias (2º forma de repartir puntos)

**Fecha:** 2026-06-28
**Estado:** Diseño aprobado

## Problema / Objetivo

Hoy cada partido reparte un **pozo por fase** entre quienes aciertan el signo del
resultado a los 90' (local/empate/visita); el marcador exacto duplica la parte. En
eliminatorias eso deja fuera la pregunta natural de "¿quién pasa a la siguiente fase
y cómo?".

Se agrega una **segunda forma de repartir puntos**, independiente y sumada a la
existente: un pozo de **20 puntos por partido de fase final** que se reparte entre
**todos** los que aciertan qué equipo avanza, con un **×1.5** para quienes además
aciertan **cómo** avanza.

Clave: la predicción del resultado ya implica una predicción de "quién pasa y cómo".

- Quien predice un **ganador** está diciendo implícitamente: ese equipo pasa **en
  los 90'**.
- Quien predice **empate** debe elegir explícitamente el equipo que avanza y el
  método (**alargue 120'** o **penales**).

Hay tres métodos posibles: `'90'` (implícito del ganador-predictor), `'120'` y
`'pen'` (explícitos del empate-predictor). El ×1.5 aplica a todos por igual cuando su
método (implícito o explícito) coincide con cómo se definió el partido.

### Ejemplos

- Predijo Brasil 2-1 → "Brasil pasa en 90'". Brasil gana en 90' → acierta quién **y**
  cómo → ×1.5.
- Predijo Brasil 2-1, pero fue 1-1 y Brasil ganó en penales → acierta quién pasa
  (×1 base), falla el método (era `pen`, no `90`).
- Predijo 1-1 + "Brasil / penales" y Brasil pasó en penales → ×1.5.

Fuera de alcance: cambiar el pozo de resultado (90') existente. Grupos no participan
de este pozo.

## Contexto ya implementado (dependencias)

- En fase final solo puntúa el **90'** (`realHome/realAway`); existen `score120Home/
  score120Away`, `penHome/penAway` y `advances` (equipo que avanza), seteados por el
  sync (ver `2026-06-28-resultados-fase-final-90-alargue-penales-design.md`).
- `index.html` ya tiene la lógica de "quién pasa" para mostrar llaves
  (`resolveBracketDisplay` → `outcome(m)`): gana local/visita si hay diferencia a los
  90'; si hubo empate a los 90', manda `advances`. Esta lógica se reutiliza.
- Motor de puntos del resultado: `calcPoints` → `_pointsAt` (pozo/N, exacto ×2).

## Modelo de datos

**Predicción** (`pf/preds/{userId}__{matchId}`). Campos nuevos, **opcionales**, solo
presentes cuando el jugador predice **empate** en un partido de **fase final**:

| Campo | Valor |
|-------|-------|
| `predAdvances` | nombre del equipo que el jugador cree que avanza (`m.home` o `m.away`) |
| `predMethod` | `'120'` o `'pen'` |

El ganador-predictor no llena estos campos: su "quién pasa" es el equipo que puso
ganador y su método es `'90'` implícito. Si el jugador cambia un marcador de empate a
no-empate, estos campos se limpian.

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

1. **Quién pasó (`actualAdvancer`)**: reusar la lógica de `outcome(m)`:
   - `realHome > realAway` → `m.home`
   - `realAway > realHome` → `m.away`
   - empate a 90' → `m.advances` (puede ser `m.home`/`m.away`); si no hay → `null`.
2. **Cómo pasó (`actualMethod`)**: `'pen'` si `penHome != null`; si no `'120'` si
   `score120Home != null`; si no `'90'`.
3. **Guess del jugador**:
   - `predHome > predAway` → equipo `m.home`, método `'90'`
   - `predAway > predHome` → equipo `m.away`, método `'90'`
   - empate (`predHome === predAway`) → equipo `pred.predAdvances`, método `pred.predMethod`
4. **Acertadores** = predicciones cuyo equipo `=== actualAdvancer`. `N` = cantidad.
   Si el jugador no es acertador → `0`. `base = advancePool / N`.
5. **×1.5** si además el método del jugador `=== actualMethod`; si no, `base`.
6. Redondeo a 2 decimales (`Math.round(x*100)/100`), igual que el pozo de resultado.

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
**empate**, aparecen debajo del marcador:
- Selector de equipo que avanza: 2 botones (local / visita).
- Selector de método: 2 botones (Alargue 120' / Penales).
- Se guardan con `onchange` como el resto de la predicción. Al cambiar a marcador
  no-empate, se ocultan y se limpian `predAdvances`/`predMethod`.

**Resultado (fixture, partido de fase final finalizado)**: en la zona de puntos del
jugador, además de los puntos del resultado, una línea `+X pts · quién pasa`, con
indicación de ×1.5 cuando corresponda.

**Reglas**: agregar la explicación del pozo de 20 y del ×1.5 (con los tres métodos).

**Admin**: input para editar `advancePool` junto a los pozos por fase.

## Testing

- Unit (node:test) para `calcAdvancePoints` como función pura:
  - Ganador en 90' acertado (quién + cómo) → `base*1.5`.
  - Ganador-predictor correcto pero partido a penales → solo quién (`base`).
  - Empate-predictor con equipo correcto y método correcto → `base*1.5`.
  - Empate-predictor con equipo correcto, método incorrecto → `base`.
  - Reparto entre `N` acertadores (verifica `20/N`).
  - Partido de grupo → `0`.
  - Partido sin resultado → `null`.
- Manual: predecir empate en un KO, verificar inputs (equipo + método), cambiar a
  no-empate (se limpian), y verificar el cálculo del total con datos de ejemplo.

## Riesgos

- **Doble fuente de "quién pasa"** (cálculo a 90' vs. `advances`): se mitiga reusando
  exactamente la lógica `outcome(m)` ya usada para las llaves.
- **Empate-predictor sin método/equipo cargado** (datos viejos o input incompleto):
  guess con `predAdvances`/`predMethod` `undefined` → no acierta → `0`. Sin error.

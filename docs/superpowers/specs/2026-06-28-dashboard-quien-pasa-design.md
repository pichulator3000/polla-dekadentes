# Dashboard en vivo: integrar pozo "quién pasa"

**Fecha:** 2026-06-28
**Archivo afectado:** `index.html` (único). Sin cambios en `scripts/scoring.mjs`, admin ni persistencia.

## Contexto

El pozo "quién pasa" (eliminatorias) ya está modelado en `scripts/scoring.mjs`:
`playerAdvanceGuess` mapea cada predicción KO a un equipo (ganador elegido → ese
equipo; empate → `pred.predAdvances`) y `advancePoints` reparte `getAdvancePool()`
(default 20) entre quienes aciertan quién avanza.

El Dashboard en vivo (`renderLiveDash`, index.html:2629) **no** lo refleja:

- La proyección 🏆 (`_projRows`) y la tabla general en vivo (`ldRenderGeneral`) usan
  `_pointsAt` (index.html:1462), que solo calcula el pozo de resultado → en partidos
  KO los totales en vivo quedan incompletos.
- No hay sección que muestre la distribución/pago del pozo quién pasa.
- "Tu pronóstico" no muestra a qué equipo apostaste que pasa.

## Guarda de alcance

Todo lo de abajo aplica **solo** cuando el partido es KO y el pozo está activo:

```js
!normStage(m.stage).startsWith('Grupo') && m.advancePozo !== false
```

Partidos de grupo y KO previos al pozo (`advancePozo === false`) se renderizan
exactamente como hoy.

## Componentes

### 1. Helpers de avance en vivo (junto a `_pointsAt`, ~index.html:1462)

- `_ldAdvanceOn(m)` → boolean de la guarda de alcance.
- `_liveAdvancer(m, sh, sa)` → quién avanza **ahora**:
  - `sh > sa` → `m.home`
  - `sa > sh` → `m.away`
  - empate → `m.advances` si el partido está `done` y `m.advances` es uno de los
    equipos; si no, `null` (indefinido: un empate en vivo no tiene avanzador
    provisional porque iría a alargue/penales).
- `_advanceAt(pred, m, allPreds, sh, sa)` → espeja `advancePoints` pero sobre el
  marcador en vivo:
  - Si `!_ldAdvanceOn(m)` → `0` (consistente con `advancePoints` para grupos).
  - `adv = _liveAdvancer(m, sh, sa)`; si `adv == null` → `null` (sin avanzador aún).
  - Si `window.__scoring.playerAdvanceGuess(pred, m) !== adv` → `0`.
  - Si acierta → `round((getAdvancePool() / nAcertadores) * 100) / 100`, donde
    `nAcertadores` cuenta `allPreds` del mismo `matchId` cuyo `playerAdvanceGuess`
    es `adv` (mínimo 1).

Reutiliza `window.__scoring.playerAdvanceGuess` y `getAdvancePool()`.

### 2. Corregir totales en vivo

- **`_projRows`** (index.html:2614): sumar `_advanceAt(p, m, CACHE.preds, LD.sh, LD.sa) || 0`
  a `pts` de cada fila.
- **`ldRenderGeneral` → `calc(useLive)`** (index.html:2696):
  - Rama "antes" (`!useLive`, solo finalizados): sumar `calcAdvancePoints(p, m) || 0`.
  - Rama "ahora" (`useLive`): para `m.id === LD.m.id` sumar
    `_advanceAt(p, m, CACHE.preds, LD.sh, LD.sa) || 0`; para el resto sumar
    `calcAdvancePoints(p, m) || 0`.

  Esto mantiene honestos el movimiento ▲▼ y el tag "+x.xx en vivo".

### 3. Sección dedicada "🎟️ ¿Quién pasa?"

Se inserta en la plantilla de `ldBody` (index.html:2645) **después** de la sección
de pagos "¿Cuánto paga cada resultado?", solo si `_ldAdvanceOn(LD.m)`. Render por una
función nueva `ldRenderAdvance()` llamada al final de `renderLiveDash` (index.html:2682),
junto a las demás `ldRender*`.

Estructura (reutiliza estilos `ld-sec`, `ld-bar`, `ld-seg`, `ld-pay-*`):

- **Encabezado:** `🎟️ ¿Quién pasa?` con sub `pozo {getAdvancePool()} pts`.
- **Barra de votos:** dos segmentos — *Pasa {home}* vs *Pasa {away}* — dimensionados
  por cuántas predicciones mapean a cada equipo vía `playerAdvanceGuess`. Respeta el
  toggle `LD_BARMODE` (%/N°) existente. Clickeable → chips de quiénes están en cada
  lado (como la barra de resultado, via un detalle propio).
- **Filas de pago:** por equipo, `pozo ÷ acertadores`. Sin "exacto ×2" (no aplica).
  El lado que avanza según `_liveAdvancer` lleva tag "VA PASANDO"; si el live está
  empatado, mostrar "indefinido — empate" en vez de marcar un lado.
- Sin predicciones → mensaje vacío equivalente al de la barra de resultado.

Colores: usar `col.L` para el lado home y `col.V` para el away (de `matchColors`),
coherente con el resto del dashboard.

### 4. Badge en "Tu pronóstico"

En `_ldMine` (index.html:2798), **solo** cuando `_ldAdvanceOn(m)`, tu predicción es
empate (`mine.predHome === mine.predAway`) y `mine.predAdvances` está seteado:

- Mostrar una línea `🎟️ Apostaste que pasa {mine.predAdvances}`.
- Si `_liveAdvancer(m, sh, sa)` no es null, marcar ✅ (coincide) / ❌ (no coincide).

Si elegiste un ganador (no empate), no se muestra nada: no hubo apuesta de avance
separada (el ganador ya implica quién pasa).

## Flujo de datos

`renderLiveDash` arma `LD = { m, preds, col, pot, pool, sh, sa, mine, hasScore }`
(sin cambios). Las funciones nuevas leen de `LD`, `CACHE.preds`, `window.__scoring`
y `getAdvancePool()`. Todo es display de solo lectura; no se escribe en Firebase ni
se toca el flujo de guardado de predicciones.

## Manejo de casos borde

- Partido sin predicciones: barra/pago vacíos (mensaje equivalente al de resultado).
- Live empatado (sin `done`): `_liveAdvancer` = null → sección muestra distribución y
  pago pero "indefinido — empate"; `_advanceAt` devuelve null → no altera totales.
- `advancePozo === false` o grupo: sección oculta, badge oculto, totales sin sumar
  avance (`_advanceAt` → 0).
- `predAdvances` ausente en empate (no debería pasar tras los fixes recientes):
  `playerAdvanceGuess` → null → no acierta ningún avanzador; badge no se muestra.

## Testing

`scripts/scoring.mjs` no cambia, así que `scripts/scoring.test.mjs` sigue válido. La
lógica nueva es UI sobre helpers ya probados; verificación manual en el dashboard:

1. KO con marcador en vivo a favor de un lado → "VA PASANDO" en ese lado, totales de
   proyección/general incluyen el pozo de avance.
2. KO empatado en vivo → "indefinido — empate", totales sin avance.
3. Empate predicho con `predAdvances` → badge en "Tu pronóstico"; ganador predicho →
   sin badge.
4. Partido de grupo → sección y badge ausentes; dashboard idéntico a hoy.

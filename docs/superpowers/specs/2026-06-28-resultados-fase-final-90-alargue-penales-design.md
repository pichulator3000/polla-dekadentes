# Resultados de fase final: 90' / alargue / penales

**Fecha:** 2026-06-28
**Estado:** Diseño aprobado

## Problema

La polla puntúa con el resultado a los **90 minutos** (sin alargue ni penales). En
fase de grupos esto coincide con el marcador final, pero en las eliminatorias un
partido puede definirse en alargue (120') o penales. El sync actual escribe en
`realHome/realAway` el marcador que entrega ESPN, que **incluye el alargue** — eso
puntuaría mal. Además se quiere **mostrar** las tres fases (90', alargue, penales)
sin que afecten los puntos.

## Objetivo

1. Que `realHome/realAway` de un partido de fase final sea **siempre el marcador a
   los 90'** (lo único que puntúa). El motor de puntos no cambia.
2. Guardar aparte el marcador de 120' y de penales, solo para mostrar.
3. Mostrar en la UI: 90' protagonista, y debajo `120': X–Y · Penales X–Y` + badge
   "✓ Avanza X" (Variante 3 / "TV inline" del mockup
   [`mockup-resultados-fasefinal.html`](../../../mockup-resultados-fasefinal.html)).

Fuera de alcance: cambiar cómo se predicen los partidos (se sigue prediciendo un
marcador; se compara contra el 90'). No se predicen penales ni alargue.

## Contexto ya implementado (dependencia, hecho)

- Los 16 partidos de Ronda de 32 y los 16 de octavos→final están cargados en
  Firebase, cada uno con `code` único (16A–16P, 8A–8H, 4A–4D, 2A/2B, 3P, F1) y
  `feedHome`/`feedAway`.
- La **propagación de llaves** vive en `scripts/sync_results.mjs`
  (`computeBracketUpdates`, `matchOutcome`): resuelve en cascada los nombres reales
  a medida que entran resultados, usando `realHome/realAway` y, en empate a los 90',
  el campo `advances`. Ya testeada.

Como la propagación decide el avance vía `advances` cuando el 90' es empate, usar el
marcador de 90' en `realHome/realAway` es **consistente**: el único caso en que el
que avanza difiere del que ganaba a los 90' es justamente cuando hubo empate a los
90' → ahí manda `advances`.

## Modelo de datos

Campos en el documento de partido (Realtime DB `pf/matches/$id`). Todos los nuevos
son **opcionales** y solo presentes en partidos de fase final que fueron a ET/penales:

| Campo | Significado |
|-------|-------------|
| `realHome` / `realAway` | Marcador a los **90'**. Único que puntúa. (campo existente) |
| `score120Home` / `score120Away` | Marcador tras alargue (solo si hubo ET) |
| `penHome` / `penAway` | Tanda de penales (solo si hubo) |
| `advances` | Nombre del equipo que avanza (existente; lo setea el sync) |

Las reglas de Firebase (`firebase-rules.json`) en `pf/matches` no validan estructura
(`".write": true`), así que no requieren cambios.

## Fuente de datos (ESPN)

- El **scoreboard** (`.../scoreboard`) da `competitor.score` (= marcador 120' si hubo
  alargue), `competitor.shootoutScore` (penales) y `competitor.winner` (bool), y
  `status.type.name` distingue `STATUS_FINAL_PEN` / detalle `FT-Pens`.
- El **summary** (`.../summary?event=<id>`) da el desglose por período en
  `header.competitions[0].competitors[].linescores` (array de `{displayValue}`):
  - 2 entradas → solo 90' (`[1ºT, 2ºT]`).
  - 4 entradas → fue a alargue (`[1ºT, 2ºT, ET1, ET2]`).
  - 5 entradas → fue a penales (`[..., penales]`).
  - **90'** = `ls[0] + ls[1]`; **120'** = suma de las 4 primeras; **penales** = `ls[4]`.

Verificado con la final 2022 (Argentina): `[2,0,0,1,4]` → 90' 2, 120' 3, pen 4.

## Sync (`scripts/sync_results.mjs`)

Cambios en el manejo de un partido **FINAL** (`STATUS_FINAL` / `STATUS_FULL_TIME` /
`STATUS_FINAL_PEN`):

1. **Grupos** (`stage` empieza con "Grupo"): sin cambios — `realHome/realAway` = score
   del scoreboard (es el 90' por definición).
2. **Fase final**: pedir el `summary` del evento y leer `linescores` alineadas a la
   orientación home/away del partido en Firebase (reusar la lógica de swap de
   `resolveScores`). Calcular:
   - `realHome/realAway` = marcador 90'.
   - Si hubo ET: `score120Home/Away`.
   - Si hubo penales: `penHome/Away` (de `linescores`/`shootoutScore`).
   - `advances` = `normalizeTeam` del competidor con `winner === true`.
3. Si para un KO no se pudo obtener `linescores` (summary vacío/error): **no escribir
   `realHome/realAway`** (evita puntuar con un 90' incorrecto); sí escribir `advances`
   si está disponible. Queda pendiente para el próximo ciclo o carga manual del admin.

Funciones puras nuevas (testeables, exportadas):
- `parsePeriods(linescores)` → `{ reg90:[h,a], score120:[h,a]|null, pen:[h,a]|null }`.
- `resolveFinalUpdate({ stage, periods, winnerName })` → objeto con los campos a
  escribir (o señal de "no escribir score").

La propagación (`computeBracketUpdates`) ya corre cada ciclo; no cambia.

## UI (`index.html`)

Helper de render para el resultado de un partido (Variante 3):

- Marcador **90' grande** (como hoy `realHome - realAway`), con micro-label
  "Resultado 90' · vale para la polla" cuando el partido es de fase final y tuvo
  ET/penales.
- Debajo, una línea inline secundaria: `120': X–Y · Penales X–Y` (cada segmento solo
  si existe el dato).
- Badge `✓ Avanza <equipo>` (de `advances`) cuando corresponda.
- Partidos de grupos y KO sin alargue: se ven igual que hoy (sin línea extra).

Se aplica en los puntos donde hoy se muestra `realHome - realAway`: lista de partidos
(`renderMatches`), resultados y "próximos/finalizados". Identificar partido de fase
final por `normStage(m.stage)` distinto de los grupos (o presencia de `code`).

## Testing

- Unit (node:test, junto a los tests existentes de `sync_results.mjs`):
  - `parsePeriods`: 2 / 4 / 5 entradas → 90'/120'/penales correctos.
  - `resolveFinalUpdate`: grupo (passthrough), KO regulación (solo real*), KO con ET
    (real*=90' + score120*), KO con penales (+pen* + advances), summary faltante
    (no escribe score).
  - Alineación de orientación home/away (swap) en los períodos.
- Manual: abrir `index.html` con un partido KO de ejemplo con los nuevos campos y
  verificar el render (Variante 3).

## Riesgos

- **Ventana de ESPN:** si el summary no trae `linescores` a tiempo, el KO queda sin
  `realHome` hasta el próximo ciclo / carga manual. Mitigación: no inventar 90'.
- **Carga manual:** si el admin ingresa a mano un KO que fue a alargue, ingresa el 90'
  (empate) y `advances` se necesita para la llave. (UI de carga manual de `advances`
  queda como mejora futura; el caso vía sync es automático.)

# Simulador de tabla (podio) — Diseño

**Fecha:** 2026-07-11
**Estado:** Aprobado

## Objetivo

Agregar un botón en la pantalla de Ranking que abra un simulador de tabla.
Permite elegir un escenario hipotético de **campeón, subcampeón y goleador** y
ver cómo quedaría el ranking, sin modificar datos reales.

## Alcance

- **Solo el podio.** Los resultados de partidos se mantienen tal cual están hoy.
- El simulador únicamente recalcula los puntos de podio
  (`champion` / `runner` / `scorer`) contra el escenario elegido.
- Nada se escribe en Firebase; todo el cálculo es local y efímero.

## Acceso y ubicación

- Botón "🔮 Simular tabla" en la pantalla de Ranking (`#tabRanking`), visible
  para todos, ubicado sobre la tabla de ranking.
- Abre un modal/overlay con el mismo estilo que los demás overlays del app.

## Inputs

- **Campeón** y **Subcampeón**: dropdowns con los equipos que **siguen en
  competencia**, derivados del bracket. Un equipo está eliminado si perdió un
  partido de eliminatoria (perdedor de un KO `done`). Alive = todos los equipos
  de partidos (excluyendo "Por definir") menos los eliminados.
  - No se puede elegir el mismo equipo como campeón y subcampeón.
- **Goleador**: dropdown con los goleadores **distintos que la gente
  pronosticó** (`CACHE.podio[].scorer`), más una opción "— cualquier otro —"
  que otorga 0 pts de goleador a todos.
  - Motivo: el goleador se guarda como texto libre y el app no tiene roster ni
    mapeo jugador→equipo, así que no se puede filtrar por "en competencia". El
    conjunto de goleadores pronosticados es el único que puede mover la tabla.
- Los tres inputs son opcionales; uno vacío = no otorga esos puntos a nadie.

## Cálculo

- Reutiliza `calcPodioPoints` pero con un "podio oficial" simulado en lugar de
  `getPodioOficial()`. Se implementa recalculando el podio con el escenario:
  para cada usuario, comparar su `podio` contra `{champion, runner, scorer}`
  simulados usando los mismos pts de `getPodioPoints()` y la misma comparación
  case-insensitive.
- Los puntos de partidos por usuario se toman igual que en `renderRanking`
  (mismos `totalPoints` sobre `doneOrLive`). Se restan los castigos igual que hoy.
- Total simulado por usuario = puntos de partidos + puntos de podio simulados − castigo.

## Salida

- Tabla simulada, reordenada por total simulado (desempate por exactos, igual
  que el ranking actual).
- Columna de puntos de podio del escenario.
- Indicador de cambio de posición vs. ranking actual (▲ sube / ▼ baja / = igual).
- Botón "Reiniciar" para limpiar los inputs y volver al estado vacío.

## Sin cambios en

- Scoring de partidos.
- Datos guardados en Firebase.
- Podio oficial real (`pf/settings/podioOficial`).

## Notas de implementación

- Todo vive en `index.html` (SPA de un archivo), siguiendo el patrón de los
  overlays/modales existentes.
- Reutilizar helpers existentes: `getPodioPoints`, `cheatPenalty`,
  `totalPoints`, `podioAplicaATorneo`, y la construcción de scores de
  `renderRanking` (extraer/compartir si conviene, sin refactor innecesario).

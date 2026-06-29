# Vista Bracket en Fixture — Diseño

Fecha: 2026-06-29

## Objetivo

Agregar una representación gráfica de las llaves (bracket) dentro de la
pestaña Fixture, para visualizar quién pasa y contra quién juega en fase
final. El usuario podrá alternar entre la vista actual (lista de partidos)
y la nueva vista de llaves.

## Decisiones

- **Layout:** Árbol completo estilo gráfico de TV, en un contenedor con
  scroll horizontal + pinch-zoom. No se parte en mitades ni en stepper.
- **Contenido:** Solo oficial. Refleja el torneo real (quién pasó,
  marcadores reales, próximos cruces). Sin overlay de pronósticos.
- **Densidad de celda:** Completa — marcador 90', ✓ de quién avanza,
  pie con penales/120' cuando aplica, estado "Por jugarse" si no hay
  resultado.
- **Switch de vista:** Dos pills arriba del fixture (📋 Lista / 🏆 Llaves),
  al estilo de las pills de torneo existentes.
- **Tap en celda:** Nada. Read-only, puramente informativo.
- **Tercer puesto:** Incluido, colgado cerca de la Final (perdedores de
  semifinales).

## Contexto del código existente

Todo vive en `index.html` (archivo único). Lo relevante ya existe:

- `STAGE_ORDER` incluye las fases KO: `Ronda de 32`, `Octavos`,
  `Cuartos de Final`, `Semifinal`, `Tercer Puesto`, `Final`
  (index.html:3293).
- Cada partido KO tiene `code`, `feedHome`, `feedAway` que encadenan las
  llaves. `feedHome` apunta al `code` del partido alimentador (o `L_<code>`
  para el perdedor).
- `resolveBracketDisplay()` (index.html:3370) ya resuelve cada lado: apenas
  se define quién pasa, pone su país en la fase siguiente; si no, deja un
  placeholder ("Ganador `<code>`" / "Perdedor `<code>`").
- `koWentBeyond90(m)` y `koResultExtra(m)` (index.html:3351-3363) ya dan la
  línea de penales/120' y el badge "Avanza".
- `normStage(raw)` (index.html:3766) normaliza el texto de fase.
- `renderMatches()` (index.html:3776) construye la vista lista en
  `#matchList`, filtrando por `selectedTournament`.
- Contenedor de fixture: `#tabPartidos`, con `#tournamentPills` y
  `#matchList` (index.html:965-974).

## Componentes a construir

### 1. Estado de vista

Variable de UI `fixtureView` con valores `'list'` | `'bracket'`, default
`'list'`. No se persiste en backend (estado de sesión/local).

### 2. Pills de vista

Función `renderFixtureViewPills()` que pinta dos pills (📋 Lista / 🏆 Llaves)
en un contenedor nuevo (`#fixtureViewPills`) bajo `#tournamentPills`. Reusa
el estilo visual de las pills de torneo (index.html:3798-3807). Al hacer
clic, setea `fixtureView` y re-renderiza.

**Visibilidad:** Las pills solo se muestran si el torneo seleccionado tiene
al menos un partido de fase final (algún `m` cuyo `normStage(m.stage)` no
sea grupo). Si no hay KO, se ocultan y se fuerza `fixtureView='list'`.

### 3. Construcción del árbol

Función `buildBracketTree(koMatches)` que arma la estructura de árbol:

- Indexa partidos por `code` (`byCode`).
- Identifica la raíz: el partido con `normStage === 'Final'`.
- Recursa por `feedHome`/`feedAway`: cada lado puede ser otro partido
  (si su `feed*` referencia un `code` existente) o un equipo ya resuelto.
- Usa los `home`/`away` ya resueltos por `resolveBracketDisplay()` para los
  nombres/placeholders de cada lado.
- El partido de Tercer Puesto (`normStage === 'Tercer Puesto'`) se trata
  como un nodo aparte, no dentro de la recursión de la Final.

Salida: una estructura de columnas por ronda en orden
`R32 → Octavos → Cuartos → Semifinal → Final`, lista para render. El árbol
se ordena de modo que cada partido quede vertical/centrado frente a sus dos
alimentadores.

### 4. Render del bracket

Función `renderBracket(matches)` que recibe los partidos del torneo
seleccionado, filtra los KO, llama a `buildBracketTree`, y devuelve el HTML
del árbol: columnas por ronda con etiqueta (R32, 8vos, 4tos, Semi, Final),
celdas conectadas con líneas, y el Tercer Puesto colgado cerca de la Final.

**Celda (`renderBracketCell(m)`):** dos filas (bandera + país + marcador
90'), ganador resaltado verde con ✓ (usando el mismo criterio de
`outcome`/`advances` que `resolveBracketDisplay`), perdedor atenuado. Pie
con `koResultExtra(m)` cuando `koWentBeyond90(m)`; "Por jugarse" si
`realHome == null`.

El árbol va en un contenedor con `overflow-x:auto` y soporte de
pinch-zoom (CSS `touch-action`), dentro de `#matchList` (o un contenedor
hermano dedicado).

### 5. Integración en renderMatches()

Al inicio de `renderMatches()`, tras resolver `selectedTournament` y filtrar
`matches`:

- Calcular si hay KO en el torneo → mostrar/ocultar `#fixtureViewPills`.
- Si `fixtureView === 'bracket'` y hay KO: renderizar `renderBracket(matches)`
  en el contenedor y `return` (saltar la construcción de la lista).
- Si no: comportamiento actual (lista) intacto.

No se modifica la lógica de la lista existente; solo se agrega el switch y
la rama alternativa.

## Aislamiento y testing

- `buildBracketTree` es lógica pura (entrada: partidos; salida: estructura
  de árbol) → testeable de forma aislada con datos de ejemplo.
- `renderBracket` / `renderBracketCell` son funciones de presentación que
  consumen esa estructura.
- Verificación manual con datos reales del torneo: abrir Fixture → pill
  Llaves → confirmar que el árbol refleja resultados, avances, penales y
  placeholders de lados sin definir.

## Fuera de alcance (YAGNI)

- Overlay de pronósticos del usuario sobre el bracket.
- Interacción al tocar celdas (navegación, edición).
- Vista de mitades o stepper por ronda.
- Persistencia del estado de vista en backend.

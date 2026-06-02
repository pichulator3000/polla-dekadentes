# 🏆 POLLA DEKADENTES — Contexto para Agente Especializado

> **Versión:** 2.0 — Junio 2025  
> **Estado:** ✅ EN PRODUCCIÓN  
> **URL:** https://pichulator3000.github.io/polla-dekadentes  
> **Repo:** https://github.com/pichulator3000/polla-dekadentes  

---

## ⚠️ REGLAS CRÍTICAS PARA EL AGENTE

1. **GitHub Pages límite: 10 pushes/hora** — Agrupar cambios, NO hacer pushes innecesarios
2. **TODO está en `index.html`** — Un solo archivo (~3700 líneas) con HTML + CSS + JS. NO splitear
3. **CSS inline** — Todo usa `style=""` inline. NO agregar archivos CSS externos
4. **Firebase se auto-inicializa** — No requiere auth, reglas abiertas
5. **Probar antes de push** — Verificar sintaxis JS, cerrar llaves, paréntesis
6. **Commits atómicos** — Un cambio lógico por commit, descripción clara en español

---

## 📐 ARQUITECTURA

```
[index.html en GitHub Pages]  ←→  [Firebase Realtime Database]
         ↑                              ↑
    HTML + CSS + JS                pf/users/{id}
    Todo en un solo archivo        pf/matches/{id}
    CACHE local en RAM             pf/preds/{userId}__{matchId}
    Actualizado por listeners      pf/podio/{userId}
    ~3700 líneas                   pf/settings/{key}
                                   pf/pending/{code}
                                   pf/messages/{id}
```

### Flujo de datos
1. Al abrir → Firebase listeners (`on('value')`) cargan todo a `CACHE`
2. Todos los renders leen de `CACHE` (sync, instantáneo)
3. Writes → Firebase → notifica a todos los clientes (real-time)
4. Admin carga resultados → todos ven puntos al instante

### Librerías CDN (ya incluidas)
- **Firebase App + Realtime DB** compat `v10.12.0`
- **SheetJS** `xlsx-0.20.2` — lectura de Excel en browser
- **Chart.js** `v4` — gráfico de evolución en Stats

### Firebase Config (NO cambiar)
```js
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBaYaTnX5M9U-0n_Igj6Us5ks4x8kKv-E0",
  authDomain:        "polla-dekadentes.firebaseapp.com",
  databaseURL:       "https://polla-dekadentes-default-rtdb.firebaseio.com",
  projectId:         "polla-dekadentes",
  storageBucket:     "polla-dekadentes.firebasestorage.app",
  messagingSenderId: "649846580120",
  appId:             "1:649846580120:web:85196725aa315749d881ed"
};
```

---

## 🗂️ ESTRUCTURA DE DATOS EN FIREBASE

```
pf/
├── users/{id}
│   ├── id, code, name, passHash (SHA-256)
│   ├── rawPass (texto plano, admin puede ver contraseñas)
│   └── isAdmin (boolean)
│
├── matches/{id}
│   ├── id, home, away, datetime (ISO 8601 UTC)
│   ├── tournament ("Mundial 2026", "Copa Libertadores 2025")
│   ├── stage ("Grupo A", "Octavos", "Final")
│   ├── realHome, realAway (null = no jugado, number = resultado)
│   ├── venue (opcional, sede)
│   └── potenciado (boolean, ×2 puntos)
│
├── preds/{userId}__{matchId}
│   ├── userId, matchId
│   └── predHome, predAway
│
├── podio/{userId}
│   ├── userId, champion, runner, scorer
│   └── (predicción de campeón/subcampeón/goleador)
│
├── settings/
│   ├── regLocked (boolean)
│   ├── regApproval (boolean)
│   ├── hiddenTournaments (array)
│   ├── stagePoints/{Fase} (number)
│   ├── podioPoints (champion/runner/scorer)
│   └── podioOficial (champion/runner/scorer)
│
├── pending/{code}
│   └── name, code, passHash, rawPass
│
└── messages/{id}
    ├── fromUserId, fromName, toUserId, toName
    ├── text (máx 50 chars), date, timestamp
```

---

## 🔑 CUENTAS ADMIN

| Usuario | Contraseña | Nombre |
|---|---|---|
| `tomasadmin` | `admin123` | Tomas |
| `pabloadmin` | `admin123` | Pablo |
| `raiadmin` | `admin123` | Rai |

- Se crean automáticamente con `seedAdmin()` al cargar la app
- **NO participan** en ranking/stats

---

## 📱 PESTAÑAS DE LA APP

### Bottom Nav (todos los usuarios)
| Tab | Icono | Función principal |
|---|---|---|
| **Home** | 🏠 | KPIs, accesos rápidos, próximos partidos, admin: resultados rápidos |
| **Fixture** | 🏟️ | Partidos por fase en `<details>`, predicciones, resultados |
| **Ranking** | 🏆 | Tabla de posiciones |
| **Stats** | 📊 | Estadísticas globales, gráfico evolución |

### Header Nav (iconos arriba derecha)
| Tab | Icono | Función |
|---|---|---|
| **Podio** | 🏅 | Predicción campeón/subcampeón/goleador |
| **Reglas** | 📜 | Sistema de puntos, pozos por fase |
| **Admin** | ⚙️ | Solo admin: gestión partidos, importar Excel, pozos |
| **Ajustes** | ⚙️ | Perfil, modo PC, gestión usuarios |

---

## 🏟️ FIXTURE — Detalles de Implementación

### Orden de fases (`STAGE_ORDER`)
```js
const STAGE_ORDER = [
  'Grupo A','Grupo B','Grupo C','Grupo D','Grupo E','Grupo F',
  'Grupo G','Grupo H','Grupo I','Grupo J','Grupo K','Grupo L',
  'Ronda de 32','Octavos','Cuartos de Final','Semifinal','Tercer Puesto','Final'
];
```

### Grupos agrupados en "Fase de Grupos"
- `GROUP_STAGES` = stages que empiezan con "Grupo"
- Se renderizan dentro de un `<details>` padre con clase `fase-grupos-header`
- Sub-acordeones usan clase `sub-group` con indentación y estilo cyan

### Estados de partido (`getStatus()`)
| Estado | Condición | Visual |
|---|---|---|
| `open` | `datetime > now` | Badge verde "● Abierto", inputs habilitados |
| `locked` | `datetime <= now && realHome == null` | Badge gris "🔒 Cerrado" |
| `live` | Empezó hace <105 min | Badge rojo "🔴 En vivo", animación blink |
| `done` | `realHome != null` | Badge "✓ Fin", muestra puntos |

### Preservado de estado abierto
```js
// Antes de renderizar, guardar qué <details> están abiertos
const prevOpen = new Set();
document.querySelectorAll('#matchList details[data-stage]').forEach(d => {
  if (d.open) prevOpen.add(d.dataset.stage);
});
// Al renderizar, usar prevOpen.has(stage) para re-aplicar 'open'
```

### Multi-torneo
- Pills de torneos filtran por `selectedTournament`
- Torneos ocultos (`hiddenTournaments`) se excluyen de todo

---

## 📊 SISTEMA DE PUNTOS

### Pozos por fase (defaults)
| Fase | Puntos |
|---|---|
| Grupos (A-L) | 30 |
| Ronda de 32 | 35 |
| Octavos | 40 |
| Cuartos de Final | 50 |
| Semifinal | 60 |
| Tercer Puesto | 50 |
| Final | 100 |

### Cálculo (`calcPoints()`)
1. Pozo se reparte entre quienes aciertan resultado (local/empate/visita)
2. Acertar marcador exacto = ×2 tu parte
3. Fallar = 0 puntos (sin negativos)
4. Admin puede editar pozos en vivo → se recalcula retroactivamente

### Podio (puntos fijos, NO se reparten)
| Acierto | Default |
|---|---|
| Campeón | 100 pts |
| Subcampeón | 50 pts |
| Goleador | 50 pts |

### Partidos potenciados
- `potenciado: true` → pozo ×2
- Badge ⚡ POTENCIADO en el card

---

## 🏠 HOME — Sección Admin de Resultados Rápidos

Los admin ven arriba de "Próximos Partidos" una sección **"⏰ Partidos sin resultado"**:
- Filtra: `datetime < now && realHome == null`
- Orden: más recientes primero (descendente)
- Inputs con bordes naranjas para goles local/visita
- Botón 💾 llama a `saveUpcomingResult(matchId)`
- Al guardar, desaparece de la lista (re-render)

---

## 🎨 DISEÑO VISUAL

### Paleta CSS Variables
```css
:root {
  --bg-deep: #060d1b;
  --bg-surface: #0c1526;
  --bg-card: #0f1b2d;
  --border: rgba(56, 189, 248, 0.12);
  --accent: #38bdf8;        /* cyan/sky */
  --accent-bright: #7dd3fc;
  --blue: #3b82f6;
  --cyan: #22d3ee;
  --green: #34d399;
  --red: #f87171;
  --purple: #a78bfa;
  --orange: #fb923c;
  --text-primary: #f0f5fc;
  --text-secondary: #8899b0;
  --text-muted: #4a5f78;
}
```

### Font
- **Outfit** (Google Fonts) — geometric, modern
- `@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');`

### Layout
- Mobile-first con app shell (header fijo + scroll + bottom nav fija)
- Safe-area iOS: `env(safe-area-inset-*)`
- Modo PC: `body.pc-mode` con max-width 820px centrado
- NO usar emojis como iconos principales — usar iconografía SVG o texto

### Componentes CSS Clase
| Clase | Uso |
|---|---|
| `.group-summary` | Header de acordeón `<details>` |
| `.group-chevron` | Flecha ▼ que rota 180° al abrir |
| `.fase-grupos-header` | Header especial del acordeón padre "Fase de Grupos" |
| `.sub-group` | Sub-acordeón de grupo individual |
| `.card-match` | Tarjeta de partido |
| `.score-input` | Input de marcador (54×54px) |
| `.score-input-locked` | Input deshabilitado (con candado) |
| `.badge-open/lock/live/done` | Badges de estado |
| `.toggle` | Switch on/off |
| `.btn-primary` | Botón principal (gradiente accent→blue) |
| `.glow-border` | Borde animado con conic-gradient |
| `.potenciado-card` | Card con glow animado para partidos potenciados |

---

## ⚙️ FUNCIONES JS CLAVE

### Render
| Función | Descripción |
|---|---|
| `renderHomeStats()` | KPIs del jugador en home |
| `renderUpcoming()` | Próximos partidos + admin: resultados rápidos |
| `renderMatches()` | Fixture completo con acordeones |
| `renderRanking()` | Tabla de posiciones |
| `renderStats()` | Estadísticas globales |
| `renderStatsChart()` | Gráfico Chart.js |
| `renderPodio()` | Predicción de podio |
| `renderReglasPozos()` | Tabla de pozos en Reglas |
| `renderAdmin()` | Panel admin completo |
| `renderAjustes()` | Ajustes + gestión usuarios |

### Lógica
| Función | Descripción |
|---|---|
| `getStatus(m)` | Retorna `open/locked/live/done` |
| `normStage(raw)` | Normaliza fase (extrae "Grupo X" del string) |
| `getPoolForStage(stage)` | Pozo de puntos (custom o default) |
| `calcPoints(pred, match, allPreds)` | Calcula puntos de una predicción |
| `calcPodioPoints(userPodio)` | Calcula puntos de podio |
| `isTournamentHidden(t)` | Verifica si torneo está oculto |
| `getStagesEnUso()` | Fases únicas en partidos cargados |

### Admin
| Función | Descripción |
|---|---|
| `setResult(id)` | Guarda resultado oficial (desde fixture) |
| `saveUpcomingResult(id)` | Guarda resultado desde home |
| `saveStagePool(stage, valor)` | Edita pozo de una fase |
| `importarExcel(input)` | Importa partidos desde .xlsx |
| `seedAdmin()` | Crea 3 admins si no existen |
| `togglePotenciadoAdmin(id)` | Toggle partido potenciado |

### Utilidades
| Función | Descripción |
|---|---|
| `fmtDate(iso)` | Formatea fecha a hora Chile |
| `timeUntil(iso)` | "2h 30m" o "3d" hasta el partido |
| `autoJump(input, nextId)` | Salta al siguiente input al escribir |
| `toast(msg, type)` | Notificación temporal |

---

## 📥 IMPORTAR PARTIDOS DESDE EXCEL

### Formato requerido (.xlsx)
| Columna | Descripción | Ejemplo |
|---|---|---|
| `local` | Equipo local | México |
| `visita` | Equipo visita | Ecuador |
| `torneo` | Nombre del torneo | Mundial 2026 |
| `fase` | Fase o grupo | Grupo A |
| `fecha_hora_chile` | Fecha/hora Santiago | 2026-06-11T18:00 |

### Comportamiento
- Partidos con "Por definir" se omiten
- ID generado: timestamp + nombres
- Fecha se convierte de UTC-4 (Chile) a UTC

---

## 🔐 AUTENTICACIÓN

- Login: código único + contraseña
- Hash: SHA-256 con Web Crypto API (client-side)
- Sesión: `localStorage` (persiste)
- `rawPass` se guarda en texto plano (admin puede ver contraseñas)

---

## ⚠️ LIMITACIONES CONOCIDAS

- **Firebase Spark:** ~100 conexiones simultáneas
- **GitHub Pages:** 10 pushes/hora
- **Cierre de partidos:** evaluado en cliente (reloj del browser)
- **Zona horaria:** America/Santiago (UTC-4 invierno)
- **Partido "en vivo":** 105 minutos (90 + 15)
- **Sin email:** grupo cerrado, código es suficiente

---

## 🔧 WORKFLOW PARA HACER CAMBIOS

1. **Leer el archivo** — Usar `read_file` con `start_line` y `num_lines` para no cargar todo
2. **Identificar la sección** — Buscar funciones/clases específicas
3. **Editar con `replace_in_file`** — Diffs pequeños (100-300 líneas)
4. **Verificar sintaxis** — Asegurar llaves y paréntesis balanceados
5. **Commit atómico** — Un cambio lógico por commit
6. **Push** — `git push origin main`
7. **Esperar ~1 min** — GitHub Pages actualiza automáticamente

### Ejemplo de commit messages
- "Agrupar grupos en acordeón padre Fase de Grupos"
- "Admin: agregar resultados desde home en partidos pasados"
- "Fix: cerrar llaves en renderMatches()"

---

## 📁 ARCHIVOS DEL PROYECTO

```
polla-dekadentes/
├── index.html              ← App completa (TODO en uno, ~3700 líneas)
├── panini.png              ← Logo
├── CONTEXTO.md             ← Documentación original
├── AGENT_CONTEXT.md        ← Contexto para agentes (v1)
├── agent-polla-context.md  ← Este documento (v2, actualizado)
├── mundial_2026.xlsx       ← Partidos Mundial
├── mundial_2026_v2.xlsx    ← Versión actualizada
├── libertadores_2026.xlsx  ← Partidos Libertadores
├── champions_2026.xlsx     ← Partidos Champions
├── gen_libertadores.py     ← Script generar Excel
├── gen_champions.py        ← Script generar Champions
├── scrape_mundial.py       ← Script scraper
├── firebase-rules.json     ← Reglas Firebase
├── preview-potenciado.html ← Preview del diseño potenciado
└── exportacion/            ← Carpeta de exportación
```

---

*Documentado por fito 🐶 — Junio 2025*

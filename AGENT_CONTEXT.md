# 🏆 Polla Dekadentes — Contexto Completo para Agente

> **Estado:** ✅ EN PRODUCCIÓN  
> **URL:** https://pichulator3000.github.io/polla-dekadentes  
> **Repo:** https://github.com/pichulator3000/polla-dekadentes  
> **Backend:** Firebase Realtime Database (plan Spark/gratis)  
> **Hosting:** GitHub Pages (estático)  
> **Archivo principal:** `index.html` (~3000+ líneas, TODO en un solo archivo)  
> **Última revisión:** Mayo 2025

---

## ⚠️ REGLAS IMPORTANTES PARA EL AGENTE

1. **GitHub Pages tiene límite de 10 pushes/hora** — Agrupar cambios, evitar pushes innecesarios
2. **Todo está en `index.html`** — Un solo archivo con HTML + CSS + JS
3. **No splitear archivos** — El proyecto está diseñado para ser un solo archivo
4. **Mantener el estilo inline** — Todo el CSS está en style="", no agregar archivos CSS externos
5. **Firebase se inicializa solo** — No requiere auth, las reglas están abiertas

---

## ¿Qué es esto?

Una **polla deportiva** (quiniela) donde un grupo cerrado de amigos predice
resultados de partidos de fútbol. Soporta múltiples torneos simultáneos
(Mundial 2026, Copa Libertadores, etc.).

**Sistema de puntos:**
- Cada partido tiene un pozo de **puntos variable según la fase** (editable desde Admin)
- Defaults: Grupos 30, R32 35, Octavos 40, Cuartos 50, **Semifinal 60, Tercer Puesto 50, Final 100**
- Los admins pueden editar cualquier pozo en vivo desde "Pozos por Fase" en pestaña Admin
- Cambios se aplican retroactivamente a todos los partidos de esa fase
- Se reparte entre los que aciertan el resultado (local/empate/visita)
- Acertar el **marcador exacto** duplica tu parte
- Fallar = 0 puntos (sin puntos negativos)
- Los partidos **se cierran automáticamente** a la hora de inicio

---

## 🔑 Cuentas Admin

| Usuario | Contraseña | Nombre |
|---|---|---|
| `tomasadmin` | `admin123` | Tomas (Admin) |
| `pabloadmin` | `admin123` | Pablo (Admin) |
| `raiadmin` | `admin123` | Rai (Admin) |

- Los 3 admins se crean automáticamente al cargar la app (función `seedAdmin()`)
- Si no existen, se crean; si ya existen, no se duplican
- La cuenta legacy `admin` se elimina automáticamente si existe
- **Los admins NO participan** en el juego (excluidos del ranking y stats)

---

## 🏗️ Arquitectura

```
[index.html en GitHub Pages]  ←→  [Firebase Realtime Database]
         ↑                              ↑
    HTML + CSS + JS                pf/users/{id}
    Todo en un solo archivo        pf/matches/{id}
    CACHE local en RAM             pf/preds/{userId}__{matchId}
    Actualizado por listeners      pf/podio/{userId}
                                   pf/settings/{key}
                                   pf/pending/{code}
                                   pf/messages/{id}
```

### Flujo de datos
1. Al abrir la app → Firebase listeners (`on('value')`) cargan todo a `CACHE`
2. Todos los renders leen de `CACHE` (sync, instantáneo)
3. Cualquier write → va a Firebase → Firebase notifica a todos los clientes
4. El admin carga resultados → todos ven los puntos al instante (real-time)

### Librerías CDN
- **Firebase App + Realtime DB** compat `v10.12.0`
- **SheetJS** `xlsx-0.20.2` — lectura de Excel en browser (importación masiva)
- **Chart.js** `v4` — gráfico de evolución en Stats

### Firebase Config
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

## 🗂️ Estructura de datos en Firebase

```
pf/
├── users/{id}
│   ├── id, code, name, passHash (SHA-256)
│   ├── rawPass (texto plano, para que admin vea contraseñas)
│   └── isAdmin (boolean)
│
├── matches/{id}
│   ├── id, home, away, datetime (ISO 8601 UTC)
│   ├── tournament ("Mundial 2026", "Copa Libertadores 2025")
│   ├── stage ("Grupo A", "Octavos", "Final")
│   ├── realHome, realAway (null = no jugado, number = resultado)
│   └── venue (opcional, sede)
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
│   ├── regLocked (boolean - inscripciones cerradas)
│   ├── regApproval (boolean - modo aprobación)
│   ├── hiddenTournaments (array - torneos ocultos)
│   └── stagePoints/{Fase} (number - pozo personalizado por fase)
│
├── pending/{code}
│   └── name, code, passHash, rawPass (cola de aprobación)
│
└── messages/{id}
    ├── fromUserId, fromName
    ├── toUserId, toName
    ├── text (mensaje, máx 50 chars)
    ├── date (fecha en formato es-CL)
    └── timestamp
```

---

## 📱 Pestañas de la App

### Bottom Nav (visible para todos)
| Tab | Icono | Descripción |
|---|---|---|
| **Home** | 🏠 | Logo, resumen (puntos, promedio, exactos, posición, partidos, mensaje), grid de accesos rápidos, próximos partidos |
| **Fixture** | 🏟️ | Partidos agrupados por fase en `<details>`, predicciones, resultados |
| **Ranking** | 🏆 | Tabla de posiciones con puntos, exactos, aciertos |
| **Stats** | 📊 | Resumen global, % acierto por jugador, goles por equipo, gráfico de evolución |

### Header Nav (iconos arriba a la derecha)
| Tab | Icono | Descripción |
|---|---|---|
| **Podio** | 🏅 | Predicción de campeón, subcampeón y goleador |
| **Reglas** | 📜 | Explicación del sistema de puntos |
| **Admin** | ⚙️ | Solo admin: gestión de partidos, importar Excel |
| **Ajustes** | ⚙️ | Perfil, formato pantalla, gestión usuarios |

---

## 🏠 Home — Resumen del Jugador

Muestra 6 KPIs en 2 filas de 3:

**Fila 1 (homeStatsKPIs):**
- Mis puntos (dorado)
- Promedio/partido (azul)
- Exactos 🥇 (verde)

**Fila 2 (homeExtraStats):**
- # Posición (púrpura)
- 💌 Mensaje (rosa) — click abre panel de mensajes diarios
- Partidos jugados (turquesa)

**Mensaje flotante (msgCorner):**
- Posición: `fixed`, esquina superior izquierda
- Muestra mensaje recibido del día (fondo semi-transparente, letras opacas)
- Solo aparece si alguien te dejó mensaje hoy

---

## 💌 Sistema de Mensajes Diarios

**Reglas:**
- Cada jugador puede enviar **1 mensaje por día** (no 1 por persona, 1 en total)
- El mensaje dura hasta medianoche (hora Chile)
- Máximo 50 caracteres
- Se guarda en Firebase bajo `pf/messages`

**Implementación:**
- `toggleMessagePanel()` — Abre/cierra el panel expandible
- `renderMessageTargets()` — Muestra lista de jugadores con input para mensaje
- `sendMessage(toUserId, toUserName)` — Envía el mensaje a Firebase
- Solo se cargan mensajes del día actual (optimización de datos)
- Limpieza automática de mensajes viejos (1 vez/día)

---

## 🏟️ Fixture — Comportamiento detallado

### Estados de un partido (`getStatus()`)
| Estado | Condición | Visual |
|---|---|---|
| `open` | Aún no empieza | Badge verde "● Abierto", inputs habilitados |
| `locked` | Ya empezó pero sin resultado | Badge gris "🔒 Cerrado", inputs bloqueados |
| `live` | Empezó hace menos de 105 min | Badge rojo "🔴 En vivo", animación blink |
| `done` | Tiene `realHome` y `realAway` | Badge "✓ Fin", muestra puntos |

### Agrupación por fase
- `normStage()` extrae la fase del string (ej: `"Grupo A · Estadio Azteca"` → `"Grupo A"`)
- Orden: Grupo A→L, Ronda de 32, Octavos, Cuartos, Semifinal, Tercer Puesto, Final
- Los `<details>` **preservan su estado abierto/cerrado** al re-renderizar (`data-stage`)

### Multi-torneo
- Pills de torneos arriba del fixture
- Variable `selectedTournament` filtra los partidos
- **Torneos ocultos** no suman puntos en ningún lado

---

## 📊 Cálculo de Puntos

**REGLA CRÍTICA:** Los puntos SOLO se calculan con partidos de torneos **visibles** (no ocultos).

```js
// SIEMPRE filtrar así:
CACHE.matches.filter(m => m.realHome != null && !isTournamentHidden(m.tournament || 'Sin Torneo'))
```

Funciones que calculan puntos:
- `renderHomeStats()` — KPIs del home
- `renderRanking()` — Tabla de posiciones
- `renderStats()` — Estadísticas globales
- `renderStatsChart()` — Gráfico de evolución

---

## 🎨 Diseño Visual

### Paleta de colores
| Uso | Color | Hex |
|---|---|---|
| Background principal | Slate 900 | `#0f172a` |
| Cards / elementos | Slate 800 | `#1e293b` |
| Texto principal | Slate 100 | `#f1f5f9` |
| Texto secundario | Slate 500 | `#64748b` |
| Bordes | Slate 700 | `#334155` |
| Acento dorado | Amber | `#facc15` |
| Éxito/acierto | Green | `#4ade80` |
| Error/fallo | Red | `#f87171` |
| Admin/editar | Purple | `#7c3aed` / `#c084fc` |
| Links/info | Blue | `#60a5fa` |
| Mensajes | Pink | `#f472b6` |

### Layout
- **Mobile-first** con app shell (header fijo + scroll central + bottom nav fija)
- **Safe-area** para iOS (notch, home indicator)
- **Modo PC** opcional (max-width 700px, centrado)
- Cards con `border-radius: 12px`, `background: #1e293b`
- Font: `-apple-system, 'Segoe UI', sans-serif`

---

## ⚙️ Funciones JS Clave

| Función | Descripción |
|---|---|
| `getStatus(m)` | Retorna `open/locked/live/done` según hora y resultado |
| `getPoolForStage(stage)` | Retorna el pozo de puntos para esa fase |
| `isTournamentHidden(t)` | Verifica si un torneo está oculto |
| `getHiddenTournaments()` | Lista de torneos ocultos desde settings |
| `calcPoints(pred, match, allPreds)` | Calcula puntos: pozo÷N acertadores, exacto ×2 |
| `renderHomeStats()` | KPIs + mensaje en home |
| `renderStatsChart()` | Gráfico de evolución (en tab Stats) |
| `toggleMessagePanel()` | Abre/cierra panel de mensajes |
| `renderMessageTargets()` | Lista jugadores para enviar mensaje |
- `sendMessage(toUserId, toUserName)` | Envía mensaje diario |
| `renderMatches()` | Renderiza fixture completo |
| `renderRanking()` | Tabla de posiciones |
| `renderStats()` | Estadísticas globales |
| `renderUpcoming()` | Próximos partidos en Home |
| `renderPodio()` | Predicción de podio |
| `seedAdmin()` | Crea 3 admins si no existen |
| `importarExcel(input)` | Lee .xlsx y sube partidos a Firebase |
| `normStage(raw)` | Normaliza fase para agrupar partidos |
| `fmtDate(iso)` | Formatea fecha a hora Chile |
| `timeUntil(iso)` | "2h 30m" o "3d" hasta el partido |

---

## ⚠️ Limitaciones y Decisiones

- **Contraseñas SHA-256 en cliente** — OK para grupo cerrado de confianza
- **Reglas Firebase abiertas** — todos pueden leer/escribir
- **Cierre evaluado en cliente** — con reloj del browser
- **Zona horaria Chile** — UTC-4 (horario invierno junio/julio)
- **Admin no juega** — excluido de ranking/stats
- **Partido dura 105 min** (90 + 15) para badge "en vivo"
- **Max ~100 conexiones simultáneas** (límite Firebase Spark)
- **Logo:** `panini.png` en la raíz del repo
- **GitHub Pages límite:** 10 pushes/hora

---

## 📁 Archivos del Proyecto

```
polla-dekadentes/
├── index.html              ← App completa (TODO en uno)
├── panini.png              ← Logo de la polla
├── CONTEXTO.md             ← Documentación original
├── AGENT_CONTEXT.md        ← Este archivo (para agentes)
├── mundial_2026.xlsx       ← Partidos del Mundial
├── mundial_2026_v2.xlsx    ← Versión actualizada
├── libertadores_2026.xlsx  ← Partidos Libertadores
├── champions_2026.xlsx     ← Partidos Champions
├── gen_libertadores.py     ← Script generar Excel
├── gen_champions.py        ← Script generar Champions
├── scrape_mundial.py       ← Script scraper
├── firebase-rules.json     ← Reglas Firebase
└── exportacion/            ← Carpeta de exportación
```

---

## 🔧 Cómo hacer cambios

1. Editar `index.html` localmente
2. Probar en browser (abrir con Live Server o similar)
3. `git add . && git commit -m "descripción" && git push`
4. Esperar ~1 min para que GitHub Pages actualice
5. **No hacer muchos pushes** — límite de 10/hora

---

*Documentado por Tomas 🐶 — Mayo 2025*

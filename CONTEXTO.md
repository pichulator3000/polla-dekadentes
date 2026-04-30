# 🏆 Polla Dekadentes — Contexto Completo del Proyecto

> **Estado:** ✅ EN PRODUCCIÓN  
> **URL:** https://pichulator3000.github.io/polla-dekadentes  
> **Repo:** https://github.com/pichulator3000/polla-dekadentes  
> **Backend:** Firebase Realtime Database (plan Spark/gratis)  
> **Hosting:** GitHub Pages (estático)  
> **Meta:** App web multijugador para ~30 amigos, predicciones de fútbol  
> **Última revisión:** Abril 2025

---

## ¿Qué es esto?

Una **polla deportiva** (quiniela) donde un grupo cerrado de amigos predice
resultados de partidos de fútbol. Soporta múltiples torneos simultáneamente
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
    ~2300 líneas                   pf/settings/{key}
                                   pf/pending/{code}
```

### Flujo de datos
1. Al abrir la app → Firebase listeners (`on('value')`) cargan todo a `CACHE`
2. Todos los renders leen de `CACHE` (sync, instantáneo)
3. Cualquier write → va a Firebase → Firebase notifica a todos los clientes
4. El admin carga resultados → todos ven los puntos al instante (real-time)

### Librerías CDN
- **Firebase App + Realtime DB** compat `v10.12.0`
- **SheetJS** `xlsx-0.20.2` — lectura de Excel en browser (importación masiva)
- **Tailwind CSS** vía CDN
- **Chart.js** `v4` — gráfico de evolución en Home

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
│   └── stagePoints/{Fase} (number - pozo personalizado por fase)
│
└── pending/{code}
    └── name, code, passHash, rawPass (cola de aprobación)
```

---

## 📱 Pestañas de la App (navegación)

### Bottom Nav (visible para todos)
| Tab | Icono | Descripción |
|---|---|---|
| **Home** | 🏠 | Saludo, mini stats con KPIs y gráfico de evolución, grid de accesos rápidos, próximos partidos |
| **Fixture** | ⚽ | Partidos agrupados por fase en `<details>`, predicciones, resultados |
| **Ranking** | 🏆 | Tabla de posiciones con puntos, exactos, aciertos |
| **Stats** | 📊 | Resumen global, % acierto por jugador, goles por equipo, distribución de apuestas |

### Header Nav (iconos arriba a la derecha)
| Tab | Icono | Descripción |
|---|---|---|
| **Podio** | 🏅 | Predicción de campeón, subcampeón y goleador (se cierra al comenzar el torneo) |
| **Reglas** | 📋 | Explicación del sistema de puntos |
| **Admin** | 🛡️ | Solo admin: gestión de partidos, importar Excel |
| **Ajustes** | ⚙️ | Perfil, formato pantalla, gestión usuarios (admin), actividad admin |

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
- Pills de torneos arriba del fixture (ej: "Mundial 2026" | "Libertadores 2025")
- Variable `selectedTournament` filtra los partidos

### Distribución de apuestas (partidos cerrados)
- Barra compacta sobre el resultado: `3 (38%) | 2 emp (25%) | 3 (38%)`
- Solo aparece cuando el partido está cerrado/vivo/finalizado

### Panel de Predicciones (solo admin)
- Cada partido muestra `📋 3/5 (60%)` — participación
- Botón **"🔍 Predicciones ▼"** expande tabla con:
  - Todos los jugadores, su predicción, resultado real, puntos
  - Inputs editables para que el admin corrija predicciones
  - Se registra en el log de actividad qué admin abrió qué partido
- Set `_openPredPanels` (in-memory) — se cierra al recargar

### Vista del jugador (no admin)
- Inputs para poner marcador en partidos abiertos
- Se guarda automáticamente con `onchange`
- Partidos cerrados muestran candado con la predicción en opacidad baja
- Partidos finalizados muestran los puntos ganados (🥇 exacto, ✅ acierto, ❌ fallo)

---

## 🏆 Ranking

- Tabla ordenada por puntos (desc), exactos (desc), aciertos (desc)
- Columnas: #, Nombre, PTS, Exactos, OK, Fail, Partidos jugados
- El líder tiene corona dorada 👑
- Badge de posición con colores (🥇🥈🥉)
- Excluye admins

---

## 📊 Stats

- **KPIs globales:** Total partidos, finalizados, predicciones, exactos
- **% Acierto por jugador:** Tabla con nombre, partidos, aciertos, fallos, porcentaje
- **Goles por equipo:** Tabla con PJ, G, E, P, GF, GC, DG
- **Distribución de apuestas:** Por partido cerrado, cuántos apostaron local/empate/visita

---

## 🏅 Podio

- Cada jugador predice: **Campeón**, **Subcampeón**, **Goleador**
- Se bloquea automáticamente cuando el primer partido del torneo empieza (`isPodioLocked()`)
- Tabla con las predicciones de todos los jugadores (visible después del bloqueo)
- En Stats también aparece la tabla de predicciones de podio

---

## 🛡️ Admin — Gestión

- **Partidos existentes:** Cards con edición (nombre, fecha, sede), botón eliminar, inputs de resultado
- **Agregar partido manual:** Formulario con local, visita, torneo, fase, fecha/hora
- **Importar Excel:** Sube `.xlsx` con columnas: `local`, `visita`, `torneo`, `fase`, `fecha_hora_chile`
- **Borrar todos los partidos:** Botón destructivo con doble confirmación

---

## ⚙️ Ajustes

### Para todos
- **Editar perfil:** Cambiar nombre y contraseña
- **Modo PC:** Diseño más ancho para desktop
- **Mostrar usuario:** Toggle para mostrar/ocultar código en header

### Solo admin
- **🗂️ Actividad Admin:** Log de qué admin abrió predicciones de qué partido, quién editó qué. Máximo 200 registros. Formato: `@tomasadmin Abrió predicciones de Boca vs Barcelona a las 18:55`
- **🔒 Cerrar inscripciones:** Bloquea nuevos registros
- **✅ Modo aprobación:** Nuevos usuarios van a cola de aprobación
- **👥 Gestión de usuarios:** Tabla con nombre, código, contraseña (oculta con reveal), botón eliminar

---

## 📥 Importar partidos desde Excel

### Formato del Excel
| Columna | Descripción | Ejemplo |
|---|---|---|
| `local` | Equipo local | México |
| `visita` | Equipo visita | Ecuador |
| `torneo` | Nombre del torneo | Mundial 2026 |
| `fase` | Fase o grupo | Grupo A |
| `fecha_hora_chile` | Fecha/hora Santiago (Chile) | 2026-06-11T18:00 |

### Excels actuales en el repo
- `mundial_2026.xlsx` — 104 partidos del Mundial 2026
- `mundial_2026_v2.xlsx` — Versión actualizada
- `libertadores_2026.xlsx` — Partidos Copa Libertadores 2025

### Comportamiento al importar
- Partidos con equipo "Por definir" se **omiten** automáticamente
- Se genera un `id` único con timestamp + nombres
- Detecta y avisa partidos duplicados
- La fecha se convierte de hora Chile (UTC-4) a UTC internamente

---

## 🔐 Autenticación

- **Login:** Código único (ej: `tomas22`) + contraseña
- **Registro:** Nombre + código + contraseña
- **Hash:** SHA-256 con Web Crypto API (client-side)
- **Sesión:** `localStorage` (persiste entre tabs y recargas)
- **Auto-login:** Al abrir, intenta restaurar sesión guardada
- **rawPass:** Se guarda en texto plano en Firebase para que admin pueda ver contraseñas olvidadas

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

### Layout
- **Mobile-first** con app shell (header fijo + scroll central + bottom nav fija)
- **Safe-area** para iOS (notch, home indicator)
- **Modo PC** opcional (max-width 700px, centrado)
- Cards con `border-radius: 12px`, `background: #1e293b`
- Font: `-apple-system, 'Segoe UI', sans-serif`

### Componentes recurrentes
- `<details>` con `class="group-summary"` para acordeones
- `.card-match` para tarjetas de partido
- `.score-input` para inputs de marcador (60×60px, centered, bold)
- `.badge-open/lock/live/done` para estados
- `.toggle` para switches on/off
- Toast notifications (arriba, con colores por tipo)

---

## 📁 Archivos del Proyecto

```
polla-futbolera/
├── index.html              ← App completa (~2300 líneas, todo en uno)
├── CONTEXTO.md             ← Este archivo
├── mundial_2026.xlsx       ← Partidos del Mundial
├── mundial_2026_v2.xlsx    ← Versión actualizada
├── libertadores_2026.xlsx  ← Partidos Libertadores
├── gen_libertadores.py     ← Script para generar Excel de Libertadores
├── scrape_mundial.py       ← Script scraper partidos Mundial
├── .gitignore              ← Ignora ~$* (temp Excel), __pycache__
└── deploy/                 ← Carpeta sincronizada con GitHub Pages
    └── (mismos archivos)
```

---

## ⚙️ Funciones JS Clave

| Función | Descripción |
|---|---|
| `getStatus(m)` | Retorna `open/locked/live/done` según hora y resultado |
| `getPoolForStage(stage)` | Retorna el pozo de puntos para esa fase (custom o default) |
| `getStagesEnUso()` | Lista de fases únicas presentes en partidos cargados, ordenadas |
| `saveStagePool(stage, pts)` | Admin guarda pozo personalizado en Firebase |
| `resetStagePool(stage)` | Admin restaura pozo de una fase a su default |
| `renderReglasPozos()` | Tabla de pozos en pestaña Reglas (visible para todos) |
| `buildAdminPozos()` | Panel admin con inputs editables por fase |
| `calcPoints(pred, match, allPreds)` | Calcula puntos: pozo÷N acertadores, exacto ×2 |
| `renderMatches()` | Renderiza fixture completo con grupos, preserva estado abierto |
| `renderRanking()` | Tabla de posiciones ordenada |
| `renderStats()` | Estadísticas globales |
| `renderAdmin()` | Panel admin con gestión de partidos |
| `renderAjustes()` | Ajustes + gestión usuarios + actividad |
| `renderUpcoming()` | Próximos partidos en Home |
| `renderHomeStats()` | KPIs + gráfico evolución en Home |
| `renderPodio()` | Predicción de podio |
| `seedAdmin()` | Crea 3 admins si no existen, elimina admin legacy |
| `importarExcel(input)` | Lee .xlsx y sube partidos a Firebase |
| `togglePredPanel(matchId)` | Abre/cierra panel predicciones en fixture (admin) |
| `saveFixturePred(userId, matchId)` | Admin edita predicción de un jugador |
| `logActivity(adminCode, action, detail)` | Registra actividad admin en localStorage |
| `normStage(raw)` | Normaliza fase para agrupar partidos |
| `fmtDate(iso)` | Formatea fecha a hora Chile |
| `timeUntil(iso)` | "2h 30m" o "3d" hasta el partido |

---

## ⚠️ Limitaciones y Decisiones

- **Contraseñas SHA-256 en cliente** — OK para grupo cerrado de confianza
- **Reglas Firebase abiertas** — todos pueden leer/escribir; aceptable para amigos
- **Cierre evaluado en cliente** — con reloj del browser
- **Zona horaria Chile** — UTC-4 (horario invierno junio/julio)
- **Admin no juega** — `isAdmin: true` excluido de ranking/stats
- **Sin confirmación de email** — grupo cerrado, código es suficiente
- **Partido dura 105 min** (90 + 15) para badge "en vivo"
- **Max ~100 conexiones simultáneas** (límite Firebase Spark)
- **Log de actividad en localStorage** — solo persiste en el browser del admin que lo generó

---

*Documentado por Terminator 🐶 — Abril 2025*

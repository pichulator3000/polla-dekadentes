# 🏆 Polla Dekadentes — Contexto del Proyecto

> **Estado actual:** ✅ EN PRODUCCIÓN — App web real con Firebase + Netlify
> **Meta:** App web multijugador para ~20 amigos, Mundial 2026
> **Última revisión:** Abril 2025 (por Terminator 🐶)

---

## ¿Qué es esto?

Una **polla deportiva** (quiniela) donde un grupo cerrado de ~20 amigos predice
resultados de partidos de fútbol. Cada partido tiene un pozo de 30 puntos que
se reparte entre los que aciertan el resultado (ganador/empate). Acertar el
marcador exacto duplica tu parte.

Los partidos **se cierran solos a la hora de inicio** — sin excepciones, sin
editar después. El admin carga los resultados reales y el sistema calcula los
puntos automáticamente.

---

## 🌐 URLs y Credenciales de Producción

| Qué | Valor |
|---|---|
| **App (Netlify)** | https://polla-dekadentes.netlify.app |
| **Firebase proyecto** | `polla-dekadentes` |
| **Firebase DB URL** | `https://polla-dekadentes-default-rtdb.firebaseio.com` |
| **Firebase consola** | https://console.firebase.google.com → polla-dekadentes |
| **Admin login** | código `admin` / contraseña `admin123` |

> ⚠️ Cambiar la contraseña de admin antes de compartir con los participantes.

---

## ✅ Módulos implementados y en producción

| Módulo | Descripción |
|---|---|
| **Auth** | Login/registro con código único + contraseña (SHA-256, Web Crypto API) |
| **Firebase Realtime DB** | Backend gratuito, datos sincronizados en tiempo real |
| **Netlify hosting** | HTML estático, HTTPS incluido, gratis para siempre |
| **Fixture por grupos** | Partidos agrupados por fase en acordeones desplegables (Grupo A…Final) |
| **Predicciones** | Se guardan en Firebase; cierre automático a la hora exacta del partido |
| **Cálculo de puntos** | `calcPoints()`: pozo 30 pts ÷ N acertadores; exacto ×2 |
| **Ranking** | Tabla en tiempo real con pts, exactos, correctos, partidos jugados |
| **Estadísticas globales** | Goles por equipo, % acierto por jugador, resumen global |
| **Distribución de apuestas** | Por partido: "4 México · 10 Empate · 6 Ecuador" (solo jugados/en vivo) |
| **Admin — Gestión** | Agregar/eliminar partidos, cargar resultados, eliminar usuarios |
| **Admin — Importar Excel** | Sube `mundial_2026.xlsx` y carga los 104 partidos de una vez a Firebase |
| **Admin — Resultados Participantes** | Ve predicciones ajenas ocultas; se revelan con click (queda en log) |
| **Ajustes — Actividad Admin** | Historial de qué predicciones ajenas vio el admin (localStorage, 200 reg.) |
| **UI mobile-first** | App shell con header + scroll central + bottom nav; safe-area iOS |
| **Auto-login** | Sesión guardada en localStorage (persiste entre tabs y recargas) |
| **Modo PC** | Override CSS para pantallas grandes |

---

## 🏗️ Arquitectura actual

```
[index.html en Netlify]  ←→  [Firebase Realtime Database]
       ↑                           ↑
  HTML + CSS + JS             pf/users/{id}
  (sin servidor propio)       pf/matches/{id}
  CACHE local en RAM          pf/preds/{userId}__{matchId}
  actualizado por listeners
```

**Flujo de datos:**
1. Al abrir la app → Firebase listeners actualizan `CACHE`
2. Todos los renders leen de `CACHE` (sync, rápido)
3. Cualquier write → va a Firebase → Firebase notifica a todos
4. El admin carga resultados → todos ven los puntos al instante

**Librerías CDN usadas:**
- Firebase App + Realtime DB compat `v10.12.0`
- SheetJS `xlsx-0.20.2` — para leer Excel en el browser (importación masiva)
- Tailwind CSS (vía CDN)

---

## 📁 Archivos del proyecto

```
polla-futbolera/
├── index.html          ← App completa (todo en uno, ~1500 líneas)
├── mundial_2026.xlsx   ← 104 partidos del Mundial 2026 listos para importar
├── scrape_mundial.py   ← Script Python que genera el Excel (hardcodeado, wiki bloqueada en Walmart)
└── CONTEXTO.md         ← Este archivo ← LEE ESTO PRIMERO
```

---

## 🗂️ Fixture — Cómo funcionan los grupos

Los partidos se agrupan por `m.stage` usando `normStage()`:

```js
const STAGE_ORDER = [
  'Grupo A'...'Grupo L',
  'Ronda de 32','Octavos','Cuartos de Final','Semifinal','Tercer Puesto','Final'
];
```

El stage en Firebase viene como `"Grupo A · Estadio Azteca"` (fase + sede).
`normStage()` extrae solo `"Grupo A"` para agrupar correctamente.

---

## 📥 Importar partidos desde Excel

El Excel `mundial_2026.xlsx` tiene estas columnas:

| Columna | Descripción |
|---|---|
| `local` | Equipo local |
| `visita` | Equipo visita |
| `torneo` | "Mundial 2026" |
| `fase` | Grupo A … Final |
| `sede` | Estadio y ciudad |
| `fecha_hora_chile` | Hora Santiago UTC-4 (YYYY-MM-DDTHH:MM) ← **la app usa esta** |
| `fecha_hora_utc` | Hora UTC (referencia) |

**Cómo importar:**
1. Entrar como `admin` → pestaña **⚙️ Admin** → sub-pestaña **Gestión**
2. Usar el bloque verde **📥 Importar Partidos desde Excel**
3. Seleccionar `mundial_2026.xlsx`
4. Esperar ~30s — sube solo los partidos con equipos definidos (omite "Por definir")

> 📝 Los partidos eliminatorios (Octavos en adelante) vienen como "Por definir"
> y se omiten al importar. Se cargan manualmente cuando se sepa quién juega.

---

## 🔍 Panel "Resultados Participantes" (admin)

- Admin → sub-pestaña **🔍 Participantes**
- Dropdown para elegir jugador
- Muestra todos sus partidos cerrados/en vivo con predicción tapada
- Click en **👁️ Ver predicción** → revela el marcador predicho
- Cada revelación queda registrada en `localStorage` bajo la clave `polla_admin_activity`
- Las revelaciones duran solo la sesión (sessionStorage) — al recargar se tapan de nuevo

---

## 🗂️ Actividad Admin (Ajustes)

- Solo visible para el admin en **⚙️ Ajustes**
- Muestra: timestamp · jugador espiado · partido · predicción revelada
- Máximo 200 registros, FIFO
- Botón **Limpiar** para resetear

---

## 📊 Distribución de apuestas (Estadísticas)

- Sección al final de **📊 Stats**
- Solo muestra partidos `done` o `live`
- Orden: finalizados primero por fecha, en vivo al final con punto rojo 🔴
- Formato compacto: `4 México · 10 Empate · 6 Ecuador`
- Partidos futuros no aparecen

---

## ⚠️ Limitaciones actuales

- **Contraseñas SHA-256 en cliente** — OK para grupo cerrado de confianza
- **Reglas Firebase abiertas** — todos pueden leer/escribir; OK para amigos
- **Cierre evaluado en cliente** — con reloj del browser; mejorar con Cloud Functions si se necesita
- **Colaboración Netlify** — el plan gratis no permite múltiples cuentas en el mismo sitio; alternativa recomendada = GitHub + Netlify auto-deploy

---

## 💡 Decisiones de diseño ya tomadas (respetar)

- **Código único de usuario** (ej: `tomas22`) como identificador principal
- **Admin tiene credenciales fijas** (`admin` / `admin123`) — cambiar antes de producción real
- **Pozo de 30 pts** por partido, dividido entre acertadores, exacto ×2
- **Sin puntos negativos** — fallar da 0
- **Cierre en el minuto exacto de inicio** del partido
- **Partido dura 105 min** (90 + 15 descuento) para el badge "en vivo"
- **El admin no juega** (`isAdmin: true` excluido del ranking y stats)
- **Modo PC** — override CSS para pantallas grandes
- **Sin confirmación de email** — grupo cerrado, código es suficiente
- **Zona horaria Chile** — UTC-4 en junio/julio (CLT, horario invierno)

---

## 🔄 Plan de migración a FastAPI (cuando sea el momento)

### Stack sugerido

```
Backend : Python 3.12 + FastAPI
Template: Jinja2 (o HTMX para actualizaciones parciales)
Estilos : Tailwind CSS (ya lo usa el prototipo vía CDN)
BD      : SQLite (para empezar) → PostgreSQL (si escala)
Auth    : sessions simples con JWT
Deploy  : Railway / Render / VPS con dominio propio
```

### Modelo de datos

```sql
CREATE TABLE users (
    id        TEXT PRIMARY KEY,
    code      TEXT UNIQUE NOT NULL,
    name      TEXT NOT NULL,
    pass_hash TEXT NOT NULL,  -- bcrypt, NO SHA-256
    is_admin  INTEGER DEFAULT 0
);

CREATE TABLE matches (
    id         TEXT PRIMARY KEY,
    home       TEXT NOT NULL,
    away       TEXT NOT NULL,
    datetime   TEXT NOT NULL,  -- ISO 8601, UTC
    tournament TEXT,
    stage      TEXT,
    real_home  INTEGER,        -- NULL = no jugado aún
    real_away  INTEGER
);

CREATE TABLE predictions (
    user_id   TEXT REFERENCES users(id)   ON DELETE CASCADE,
    match_id  TEXT REFERENCES matches(id) ON DELETE CASCADE,
    pred_home INTEGER NOT NULL,
    pred_away INTEGER NOT NULL,
    PRIMARY KEY (user_id, match_id)
);
```

### Pasos de migración (en orden)

1. `uv venv` + estructura de carpetas
2. Modelos SQLite (igual al schema de arriba)
3. Auth endpoint — copiar validaciones del JS actual
4. Endpoints de matches y predictions — copiar lógica de `calcPoints`, `getStatus`
5. Convertir `index.html` a Jinja2 — reemplazar `DB.*` por llamadas al server
6. Deploy en Railway/Render con dominio propio

---

## ❓ Preguntas pendientes

- [ ] ¿Notificaciones? (ej: WhatsApp bot cuando cierra un partido)
- [ ] ¿Múltiples torneos o siempre uno a la vez?
- [ ] ¿Historial de temporadas anteriores?
- [ ] ¿Se permite al admin editar partidos ya iniciados? (ej: posposición)
- [ ] ¿Configurar GitHub + Netlify auto-deploy para colaborar sin drag & drop?
- [ ] Cambiar contraseña de admin antes de abrir al grupo

---

*Documentado por Terminator 🐶 — el perro código de Tomas*

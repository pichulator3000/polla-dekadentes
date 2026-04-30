# 🏆 LEER PARA IMPORTAR — Polla Futbolera

> **Esto es una plantilla de polla deportiva multijugador.** Para tener tu propia
> polla independiente (con tus amigos, sin compartir nada con nadie más),
> seguí estos pasos. Tarda **~10 minutos**.

---

## 📦 ¿Qué hay en este ZIP?

| Archivo | Para qué sirve |
|---------|----------------|
| `index.html` | La app completa (HTML + CSS + JS, todo en un archivo) |
| `firebase-rules.json` | Reglas de seguridad para tu Firebase |
| `mundial_2026.xlsx` | Ejemplo del formato para importar partidos masivamente |
| `LEER_PARA_IMPORTAR.md` | Este archivo |

---

## 🚀 Paso a paso

### 1️⃣ Crear tu Firebase (5 min)

1. Andá a https://console.firebase.google.com
2. Click **"Add project"** → ponele un nombre (ej: `mi-polla-2026`)
3. **Desactivá Google Analytics** (no lo necesitás) → "Create project"
4. Una vez creado: barra lateral izquierda → **Build → Realtime Database**
5. Click **"Create database"** → ubicación: `us-central1` o la más cercana
6. Modo: **"Start in test mode"** (después lo aseguramos con las rules)
7. Pestaña **"Rules"** → borrá lo que hay → pegá el contenido de `firebase-rules.json` → **Publish**

### 2️⃣ Obtener tus credenciales (1 min)

1. En Firebase Console → ⚙️ ícono engranaje arriba a la izquierda → **"Project settings"**
2. Bajá hasta **"Your apps"** → click el ícono **`</>`** (web)
3. Nickname: lo que quieras (ej: `polla-web`) → **NO** marques "Firebase Hosting" → "Register app"
4. Te muestra un objeto `firebaseConfig` con 7 campos. **Copialo entero.**

### 3️⃣ Pegar credenciales en `index.html`

Abrí `index.html` con un editor de texto (Notepad, VSCode, lo que sea).

Buscá este bloque (cerca de la línea 583):

```js
const FIREBASE_CONFIG = {
  apiKey:            "TU_API_KEY",
  authDomain:        "TU_PROYECTO.firebaseapp.com",
  databaseURL:       "https://TU_PROYECTO-default-rtdb.firebaseio.com",
  projectId:         "TU_PROYECTO",
  storageBucket:     "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId:             "TU_APP_ID"
};
```

**Reemplazá los 7 valores con los tuyos** (los de Firebase Console).

⚠️ Importante: el `databaseURL` debe estar correcto. Si tu base está en otra
región puede ser `https://TU_PROYECTO-default-rtdb.SOME-REGION.firebasedatabase.app`.

### 4️⃣ Cambiar admins (opcional pero MUY recomendado)

En el mismo `index.html`, buscá `seedAdmin` (cerca de línea 740):

```js
const admins = [
  { id:'admin1', code:'admin1', name:'Admin 1' },
  { id:'admin2', code:'admin2', name:'Admin 2' },
];
```

Cambiá `id`, `code` y `name` por los tuyos. La contraseña por defecto
es `cambiame123` (línea de abajo, en `hashPass('cambiame123')`).
**Cambiala por algo más seguro.**

### 5️⃣ Subir a GitHub Pages (3 min)

1. Crear cuenta en https://github.com (si no tenés)
2. Click **"New repository"** → nombre (ej: `mi-polla`) → **Public** → "Create"
3. En la siguiente pantalla: **"uploading an existing file"**
4. Arrastrá `index.html` (y opcionalmente `firebase-rules.json` y el `.xlsx`)
5. Commit → "Commit changes"
6. Una vez subido: **Settings** (tab arriba) → **Pages** (sidebar)
7. **Source:** "Deploy from a branch" → **Branch:** `main` / `(root)` → **Save**
8. Esperá ~30 seg. Tu URL aparece arriba: `https://TU_USUARIO.github.io/mi-polla`

### 6️⃣ Primer login

1. Abrí tu URL
2. Login con el código y contraseña que pusiste en el paso 4 (`admin1` / `cambiame123`)
3. Vas a entrar como Admin → entrá a pestaña ⚙️ Admin
4. **Cambiá tu contraseña** (Ajustes → Editar perfil)
5. Importá tus partidos desde el Excel o creá manualmente

### 7️⃣ Compartir con tus amigos

- Mandales tu URL
- Que se registren con su nombre + un código único + contraseña
- Si querés revisar antes de aprobarlos: Ajustes → "Modo aprobación"

---

## 🎯 Funcionalidades incluidas

- 🏟️ **Fixture multi-torneo** (Mundial, Libertadores, Champions, lo que quieras)
- 🏆 **Pozos editables por fase** (ej: Final 100 pts, Semis 60 pts)
- 📊 **Ranking, Stats, Resultados** en tiempo real
- 🏅 **Predicción de Podio** (Campeón, Subcampeón, Goleador)
- 📥 **Importación masiva desde Excel** (formato en `mundial_2026.xlsx`)
- 🛡️ **Panel admin completo** (gestionar partidos, torneos, usuarios, pozos)
- 📱 **Mobile-first** (funciona perfecto en celular)

---

## 💰 Costos

**$0 USD/mes.** Todo en planes gratis:
- **Firebase Spark** (free): 100 conexiones simultáneas, 1 GB storage, 10 GB/mes
- **GitHub Pages** (free): 100 GB/mes de bandwidth, ilimitado en tiempo

Para 30-100 amigos sobra mil veces.

---

## 🐛 Problemas comunes

| Problema | Solución |
|----------|----------|
| Pantalla con "Falta configurar Firebase" | No reemplazaste `FIREBASE_CONFIG`. Volvé al paso 3 |
| Error "Permission denied" al guardar | No subiste las rules al paso 1.7. Andá a Firebase → Rules |
| No puedo entrar como admin | El primer load tarda ~3 seg en crear los admins. Recargá |
| Los amigos no pueden registrarse | Verificá que las rules estén publicadas en Firebase |
| El sitio carga pero no muestra partidos | Importá el Excel desde Admin o creá partidos manualmente |

---

## 🔒 Seguridad

- Las contraseñas se hashean con SHA-256 en el cliente
- Las reglas de Firebase actuales son **abiertas** (cualquiera con tu URL podría escribir)
- Para grupo cerrado de amigos: aceptable
- Si querés blindarlo más: migrá a Firebase Auth con email/Google

---

## 📝 Sistema de puntos

- Cada partido tiene un **pozo** que se reparte entre los que aciertan el resultado
- **Marcador exacto** = tu parte ×2
- **Fallar** = 0 puntos (no hay puntos negativos)
- Los partidos **se cierran a la hora de inicio** automáticamente
- **Pozo por fase editable** desde Admin (defaults: Grupos 30, Octavos 40, Semis 60, Final 100)

---

## 🆘 ¿Necesitás ayuda?

Esto es una plantilla open-source basada en una polla real con ~30 amigos.
Los archivos son lo único que necesitás. No hay servidor que mantener,
ni bases de datos que respaldar, ni costos ocultos.

**Disfrutá tu polla! 🏆⚽**

---

*Plantilla generada por Terminator 🐶 (Code Puppy) — Abril 2026*

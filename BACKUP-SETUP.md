# 🔄 Backup Automático — Configuración

## Qué hace
- **Backup diario automático** de toda la Firebase DB (users, matches, preds, podio, settings, pending)
- Se guarda en `backups/backup-YYYY-MM-DD.json`
- Se pushea al repo automáticamente
- **Restauración** disponible con `node restore-backup.js`

## Configuración necesaria (una sola vez)

### 1. Generar Service Account en Firebase
1. Andá a [Firebase Console](https://console.firebase.google.com/)
2. Seleccioná el proyecto `polla-dekadentes`
3. ⚙️ Configuración del proyecto → **Cuentas de servicio**
4. **Generar nueva clave privada** → Descarga el JSON
5. Guardá ese archivo como `service-account.json` en el repo (NO lo subas al repo, es secreto)

### 2. Agregar el secreto en GitHub
1. Andá al repo en GitHub → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Nombre: `FIREBASE_SERVICE_ACCOUNT`
4. Valor: Pegá el contenido completo del JSON del Service Account
5. **Add secret**

### 3. Verificar que funciona
- Andá a **Actions** → **Daily Firebase Backup** → **Run workflow**
- Debería crear el primer backup en la carpeta `backups/`

## Restaurar datos

```bash
# Listar backups disponibles
ls backups/

# Restaurar uno específico
node restore-backup.js backups/backup-2025-01-15.json
```

⚠️ **La restauración SOBREESCRIBE todos los datos actuales.** Siempre se pide confirmación.

## Estructura del backup
```json
{
  "users": { ... },
  "matches": { ... },
  "preds": { ... },
  "podio": { ... },
  "settings": { ... },
  "pending": { ... },
  "messages": { ... }
}
```

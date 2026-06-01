/**
 * ═══════════════════════════════════════════════════════════
 * RESTORE BACKUP — Restore Firebase data from a backup file
 * ═══════════════════════════════════════════════════════════
 *
 * Uso:
 *   1. Pegá tu Service Account JSON en un archivo 'service-account.json'
 *   2. Ejecutá: node restore-backup.js backups/backup-2025-01-15.json
 *
 * Para obtener el Service Account:
 *   Firebase Console → Configuración del proyecto → Cuentas de servicio
 *   → Generar nueva clave privada
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── Config ──
const SERVICE_ACCOUNT = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));
const DB_URL = 'https://polla-dekadentes-default-rtdb.firebaseio.com';

const backupFile = process.argv[2];
if (!backupFile) {
  console.error('Uso: node restore-backup.js <archivo-backup.json>');
  process.exit(1);
}

if (!fs.existsSync(backupFile)) {
  console.error('No existe:', backupFile);
  console.log('Backups disponibles:');
  const dir = path.dirname(backupFile) || 'backups';
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => console.log(' ', path.join(dir, f)));
  }
  process.exit(1);
}

// ── Init Firebase ──
admin.initializeApp({
  credential: admin.credential.cert(SERVICE_ACCOUNT),
  databaseURL: DB_URL
});

const db = admin.database();

async function restore() {
  console.log('═══════════════════════════════════════');
  console.log('RESTORANDO BACKUP');
  console.log('═══════════════════════════════════════');
  console.log('Archivo:', backupFile);

  const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  const keys = Object.keys(data);
  console.log('Secciones encontradas:', keys.join(', '));

  // Mostrar resumen
  for (const key of keys) {
    const section = data[key];
    const count = typeof section === 'object' && section ? Object.keys(section).length : 1;
    console.log(`  ${key}: ${count} registros`);
  }

  // Confirmar
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question('\n¿Confirmar restauración? Esto SOBREESCRIBE todos los datos actuales. (s/n): ', async (answer) => {
      rl.close();

      if (answer.toLowerCase() !== 's') {
        console.log('Cancelado.');
        resolve();
        return;
      }

      try {
        // Restaurar cada sección
        for (const key of keys) {
          await db.ref(key).set(data[key]);
          console.log(`✓ Restaurado: ${key}`);
        }
        console.log('\n✅ Restauración completada exitosamente.');
      } catch (err) {
        console.error('Error:', err.message);
      }
      resolve();
    });
  });
}

restore().then(() => process.exit(0));

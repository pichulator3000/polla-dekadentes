const admin = require('firebase-admin');
const fs = require('fs');

console.log('Starting backup test...');
console.log('Service account exists:', fs.existsSync('service-account.json'));

const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
console.log('Project ID:', serviceAccount.project_id);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://polla-dekadentes-default-rtdb.firebaseio.com'
});

const db = admin.database();

async function backup() {
  console.log('Reading from Firebase...');
  const ref = db.ref('pf');
  const snapshot = await ref.once('value');
  const data = snapshot.val();
  
  if (!data) {
    console.log('WARNING: No data found in pf/');
    return;
  }
  
  if (!fs.existsSync('backups')) fs.mkdirSync('backups');
  const date = new Date().toISOString().split('T')[0];
  const file = 'backups/backup-' + date + '.json';
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  
  console.log('Backup saved:', file);
  console.log('Sections:', Object.keys(data).join(', '));
  for (const k of Object.keys(data)) {
    const count = data[k] ? Object.keys(data[k]).length : 0;
    console.log('  ' + k + ': ' + count + ' records');
  }
}

backup()
  .then(() => { console.log('Done!'); process.exit(0); })
  .catch(err => { console.error('Error:', err.message); process.exit(1); });

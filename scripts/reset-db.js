const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
for (const name of ['deepkamal.db', 'deepkamal.db-shm', 'deepkamal.db-wal']) {
  const file = path.join(dataDir, name);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log('Removed', name);
  }
}
console.log('Database cleared. Start the server to create a fresh empty DB.');

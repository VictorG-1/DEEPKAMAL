const app = require('./app');
const db = require('./db');

const PORT = process.env.PORT || 3000;

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

const server = app.listen(PORT, () => {
  console.log(`DeepKamal running at http://localhost:${PORT}`);
  console.log(`Database: ${db.dbPath}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error('Run this in PowerShell, then npm start again:');
    console.error(
      `  Get-NetTCPConnection -LocalPort ${PORT} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
    );
    process.exit(1);
  }
  throw err;
});

module.exports = app;

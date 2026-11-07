/**
 * Frees port 3000 (Windows), then starts DeepKamal.
 * Usage:
 *   node scripts/run-server.js
 *   node scripts/run-server.js --watch
 */
const { execSync, spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3000;
const root = path.join(__dirname, '..');
const watch = process.argv.includes('--watch');

function freePort(port) {
  if (process.platform !== 'win32') {
    try {
      execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
    } catch (_) {
      /* ignore */
    }
    return;
  }

  try {
    const out = execSync('netstat -ano', { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`Freed port ${port} (stopped PID ${pid})`);
      } catch (_) {
        /* ignore */
      }
    }
  } catch (_) {
    /* ignore */
  }
}

freePort(PORT);

// Brief wait so Windows releases the socket
const waitMs = 800;
const start = Date.now();
while (Date.now() - start < waitMs) {
  /* spin */
}

if (watch) {
  console.log(`Starting DeepKamal in watch mode on http://localhost:${PORT}`);
  const child = spawn(process.execPath, ['--watch', path.join('server', 'index.js')], {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  require(path.join(root, 'server', 'index.js'));
}

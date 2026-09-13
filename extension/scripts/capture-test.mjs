import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const occupied = await new Promise(resolve => {
  const socket = createConnection({ host: '127.0.0.1', port: 8765 });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});
if (occupied) throw new Error('Port 8765 is in use. Stop your backend before running the isolated capture test.');
const temporary = await mkdtemp(join(tmpdir(), 'cinenihongo-capture-'));
const python = resolve('../backend/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const backend = spawn(python, ['-m', 'uvicorn', 'browser_backend:app', '--app-dir', 'tests', '--host', '127.0.0.1', '--port', '8765'], {
  cwd: resolve('../backend'), windowsHide: true,
  env: { ...process.env, CINENIHONGO_DATABASE_PATH: join(temporary, 'test.sqlite3') },
  stdio: ['ignore', 'pipe', 'pipe']
});
let log = ''; let startupError;
backend.on('error', error => { startupError = error; });
backend.stdout.on('data', data => { log = (log + data).slice(-12000); });
backend.stderr.on('data', data => { log = (log + data).slice(-12000); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (startupError) throw startupError;
    if (backend.exitCode !== null) throw new Error(log);
    try { ready = (await (await fetch('http://127.0.0.1:8765/health')).json()).protocolVersion === '3'; } catch { /* starting */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`Test backend did not start. ${log}`);
  const code = await new Promise((resolve, reject) => {
    const test = spawn(process.execPath, ['scripts/browser-test.mjs', '--capture'], { stdio: 'inherit', windowsHide: true });
    test.on('error', reject); test.on('exit', resolve);
  });
  if (code !== 0) throw new Error(`Capture test failed. Backend output:\n${log}`);
} finally {
  if (backend.exitCode === null && backend.pid) {
    const exited = new Promise(resolve => backend.once('exit', resolve)); backend.kill(); await exited;
  }
  await rm(temporary, { recursive: true, force: true });
}

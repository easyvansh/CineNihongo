import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const skipped = new Set(['node_modules', 'dist', '.venv', '.git', '.cert', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', 'data', 'coverage']);
const decoder = new TextDecoder('utf-8', { fatal: true });
let checked = 0;
async function scan(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) { if (!skipped.has(item.name)) await scan(path); continue; }
    if (!/\.(?:py|ts|tsx|js|mjs|json|html|css|md|toml|yml|yaml|ps1|sh|srt|vtt)$/.test(item.name)) continue;
    const bytes = await readFile(path);
    let source;
    try { source = decoder.decode(bytes); } catch { throw new Error(`Invalid UTF-8 source: ${path}`); }
    if (bytes.includes(0)) throw new Error(`Binary bytes in source: ${path}`);
    if (item.name.endsWith('.json')) JSON.parse(source);
    checked++;
  }
}
await scan(resolve(root));
console.log(`Source integrity: ${checked} text files are valid UTF-8; JSON parses.`);

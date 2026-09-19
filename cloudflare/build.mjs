import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const frontend = fileURLToPath(new URL('../frontend', import.meta.url));
// Paths are fixed inside this repository, never derived from user input.
execFileSync(process.execPath, [frontend + '/node_modules/typescript/bin/tsc', '--noEmit'], { cwd: frontend, stdio: 'inherit' });
execFileSync(process.execPath, [frontend + '/node_modules/vite/bin/vite.js', 'build', '--base=/proyecto/aforo/'], { cwd: frontend, stdio: 'inherit' });
const output = new URL('./public', import.meta.url);
rmSync(output, { recursive: true, force: true });
mkdirSync(new URL('./public/proyecto/aforo', import.meta.url), { recursive: true });
cpSync(new URL('../frontend/dist', import.meta.url), new URL('./public/proyecto/aforo', import.meta.url), { recursive: true });
cpSync(new URL('../frontend/public/_headers', import.meta.url), new URL('./public/_headers', import.meta.url));

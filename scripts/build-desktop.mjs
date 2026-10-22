// Arma la carpeta de la app de escritorio (Electron) a partir de la compilación web.
// Uso: npm run build && node scripts/build-desktop.mjs [versión]
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'desktop-build');
const appDir = join(out, 'app');
if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.error('Primero ejecute "npm run build".');
  process.exit(1);
}
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = process.argv[2] || rootPkg.version;

rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
cpSync(join(root, 'dist'), join(appDir, 'dist'), { recursive: true });
cpSync(join(root, 'desktop', 'main.mjs'), join(appDir, 'main.mjs'));
cpSync(join(root, 'desktop', 'preload.cjs'), join(appDir, 'preload.cjs'));
cpSync(join(root, 'sync-server', 'server.mjs'), join(appDir, 'server.mjs'));
writeFileSync(
  join(appDir, 'package.json'),
  JSON.stringify({ name: 'finanzas-personales', productName: 'Brote', version, description: rootPkg.description, author: 'Brote', main: 'main.mjs', type: 'module', private: true }, null, 2),
);
mkdirSync(join(out, 'resources'), { recursive: true });
cpSync(join(root, 'public', 'icons', 'icon-512.png'), join(out, 'resources', 'icon.png'));
console.log(`App de escritorio ${version} lista en ${appDir}`);

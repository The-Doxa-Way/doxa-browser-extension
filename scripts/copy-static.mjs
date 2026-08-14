/**
 * Copy static assets (manifest.json, HTML, CSS, icons, and the
 * MCP client bundle) into dist/ after tsc has emitted the compiled JS.
 *
 * dist/ is the directory you load as the unpacked extension.
 */

import { cp, mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const staticDir = path.join(root, 'static');
const iconsSrc = path.join(root, 'src', 'icons');
const iconsDist = path.join(dist, 'icons');

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else {
      await cp(s, d);
    }
  }
}

async function copyFile(src, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest);
}

async function bundleMcpClient() {
  // Inline the MCP client into dist/ so the service worker (which is an
  // ES module) and the popup can both reach it via a relative path.
  // The published package is pure ES modules with zero deps, so we can
  // just copy the compiled JS verbatim.
  const pkgRoot = path.join(root, 'node_modules', '@thedoxaway', 'mcp-client', 'dist');
  if (!existsSync(pkgRoot)) {
    throw new Error(
      'Missing node_modules/@thedoxaway/mcp-client/dist. Run `npm install` first.',
    );
  }
  const out = path.join(dist, 'vendor', 'mcp-client');
  await copyDir(pkgRoot, out);
}

async function rewriteImports() {
  // tsc emits `import ... from "@thedoxaway/mcp-client"`. The browser
  // can't resolve bare-specifier imports, so rewrite to the relative
  // vendored path. This is the same trick everyone does for "bundler"
  // moduleResolution targets without a real bundler.
  const files = await collectJs(dist);
  for (const file of files) {
    let src = await readFile(file, 'utf8');
    const next = src.replace(
      /from\s+['"]@thedoxaway\/mcp-client['"]/g,
      (_, ...rest) => {
        const relative = path
          .relative(path.dirname(file), path.join(dist, 'vendor', 'mcp-client', 'index.js'))
          .replace(/\\/g, '/');
        const spec = relative.startsWith('.') ? relative : './' + relative;
        return `from '${spec}'`;
      },
    );
    if (next !== src) await writeFile(file, next, 'utf8');
  }
}

async function collectJs(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectJs(p)));
    } else if (entry.name.endsWith('.js')) {
      out.push(p);
    }
  }
  return out;
}

async function ensureDist() {
  await mkdir(dist, { recursive: true });
}

async function copyStaticFiles() {
  const entries = await readdir(staticDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await copyFile(path.join(staticDir, entry.name), path.join(dist, entry.name));
  }
}

async function copyIcons() {
  await mkdir(iconsDist, { recursive: true });
  const entries = await readdir(iconsSrc, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.png')) continue;
    await copyFile(path.join(iconsSrc, entry.name), path.join(iconsDist, entry.name));
  }
}

async function main() {
  await ensureDist();
  await bundleMcpClient();
  await rewriteImports();
  await copyStaticFiles();
  await copyIcons();
  const stats = await stat(dist);
  if (!stats.isDirectory()) throw new Error('dist is not a directory after build');
  console.log('dist/ ready. Load this folder as an unpacked extension.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Copy static assets (manifest.json, HTML, CSS, icons, and the
 * MCP client bundle) into dist/ after tsc has emitted the compiled JS.
 *
 * dist/ is the directory you load as the unpacked extension.
 */

import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const staticDir = path.join(root, 'static');
const iconsSrc = path.join(root, 'src', 'icons');
const iconsDist = path.join(dist, 'icons');

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
  await cp(pkgRoot, path.join(dist, 'vendor', 'mcp-client'), { recursive: true });
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
      () => {
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

async function main() {
  await mkdir(dist, { recursive: true });
  await bundleMcpClient();
  await rewriteImports();
  await cp(staticDir, dist, {
    recursive: true,
    filter: (src) => src === staticDir || !path.relative(staticDir, src).includes(path.sep),
  });
  await cp(iconsSrc, iconsDist, {
    recursive: true,
    filter: (src) => src === iconsSrc || src.endsWith('.png'),
  });
  console.log('dist/ ready. Load this folder as an unpacked extension.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

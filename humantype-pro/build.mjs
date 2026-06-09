/**
 * HumanType Pro — build script (esbuild).
 *
 * Bundles each TypeScript entry point into a single self-contained IIFE that
 * Chrome can load directly (content scripts can't use ES-module imports), then
 * copies the static assets (manifest, popup HTML/CSS, icons) into `dist/`.
 *
 * Usage:
 *   node build.mjs           # one-off production build (minified)
 *   node build.mjs --watch   # rebuild-on-save dev build (sourcemaps, no minify)
 */

import esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const OUT = 'dist';

/** entry name → source file. The name becomes `<name>.js` in dist/. */
const entryPoints = {
  'service-worker': 'src/background/service-worker.ts',
  'content-script': 'src/content/content-script.ts',
  popup: 'src/popup/popup.ts',
};

/** Copy everything Chrome loads as-is into dist/. */
async function copyStatic() {
  await mkdir(OUT, { recursive: true });
  await cp('src/manifest.json', `${OUT}/manifest.json`);
  await cp('src/popup/popup.html', `${OUT}/popup.html`);
  await cp('src/popup/popup.css', `${OUT}/popup.css`);
  await cp('icons', `${OUT}/icons`, { recursive: true });
}

const options = {
  entryPoints,
  outdir: OUT,
  bundle: true,
  format: 'iife', // content scripts must not be ES modules
  target: 'chrome110',
  platform: 'browser',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  legalComments: 'none',
  logLevel: 'info',
};

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await copyStatic();

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('👀 HumanType Pro: watching for changes (Ctrl+C to stop)…');
  } else {
    await esbuild.build(options);
    console.log('✅ HumanType Pro built to ./dist');
  }
}

main().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});

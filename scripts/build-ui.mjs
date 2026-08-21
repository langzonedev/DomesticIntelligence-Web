import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const targets = [
  ['src/ui/icons.ts', 'ui-icons.js'],
  ['src/ui/ui-kit.ts', 'ui-kit.js']
];

export function compileTypeScript(source, sourcePath) {
  const body = stripTypeScriptTypes(source, {
    mode: 'strip',
    sourceUrl: sourcePath
  });
  return `/* Generated from ${sourcePath}. Run: node scripts/build-ui.mjs */\n${body}`;
}

export async function build({ check = false } = {}) {
  const stale = [];
  for (const [sourcePath, outputPath] of targets) {
    const source = await readFile(resolve(root, sourcePath), 'utf8');
    const output = compileTypeScript(source, sourcePath);
    const outputFile = resolve(root, outputPath);
    if (check) {
      let current = '';
      try { current = await readFile(outputFile, 'utf8'); } catch (_) { /* missing is stale */ }
      if (current !== output) stale.push(outputPath);
    } else {
      await writeFile(outputFile, output, 'utf8');
    }
  }
  if (stale.length) throw new Error(`Generated UI runtime is stale: ${stale.join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  build({ check: process.argv.includes('--check') }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

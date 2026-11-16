// The engine is a library: nothing under src/engine may import from outside it (three.js aside).
// Run by `npm run typecheck`; exits non-zero and lists every offending import.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
const root = resolve(dirname(new URL(import.meta.url).pathname), '..'), engine = join(root, 'src/engine');
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
const bad = [];
for (const f of walk(engine)) {
  for (const m of readFileSync(f, 'utf8').matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1] || m[2];
    if (!spec.startsWith('.')) { if (!/^three(\/|$)/.test(spec)) bad.push(`${relative(root, f)}: external '${spec}'`); continue; }
    if (!resolve(dirname(f), spec).startsWith(engine + '/')) bad.push(`${relative(root, f)}: '${spec}'`);
  }
}
if (bad.length) { console.error('engine boundary broken:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('engine boundary ok');

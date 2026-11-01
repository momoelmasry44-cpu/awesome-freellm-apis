// Parses the repository README tables into data/providers.json for the app.
// Usage: node scripts/build-data.mjs   (run from mobile-app/)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(resolve(here, '../../README.md'), 'utf8');

function section(name) {
  const m = readme.match(new RegExp(`<!-- BEGIN_${name} -->([\\s\\S]*?)<!-- END_${name} -->`));
  if (!m) throw new Error(`Section ${name} not found in README`);
  return m[1]
    .split('\n')
    .filter((l) => l.trim().startsWith('|') && !/^\|\s*-/.test(l.trim()))
    .slice(1) // header row
    .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
}

const href = (cell) => (cell.match(/href="([^"]+)"/) || [])[1] || null;
const text = (cell) => cell.replace(/<[^>]+>/g, '').replace(/`/g, '').trim();
const clean = (v) => (!v || v === '-' || v === '—' || v === '0' ? null : v);

const providers = new Map();
const add = (row, tier, extra) => {
  const [name, models, col3, ctx, modalities, key] = row;
  providers.set(name, {
    name,
    tier,
    freeModels: Number(models) || 0,
    signup: tier === 'permanent' ? col3 : 'Registration',
    creditModel: tier === 'renewable' ? col3 : null,
    maxContext: clean(ctx),
    modalities: modalities.split(',').map((s) => s.trim()).filter(Boolean),
    keyUrl: href(key),
    baseUrl: null,
    models: [],
    ...extra,
  });
};

section('PERMANENT_FREE').forEach((r) => add(r, 'permanent'));
section('RENEWABLE').forEach((r) => add(r, 'renewable'));

for (const [name, base, , card] of section('QUICK_REF')) {
  const p = providers.get(name);
  if (!p) continue;
  p.baseUrl = clean(text(base));
  if (p.tier === 'renewable') p.signup = card;
}

let current = null;
for (const [name, label, id, ctx, limit] of section('BEST_MODELS')) {
  if (name) current = providers.get(name);
  if (!current) continue;
  current.models.push({
    name: text(label),
    id: text(id),
    url: href(label),
    context: clean(ctx),
    rateLimit: clean(text(limit || '')),
  });
}

const topModels = section('TOP_MODELS').map(([label, provider, ctx, usage]) => ({
  name: text(label),
  url: href(label),
  provider,
  context: clean(ctx),
  usage,
}));

const updated = (readme.match(/Last updated: (\d{4}-\d{2}-\d{2})/) || [])[1] || null;

const out = resolve(here, '../data/providers.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({ updated, providers: [...providers.values()], topModels }, null, 2) + '\n'
);
console.log(`Wrote ${providers.size} providers, ${topModels.length} top models → ${out}`);

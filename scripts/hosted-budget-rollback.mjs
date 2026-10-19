import {closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

function exclusiveWrite(path, content) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
  const dir = openSync(dirname(path), 'r');
  try { fsyncSync(dir); } finally { closeSync(dir); }
}
/** Offline preparation only. Never modifies the source ledger or clears a lock. */
export function prepareBudgetRollback(source, output) {
  source = resolve(source); output = resolve(output);
  if (source === output || existsSync(`${source}.lock`) || existsSync(output) || existsSync(`${output}.source-v2.json`)) throw new Error('Rollback requires a stopped writer and fresh output/backup paths');
  const original = readFileSync(source);
  const state = JSON.parse(original.toString('utf8'));
  if (state.version !== 2 || !state.days || typeof state.days !== 'object' || Array.isArray(state.days) || !Array.isArray(state.alerts)) throw new Error('Expected a valid v2 budget ledger');
  const days = {};
  for (const [day, value] of Object.entries(state.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !value || !Number.isFinite(value.confirmed) || value.confirmed < 0 || !Number.isFinite(value.reserved) || value.reserved < 0 || !Number.isFinite(value.confirmed + value.reserved) || (value.blocked !== undefined && typeof value.blocked !== 'boolean')) throw new Error('Invalid budget day; refusing rollback');
    days[day] = {charged: value.confirmed + value.reserved, ...(value.blocked !== undefined ? {blocked: value.blocked} : {})};
  }
  // Keep exact bytes including event delivery metadata before creating the v1 export.
  exclusiveWrite(`${output}.source-v2.json`, original);
  exclusiveWrite(output, JSON.stringify({version: 1, days}));
  return {version: 1, days: Object.keys(days).length, conservativeOccupancy: true, blockedPreserved: true, sourceUnchanged: true};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--source' || args[2] !== '--output') throw new Error('Usage: node scripts/hosted-budget-rollback.mjs --source /isolated/budget-v2.json --output /isolated/budget-v1.json');
    console.log(JSON.stringify(prepareBudgetRollback(args[1], args[3])));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

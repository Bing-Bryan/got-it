import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareBudgetRollback} from './hosted-budget-rollback.mjs';

test('offline rollback backs up exact v2 bytes and never lowers or unblocks occupancy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gotit-rollback-'));
  try {
    const source = join(dir, 'v2.json'), output = join(dir, 'v1.json');
    const state = {version: 2, days: {'2026-10-18': {confirmed: 1.2, reserved: .8, blocked: true}, '2026-10-19': {confirmed: .1, reserved: 2.8999, blocked: false}}, alerts: [{id: 'fixture-only'}]};
    const bytes = JSON.stringify(state, null, 2); writeFileSync(source, bytes);
    assert.equal(prepareBudgetRollback(source, output).conservativeOccupancy, true);
    assert.equal(readFileSync(source, 'utf8'), bytes);
    assert.equal(readFileSync(`${output}.source-v2.json`, 'utf8'), bytes);
    const old = JSON.parse(readFileSync(output, 'utf8'));
    for (const [day, item] of Object.entries(state.days)) {
      assert.equal(old.days[day].charged, item.confirmed + item.reserved);
      assert.equal(old.days[day].blocked, item.blocked);
    }
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.equal(statSync(`${output}.source-v2.json`).mode & 0o777, 0o600);
    assert.throws(() => prepareBudgetRollback(source, output));
    writeFileSync(`${source}.lock`, 'fixture-writer');
    assert.throws(() => prepareBudgetRollback(source, join(dir, 'another.json')));
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('invalid or negative occupancy is rejected without producing an export', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gotit-rollback-'));
  try {
    const source = join(dir, 'bad.json');
    writeFileSync(source, JSON.stringify({version: 2, days: {'2026-10-19': {confirmed: -1, reserved: 0}}, alerts: []}));
    assert.throws(() => prepareBudgetRollback(source, join(dir, 'out.json')));
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

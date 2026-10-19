// Isolated loopback fault injection only. No production configuration is read.
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareBudgetRollback} from './hosted-budget-rollback.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'gotit-alert-drill-'));
const path = join(dir, 'budget.json');
const start = Date.parse('2026-10-19T04:00:00Z');
const delays = [0, 60_000, 300_000, 900_000, 1_800_000, 3_600_000, 7_200_000, 14_400_000];
let received = 0; const eventIds = new Set();
const server = createServer((req, res) => {
  let body = ''; req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const event = JSON.parse(body); received++; eventIds.add(event.eventId);
    if (received % 2 === 0) req.socket.destroy();
    // Odd requests accept but withhold an ACK until the client times out.
  });
});
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/local-fixture`;
  const child = async (now, initialize = false) => {
    const code = `
      import {HostedBudget,initializeBudget} from './server/hosted-budget.ts';
      import {HostedAlerts} from './server/hosted-alerts.ts';
      const path=${JSON.stringify(path)}, now=${now};
      if(${initialize})initializeBudget(path);
      const budget=new HostedBudget(path,.01,()=>now);
      if(${initialize}){try{budget.reserve('fixture-reader','192.0.2.44',.01)}catch{}}
      const alerts=new HostedAlerts(budget,{url:${JSON.stringify(url)},timeoutMs:100,clock:()=>now});
      await alerts.pump(now);
      console.log(JSON.stringify(budget.alerts()[0]));
      budget.close();
    `;
    const {stdout} = await exec(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', code], {cwd: root});
    return JSON.parse(stdout.trim().split('\n').at(-1));
  };
  const states = [];
  for (let index = 0; index < delays.length; index++) {
    const alert = await child(start + delays[index], index === 0);
    if (alert.attempts !== index + 1) throw new Error('Attempt count did not survive process restart');
    states.push({attempts: alert.attempts, status: alert.status});
  }
  const final = await child(start + 86_400_000);
  if (received !== 8 || final.status !== 'exhausted' || eventIds.size !== 1) throw new Error('Retry bound or stable event ID failed');
  const original = readFileSync(path);
  const state = JSON.parse(original);
  // Safe rollback fixture includes a blocked historical day and both fee categories.
  state.days['2026-10-18'] = {confirmed: 1.2, reserved: .8, blocked: true};
  state.days['2026-10-19'] = {confirmed: .1, reserved: 2.8999, blocked: false};
  writeFileSync(path, JSON.stringify(state));
  const before = readFileSync(path); const output = join(dir, 'rollback-v1.json');
  prepareBudgetRollback(path, output);
  const old = JSON.parse(readFileSync(output));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  if (hash(before) !== hash(readFileSync(path)) || hash(before) !== hash(readFileSync(`${output}.source-v2.json`))) throw new Error('Source/backup bytes changed');
  console.log(JSON.stringify({controlled: true, externalNetwork: false, modelCalls: 0, childProcesses: 9, receivedRequests: received, uniqueEvents: eventIds.size, states, final: {attempts: final.attempts, status: final.status}, privacy: 'Only safe event whitelist sent; no configured credentials read', rollback: {sourceUnchanged: true, backupExact: true, v1: old}}, null, 2));
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  rmSync(dir, {recursive: true, force: true});
}

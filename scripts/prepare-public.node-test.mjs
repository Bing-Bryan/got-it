import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const script=fileURLToPath(new URL('./prepare-public.mjs',import.meta.url));
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'got-it-public-boundary-'));
 const dirs=['src','server','scripts','ops','.github','docs/updates','docs/ui','public/fonts'];
 for(const dir of dirs)await mkdir(join(root,dir),{recursive:true});
 const files=['reading','explain','sources','question','pdf-reading','pdf-selection','library','web-reading','homepage-2026-10-19','reading-2026-10-19','reading-2026-10-14','pdf-reading-2026-10-14','web-images-2026-10-14'].map(n=>`docs/images/${n}.png`).concat(['docs/release-checklist.md','docs/release-results.md','docs/ui-guidelines.md','SECURITY.md','LICENSE','README.md','README.en.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','vite.ops.config.ts','index.html','.env.example','.gitignore','.nvmrc','src/safe.txt','scripts/runtime.mjs','ops/index.html','ops/src/main.tsx','scripts/search-provider-eval/internal.ts','scripts/search-reading-eval/internal.ts','scripts/bookmark-ai-spike/private.txt','scripts/bookmark-retrieval-spike/round3/private.txt','public/fonts/licenses/OFL.txt','public/hosted-samples/companion-ai-report.md','public/hosted-samples/unapproved.md','public/hosted-samples/images/unapproved.png','public/private-reading.md']);
 for(const file of files){await mkdir(dirname(join(root,file)),{recursive:true});await writeFile(join(root,file),'safe fixture');}
 return root;
}
test('public copy and manifest both exclude internal research, retain runtime files',async()=>{
 const root=await fixture();try{
  const run=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  const dest=join(root,'release',(await readdir(join(root,'release')))[0]);const manifest=JSON.parse(await readFile(join(dest,'PUBLIC-MANIFEST.json'),'utf8'));
  assert(manifest.files.some(f=>f.path==='src/safe.txt'));assert(manifest.files.some(f=>f.path==='scripts/runtime.mjs'));assert(manifest.files.some(f=>f.path==='public/fonts/licenses/OFL.txt'));
  assert(!manifest.files.some(f=>/scripts\/(bookmark-(ai|retrieval)-spike|search-(provider|reading)-eval)/.test(f.path)));
  assert.deepEqual((await readdir(join(dest,'scripts'))).sort(),['runtime.mjs']);
  for(const f of manifest.files)assert.equal((await readFile(join(dest,f.path))).length,f.bytes);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('allowed-root symlinks still block public preparation',async()=>{
 const root=await fixture();try{await symlink(join(root,'README.md'),join(root,'src','linked.txt'));const run=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'});assert.notEqual(run.status,0);assert.match(run.stderr,/Symlinks are not permitted/);}finally{await rm(root,{recursive:true,force:true});}
});

test('only the publicly served teaching article is copied, without widening to neighboring samples or private public files',async()=>{
 const root=await fixture();try{
  const run=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  const dest=join(root,'release',(await readdir(join(root,'release')))[0]);const manifest=JSON.parse(await readFile(join(dest,'PUBLIC-MANIFEST.json'),'utf8'));
  assert.equal(await readFile(join(dest,'public/hosted-samples/companion-ai-report.md'),'utf8'),'safe fixture');
  assert.deepEqual(await readdir(join(dest,'public/hosted-samples')),['companion-ai-report.md']);
  assert.deepEqual(manifest.files.filter(f=>f.path.startsWith('public/hosted-samples/')).map(f=>f.path),['public/hosted-samples/companion-ai-report.md']);
  assert(!manifest.files.some(f=>f.path==='public/private-reading.md'));
  await assert.rejects(readFile(join(dest,'public/private-reading.md')), {code:'ENOENT'});
 }finally{await rm(root,{recursive:true,force:true});}
});

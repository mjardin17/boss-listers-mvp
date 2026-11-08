'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createCommercialProjection, getPrivatePreviewManifest } = require('../lib/cardScanner/commercialProjection');
const syncFs = require('node:fs');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { buildCardCommercial } = require('../lib/cardCommercial');
const TENANT = '11111111-1111-4111-8111-111111111111';
const ITEM = '33333333-3333-4333-8333-333333333333';
const SESSION = Object.freeze({ tenantId: TENANT, userId: '22222222-2222-4222-8222-222222222222', role: 'owner' });
const OTHER = '99999999-9999-4999-8999-999999999999';
// Test-only explicit system-runtime discovery. Production refuses PATH discovery and requires
// explicit deployment pins; all worker requests below use temporary fixtures.
const probe = spawnSync('/usr/bin/python3',['-I','-S','-B','-c',
  'import sys,sqlite3,os,json;print(json.dumps(dict(path=os.path.realpath(sys.executable),python=".".join(map(str,sys.version_info[:3])),sqlite=sqlite3.sqlite_version)))'],{encoding:'utf8'});
assert.equal(probe.status,0);
const installed = JSON.parse(probe.stdout);
const RUNTIME_ENV = {CARD_FACTORY_PYTHON:installed.path,
  CARD_FACTORY_PYTHON_SHA256:createHash('sha256').update(syncFs.readFileSync(installed.path)).digest('hex'),
  CARD_FACTORY_PYTHON_VERSION:installed.python,CARD_FACTORY_SQLITE_VERSION:installed.sqlite};

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'boss-commercial-node-fixture-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = spawnSync('python', ['-I','-S','-B','tests/card_factory/test_commercial_readonly.py','fixture',root], {encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const service = createCommercialProjection({env:{...RUNTIME_ENV,CARD_FACTORY_LOCAL_ENABLED:'1',BOSS_CARD_FACTORY_ROOT:root}});
  return {root,service};
}
async function state(root) {
  const entries = [];
  async function visit(file) {
    const stat = await fs.lstat(file, {bigint:true});
    entries.push([path.relative(root,file),String(stat.ino),String(stat.mode),String(stat.size),String(stat.mtimeNs),String(stat.ctimeNs),
      stat.isFile() ? createHash('sha256').update(await fs.readFile(file)).digest('hex') : null]);
    if (stat.isDirectory()) for (const name of (await fs.readdir(file)).sort()) await visit(path.join(file,name));
  }
  await visit(root); return entries;
}

test('existing synthetic inventory reaches the unchanged builder; state is unchanged', async t => {
  const {root,service} = await setup(t); const before = await state(root);
  const result = await service.preview(SESSION,[ITEM]);
  assert.deepEqual(await state(root),before);
  assert.equal(result.mode,'private-preview'); assert.equal(result.published,false);
  assert.equal(result.includedCount,1); assert.deepEqual(result.excluded,[]);
  assert.equal(result.reservationSupport,false);
  assert.equal(result.script.scenes[1].caption,'2024 Synthetic Set Example Card #7');
  const asset = result.script.scenes[1].product_images[0];
  assert.match(asset,/^bl-private:asset:[0-9a-f-]{36}$/);
  assert.deepEqual(result.script,buildCardCommercial([{itemId:ITEM,title:'2024 Synthetic Set Example Card #7',titleVerified:true,
    quantity:2,needsReview:false,frontImage:asset,snapshotHash:'a'.repeat(64)}]));
  assert.deepEqual(await service.preview(SESSION,[ITEM]),result);
  const serialized = JSON.stringify(result);
  for (const prohibited of [root,TENANT,ITEM,'https://','file://','snapshotHash','front_image_path']) assert.equal(serialized.includes(prohibited),false);
});

test('empty selection returns empty scenes without creating a tenant or database', async t => {
  const {root,service} = await setup(t); const before = await state(root);
  assert.deepEqual((await service.preview({...SESSION,tenantId:OTHER},[])).script.scenes,[]);
  assert.deepEqual(await state(root),before);
});

test('unknown or cross-tenant IDs fail as a whole request without detail leakage', async t => {
  const {root,service} = await setup(t);
  await assert.rejects(service.preview(SESSION,[ITEM,OTHER]),e => e.code === 'SELECTION_NOT_FOUND' && !e.message.includes(root));
  await assert.rejects(service.preview({...SESSION,tenantId:OTHER},[ITEM]),e => e.code === 'STORE_UNAVAILABLE');
  await assert.rejects(fs.stat(path.join(root,OTHER)),{code:'ENOENT'});
});

test('missing database is never created', async t => {
  const {root,service} = await setup(t); await fs.unlink(path.join(root,TENANT,'cards.sqlite3'));
  const before = await state(root);
  await assert.rejects(service.preview(SESSION,[ITEM]),e => e.code === 'STORE_UNAVAILABLE');
  assert.deepEqual(await state(root),before);
});

test('trusted session is required; authorization is not taken from selected client data', async t => {
  const {service} = await setup(t);
  for (const session of [null,{}, {...SESSION,role:'member'}, {...SESSION,tenantId:'../escape'}, {...SESSION,userId:''}]) {
    await assert.rejects(service.preview(session,[ITEM]),e => e.code === 'FORBIDDEN');
  }
  for (const input of [{tenantId:TENANT,itemIds:[ITEM]}, [{itemId:ITEM,title:'override',titleVerified:true,quantity:999,frontImage:'x',snapshotHash:'a'.repeat(64)}], [ITEM,ITEM], Array(51).fill(ITEM)]) {
    await assert.rejects(service.preview(SESSION,input),e => e.code === 'INVALID_SELECTION');
  }
  const extra = [ITEM]; extra.tenantId = OTHER;
  await assert.rejects(service.preview(SESSION,extra),e => e.code === 'INVALID_SELECTION');
});

test('disabled or unsafe server configuration fails closed', async () => {
  for (const env of [{}, {CARD_FACTORY_LOCAL_ENABLED:'1',BOSS_CARD_FACTORY_ROOT:'relative'},
    {CARD_FACTORY_LOCAL_ENABLED:'1',BOSS_CARD_FACTORY_ROOT:path.join(process.cwd(),'public')}]) {
    await assert.rejects(createCommercialProjection({env}).preview(SESSION,[ITEM]),e => e.code === 'LOCAL_PREVIEW_DISABLED');
  }
});

test('WAL/journal state errors never become an empty successful preview', async t => {
  const {root,service} = await setup(t);
  await fs.writeFile(path.join(root,TENANT,'cards.sqlite3-wal'),'fixture'); const before = await state(root);
  await assert.rejects(service.preview(SESSION,[ITEM]),e => e.code === 'WAL_OR_JOURNAL_UNSUPPORTED');
  assert.deepEqual(await state(root),before);
});

test('no network requests, auth resolution, copywriter, publisher or renderer imports', async t => {
  const {service} = await setup(t);
  const original = global.fetch; let calls = 0;
  global.fetch = () => {calls++; throw new Error('network forbidden');};
  try { assert.equal((await service.preview(SESSION,[ITEM])).includedCount,1); }
  finally {global.fetch = original;}
  assert.equal(calls,0);
  const source = await fs.readFile(require.resolve('../lib/cardScanner/commercialProjection'),'utf8');
  const imports = [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m=>m[1]).sort();
  assert.deepEqual(imports,['../cardCommercial','node:child_process','node:path','node:fs','node:crypto'].sort());
});

test('builder policy violations are explicit exclusions, not rewritten captions', async t => {
  const {root,service} = await setup(t);
  const code = `import sqlite3,json,sys
from contextlib import closing
with closing(sqlite3.connect(sys.argv[1])) as db, db:
 identity,history=db.execute('SELECT identification,review_history FROM cards').fetchone()
 identity=json.loads(identity); history=json.loads(history)
 identity['fields']['player']='Rare Example'; history[-1]['corrected']=identity
 db.execute('UPDATE cards SET identification=?,review_history=?',(json.dumps(identity),json.dumps(history)))`;
  const result = spawnSync('python',['-I','-S','-B','-c',code,path.join(root,TENANT,'cards.sqlite3')],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const preview = await service.preview(SESSION,[ITEM]);
  assert.deepEqual(preview.script.scenes,[]);
  assert.deepEqual(preview.excluded,[{selectionIndex:0,reason:'BUILDER_POLICY_REJECTED'}]);
});


function loadInternals({spawnImpl=spawn, timers=globalThis}={}) {
  const source=syncFs.readFileSync(require.resolve('../lib/cardScanner/commercialProjection'),'utf8');
  const module={exports:{}};
  const localRequire=name => name==='node:child_process' ? {spawn:spawnImpl} :
    name==='../cardCommercial' ? require('../lib/cardCommercial') : require(name);
  const factory=new Function('require','module','__dirname','process','Buffer','setTimeout','clearTimeout',
    source+'\nmodule.exports.testing={runWorker,activeWorkers,checkedResponse,boundAsset,validatedRuntime};');
  factory(localRequire,module,path.dirname(require.resolve('../lib/cardScanner/commercialProjection')),process,Buffer,
    timers.setTimeout.bind(timers),timers.clearTimeout.bind(timers));
  return module.exports;
}
function doubleChild() {
  const child=new EventEmitter(); child.pid=12345; child.signals=[];
  for (const key of ['stdin','stdout','stderr']) {
    child[key]=new EventEmitter(); child[key].destroyed=false;
    child[key].destroy=()=>{child[key].destroyed=true;};
    child[key].end=value=>{child.input=value;};
  }
  child.kill=signal=>{child.signals.push(signal);return true;};
  return child;
}
function fakeClock() {
  let time=0, next=0; const pending=new Map();
  return {
    setTimeout(fn,delay){const id=++next;pending.set(id,{fn,at:time+delay});return id;},
    clearTimeout(id){pending.delete(id);},
    advance(delta){time+=delta;for(const [id,entry] of [...pending]) if(entry.at<=time){pending.delete(id);entry.fn();}},
    get size(){return pending.size;},
  };
}
const fakeRuntime={python:'/synthetic/pinned/python'};

for (const scenario of ['timeout','stdout overflow','stderr overflow','stdin failure','cancellation']) {
  test(`mock process: ${scenario} waits for exit, escalates and cleans resources`,async()=>{
    const child=doubleChild(), clock=fakeClock(), controller=new AbortController();
    const {testing}=loadInternals({spawnImpl:()=>child,timers:clock});
    let settled=false;
    const promise=testing.runWorker(fakeRuntime,{}, {signal:controller.signal,timeoutMs:10,termMs:5,killMs:10});
    const observed=promise.catch(error=>{settled=true;return error;});
    if(scenario==='timeout')clock.advance(10);
    if(scenario==='stdout overflow')child.stdout.emit('data',Buffer.alloc(131073));
    if(scenario==='stderr overflow')child.stderr.emit('data',Buffer.alloc(131073));
    if(scenario==='stdin failure')child.stdin.emit('error',new Error('synthetic private detail'));
    if(scenario==='cancellation')controller.abort();
    await Promise.resolve(); assert.equal(settled,false);
    assert.deepEqual(child.signals,['SIGTERM']); assert.equal(testing.activeWorkers.size,1);
    clock.advance(5); assert.deepEqual(child.signals,['SIGTERM','SIGKILL']);
    await Promise.resolve(); assert.equal(settled,false);
    child.emit('exit',null,'SIGKILL');
    const error=await observed;
    assert.equal(error.cleanupComplete,true);assert.equal(error.message.includes('private detail'),false);
    assert.equal(testing.activeWorkers.size,0);assert.equal(clock.size,0);
    for(const stream of [child.stdin,child.stdout,child.stderr]) {
      assert.equal(stream.destroyed,true);assert.equal(stream.eventNames().length,0);
    }
    assert.equal(child.eventNames().length,0);
  });
}

test('mock process: unconfirmed termination is tracked and quarantines new work',async()=>{
  const child=doubleChild(),clock=fakeClock();
  const {testing}=loadInternals({spawnImpl:()=>child,timers:clock});
  const observed=testing.runWorker(fakeRuntime,{}, {timeoutMs:10,termMs:5,killMs:10}).catch(error=>error);
  clock.advance(10);clock.advance(5);clock.advance(10);
  const error=await observed;
  assert.equal(error.code,'WORKER_CLEANUP_UNCONFIRMED');assert.equal(error.cleanupComplete,false);
  assert.equal(testing.activeWorkers.size,1);
  await assert.rejects(testing.runWorker(fakeRuntime,{}),e=>e.code==='WORKER_CLEANUP_UNCONFIRMED');
  child.emit('exit',null,'SIGKILL');assert.equal(testing.activeWorkers.size,0);
});

test('mock process: process-wide concurrency and request-byte limits fail before spawn',async()=>{
  const children=[],clock=fakeClock();
  const {testing}=loadInternals({spawnImpl:()=>{const child=doubleChild();children.push(child);return child;},timers:clock});
  await assert.rejects(testing.runWorker(fakeRuntime,{large:'x'.repeat(16385)}),e=>e.code==='INVALID_SELECTION');
  const one=testing.runWorker(fakeRuntime,{}).catch(e=>e),two=testing.runWorker(fakeRuntime,{}).catch(e=>e);
  await assert.rejects(testing.runWorker(fakeRuntime,{}),e=>e.code==='WORKER_LIMIT');
  assert.equal(children.length,2);
  for(const child of children){child.stdin.emit('error',new Error('fixture'));child.emit('exit',1,null);}
  await Promise.all([one,two]);assert.equal(testing.activeWorkers.size,0);
});

test('mock process: pinned startup arguments and minimized environment',async()=>{
  const child=doubleChild();let call;
  const {testing}=loadInternals({spawnImpl:(...args)=>{call=args;return child;}});
  const result=testing.runWorker(fakeRuntime,{});
  assert.deepEqual(call[1].slice(0,3),['-I','-S','-B']);assert.deepEqual(call[2].env,{LANG:'C.UTF-8'});
  child.stdout.emit('data',Buffer.from('{"ok":true}'));child.emit('exit',0,null);child.emit('close',0,null);
  assert.deepEqual(await result,{ok:true});
});

test('runtime pinning rejects PATH executables, missing hashes and incorrect versions',async t=>{
  const {root}=await setup(t);
  for(const patch of [{CARD_FACTORY_PYTHON:'python'},{CARD_FACTORY_PYTHON_SHA256:''},
    {CARD_FACTORY_PYTHON_SHA256:'0'.repeat(64)},{CARD_FACTORY_PYTHON_VERSION:'3.99.0'},
    {CARD_FACTORY_PYTHON_VERSION:'3.11.0'},{CARD_FACTORY_SQLITE_VERSION:'3.1.0'}]) {
    const service=createCommercialProjection({env:{...RUNTIME_ENV,CARD_FACTORY_LOCAL_ENABLED:'1',BOSS_CARD_FACTORY_ROOT:root,...patch}});
    await assert.rejects(service.preview(SESSION,[ITEM]),e=>e.code==='RUNTIME_UNVERIFIED');
  }
});

test('private manifest survives handoff but never enters public output',async t=>{
  const {service,root}=await setup(t);const preview=await service.preview(SESSION,[ITEM]);
  const manifest=getPrivatePreviewManifest(preview);
  assert.match(manifest.revision,/^[a-f0-9]{64}$/);assert.equal(manifest.bindings[0].itemId,ITEM);
  assert.equal(Object.isFrozen(manifest),true);assert.equal(Object.isFrozen(manifest.bindings[0]),true);
  assert.equal(Object.isFrozen(preview.script.scenes[1].product_images),true);
  assert.throws(()=>{preview.script.scenes[1].product_images[0]='substituted';},TypeError);
  const json=JSON.stringify(preview);
  for(const value of [root,TENANT,ITEM,manifest.revision,manifest.bindings[0].snapshotHash,manifest.bindings[0].frontSha256]) assert.equal(json.includes(value),false);
  assert.equal(getPrivatePreviewManifest(JSON.parse(json)),undefined);
});

test('manifest validation rejects substituted assets, item IDs, missing hashes and mismatched revisions',()=>{
  const {testing}=loadInternals();
  const row={itemId:ITEM,title:'Synthetic Example #7',titleVerified:true,quantity:1,needsReview:false,snapshotHash:'a'.repeat(64),frontImage:''};
  const binding={...row,frontSha256:'b'.repeat(64),backSha256:'c'.repeat(64)};
  row.frontImage=testing.boundAsset(TENANT,row,binding);binding.frontImage=row.frontImage;
  const valid={revision:'d'.repeat(64),rows:[{selectionIndex:0,row,binding}],excluded:[]};
  assert.equal(testing.checkedResponse(valid,[ITEM],TENANT).rows.length,1);
  for(const change of [entry=>{entry.row.itemId=OTHER;},entry=>{entry.row.frontImage='bl-private:asset:'+OTHER;},
    entry=>{entry.binding.snapshotHash='f'.repeat(64);},entry=>{delete entry.binding.frontSha256;},
    entry=>{entry.binding.quantity=9;},entry=>{entry.binding.backSha256='';}]) {
    const altered=structuredClone(valid);change(altered.rows[0]);
    assert.throws(()=>testing.checkedResponse(altered,[ITEM],TENANT));
  }
});

// Real OS process probes: synthetic interpreter children only. The test spawn
// adapter substitutes harmless -c programs for the fixed production worker;
// runWorker itself handles real pipes, signals, exit and cleanup unchanged.
for (const scenario of ['timeout escalation','stdout overflow','stdin failure','cancellation']) {
  test(`real process: ${scenario} is reaped before failure is returned`,{timeout:10000},async()=>{
    let child; const controller=new AbortController();
    let program='import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); print("ready",flush=True); time.sleep(30)';
    if(scenario==='stdout overflow') program='import sys,time;sys.stdout.write("x"*140000);sys.stdout.flush();time.sleep(30)';
    const {testing}=loadInternals({spawnImpl:(_python,_args,options)=>{
      child=spawn(installed.path,['-I','-S','-B','-c',program],options);
      if(scenario==='stdin failure'||scenario==='cancellation') child.stdout.once('data',()=>{
        if(scenario==='stdin failure') child.stdin.emit('error',new Error('synthetic pipe failure'));
        else controller.abort();
      });
      return child;
    }});
    const error=await testing.runWorker({python:installed.path},{},{signal:controller.signal,timeoutMs:500,termMs:50,killMs:1500}).catch(e=>e);
    assert.equal(error.cleanupComplete,true);
    assert.equal(testing.activeWorkers.size,0);
    assert.ok(child.exitCode!==null || child.signalCode!==null);
    assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});
    if(scenario!=='stdout overflow') assert.equal(child.signalCode,'SIGKILL');
  });
}

test('real projection detects stock changed between the two verification reads',async t=>{
  const {root}=await setup(t);let launches=0, mutationState;
  const api=loadInternals({spawnImpl:(python,args,options)=>{
    launches++;
    if(launches===2){
      const result=spawnSync(installed.path,['-I','-S','-B','-c',
        'import sqlite3,sys;db=sqlite3.connect(sys.argv[1]);db.execute("UPDATE cards SET on_hand=4");db.commit();db.close()',
        path.join(root,TENANT,'cards.sqlite3')],{encoding:'utf8'});
      assert.equal(result.status,0);mutationState=state(root);
    }
    return spawn(python,args,options);
  }});
  const service=api.createCommercialProjection({env:{...RUNTIME_ENV,CARD_FACTORY_LOCAL_ENABLED:'1',BOSS_CARD_FACTORY_ROOT:root}});
  await assert.rejects(service.preview(SESSION,[ITEM]),e=>e.code==='SNAPSHOT_STALE');
  assert.equal(launches,2);assert.equal(api.testing.activeWorkers.size,0);
  assert.deepEqual(await state(root),await mutationState);
});

test('real process: actual closed-stdin EPIPE triggers termination and confirmed exit',{timeout:10000},async()=>{
  let child, pipeError;
  const {testing}=loadInternals({spawnImpl:(_python,_args,options)=>{
    child=spawn(installed.path,['-I','-S','-B','-c',
      'import os,signal,time;os.close(0);signal.signal(signal.SIGTERM,signal.SIG_IGN);print("ready",flush=True);time.sleep(30)'],options);
    const end=child.stdin.end.bind(child.stdin);
    child.stdin.end=input=>{child.stdout.once('data',()=>end(input));};
    child.stdin.once('error',error=>{pipeError=error.code;});
    return child;
  }});
  const error=await testing.runWorker({python:installed.path},{synthetic:'data'},
    {timeoutMs:2000,termMs:50,killMs:1500}).catch(e=>e);
  assert.equal(pipeError,'EPIPE');assert.equal(error.code,'DATABASE_READ_FAILED');
  assert.equal(error.cleanupComplete,true);assert.equal(child.signalCode,'SIGKILL');
  assert.equal(testing.activeWorkers.size,0);assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});
});

test('real process: concurrency cap prevents a third child and releases both slots',{timeout:10000},async()=>{
  const children=[];const controller=new AbortController();
  const {testing}=loadInternals({spawnImpl:(_python,_args,options)=>{
    const child=spawn(installed.path,['-I','-S','-B','-c','import time;time.sleep(30)'],options);
    children.push(child);return child;
  }});
  const options={signal:controller.signal,timeoutMs:2000,termMs:50,killMs:1500};
  const one=testing.runWorker(fakeRuntime,{},options).catch(e=>e);
  const two=testing.runWorker(fakeRuntime,{},options).catch(e=>e);
  await assert.rejects(testing.runWorker(fakeRuntime,{},options),e=>e.code==='WORKER_LIMIT');
  assert.equal(children.length,2);controller.abort();
  for(const error of await Promise.all([one,two]))assert.equal(error.cleanupComplete,true);
  for(const child of children)assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});
  assert.equal(testing.activeWorkers.size,0);
});

test('mock process: cancellation before launch and spawn failure create no orphan',async()=>{
  let launches=0;const controller=new AbortController();controller.abort();
  const {testing}=loadInternals({spawnImpl:()=>{launches++;throw new Error('synthetic spawn failure');}});
  await assert.rejects(testing.runWorker(fakeRuntime,{}, {signal:controller.signal}),e=>e.code==='CANCELLED'&&e.cleanupComplete);
  assert.equal(launches,0);
  await assert.rejects(testing.runWorker(fakeRuntime,{}),e=>e.code==='DATABASE_READ_FAILED'&&e.cleanupComplete);
  assert.equal(testing.activeWorkers.size,0);
});

test('runtime validation refuses a group/world-writable executable deployment',()=>{
  const {testing}=loadInternals();
  // The sandbox /usr/local runtime has unsafe deployment permissions. Do not
  // chmod it or weaken production checks; test the refusal when present.
  const unsafe='/usr/local/bin/python3.13';
  if(syncFs.existsSync(unsafe) && (syncFs.statSync(unsafe).mode&0o022)) {
    const env={...RUNTIME_ENV,CARD_FACTORY_PYTHON:unsafe,
      CARD_FACTORY_PYTHON_SHA256:createHash('sha256').update(syncFs.readFileSync(unsafe)).digest('hex')};
    assert.throws(()=>testing.validatedRuntime(env),e=>e.code==='RUNTIME_UNVERIFIED');
  } else {
    assert.throws(()=>testing.validatedRuntime({...RUNTIME_ENV,CARD_FACTORY_PYTHON:'relative/python'}),e=>e.code==='RUNTIME_UNVERIFIED');
  }
});

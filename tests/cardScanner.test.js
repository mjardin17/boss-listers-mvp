const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {createScannerService}=require('../lib/cardScanner/service');
const A={tenantId:'11111111-2222-4333-8444-555555555555',userId:'11111111-2222-4333-8444-666666666666'};
const B={tenantId:'22222222-2222-4333-8444-555555555555',userId:A.userId};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII=','base64');
const image=()=>({bytes:png,mime:'image/png'});
async function setup(t,extra={}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'boss-scanner-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 return createScannerService({env:{CARD_FACTORY_LOCAL_ENABLED:'1',BOSS_CARD_FACTORY_ROOT:root},...extra});
}
test('local feature disabled by default',async()=>{
 const s=createScannerService({env:{}});
 await assert.rejects(()=>s.list(A),/Local staging/);
});
test('tenant paths are derived from verified session, never input',async t=>{
 const s=await setup(t); const id=randomUUID();
 const result=await s.capture(A,{captureId:id,front:image(),back:image()});
 assert.equal(result.identification.status,'unknown');
 await assert.rejects(()=>s.getCapture(B,id),/not found/);
 await assert.rejects(()=>s.getCapture(A,'../secret'),/identifier/);
});
test('recognition is not invoked without explicit approval',async t=>{
 let calls=0;const s=await setup(t,{identify:async()=>{calls++;}});
 await s.capture(A,{captureId:randomUUID(),front:image(),back:image()});
 assert.equal(calls,0);
});
test('capture retry is idempotent, changed content cannot overwrite',async t=>{
 const s=await setup(t),captureId=randomUUID();
 const first=await s.capture(A,{captureId,front:image(),back:image()});
 assert.equal((await s.capture(A,{captureId,front:image(),back:image()})).captureId,first.captureId);
 const changed={bytes:Buffer.concat([png,Buffer.from('different')]),mime:'image/png'};
 await assert.rejects(()=>s.capture(A,{captureId,front:changed,back:image()}),/different/);
});
test('both sides, byte limits and actual raster format enforced',async t=>{
 const s=await setup(t);
 for(const front of [null,{bytes:Buffer.from('<svg/>'),mime:'image/png'}, {bytes:Buffer.alloc(5*1024*1024),mime:'image/png'}]) {
  await assert.rejects(()=>s.capture(A,{captureId:randomUUID(),front,back:image()}));
 }
});
test('sync endpoint cannot write even when caller asks',async t=>{
 const s=await setup(t);await assert.rejects(()=>s.sync(A,{confirm:true}),/disabled/);
});
test('tenant isolation for SQLite inventory',async t=>{
 const s=await setup(t); assert.deepEqual((await s.list(A)).cards,[]);assert.deepEqual((await s.list(B)).cards,[]);
});
test('malformed model output is rejected without leaking provider errors',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'boss-ai-fixture-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const s=createScannerService({env:{CARD_FACTORY_LOCAL_ENABLED:'1',BOSS_CARD_FACTORY_ROOT:root,CARD_FACTORY_ALLOW_PAID_AI:'approved',GEMINI_API_KEY:'fake-fixture-only',PLATFORM_OWNER_TENANT_ID:A.tenantId},identify:async()=>({status:'confirmed',fields:{player:{invalid:true}}})});
 const result=await s.capture(A,{captureId:randomUUID(),front:image(),back:image()});assert.equal(result.identification.status,'unknown');assert.equal(JSON.stringify(result).includes('fake-fixture-only'),false);
});
test('other tenants cannot invoke shared recognition even when enabled',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'boss-owner-fixture-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let called=0;
 const s=createScannerService({env:{CARD_FACTORY_LOCAL_ENABLED:'1',BOSS_CARD_FACTORY_ROOT:root,CARD_FACTORY_ALLOW_PAID_AI:'approved',GEMINI_API_KEY:'fake-fixture-only',PLATFORM_OWNER_TENANT_ID:A.tenantId},identify:async()=>{called++;}});
 await s.capture(B,{captureId:randomUUID(),front:image(),back:image()});assert.equal(called,0);
});
test('private captures cannot be configured under the public asset directory',async()=>{
 const s=createScannerService({env:{CARD_FACTORY_LOCAL_ENABLED:'1',BOSS_CARD_FACTORY_ROOT:path.join(process.cwd(),'public','card-photos')}});
 await assert.rejects(()=>s.list(A),/private/);
});

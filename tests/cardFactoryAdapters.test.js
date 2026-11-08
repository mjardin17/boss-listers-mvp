const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeIdentification } = require('../lib/cardFactoryAdapters');
const fields = {cardGame:'Pokémon', player:'Demo', set:'Demo Set', cardNumber:'1',
  manufacturer:'Demo', year:'2024', team:'Demo', parallel:'Base', edition:'Unlimited'};
test('normalizer uses canonical card fields and evidence scoring', () => {
  const result = normalizeIdentification({status:'confirmed', fields, evidence:{}});
  assert.equal(result.status, 'confirmed');
  assert.equal(result.fields.language, null);
  assert.equal(result.confidenceScore, 96);
});
test('malformed model fields rejected by Zod', () => {
  assert.throws(() => normalizeIdentification({status:'confirmed', fields:{...fields, graded:'yes'}}));
});
test('multiple candidates and conflicts cannot be promoted', () => {
  assert.equal(normalizeIdentification({status:'confirmed', fields, candidates:[fields,fields]}).status, 'needs_review');
  assert.equal(normalizeIdentification({status:'confirmed', fields, evidence:{frontBackTextConflict:true}}).status, 'needs_review');
});
test('declared uncertain status is never promoted by field completeness', () => {
  for (const status of ['unknown','likely','needs_review']) {
    assert.equal(normalizeIdentification({status,fields}).status, status);
  }
});

const { estimateEbay } = require('../lib/cardFactoryAdapters');
const identification = {status:'confirmed',fields,evidence:{}};
test('pricing is offline by default even with an environment token', async () => {
  let called = false;
  const result = await estimateEbay({identification, env:{EBAY_APP_TOKEN:'test-only'}, fetchImpl:async()=>{called=true;}});
  assert.equal(called,false);
  assert.equal(result.market,null);
  assert.equal(result.verification,'unavailable');
});
test('existing ebay pricing is reused and remains unverified asking evidence', async () => {
  const result = await estimateEbay({identification,allowNetwork:true,env:{EBAY_APP_TOKEN:'test-only'},fetchImpl:async()=>({ok:true,json:async()=>({itemSummaries:[
    {itemId:'fixture',title:'2024 Demo Set Demo 1 Base',price:{value:'12.50',currency:'USD'},buyingOptions:['FIXED_PRICE']}
  ]})})});
  assert.equal(result.market,12.5);
  assert.equal(result.provider,'ebay');
  assert.equal(result.verification,'unverified');
  assert.equal(result.evidenceType,'active-listing-asking-price');
});
test('pricing never calls a provider for review candidates', async () => {
  let called=false;
  const result=await estimateEbay({identification:{...identification,status:'needs_review'},allowNetwork:true,
    env:{EBAY_APP_TOKEN:'test-only'},fetchImpl:async()=>{called=true;}});
  assert.equal(called,false);
  assert.equal(result.market,null);
});
test('pricing errors cannot echo credentials', async () => {
  const result=await estimateEbay({identification,allowNetwork:true,env:{EBAY_APP_TOKEN:'sensitive-test'},
    fetchImpl:async()=>{throw new Error('sensitive-test');}});
  assert.equal(JSON.stringify(result).includes('sensitive-test'),false);
  assert.equal(result.market,null);
});
test('non-USD observations are not silently treated as USD', async () => {
  const result=await estimateEbay({identification,allowNetwork:true,env:{EBAY_APP_TOKEN:'test-only'},fetchImpl:async()=>({ok:true,json:async()=>({itemSummaries:[
    {title:'2024 Demo Set Demo 1 Base',price:{value:'12.50',currency:'EUR'},buyingOptions:['FIXED_PRICE']}
  ]})})});
  assert.equal(result.market,null);
});
test('explicit user-verified identity can be priced without promoting model status',async()=>{
 const id={...identification,status:'needs_review'};
 const result=await estimateEbay({identification:id,verifiedIdentity:true,allowNetwork:true,env:{EBAY_APP_TOKEN:'test-only'},fetchImpl:async()=>({ok:true,json:async()=>({itemSummaries:[
  {title:'2024 Demo Set Demo 1 Base',price:{value:'10.00',currency:'USD'},buyingOptions:['FIXED_PRICE']}
 ]})})});
 assert.equal(result.market,10);assert.equal(id.status,'needs_review');assert.equal(result.verification,'unverified');
});

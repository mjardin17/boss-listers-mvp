const test=require('node:test');const assert=require('node:assert/strict');
const {newDraft,replacePhoto,canIdentify,reviewState,stagePayload}=require('../lib/cardScanner/workflow');
test('front and back are both required',()=>{const d=newDraft();assert.equal(canIdentify(d),false);d.front={};assert.equal(canIdentify(d),false);d.back={};assert.equal(canIdentify(d),true);});
test('retake invalidates prior recognition and save identifiers',()=>{const d=newDraft();d.result={identification:{status:'confirmed'}};d.saved={id:'old'};const n=replacePhoto(d,'front',{name:'retake'});assert.equal(n.result,null);assert.equal(n.saved,null);assert.notEqual(n.captureId,d.captureId);});
test('likely is review not confirmed; unidentified remains distinct',()=>{const d=newDraft();assert.equal(reviewState(d),'Unidentified');d.result={identification:{status:'likely'}};assert.equal(reviewState(d),'Needs review');d.saved={verification:{outcome:'verified'}};assert.equal(reviewState(d),'Confirmed');});
test('stage rejects impossible quantities',()=>{const d=newDraft();d.result={captureId:d.captureId};d.onHand=1;d.listed=2;assert.throws(()=>stagePayload(d),/quantity/);});
test('scan another creates a clean flow',()=>{const a=newDraft(),b=newDraft();assert.notEqual(a.captureId,b.captureId);assert.equal(b.front,null);assert.equal(b.back,null);assert.equal(b.result,null);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {assess,createLab,demo} from './lab.mjs';
const observation={consumer:'a',authenticatedIdentity:'a',generation:2,accepted:true,observedAt:100};
test('fresh actual HTTP consumer rollover and revoked cached token rejection',async()=>{
 const lab=await createLab({identities:['a']});try {
  assert.equal((await lab.probe('a')).generation,1);lab.revoke(1);
  assert.equal((await lab.probe('a')).accepted,false);lab.refresh('a');
  assert.equal(assess(['a'],[await lab.probe('a')]).decision,'ready');
  assert.deepEqual(lab.stats(),{attempts:3,rejected:1});
 }finally{await Promise.all([lab.close(),lab.close()]);}
});
test('missing, stale, future, duplicated and wrong-identity evidence never ready',()=>{
 for(const rows of [[],[{...observation,observedAt:0}],[{...observation,observedAt:102}],[observation,observation],[{...observation,authenticatedIdentity:'other'}],[{...observation,accepted:'yes'}],[{...observation,generation:null}]]) assert.equal(assess(['a'],rows,{now:101,maxAgeMs:10}).decision,'unknown');
});
test('fresh old generation is unsafe; unrelated same-label entry cannot satisfy id',()=>{
 assert.equal(assess(['a'],[{...observation,generation:1}],{now:100}).decision,'unsafe');
 assert.equal(assess(['a'],[{...observation,consumer:'b',displayName:'a'}],{now:100}).decision,'unknown');
 assert.equal(assess(['a'],[observation],{now:100}).decision,'ready');
});
test('invalid inventories and generation updates rejected',async()=>{
 assert.throws(()=>assess([],[]));assert.throws(()=>assess(['a','a'],[]));
 const lab=await createLab({identities:['a']});try{assert.throws(()=>lab.refresh('a',3));assert.throws(()=>lab.refresh('b'));}finally{await lab.close();}
});
test('paired demo measures immediate failure, cached detection and clean staged control',async()=>{
 const r=await demo();assert.equal(r.immediate.rejected,3);assert.equal(r.staged.cached.decision,'unsafe');
 assert.equal(r.staged.missing.decision,'unknown');assert.equal(r.staged.stale.decision,'unknown');assert.equal(r.staged.gate.decision,'ready');
 assert.equal(r.staged.rejected,0);assert.ok(r.staged.afterRevocation.every(o=>o.accepted));
 assert.ok(!JSON.stringify(r).includes('fictional-api-old'));
});

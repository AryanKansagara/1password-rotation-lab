/** Local fictional generations; no vendor secrets or credential integration. */
import http from 'node:http';

const start = (handler) => new Promise((resolve, reject) => {
  const server = http.createServer(handler);
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve({server, url:`http://127.0.0.1:${server.address().port}`}));
});
const reply = (res, status, data) => { res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(data)); };
const stop = ({server}) => new Promise(resolve => {server.close(resolve); server.closeAllConnections();});

/** @param {string[]} inventory @param {object[]} observations */
export function assess(inventory, observations, {target=2, now=Date.now(), maxAgeMs=1000}={}) {
  if (!Array.isArray(inventory) || !inventory.length || new Set(inventory).size!==inventory.length || inventory.some(id=>typeof id!=='string'||!id)) throw Error('unique explicit inventory required');
  if (!Number.isInteger(target)||target<1||!Number.isFinite(now)||!Number.isFinite(maxAgeMs)||maxAgeMs<0) throw Error('invalid assessment configuration');
  const checks = inventory.map(id=> {
    const matches=observations.filter(o=>o?.consumer===id);
    if(matches.length!==1) return {consumer:id,status:'unknown',reason:matches.length?'duplicate observations':'missing telemetry'};
    const o=matches[0];
    if(o.authenticatedIdentity!==id || !Number.isFinite(o.observedAt) || o.observedAt>now || now-o.observedAt>maxAgeMs || !Number.isInteger(o.generation) || typeof o.accepted!=='boolean') return {consumer:id,status:'unknown',reason:'identity, freshness or evidence invalid'};
    if(!o.accepted||o.generation!==target) return {consumer:id,status:'unsafe',reason:'consumer has not authenticated with target generation'};
    return {consumer:id,status:'ready',reason:'fresh target-generation authentication'};
  });
  return {decision:checks.some(c=>c.status==='unsafe')?'unsafe':checks.every(c=>c.status==='ready')?'ready':'unknown',checks,scope:'declared consumers only; not a complete dependency oracle'};
}

export async function createLab({identities=['api','worker','scheduler'], clock=Date.now}={}) {
  if(!Array.isArray(identities)||!identities.length||identities.some(id=>typeof id!=='string'||!id)||new Set(identities).size!==identities.length) throw Error('unique identities required');
  const valid=new Set([1,2]);
  // Deliberately fictional tokens live only in closures; reports contain generations.
  const credentials=new Map(identities.map(id=>[id,new Map([[1,`fictional-${id}-old`],[2,`fictional-${id}-new`]])]));
  let attempts=0,rejected=0;
  const resources=[];
  let closing;
  try {
    const authority=await start((req,res)=>{
      if(req.url!=='/authenticate'||req.method!=='GET') return reply(res,404,{});
      attempts++;
      const id=req.headers['x-consumer'];
      const match=[...(credentials.get(id)||[])].find(([,token])=>req.headers.authorization===`Bearer ${token}`);
      const generation=match?.[0];
      if(!generation||!valid.has(generation)) { rejected++;return reply(res,401,{accepted:false,identity:id,generation:generation??null}); }
      reply(res,200,{accepted:true,identity:id,generation});
    }); resources.push(authority);
    const consumers=new Map();
    for(const id of identities) {
      let cached=1;
      const service=await start(async(req,res)=>{
        if(req.url!=='/probe'||req.method!=='GET')return reply(res,404,{});
        try {
          const response=await fetch(authority.url+'/authenticate',{headers:{'x-consumer':id,authorization:`Bearer ${credentials.get(id).get(cached)}`},signal:AbortSignal.timeout(2000)});
          const result=await response.json();
          reply(res,200,{consumer:id,generation:result.generation,authenticatedIdentity:result.identity,accepted:response.status===200&&result.accepted===true,observedAt:clock()});
        }catch {reply(res,503,{consumer:id,error:'authority unavailable'});}
      });resources.push(service);
      consumers.set(id,{url:service.url, refresh(generation){if(!credentials.get(id).has(generation))throw Error('unknown generation');cached=generation;}});
    }
    return {
      identities:[...identities],
      async probe(id) { const consumer=consumers.get(id);if(!consumer)throw Error('unknown consumer');return (await fetch(consumer.url+'/probe',{signal:AbortSignal.timeout(3000)})).json(); },
      refresh(id,generation=2) {const consumer=consumers.get(id);if(!consumer)throw Error('unknown consumer');consumer.refresh(generation);},
      revoke(generation) {if(![1,2].includes(generation))throw Error('unknown generation');valid.delete(generation);},
      stats:()=>({attempts,rejected}),
      close(){return closing??=(Promise.all(resources.map(stop)).then(()=>undefined));},
    };
  } catch(error) {await Promise.all(resources.map(stop));throw error;}
}

export async function demo() {
  const baseline=await createLab(); let immediate;
  try {baseline.revoke(1);const probes=await Promise.all(baseline.identities.map(id=>baseline.probe(id)));immediate={probes,...baseline.stats()};}finally{await baseline.close();}
  const lab=await createLab();let staged;
  try {
    lab.refresh('api');lab.refresh('worker');
    const partial=await Promise.all(lab.identities.map(id=>lab.probe(id)));
    const cached=assess(lab.identities,partial);
    const missing=assess(lab.identities,partial.slice(0,2));
    const stale=assess(lab.identities,partial,{now:Math.max(...partial.map(o=>o.observedAt))+2000});
    lab.refresh('scheduler');const migrated=await Promise.all(lab.identities.map(id=>lab.probe(id)));
    const gate=assess(lab.identities,migrated);
    if(gate.decision!=='ready')throw Error('unexpected incomplete rollout');
    lab.revoke(1);
    staged={cached,missing,stale,gate,afterRevocation:await Promise.all(lab.identities.map(id=>lab.probe(id))),...lab.stats()};
  }finally{await lab.close();}
  return {schemaVersion:1,provenance:'observed loopback HTTP with fictional tokens',vendorIntegration:false,immediate,staged};
}

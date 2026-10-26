'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const audit=require('../functions/audit');
const actor={uid:'test-director',name:'Usuario de prueba',role:'Director'};
test('Audit diffs use stable record IDs, retain removals and exclude binary and secret data',()=>{
 const a={school:{students:[{id:'a',name:'Alumno A',amount:100},{id:'b',name:'Alumno B',amount:200}]}},b=structuredClone(a);b.school.students.reverse();assert.equal(audit.diff(a,b).length,0);
 b.school.students[1].amount=90;let rows=audit.diff(a,b);assert.equal(rows.length,1);assert.equal(rows[0].before,100);assert.equal(rows[0].after,90);assert.match(rows[0].field,/Alumno A/);
 b.school.students.pop();rows=audit.diff(a,b);assert(rows.every(x=>x.action==='Eliminado'));assert(rows.some(x=>x.before==='Alumno A'));
 const secret='never-record-this';rows=audit.diff({},{items:[{photo:'data:image/jpeg;base64,AAAA',password:secret,notes:'x'.repeat(4000)}],undoFleet:{anything:'not-needed'}});const text=JSON.stringify(rows);assert(!text.includes(secret));assert(!text.includes('data:image'));assert(!text.includes('not-needed'));assert(text.includes('recortado'));
});
test('Committed outbox is bounded, survives concurrent pending events and delivers idempotently',async()=>{
 const before={operation:'a',payload:JSON.stringify({fleet:{HP_18BLM:{hours:20}}})};
 const next={...before,operation:'b',payload:JSON.stringify({fleet:{HP_18BLM:{hours:21}}})};
 const attached=audit.attach(before,next,actor,'dashboard','Corrección de horas');assert.equal(attached.payload,next.payload);const [id,item]=Object.entries(attached.auditPending)[0];const chunks=item.chunks;assert.equal(item.meta.reason,'Corrección de horas');assert.equal(chunks['000000'][0].before,20);
 const again=audit.attach(attached,{...attached,payload:JSON.stringify({fleet:{HP_18BLM:{hours:22}}})},actor,'dashboard');assert.equal(Object.keys(again.auditPending).length,2);
 const writes={},db={ref:path=>({get:async()=>({val:()=>chunks,exists:()=>true}),update:async patch=>Object.assign(writes,patch)})};const event={params:{id},data:{val:()=>item.meta}};await audit.deliver(db,event,'dashboard/auditPending');await audit.deliver(db,event,'dashboard/auditPending');assert.equal(Object.keys(writes).length,3);assert.equal(writes['dashboard/auditPending/'+id],null);assert.equal(writes['auditIndex/'+id].uid,actor.uid);
 const many={payload:JSON.stringify({fleet:Object.fromEntries(Array.from({length:100},(_,i)=>['n'+i,'x'.repeat(5000)]))})};const result=audit.attach({payload:'{}'},many,actor,'dashboard');for(const groups of Object.values(result.auditPending))for(const part of Object.values(groups.chunks)){assert(part.length<=20);assert(Buffer.byteLength(JSON.stringify(part))<150000);}
 assert.equal(audit.attach(next,{...next,revision:5},actor,'dashboard').auditPending,undefined);
});
test('Audit queries are bounded and use Panama date boundaries',async()=>{
 const calls=[],chain={};for(const name of ['orderByKey','startAt','endAt','endBefore','limitToLast'])chain[name]=v=>{calls.push([name,v]);return chain;};chain.get=async()=>({val:()=>({})});const db={ref:()=>chain};
 await audit.list(db,{from:'2026-10-20',to:'2026-10-20'});assert(calls.some(([k,v])=>k==='limitToLast'&&v===51));assert(calls.some(([k,v])=>k==='startAt'&&v===Date.parse('2026-10-20T00:00:00-05:00')+'_'));
 await assert.rejects(()=>audit.list(db,{cursor:'../../dashboard'}));await assert.rejects(()=>audit.detail(db,{id:'../../dashboard'}));
 const rules=require('../database.rules.json').rules;assert.equal(rules['.read'],false);assert.equal(rules['.write'],false);assert.equal(rules.dashboard['.write'],false);assert.equal(rules.auditIndex['.write'],false);assert.equal(rules.auditDetails['.read'],false);
});

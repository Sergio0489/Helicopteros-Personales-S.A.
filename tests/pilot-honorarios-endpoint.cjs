'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=process.env.HP_PROPOSAL_SOURCE||root,DIRECTOR=require(path.join(source,'functions/role-ids')).DIRECTOR_UID;
const user={uid:DIRECTOR,email:'director@example.test',emailVerified:true,disabled:false};
const payloadData={
 fleet:{HP_1784:{serial:'FAKE-AIRCRAFT'}},
 pilotos:[{nombre:'Alice',email:'alice@example.test'},{nombre:'Bob',email:'bob@example.test',authUid:'pilotMember'},{nombre:'Carol',email:'carol@example.test'}],
 itinerarios:[],
 school:{students:[],registry:{clients:[],entries:[]},honorarios:{records:[{id:'bob-entry',entryId:'bob-entry',pilot:'Bob',pilotId:'legacy-pilot-1',date:'2026-11-18',aircraft:'HP1784',kind:'flight',flightHours100:175,totalCents:5250}]},userProfiles:{pilotMember:{dossier:{kind:'pilot',id:'legacy-pilot-1'}}}}
};
const store={dashboard:{schemaVersion:1,operation:'before',revision:4,payload:JSON.stringify(payloadData)}};
const get=key=>key.split('/').filter(Boolean).reduce((value,part)=>value?.[part],store)??null;
const put=(key,value)=>{const parts=key.split('/').filter(Boolean),last=parts.pop();let node=store;for(const part of parts)node=node[part]||={};node[last]=value;};
const db={ref:(key='')=>({get:async()=>({val:()=>structuredClone(get(key))}),transaction:async update=>{const previous=structuredClone(get(key)),next=update(previous);if(next===undefined)return {committed:false,snapshot:{val:()=>previous}};put(key,next);return {committed:true,snapshot:{val:()=>structuredClone(next)}};},update:async patch=>{for(const [name,value]of Object.entries(patch))put([key,name].filter(Boolean).join('/'),value);}})};
const endpoints={},localFunctions=path.join(root,'functions'),sourceFunctions=path.join(source,'functions');
vm.runInNewContext(fs.readFileSync(path.join(localFunctions,'index.js'),'utf8'),{Buffer,URL,URLSearchParams,exports:endpoints,require:id=>{
 if(id==='firebase-functions/v2/https')return {onRequest:(_,handler)=>handler};
 if(id==='firebase-admin/app')return {initializeApp(){}};
 if(id==='firebase-admin/auth')return {getAuth:()=>({verifyIdToken:async()=>({uid:user.uid}),getUser:async()=>user})};
 if(id==='firebase-admin/database')return {getDatabase:()=>db};
 if(id==='./honorarios'||id==='./pilot-identities')return require(path.join(localFunctions,id.slice(2)));
 if(id.startsWith('./'))return require(path.join(sourceFunctions,id.slice(2)));
 return require(id);
}});
async function call(payload,operation){let status=200,body;const res={set(){},status(code){status=code;return res;},json(value){body=value;},end(){}};await endpoints.accountRegistration({method:'POST',headers:{authorization:'Bearer fake'},body:{action:'director-save',payload:JSON.stringify(payload),operation,reason:'Migración de identidad ficticia'}},res);return {status,body};}
function payload(){return JSON.parse(store.dashboard.payload);}

(async()=>{
 const submitted=payload(),result=await call(submitted,'before');assert.equal(result.status,200,JSON.stringify(result.body));assert(result.body.pilotSync?.pilotos);assert.notEqual(result.body.pilotSync.pilotos[1].id,'legacy-pilot-1');
 const bobId=result.body.pilotSync.pilotos.find(p=>p.nombre==='Bob').id,carolId=result.body.pilotSync.pilotos.find(p=>p.nombre==='Carol').id;
 assert.equal(payload().school.userProfiles.pilotMember.dossier.id,bobId,'pilot dossier pointer');
 let saved=structuredClone(submitted);saved.pilotos=result.body.pilotSync.pilotos;if(result.body.schoolSync?.school)saved.school=result.body.schoolSync.school;assert.equal(saved.school.honorarios.records[0].pilotId,bobId);let report=require(path.join(localFunctions,'honorarios')).report(saved,bobId,'2026-11-18');assert.equal(report.rows[0].pilotId,bobId);assert.equal(report.rows[0].flightHours100,175);
 // A later independent save keeps the synchronized IDs and financial history.
 saved.pilotos.reverse();saved.fleet.HP_1784.serial='FAKE-UPDATED';const second=await call(saved,result.body.operation);assert.equal(second.status,200,JSON.stringify(second.body));saved=payload();assert.equal(saved.school.honorarios.records[0].pilotId,bobId);assert.equal(require(path.join(localFunctions,'honorarios')).report(saved,bobId,'2026-11-18').rows[0].pilotId,bobId);assert.equal(require(path.join(localFunctions,'honorarios')).report(saved,carolId,'2026-11-18').rows.length,0);
 const beforeFailure=store.dashboard.payload,bad=payload();bad.pilotos.push({...bad.pilotos[0],nombre:'Duplicado con ID repetido'});const rejected=await call(bad,second.body.operation);assert.equal(rejected.status,409);assert.match(rejected.body.error,/identificadores de piloto duplicados/);assert.equal(store.dashboard.payload,beforeFailure,'rejected migration must not alter the fake database');
 console.log('PASS director-save migration response sync, history attribution across reorder and rejected duplicate IDs (fake in-memory Firebase only)');
})().catch(error=>{console.error(error);process.exit(1);});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');

const name='Álex Ficticio',reason='Verificación ficticia de personas diferentes por el Director.';
function fixture({assigned=true,targetDocument='TEST-ALPHA',otherDocument='TEST-BETA'}={}){
 const data={fleet:{HP_1784:{status:'mantenimiento',mantenimiento:[{id:'maintenance-original',description:'Registro operativo ficticio',resuelto:false}]}},pilotos:[{id:'target-pilot',authUid:'target',email:'target@example.test',nombre:name,identity:targetDocument,verificaciones:[{id:'check-original',expiry:'2028-01-01'}]}],itinerarios:[{id:'itinerary-original',piloto:name,aeronave:'HP-1784'}],school:{students:[{id:'target-student',authUid:'target',email:'target@example.test',name,identity:targetDocument,courses:[{id:'target-course',payments:[{id:'target-payment',cents:12000}],flights:[{id:'target-flight',hours100:125}]}]},{id:'other-student',authUid:'other',email:'other@example.test',name:'ALEX FICTICIO',identity:otherDocument,courses:[{id:'other-course',payments:[{id:'other-payment',cents:7000}]}]}],personnel:[{id:'other-staff',authUid:'other',email:'other@example.test',name:'ALEX FICTICIO',identity:otherDocument,position:'Administrativo'}],registry:{clients:[{id:'other-client',authUid:'other',email:'other@example.test',name:'ALEX FICTICIO',identity:otherDocument,payments:[{id:'client-payment',cents:1500}]}],entries:[{id:'entry-original',personKind:'student',personId:'target-student',pilot:name,hours100:125}]},paymentReceipts:[{id:'receipt-original',personKey:'student:target-student',totalCents:12000}],accessConfiguration:{roles:{Estudiante:{estudiantes:{actions:{view:true},boxes:{account:{view:true,edit:false}}}}}}}};
 const target={email:'target@example.test',verified:true,role:'Estudiante',profile:{name,identity:targetDocument,phone:'TEST-TARGET'},recordKind:'student',recordId:'target-student',syncStatus:'duplicate-identity',syncedOperation:null,syncVersion:5,identityReviewPending:true,identityReviewVersion:0,prospectAccess:{fixture:'preserve'},auditPending:{'fixture-account-history':{meta:{id:'fixture-account-history',reason:'Historial previo ficticio'},chunks:{'000000':[]}}}};
 if(assigned)Object.assign(target,{assignedAt:'fixture-assigned',assignedBy:'director'});
 return {dashboard:{operation:'fixture-v1',revision:10,payload:JSON.stringify(data),auditPending:{'fixture-dashboard-history':{meta:{id:'fixture-dashboard-history'},chunks:{'000000':[]}}}},accountRequests:{director:{email:'director@example.test',verified:true,role:'Director',assignedAt:'fixture-confirmed',profile:{name:'Director Ficticio'}},target,other:{email:'other@example.test',verified:true,role:'Administrativo',assignedAt:'fixture-other',assignedBy:'director',identityReviewPending:true,profile:{name:'ALEX FICTICIO',identity:otherDocument,phone:'TEST-OTHER'},prospectAccess:{area:'school',email:'other@example.test',assignedAt:'fixture'},auditPending:{'other-history':{meta:{id:'other-history'},chunks:{'000000':[]}}}}}};
}
function harness(options){
 let store=fixture(options),current='director',cold=false,hook=null,abort=false,concurrent=null;const transactionInputs=[],disabled=[],revoked=[];
 const users=Object.fromEntries(Object.entries(store.accountRequests).map(([uid,a])=>[uid,{uid,email:a.email,emailVerified:true,disabled:false,metadata:{creationTime:'2026-01-01T00:00:00.000Z'}}]));
 const get=p=>p.split('/').filter(Boolean).reduce((v,k)=>v?.[k],store)??null;
 const put=(p,value)=>{if(!p){store=value;return;}const keys=p.split('/').filter(Boolean),last=keys.pop();let at=store;for(const k of keys)at=at[k]||={};at[last]=value;};
 const db={ref:(p='')=>({get:async()=>({val:()=>structuredClone(get(p))}),transaction:async update=>{
  if(p===''&&cold){cold=false;const first=update(null);transactionInputs.push(null);assert.notEqual(first,undefined,'an empty root cache must retry against the server');}
  let input=structuredClone(get(p)),next=update(input);if(p==='')transactionInputs.push(input);
  if(p===''&&hook){const once=hook;hook=null;await once();input=structuredClone(get(p));next=update(input);transactionInputs.push(input);}
  if(p===''&&concurrent&&concurrent.count<2){const state=concurrent;if(++state.count===2)state.release();await state.gate;if(JSON.stringify(get(p))!==JSON.stringify(input)){input=structuredClone(get(p));next=update(input);transactionInputs.push(input);}}
  if(next===undefined||abort){abort=false;return {committed:false,snapshot:{val:()=>structuredClone(get(p))}};}
  put(p,next);return {committed:true,snapshot:{val:()=>structuredClone(next)}};
 },update:async patch=>{for(const [k,v]of Object.entries(patch))put([p,k].filter(Boolean).join('/'),v);}})};
 const auth={verifyIdToken:async token=>{if(token!=='fixture-valid')throw Object.assign(Error('invalid token'),{code:'auth/id-token-revoked'});return {uid:current};},getUser:async uid=>structuredClone(users[uid]),listUsers:async()=>({users:Object.values(users).map(x=>structuredClone(x))}),updateUser:async(uid,change)=>{disabled.push({uid,change});Object.assign(users[uid],change);},revokeRefreshTokens:async uid=>revoked.push(uid)};
 const endpoints={};vm.runInNewContext(fs.readFileSync(__dirname+'/../functions/index.js','utf8'),{Buffer,exports:endpoints,require:id=>({'firebase-functions/v2/https':{onRequest:(_,fn)=>fn},'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>auth},'firebase-admin/database':{getDatabase:()=>db}}[id]||require(id.startsWith('./')?'../functions/'+id.slice(2):id))});
 return {get root(){return store;},users,disabled,revoked,transactionInputs,as:uid=>{current=uid;},cold:()=>{cold=true;},retryAfter:fn=>{hook=fn;},abort:()=>{abort=true;},concurrent:()=>{let release;const gate=new Promise(r=>release=r);concurrent={count:0,release,gate};},data:()=>JSON.parse(store.dashboard.payload),changeData:fn=>{const data=JSON.parse(store.dashboard.payload);fn(data);store.dashboard.payload=JSON.stringify(data);store.dashboard.operation=randomUUID();},call:async(action,extra={},token='fixture-valid')=>{let status=200,body;const res={set(){},status(v){status=v;return this;},json(v){body=v;},end(){}};await endpoints.accountRegistration({method:'POST',headers:{authorization:token?'Bearer '+token:''},body:{action,...extra}},res);return {status,body};}};
}
const requestPreview=(h,counterpartKey='student:other-student')=>h.call('identity-distinct-preview',{targetUid:'target',counterpartKey});
async function eligiblePreview(h,counterpartKey){const response=await requestPreview(h,counterpartKey);assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.eligible,true,JSON.stringify(response.body));assert.match(response.body.revision,/^[a-f0-9]{64}$/);assert.match(response.body.requestId,/^[a-f0-9-]{36}$/i);assert.equal(typeof response.body.remaining,'number');return response.body;}
const inputFor=(preview,patch={})=>({targetUid:'target',counterpartKey:'student:other-student',revision:preview.revision,requestId:preview.requestId,reason,confirm:true,verifiedIndependently:true,...patch});
const save=(h,preview,patch)=>h.call('identity-distinct-confirm',inputFor(preview,patch));
function assertPreserved(h,before){
 assert.deepEqual(h.root.dashboard,before.dashboard,'distinct-person confirmation must not rewrite payload, aircraft, ledgers or dashboard history');
 for(const [uid,account]of Object.entries(before.accountRequests))if(uid!=='target')assert.deepEqual(h.root.accountRequests[uid],account,'other accounts and grants must remain untouched');
 for(const key of ['role','assignedAt','assignedBy','profile','email','verified','prospectAccess','recordKind','recordId'])assert.deepEqual(h.root.accountRequests.target[key],before.accountRequests.target[key],key+' must be preserved');
 assert.deepEqual(h.disabled,[]);assert.deepEqual(h.revoked,[]);
 assert.deepEqual(h.root.accountRequests.target.auditPending['fixture-account-history'],before.accountRequests.target.auditPending['fixture-account-history']);
}
function setDocument(h,uid,value){h.root.accountRequests[uid].profile.identity=value;h.changeData(data=>{for(const record of [...data.pilotos,...data.school.students,...data.school.personnel,...data.school.registry.clients])if(record.authUid===uid)record.identity=value;});}

test('Director confirms one distinct person without merging dossiers, granting roles or losing audit history',async()=>{
 const h=harness(),before=structuredClone(h.root),preview=await eligiblePreview(h),response=await save(h,preview);
 assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.ok,true);assert.equal(response.body.resolved,true);assert.equal(response.body.remaining,0);assert.equal(response.body.targetUid,'target');assert.equal(response.body.deduplicated,false);
 const account=h.root.accountRequests.target;assert.equal(account.identityReviewPending,false);assert.equal(account.syncStatus,'no-match','a valid individual decision clears the previous duplicate status without granting a matched dossier');assert.equal(account.identityReviewVersion,1);
 assert.equal(Object.keys(account.identityDistinctDecisions).length,1);assert(account.identityDistinctDecisions[response.body.decisionId]);
 const audits=Object.values(account.auditPending).filter(x=>x.meta.id!=='fixture-account-history');assert.equal(audits.length,1,'one auditable decision must be appended');assert.equal(audits[0].meta.uid,'director');assert(audits[0].meta.reason.endsWith(reason),'the complete verification reason must remain in the audit');
 assertPreserved(h,before);assert.equal(h.root.accountRequests.other.identityReviewPending,true,'the counterpart requires its own individual review');
});

test('ordinary roles and invalid Director sessions cannot read or confirm distinct-person reviews',async()=>{
 for(const role of ['Gerente','Administrativo','Piloto','Estudiante','Mecánico','Contabilidad']){
  const h=harness(),preview=await eligiblePreview(h);h.root.accountRequests.director.role=role;const before=structuredClone(h.root);
  assert.equal((await requestPreview(h)).status,403,role);assert.equal((await save(h,preview)).status,403,role);assert.deepEqual(h.root,before);
 }
 for(const change of ['unverified','disabled','unassigned']){
  const h=harness(),preview=await eligiblePreview(h);if(change==='unverified')h.users.director.emailVerified=false;else if(change==='disabled')h.users.director.disabled=true;else delete h.root.accountRequests.director.assignedAt;
  const before=structuredClone(h.root);assert.equal((await requestPreview(h)).status,403,change);assert.equal((await save(h,preview)).status,403,change);assert.deepEqual(h.root,before);
 }
 const h=harness();assert.equal((await h.call('identity-distinct-preview',{targetUid:'target'},'')).status,401);assert.equal((await h.call('identity-distinct-preview',{targetUid:'target'},'revoked')).status,401);
});

test('a target must have a verified current Auth identity matching its stored account',async()=>{
 for(const change of ['unverified','disabled','email']){
  const h=harness(),preview=await eligiblePreview(h);if(change==='unverified')h.users.target.emailVerified=false;else if(change==='disabled')h.users.target.disabled=true;else h.users.target.email='changed@example.test';
  const before=structuredClone(h.root),response=await save(h,preview);assert(response.status>=400,change);assert.deepEqual(h.root,before);
 }
});

test('equal normalized identity documents cannot be waived by a distinct-person approval',async()=>{
 for(const renamed of [false,true]){
  const h=harness();setDocument(h,'other',' test-alpha ');
  if(renamed){h.root.accountRequests.other.profile.name='Otro Nombre';h.changeData(data=>{for(const row of [...data.school.students,...data.school.personnel,...data.school.registry.clients])if(row.authUid==='other')row.name='Otro Nombre';});}
  const before=structuredClone(h.root),preview=await requestPreview(h);assert.equal(preview.status,200);assert.equal(preview.body.eligible,false);assert(preview.body.blockers.length>0);
  const response=await save(h,preview.body);assert.equal(response.status,409);assert.deepEqual(h.root,before);
 }
});

test('document validation includes every dossier member rather than only account profiles',async()=>{
 const h=harness();h.changeData(data=>{data.school.personnel[0].identity='TEST ALPHA';});const before=structuredClone(h.root),preview=await requestPreview(h);
 assert.equal(preview.status,200);assert.equal(preview.body.eligible,false);assert.equal((await save(h,preview.body)).status,409);assert.deepEqual(h.root,before);
});

test('blank documents require an explicit independent verification and an auditable reason',async()=>{
 const h=harness({targetDocument:'',otherDocument:''}),preview=await eligiblePreview(h),before=structuredClone(h.root);
 for(const patch of [{verifiedIndependently:false},{confirm:false},{reason:'corto'}]){assert.equal((await save(h,preview,patch)).status,400);assert.deepEqual(h.root,before);}
 assert.equal((await save(h,preview)).status,200);assertPreserved(h,before);
});

test('shared UID, email or existing person links cannot be declared different',async()=>{
 for(const shared of ['uid','email','personKey']){
  const h=harness();h.changeData(data=>{
   if(shared==='uid')data.school.students[1].authUid='target';
   if(shared==='email')data.school.students[1].email='target@example.test';
   if(shared==='personKey')data.school.identityLinks={same:{records:[{kind:'student',id:'target-student'},{kind:'student',id:'other-student'}]}};
  });
  const before=structuredClone(h.root),preview=await requestPreview(h);assert.equal(preview.status,200);assert.equal(preview.body.eligible,false,shared);assert.equal((await save(h,preview.body)).status,409,shared);assert.deepEqual(h.root,before);
 }
});

test('malformed confirmations cannot create a decision or alter any record',async()=>{
 const h=harness(),preview=await eligiblePreview(h),before=structuredClone(h.root);
 for(const patch of [{confirm:false},{verifiedIndependently:false},{reason:''},{requestId:'not-a-uuid'},{revision:''},{targetUid:''}]){
  assert.equal((await save(h,preview,patch)).status,400,JSON.stringify(patch));assert.deepEqual(h.root,before);
 }
});

test('identity changes after preview reject the stale confirmation without modifying current records',async()=>{
 for(const change of ['name','document','email','owner','link']){
  const h=harness(),preview=await eligiblePreview(h);
  h.changeData(data=>{if(change==='name')data.school.personnel[0].name='Nombre Modificado';if(change==='document')data.school.personnel[0].identity='TEST-CHANGED';if(change==='email')data.school.personnel[0].email='changed@example.test';if(change==='owner')data.school.personnel[0].authUid='third';if(change==='link')data.school.identityLinks={changed:{records:[{kind:'personnel',id:'other-staff'}]}};});
  const before=structuredClone(h.root);assert.equal((await save(h,preview)).status,409,change);assert.deepEqual(h.root,before);
 }
});

test('unrelated academic and operational changes survive an identity-only confirmation',async()=>{
 const h=harness(),preview=await eligiblePreview(h);h.changeData(data=>{data.school.students[0].courses[0].payments[0].cents=16000;data.fleet.HP_1784.mantenimiento[0].resuelto=true;});
 const before=structuredClone(h.root);assert.equal((await save(h,preview)).status,200);assertPreserved(h,before);
});

test('a new third homonym does not inherit a pair approval or silently resolve the remaining review',async()=>{
 const h=harness(),preview=await eligiblePreview(h);h.changeData(data=>data.school.students.push({id:'third-student',name:'Alex Ficticio',email:'third@example.test',identity:'TEST-THIRD',courses:[{id:'third-course'}]}));
 const current=structuredClone(h.root);assert.equal((await save(h,preview)).status,409);assert.deepEqual(h.root,current);
 const refreshed=await eligiblePreview(h),saved=await save(h,refreshed);assert.equal(saved.status,200);assert.equal(saved.body.resolved,false);assert(saved.body.remaining>0);assert.equal(h.root.accountRequests.target.identityReviewPending,true);assert.equal(Object.keys(h.root.accountRequests.target.identityDistinctDecisions).length,1);assertPreserved(h,current);
});

test('Director permission revoked during a root conflict prevents the tentative decision',async()=>{
 const h=harness(),preview=await eligiblePreview(h);let authoritative;
 h.retryAfter(()=>{h.root.accountRequests.director.role='Piloto';authoritative=structuredClone(h.root);});
 const response=await save(h,preview);assert.equal(response.status,403);assert.deepEqual(h.root,authoritative);assert(h.transactionInputs.length>=2);
});

test('a conflicting document update aborts the tentative confirmation and preserves the winner',async()=>{
 const h=harness(),preview=await eligiblePreview(h);let authoritative;
 h.retryAfter(()=>{setDocument(h,'other','TEST-ALPHA');authoritative=structuredClone(h.root);});
 assert.equal((await save(h,preview)).status,409);assert.deepEqual(h.root,authoritative);
});

test('a root transaction with an empty initial cache retries and records one decision',async()=>{
 const h=harness(),preview=await eligiblePreview(h);h.cold();const response=await save(h,preview);
 assert.equal(response.status,200);assert.equal(h.transactionInputs[0],null);assert.equal(Object.keys(h.root.accountRequests.target.identityDistinctDecisions).length,1);
});

test('concurrent exact retries retain one decision, one audit event and one unchanged payload',{timeout:5000},async()=>{
 const h=harness(),preview=await eligiblePreview(h),before=structuredClone(h.root);h.concurrent();const responses=await Promise.all([save(h,preview),save(h,preview)]);
 for(const response of responses)assert.equal(response.status,200,JSON.stringify(response));assert.equal(responses[0].body.decisionId,responses[1].body.decisionId);assert.deepEqual(responses.map(r=>r.body.deduplicated).sort(),[false,true]);assert.equal(Object.keys(h.root.accountRequests.target.identityDistinctDecisions).length,1);assert.equal(Object.keys(h.root.accountRequests.target.auditPending).length,Object.keys(before.accountRequests.target.auditPending).length+1);assertPreserved(h,before);
});

test('request IDs bind the original decision input and stale revisions cannot authorize another write',async()=>{
 const h=harness(),preview=await eligiblePreview(h),saved=await save(h,preview);assert.equal(saved.status,200);const before=structuredClone(h.root);
 const retry=await save(h,preview);assert.equal(retry.status,200);assert.equal(retry.body.deduplicated,true);assert.deepEqual(h.root,before);
 assert.equal((await save(h,preview,{reason:'Una razón ficticia distinta.'})).status,409);assert.deepEqual(h.root,before);
 assert.equal((await save(h,preview,{requestId:randomUUID()})).status,409);assert.deepEqual(h.root,before);
});

test('an uncommitted root transaction never reports a successful review',async()=>{
 const h=harness(),preview=await eligiblePreview(h),before=structuredClone(h.root);h.abort();assert.equal((await save(h,preview)).status,409);assert.deepEqual(h.root,before);
});

test('resolving an identity review does not grant a role or bypass ordinary access permissions',async()=>{
 const h=harness({assigned:false}),preview=await eligiblePreview(h);assert.equal((await save(h,preview)).status,200);assert(!h.root.accountRequests.target.assignedAt);assert.equal(h.root.accountRequests.target.role,'Estudiante');h.as('target');assert.equal((await h.call('access',{page:'estudiantes'})).status,403);
});

test('an approved name-only pair remains resolved through submit and synchronization',async()=>{
 const h=harness(),preview=await eligiblePreview(h);assert.equal((await save(h,preview)).status,200);h.as('target');
 const response=await h.call('submit',{profile:{name,identity:'TEST-ALPHA'},requestIdentityReview:true});assert.equal(response.status,200);assert.equal(response.body.identityReviewPending,false);
 const status=await h.call('status');assert.equal(status.body.identityReviewPending,false);assert.equal((await h.call('access',{page:'estudiantes'})).status,200);
});

test('a real document collision after approval invalidates the exception and restores review',async()=>{
 const h=harness(),preview=await eligiblePreview(h);assert.equal((await save(h,preview)).status,200);const decision=structuredClone(h.root.accountRequests.target.identityDistinctDecisions);
 setDocument(h,'other',' test alpha ');h.as('target');const response=await h.call('status');assert.equal(response.status,200);assert.equal(response.body.identityReviewPending,true);assert.equal((await h.call('access',{page:'estudiantes'})).status,403);assert.deepEqual(h.root.accountRequests.target.identityDistinctDecisions,decision,'previous decisions remain historical evidence');
});

test('a later new account cannot reuse another pair decision and does not mutate approved accounts',async()=>{
 const h=harness(),preview=await eligiblePreview(h);assert.equal((await save(h,preview)).status,200);const target=structuredClone(h.root.accountRequests.target),other=structuredClone(h.root.accountRequests.other);
 h.users.third={uid:'third',email:'third@example.test',emailVerified:true,disabled:false,metadata:{}};
 h.changeData(data=>data.school.students.push({id:'third-student',authUid:'third',email:'third@example.test',name:'Alex Ficticio',identity:'TEST-THIRD',directoryKind:'student',courses:[]}));
 h.as('third');const submitted=await h.call('submit',{profile:{name:'Alex Ficticio',identity:'TEST-THIRD'},requestIdentityReview:true});assert.equal(submitted.status,200);assert.equal(submitted.body.identityReviewPending,true);assert.equal((await h.call('access',{page:'estudiantes'})).status,403);assert.deepEqual(h.root.accountRequests.target,target);assert.deepEqual(h.root.accountRequests.other,other);
});

test('a distinct-person decision prevents a later merge of the reviewed pair',async()=>{
 const h=harness(),mergePreview=await h.call('identity-preview'),group=mergePreview.body.groups.find(g=>g.uids.includes('target')&&g.uids.includes('other')),preview=await eligiblePreview(h);assert(group);
 assert.equal((await save(h,preview)).status,200);const before=structuredClone(h.root);
 const merged=await h.call('identity-merge',{members:group.members.map(m=>m.key),operation:h.root.dashboard.operation,primaryKey:'student:target-student',confirm:true});assert.equal(merged.status,409);assert.deepEqual(h.root,before);assert.deepEqual(h.disabled,[]);assert.deepEqual(h.revoked,[]);
});

test('legacy positional record keys cannot create a durable distinct-person exception',async()=>{
 const h=harness();h.changeData(data=>data.school.students.push({name:'Alex Ficticio',email:'legacy@example.test',identity:'TEST-LEGACY',courses:[{id:'legacy-course'}]}));const before=structuredClone(h.root);
 const preview=await requestPreview(h,'student:index-2');assert(preview.status>=400||preview.body.eligible===false);assert.deepEqual(h.root,before);
});

test('deleting a reviewed canonical account invalidates its receipt while its colliding dossiers remain',async()=>{
 const h=harness(),preview=await eligiblePreview(h);assert.equal((await save(h,preview)).status,200);const receipts=structuredClone(h.root.accountRequests.target.identityDistinctDecisions);
 delete h.root.accountRequests.other;
 const invalidated=require('../functions/identity-distinct').invalidated(h.root,'target');h.as('target');
 const status=await h.call('status');assert.equal(status.status,200);assert.equal(status.body.identityReviewPending,true,'a surviving homonym cannot disappear merely because its canonical account was removed');assert.equal(invalidated,true);assert.equal((await h.call('access',{page:'estudiantes'})).status,403);assert.deepEqual(h.root.accountRequests.target.identityDistinctDecisions,receipts);
});

test('splitting a reviewed person reopens review for the old fragment that still collides',async()=>{
 const h=harness(),preview=await eligiblePreview(h);assert.equal((await save(h,preview)).status,200);const receipts=structuredClone(h.root.accountRequests.target.identityDistinctDecisions);
 h.root.accountRequests.other.profile.name='Nombre Nuevo Sin Coincidencia';
 h.changeData(data=>{
  data.school.students[1].name='Nombre Nuevo Sin Coincidencia';data.school.personnel[0].name='Nombre Nuevo Sin Coincidencia';
  const fragment=data.school.registry.clients[0];delete fragment.authUid;fragment.email='fragment@example.test';
 });
 const invalidated=require('../functions/identity-distinct').invalidated(h.root,'target');h.as('target');const status=await h.call('status');
 assert.equal(status.status,200);assert.equal(status.body.identityReviewPending,true);assert.equal(invalidated,true);assert.equal((await h.call('access',{page:'estudiantes'})).status,403);assert.deepEqual(h.root.accountRequests.target.identityDistinctDecisions,receipts);
});

test('a completely new homonym does not invalidate the already reviewed pair of other people',async()=>{
 const h=harness(),preview=await eligiblePreview(h);assert.equal((await save(h,preview)).status,200);const receipts=structuredClone(h.root.accountRequests.target.identityDistinctDecisions);
 h.changeData(data=>data.school.students.push({id:'unrelated-new-student',authUid:'unrelated-new-user',name:'Alex Ficticio',email:'unrelated-new@example.test',identity:'TEST-UNRELATED',courses:[]}));
 assert.equal(require('../functions/identity-distinct').invalidated(h.root,'target'),false);h.as('target');const status=await h.call('status');assert.equal(status.status,200);assert.equal(status.body.identityReviewPending,false);assert.equal((await h.call('access',{page:'estudiantes'})).status,200);assert.deepEqual(h.root.accountRequests.target.identityDistinctDecisions,receipts);
});

test('filling the verified owner UID through its existing email link does not create a review loop',async()=>{
 const h=harness();h.changeData(data=>{delete data.school.students[0].authUid;});const preview=await eligiblePreview(h);assert.equal((await save(h,preview)).status,200);const receipts=structuredClone(h.root.accountRequests.target.identityDistinctDecisions);
 assert.equal(h.data().school.students[0].authUid,undefined);h.as('target');
 const first=await h.call('status');assert.equal(first.status,200);assert.equal(first.body.identityReviewPending,false);assert.equal(h.data().school.students[0].authUid,'target','normal verified email synchronization fills the same subject owner');
 const second=await h.call('status');assert.equal(second.status,200);assert.equal(second.body.identityReviewPending,false,'an equivalent UID backfill must not invalidate independent verification');assert.equal(require('../functions/identity-distinct').approved(h.root,'target','user:other'),true);assert.equal((await h.call('access',{page:'estudiantes'})).status,200);assert.deepEqual(h.root.accountRequests.target.identityDistinctDecisions,receipts);
});

test('new strong links between the reviewed people invalidate the old separate-person approval',async()=>{
 for(const shared of ['uid','email','personKey']){
  const h=harness(),preview=await eligiblePreview(h);assert.equal((await save(h,preview)).status,200);const receipts=structuredClone(h.root.accountRequests.target.identityDistinctDecisions);
  if(shared==='email')h.root.accountRequests.other.email='target@example.test';
  else h.changeData(data=>{if(shared==='uid')data.school.personnel[0].authUid='target';else data.school.identityLinks={changed:{records:[{kind:'student',id:'target-student'},{kind:'client',id:'other-client'}]}};});
  assert.equal(require('../functions/identity-distinct').invalidated(h.root,'target'),true,shared+' must not hide the old peer inside the target subject');
  h.as('target');const status=await h.call('status');assert(status.status>=400||status.body.identityReviewPending===true,shared);assert((await h.call('access',{page:'estudiantes'})).status>=400,shared);assert.deepEqual(h.root.accountRequests.target.identityDistinctDecisions,receipts);
 }
});

test('normal account responses do not expose distinct-person decisions or the counterpart identity',async()=>{
 const h=harness(),preview=await eligiblePreview(h);assert.equal((await save(h,preview)).status,200);h.as('target');
 for(const [action,body]of [['status',{}],['access',{page:'estudiantes',layout:'main'}],['self-profile',{}]]){
  const response=await h.call(action,body);assert.equal(response.status,200,action);const serialized=JSON.stringify(response.body);
  for(const secret of ['identityDistinctDecisions','other@example.test','TEST-BETA',reason])assert(!serialized.includes(secret),action+' must not expose '+secret);
 }
 assert.equal((await requestPreview(h)).status,403);assert.equal((await h.call('list')).status,403);
});

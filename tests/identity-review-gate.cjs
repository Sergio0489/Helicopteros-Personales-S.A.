'use strict';
// Real exported HTTP handler with in-memory Auth/RTDB; no network or production data.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const prospects=require('../functions/prospects'),{policyFor}=require('../functions/access'),{boxView}=require('../functions/box-view');
const quoteConfig={token:'fixture-private-quote-token-0123456789abcdef0123456789abcdef',siteId:'fixture-charters-site',forms:{acceptance:{area:'charters',kind:'quoteAcceptance',acceptance:{conditionsVersion:'fixture-v1',privacyVersion:'fixture-v1',conditionsText:'Condiciones ficticias.',privacyText:'Privacidad ficticia.',formUrl:'https://example.test/acceptance'}}}};
const flags=[{name:'pending flag with matched dossier',patch:{identityReviewPending:true,syncStatus:'matched'}},{name:'duplicate identity status with false flag',patch:{identityReviewPending:false,syncStatus:'duplicate-identity'}},{name:'both pending indicators',patch:{identityReviewPending:true,syncStatus:'duplicate-identity'}}];
const auditId='1790000000000_'+'a'.repeat(24),eventId='1790000000000_'+'b'.repeat(64),contactId=prospects.hash('inquiry@example.test');
function harness(){
 const accounts={},users={};
 for(const [uid,role,area,kind]of [['staff','Administrativo',null,'personnel'],['school','Gerente','school','personnel'],['charters','Gerente','charters','personnel'],['director','Director',null,'personnel'],['pilot','Piloto',null,'pilot'],['target','Estudiante',null,'student']]){
  const name='Persona Ficticia '+uid,email=uid+'@example.test';
  users[uid]={uid,email,emailVerified:true,disabled:false,displayName:name,metadata:{creationTime:'2026-01-01T00:00:00.000Z'}};
  accounts[uid]={role,assignedAt:'fixture-confirmed',assignedBy:'director',verified:true,email,profile:{name,identity:'TEST-'+uid.toUpperCase(),phone:'TEST-PHONE'},syncVersion:5,syncedOperation:'fixture',syncedRole:role,syncStatus:'matched',recordKind:kind,recordId:uid+'-record',identityReviewPending:false};
  if(area)accounts[uid].prospectAccess={email,area,assignedAt:'fixture-grant'};
 }
 const aircraftPolicy={aeronaves:{actions:{view:true,edit:true},boxes:{status:{view:true,edit:true}}}};
 const data={fleet:{HP_1784:{reg:'HP-1784',status:'operativo',estatus_nota:'Nota operativa ficticia',component_schema_v2:true,mantenimiento:[],documentos:[]}},pilotos:[{id:'pilot-record',authUid:'pilot',email:users.pilot.email,nombre:users.pilot.displayName,identity:'TEST-PILOT',verificaciones:[]},{id:'merge-pilot',nombre:'Duplicado Ficticio',email:'duplicate@example.test',identity:'TEST-MERGE',verificaciones:[]}],itinerarios:[],operationalNotices:[{id:'notice-fixture',message:'AVISO FICTICIO PROTEGIDO',recipients:[{kind:'group',id:'all'}]}],school:{students:[{id:'target-record',authUid:'target',email:users.target.email,name:users.target.displayName,identity:'TEST-TARGET',courses:[]},{id:'merge-student',email:'duplicate@example.test',name:'Duplicado Ficticio',identity:'TEST-MERGE',courses:[]}],personnel:['staff','school','charters','director'].map(uid=>({id:uid+'-record',authUid:uid,email:users[uid].email,name:users[uid].displayName,identity:'TEST-'+uid.toUpperCase(),position:accounts[uid].role})),registry:{clients:[],entries:[]},accessConfiguration:{roles:{Administrativo:{...structuredClone(aircraftPolicy),interesados:{actions:{view:true,edit:true,export:true},boxes:{contacts:{view:true,edit:true,export:true}}}},Gerente:structuredClone(aircraftPolicy),Piloto:{aeronaves:{actions:{view:true,edit:false},boxes:{status:{view:true,edit:false}}}},Estudiante:{estudiantes:{actions:{view:true},boxes:{account:{view:true,edit:false}}}}}}}};
 const contact={id:contactId,email:'inquiry@example.test',name:'Consulta Ficticia',phone:'TEST-CONTACT',areas:['charters','school'],courses:['privado'],version:1,status:'Nueva',responsible:'Staff Ficticio',notes:'NOTA FICTICIA PROTEGIDA',nextContact:'',consent:{status:'granted',evidence:'CONSENTIMIENTO FICTICIO'},consentHistory:{[eventId]:{from:'unknown',to:'granted',statement:'HISTORIAL FICTICIO',at:'2026-11-16T00:00:00.000Z'}},areaFollowups:{school:{status:'Nueva',notes:'ESCUELA FICTICIA',responsible:'School Ficticio'},charters:{status:'Nueva',notes:'CHARTERS FICTICIO',responsible:'Charters Ficticio'}}};
 let store={accountRequests:accounts,dashboard:{operation:'fixture',revision:1,payload:JSON.stringify(data),auditPending:{'preserved-history':{meta:{id:'preserved-history'},chunks:{'000000':[]}}}},prospects:{contacts:{[contactId]:contact},inquiries:{[contactId]:{[eventId]:{areas:['school'],interest:'CONSULTA FICTICIA PROTEGIDA',at:'2026-11-16T00:00:00.000Z',channel:'WhatsApp',courses:['privado']}}}},auditIndex:{[auditId]:{id:auditId,reason:'AUDITORIA FICTICIA',source:'Usuarios y cargos'}},auditDetails:{[auditId]:{'000000':[{field:'Campo ficticio',before:'Antes',after:'Despues'}]}}};
 let current='staff';const reads=[],writes=[],authEvents=[];
 const get=path=>path.split('/').filter(Boolean).reduce((o,k)=>o?.[k],store)??null;
 const clone=value=>structuredClone(value??null),snap=value=>({val:()=>clone(value),exists:()=>value!=null});
 const put=(path,value)=>{if(!path){store=clone(value);return;}const keys=path.split('/').filter(Boolean),last=keys.pop();let target=store;for(const k of keys)target=target[k]||={};target[last]=clone(value);};
 const db={ref(path=''){
  let start='',end='',inclusiveStart=false,inclusiveEnd=false,limit=Infinity,last=false;
  const ref={get:async()=>{reads.push(path);let value=get(path);if(limit!==Infinity)value=Object.fromEntries(Object.entries(value||{}).sort(([a],[b])=>a.localeCompare(b)).filter(([k])=>(!start||(inclusiveStart?k>=start:k>start))&&(!end||(inclusiveEnd?k<=end:k<end))).slice(last?-limit:0,last?undefined:limit));return snap(value);},set:async value=>{writes.push({path,kind:'set'});put(path,value);},update:async patch=>{writes.push({path,kind:'update'});for(const [k,value]of Object.entries(patch))put([path,k].filter(Boolean).join('/'),value);},transaction:async update=>{reads.push(path);const next=update(clone(get(path)));if(next===undefined)return {committed:false,snapshot:snap(get(path))};writes.push({path,kind:'transaction'});put(path,next);return {committed:true,snapshot:snap(next)};},orderByKey:()=>ref,startAfter:v=>(start=v,inclusiveStart=false,ref),startAt:v=>(start=v,inclusiveStart=true,ref),endBefore:v=>(end=v,inclusiveEnd=false,ref),endAt:v=>(end=v,inclusiveEnd=true,ref),limitToFirst:v=>(limit=v,last=false,ref),limitToLast:v=>(limit=v,last=true,ref)};return ref;
 }};
 const auth={verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);if(token!=='fixture-valid')throw Object.assign(Error('revoked'),{code:'auth/id-token-revoked'});return {uid:current};},getUser:async uid=>{authEvents.push({kind:'getUser',uid});if(!users[uid])throw Object.assign(Error('missing'),{code:'auth/user-not-found'});return clone(users[uid]);},listUsers:async()=>{authEvents.push({kind:'listUsers'});return {users:Object.values(users).map(clone)};},getUserByEmail:async email=>{authEvents.push({kind:'getUserByEmail',email});const u=Object.values(users).find(u=>u.email===email);if(!u)throw Object.assign(Error('missing'),{code:'auth/user-not-found'});return clone(u);},createUser:async input=>{authEvents.push({kind:'createUser',input});throw Error('Unexpected Auth creation');},updateUser:async(uid,patch)=>{authEvents.push({kind:'updateUser',uid,patch});Object.assign(users[uid],patch);return clone(users[uid]);},revokeRefreshTokens:async uid=>authEvents.push({kind:'revokeRefreshTokens',uid})};
 const endpoints={};vm.runInNewContext(fs.readFileSync(__dirname+'/../functions/index.js','utf8'),{Buffer,exports:endpoints,process:{env:{HP_WIX_INTERESTS_CONFIG:JSON.stringify(quoteConfig)}},require:id=>({'firebase-functions/v2/https':{onRequest:(_,handler)=>handler},'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>auth},'firebase-admin/database':{getDatabase:()=>db}}[id]||require(id.startsWith('./')?'../functions/'+id.slice(2):id))});
 const h={get root(){return store;},users,reads,writes,authEvents,as:uid=>{current=uid;},data:()=>JSON.parse(store.dashboard.payload),changeData:fn=>{const value=JSON.parse(store.dashboard.payload);fn(value);store.dashboard.payload=JSON.stringify(value);},clear:()=>{reads.length=0;writes.length=0;authEvents.length=0;},call:async(action,extra={},options={})=>{let status=200,body;const response={set(){},status(code){status=code;return this;},json(value){body=value;},end(){}};await endpoints.accountRegistration({method:options.method||'POST',headers:{authorization:options.token===null?'':'Bearer '+(options.token||'fixture-valid')},body:{action,...extra}},response);return {status,body};}};
 return h;
}
function boxInput(h){const data=h.data(),account=h.root.accountRequests.staff,view=boxView(data,account,policyFor(data,account),'aeronaves'),before=view.data,after=structuredClone(before);after.fleet.HP_1784.estatus_nota='Nota ficticia modificada';return {page:'aeronaves',operation:h.root.dashboard.operation,before,after};}
function crmInput(){return {record:{id:contactId,email:'inquiry@example.test',name:'Consulta Ficticia',phone:'TEST-CONTACT',areas:['school'],courses:['privado'],version:1,status:'En seguimiento',responsible:'School Ficticio',notes:'MODIFICACION FICTICIA',nextContact:'',channel:'WhatsApp',interest:'',consentStatus:'granted',consentEvidence:'CONSENTIMIENTO FICTICIO'}};}
const routes=[
 ['staff','box-save',h=>boxInput(h)],['school','prospect-session',()=>({})],['school','prospect-list',()=>({})],['school','prospect-detail',()=>({id:contactId})],['school','prospect-consent-history',()=>({id:contactId})],['school','prospect-save',()=>crmInput()],['staff','prospect-list',()=>({export:true})],['staff','operational-notices',()=>({})],['staff','session',()=>({})],['staff','self-profile',()=>({})],['staff','self-profile-save',h=>({operation:h.root.dashboard.operation,profile:{name:'Perfil Ficticio Actualizado',phone:'TEST-UPDATED',photo:''}})],['staff','access',()=>({page:'aeronaves',layout:'main'})],['pilot','aircraft-report',()=>({aircraft:'HP-1784',description:'Discrepancia ficticia para prueba aislada',idempotencyKey:randomUUID()})],
 ['director','director-save',h=>{const data=h.data();data.fleet.HP_1784.estatus_nota='Cambio ficticio del Director';return {operation:h.root.dashboard.operation,payload:JSON.stringify(data)};}],['director','permission-capabilities',()=>({})],['director','quote-session',()=>({})],['school','honorarios-read',()=>({date:'2026-11-18'})],['school','honorarios-rates-save',()=>({rates:{}})],['director','list',()=>({})],['director','users',()=>({})],['director','assign',()=>({uid:'target',role:'Gerente'})],['director','identity-preview',()=>({})],['director','identity-merge',h=>{const group=require('../functions/identity-merge').groups(h.root).find(g=>g.members.some(m=>m.key==='pilot:merge-pilot'));return {members:group.members.map(m=>m.key),revision:require('../functions/identity-merge').revision(h.root,group),confirm:true,primaryKey:'pilot:merge-pilot'};}],['director','audit-list',()=>({})],['director','audit-detail',()=>({id:auditId})],['director','prospect-configure',()=>({email:'school@example.test',name:'School Ficticio',area:'charters',confirm:true})],['staff','unknown-protected-operation',()=>({})]
];
for(const variant of flags)test('pending identity denies protected HTTP routes before private reads or writes: '+variant.name,async()=>{
 const failures=[];
 for(const [uid,action,input]of routes){
  const h=harness();h.as(uid);Object.assign(h.root.accountRequests[uid],variant.patch);const body=input(h),before=structuredClone(h.root);h.clear();const result=await h.call(action,body);
  const privateReads=h.reads.filter(path=>path!=='accountRequests/'+uid),mutations=h.authEvents.filter(event=>!['getUser'].includes(event.kind));
  if(result.status!==403||privateReads.length||h.writes.length||mutations.length||JSON.stringify(h.root)!==JSON.stringify(before))failures.push({uid,action,status:result.status,privateReads,writes:h.writes,authEvents:mutations,changed:JSON.stringify(h.root)!==JSON.stringify(before)});
 }
 assert.equal(failures.length,0,'Every protected action must reject a pending acting identity before private reads or writes. Observed: '+JSON.stringify(failures));
});

test('CRM scope rejects pending identities before its Director or individual-grant exceptions',()=>{
 const {scope}=require('../functions/prospect-access');
 for(const variant of flags)for(const uid of ['staff','school','charters','director']){
  const h=harness(),account=h.root.accountRequests[uid];Object.assign(account,variant.patch);
  assert.equal(scope(h.users[uid],account,uid==='director',policyFor(h.data(),account)),null,uid+': '+variant.name);
 }
});

test('malformed review flags fail closed while missing and explicit false remain usable',async()=>{
 for(const flag of ['',0,'false',{},[]]){
  const h=harness();h.root.accountRequests.staff.identityReviewPending=flag;const before=structuredClone(h.root);h.clear();
  const result=await h.call('prospect-list',{identityReviewPending:false,syncStatus:'matched'});
  assert.equal(result.status,403,'Stored flag '+JSON.stringify(flag)+' cannot be cleared by request fields');
  assert.deepEqual(h.reads,['accountRequests/staff']);assert.deepEqual(h.writes,[]);assert.deepEqual(h.root,before);
 }
 for(const flag of [undefined,null,false]){
  const h=harness();h.root.accountRequests.staff.identityReviewPending=flag;
  assert.equal((await h.call('prospect-list')).status,200);
 }
});

test('valid callers retain box edits and CRM reads, updates and area restrictions',async()=>{
 let h=harness();const saved=await h.call('box-save',boxInput(h));assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(h.data().fleet.HP_1784.estatus_nota,'Nota ficticia modificada');
 h=harness();h.as('school');const list=await h.call('prospect-list');assert.equal(list.status,200);assert.equal(list.body.contacts[0].notes,'ESCUELA FICTICIA');assert.equal((await h.call('prospect-detail',{id:contactId})).body.inquiries.length,1);assert.equal((await h.call('prospect-consent-history',{id:contactId})).body.events.length,1);
 const update=await h.call('prospect-save',crmInput());assert.equal(update.status,200,JSON.stringify(update));assert.equal(h.root.prospects.contacts[contactId].areaFollowups.school.notes,'MODIFICACION FICTICIA');
 h=harness();h.as('charters');const charter=await h.call('prospect-list');assert.equal(charter.status,200);assert.equal(charter.body.contacts[0].consent.status,'unknown');assert.equal(charter.body.contacts[0].notes,'CHARTERS FICTICIO');assert((await h.call('prospect-consent-history',{id:contactId})).status>=400);
});

test('revoked grants, view/edit permissions, verification, disabled users and token checks remain effective',async()=>{
 let h=harness();h.changeData(data=>{data.school.accessConfiguration.roles.Administrativo.aeronaves.boxes.status.edit=false;});let before=structuredClone(h.root);assert((await h.call('box-save',boxInput(h))).status>=400);assert.deepEqual(h.root,before);
 h=harness();h.changeData(data=>{data.school.accessConfiguration.roles.Administrativo.interesados.actions.view=false;});before=structuredClone(h.root);assert.equal((await h.call('prospect-list')).status,403);assert.deepEqual(h.root,before);
 h=harness();h.as('school');delete h.root.accountRequests.school.prospectAccess;before=structuredClone(h.root);assert.equal((await h.call('prospect-list')).status,403);assert.deepEqual(h.root,before);
 for(const patch of [{role:'Piloto'},{assignedAt:null},{prospectAccess:{email:'different@example.test',area:'school',assignedAt:'fixture'}}]){h=harness();h.as('school');Object.assign(h.root.accountRequests.school,patch);before=structuredClone(h.root);assert.equal((await h.call('prospect-list')).status,403);assert.deepEqual(h.root,before);}
 for(const patch of [{emailVerified:false},{disabled:true}]){h=harness();Object.assign(h.users.staff,patch);before=structuredClone(h.root);assert.equal((await h.call('prospect-list')).status,403);assert.deepEqual(h.root,before);}
 h=harness();assert.equal((await h.call('prospect-list',{}, {token:null})).status,401);assert.equal((await h.call('prospect-list',{}, {token:'revoked'})).status,401);assert.deepEqual(h.reads,[]);
});

test('registration status and submit preserve each pending state without accepting forged roles',async()=>{
 for(const variant of flags){
  const h=harness();Object.assign(h.root.accountRequests.staff,variant.patch);h.root.dashboard.operation='changed-fixture';
  const status=await h.call('status');assert.equal(status.status,200,JSON.stringify(status));assert(status.body.identityReviewPending||status.body.syncStatus==='duplicate-identity',variant.name+' must remain pending after synchronization');
  const submit=await h.call('submit',{requestIdentityReview:true,identityReviewPending:false,syncStatus:'matched',role:'Director',profile:{...h.root.accountRequests.staff.profile}});
  assert.equal(submit.status,200,JSON.stringify(submit));assert(submit.body.identityReviewPending||submit.body.syncStatus==='duplicate-identity',variant.name+' must remain pending after resubmission');assert.equal(h.root.accountRequests.staff.role,'Administrativo');
  assert.equal((await h.call('prospect-list')).status,403);
 }
 const h=harness();Object.assign(h.root.accountRequests.staff,flags[0].patch);h.clear();const ready=await h.call(undefined,{}, {method:'GET',token:null});assert.equal(ready.status,200);assert.equal(ready.body.ready,true);assert.deepEqual(h.reads,[]);assert.deepEqual(h.writes,[]);
});

test('an active Director can review pending targets without inheriting their restriction',async()=>{
 const h=harness();Object.assign(h.root.accountRequests.target,flags[0].patch);h.as('director');const list=await h.call('list');assert.equal(list.status,200);assert.equal(list.body.requests.find(r=>r.uid==='target').identityReviewPending,true);const users=await h.call('users');assert.equal(users.status,200);assert.equal(users.body.users.find(r=>r.uid==='target').identityReviewPending,true);assert.equal((await h.call('audit-list')).status,200);
});

test('authorized Director and Gerencia retain Quotes and read-only Honorarios access',async()=>{
 const quotes=harness();quotes.as('director');const session=await quotes.call('quote-session');assert.equal(session.status,200,JSON.stringify(session));assert.equal(session.body.access.view,true);assert.equal(session.body.policy.formUrl,'https://example.test/acceptance');assert(!JSON.stringify(session.body).includes(quoteConfig.token));
 const honorarios=harness();honorarios.as('school');const report=await honorarios.call('honorarios-read',{date:'2026-11-18'});assert.equal(report.status,200,JSON.stringify(report));assert.equal(report.body.canEditRates,false);assert.equal((await honorarios.call('honorarios-rates-save',{rates:{}})).status,403,'Gerencia can read Honorarios but cannot edit rates');
});

test('Director-confirmed merge clears the old duplicate status before the next identity synchronization',async()=>{
 const h=harness();Object.assign(h.root.accountRequests.staff,flags[2].patch);h.changeData(data=>{data.school.students.push({id:'staff-legacy',email:'former-staff@example.test',name:h.root.accountRequests.staff.profile.name,identity:h.root.accountRequests.staff.profile.identity,courses:[]});});h.as('director');const preview=await h.call('identity-preview');assert.equal(preview.status,200);const group=preview.body.groups.find(g=>g.uids.includes('staff'));assert(group);const merged=await h.call('identity-merge',{members:group.members.map(m=>m.key),revision:group.revision,confirm:true,primaryKey:'personnel:staff-record'});assert.equal(merged.status,200,JSON.stringify(merged));assert.equal(h.root.accountRequests.staff.identityReviewPending,false);assert.notEqual(h.root.accountRequests.staff.syncStatus,'duplicate-identity','explicit approval must remove the auxiliary blocking status');h.as('staff');assert.equal((await h.call('status')).status,200);assert.equal((await h.call('access',{page:'aeronaves'})).status,200);
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const q=require('../functions/quotes'),p=require('../functions/prospects');
const {memory}=require('./helpers/consent-fixtures.cjs');
const now='2026-11-17T15:00:00.000Z',later='2026-11-17T15:01:00.000Z',last='2026-11-17T15:02:00.000Z';
const formId='fictional-acceptance',cfg={token:'fictional-private-token-'.repeat(3),siteId:'fictional-site',forms:{
 [formId]:{area:'charters',kind:'quoteAcceptance',acceptance:{conditionsVersion:'2026-11-17',privacyVersion:'2026-11-17',conditionsText:'Condiciones ficticias aprobadas.',privacyText:'Privacidad ficticia aprobada.',formUrl:'https://example.test/acceptance'}},
 charters:{area:'charters'},school:{area:'school'}
}};
const current=q.policy(cfg),actor={uid:'fictional-antonio'},record={reference:'HP-001',customerName:'Persona Ficticia',email:'persona@example.test',phone:'TEST-ONLY',description:'Albrook a Contadora, ida',flightDate:'2026-12-01',amountCents:100000,paymentConcept:'Abono',notes:'Solo prueba',version:0};
const id=p.hash(record.reference),path='prospects/quotes/'+id;
const body={token:cfg.token,siteId:cfg.siteId,formId,submissionId:'fictional-001',submittedAt:later,name:record.customerName,email:record.email,phone:record.phone,quoteReference:record.reference,amount:'1000.00',acceptedConditions:true,acceptedPrivacy:'true',conditionsVersion:'2026-11-17',privacyVersion:'2026-11-17'};
const input=(patch={},config=cfg)=>q.webhookInput({...body,...patch},config,last);
const save=(db,patch={},at=now)=>q.handle(db,'quote-save',{record:{...record,...patch}},actor,current,at);
const view=db=>q.quoteView(db.read(path),current);

test('exact form/site/token mapping and strict decimal USD parsing reject forged or mixed envelopes',()=>{
 for(const envelope of [body,{data:body},JSON.stringify(body),Buffer.from(JSON.stringify({data:body}))])assert.equal(q.webhookInput(envelope,cfg,last).reference,record.reference);
 for(const patch of [{token:'wrong'},{siteId:'wrong'},{formId:'charters'},{formId:'school'},{formId:'toString'},{submissionId:''},{name:''},{email:'invalid'},{submittedAt:'2099-01-01T00:00:00Z'},{amount:'99.99'},{amount:'8000.01'},{amount:'1e3'},{amount:'1,000.00'},{amount:'1000.001'},{amount:NaN},{quoteReference:'../x'},{quoteReference:{}},{conditionsVersion:'other'},{privacyVersion:'other'},{courseUpdates:true},{consentVersion:'marketing'}])assert.throws(()=>input(patch),JSON.stringify(patch));
 for(const raw of [{token:'bad',data:body},{data:{...body,token:'bad'}},JSON.stringify({padding:'x'.repeat(33000),data:body}),[]])assert.throws(()=>q.webhookInput(raw,cfg,last));
 assert.equal(input({quoteReference:' hp-001 ',amount:100}).reference,'HP-001');assert.equal(input({amount:'8000'}).amountCents,800000);
 const result=input({conditionsText:'Forged',privacyText:'Forged',paid:true,readyForPaymentLink:true,area:'school',binding:{materialRevision:1},paymentLink:'https://bad.test'});
 assert.equal(result.conditionsText,current.conditionsText);assert.equal(result.privacyText,current.privacyText);assert.equal(result.paid,undefined);assert.equal(result.binding,undefined);assert.equal(result.paymentLink,undefined);assert(!JSON.stringify(result).includes(cfg.token));
});

test('only two explicit affirmative checks can enable payment-link readiness',async()=>{
 for(const [i,value] of [false,'false',undefined,null,'',true,'true'].entries()){
  const db=memory();await save(db);await q.receive(db,input({submissionId:'check-'+i,acceptedConditions:value}),last);
  assert.equal(view(db).readyForPaymentLink,value===true||value==='true');
  const evidence=view(db).latestAcceptance;assert.equal(evidence.acceptedConditions,value===true||value==='true');assert.equal(evidence.receivedAt,last);
 }
 for(const value of ['yes','sí','TRUE','on',1,'1',{},[]])assert.throws(()=>input({acceptedPrivacy:value}));
 const db=memory();await save(db);await q.receive(db,input({acceptedPrivacy:undefined}),last);assert.equal(view(db).readyForPaymentLink,false);
 assert(db.writes.every(w=>/^prospects\/(quotes|quoteAcceptanceEvents|quoteAcceptancePolicies)\//.test(w.path)));assert.equal(db.read('prospects/inquiries'),undefined);assert.equal(db.read('prospects/contacts'),undefined);
});

test('manual save never fabricates evidence, payment, a link or privilege; reference is unique and version locked',async()=>{
 const db=memory();const saved=await save(db,{readyForPaymentLink:true,paid:true,acceptedConditions:true,acceptedPrivacy:true,acceptances:{forged:body},materialRevision:99,role:'Director'});
 assert.equal(saved.quote.readyForPaymentLink,false);const stored=db.read(path);assert.equal(stored.acceptances,undefined);assert.equal(stored.record.paid,undefined);assert.equal(stored.record.role,undefined);assert.equal(stored.record.materialRevision,1);
 await assert.rejects(save(db),/cambió/);await assert.rejects(save(db,{id,reference:'HP-002',version:1}),/referencia/);
 await assert.rejects(save(db,{amountCents:10000.1,version:1}),/importe/);await assert.rejects(save(db,{flightDate:'2026-02-30',version:1}),/Fecha/);
 assert.equal(Object.keys(db.read('prospects/quotes')).length,1);
});

test('evidence matches the exact quotation revision and every material change invalidates it, including reverting values',async()=>{
 for(const patch of [{email:'other@example.test'},{amountCents:110000},{description:'Otro servicio'},{flightDate:'2026-12-02'},{paymentConcept:'Saldo'},{customerName:'Otra Persona'}]){
  const db=memory();await save(db);await q.receive(db,input(),last);assert.equal(view(db).readyForPaymentLink,true);
  await save(db,{...patch,version:1},last);assert.equal(view(db).readyForPaymentLink,false);assert.equal(view(db).materialRevision,2);
  await save(db,{version:2},'2026-11-17T15:03:00.000Z');assert.equal(view(db).readyForPaymentLink,false);assert.equal(view(db).materialRevision,3);
 }
 const db=memory();await save(db);await q.receive(db,input(),last);await save(db,{version:1,notes:'Seguimiento nuevo',phone:'TEST-UPDATED'},last);assert.equal(view(db).readyForPaymentLink,true);assert.equal(view(db).materialRevision,1);
});

test('pre-registration and delayed pre-change submissions stay visible for review and never attach retroactively',async()=>{
 const db=memory();await q.receive(db,input(),last);assert.equal(view(db).quoteExists,false);assert.equal(view(db).acceptanceStatus,'pending_quote');
 await save(db,{},'2026-11-17T15:03:00.000Z');assert.equal(view(db).readyForPaymentLink,false);assert.equal(view(db).latestAcceptance.binding,undefined);
 await q.receive(db,input(),last);assert.equal(view(db).readyForPaymentLink,false);
 const changed=memory();await save(changed);await save(changed,{version:1,description:'Nuevo servicio'},last);await q.receive(changed,input(),last);assert.equal(view(changed).readyForPaymentLink,false);assert.equal(view(changed).latestAcceptance.binding,undefined);
});

test('duplicate, concurrent, out-of-order and colliding deliveries retain immutable first evidence',async()=>{
 const db=memory();await save(db);await Promise.all([q.receive(db,input(),last),q.receive(db,input(),last)]);const original=db.read(path).acceptances;
 assert.equal(view(db).acceptanceCount,1);assert.equal((await q.receive(db,input(),'2026-11-18T15:00:00Z')).duplicate,true);assert.deepEqual(db.read(path).acceptances,original);
 for(const patch of [{email:'other@example.test'},{amount:'2000'},{quoteReference:'OTHER'},{acceptedConditions:false},{phone:'changed'},{submittedAt:now}])await assert.rejects(q.receive(db,input(patch),last),/identificador/);
 const falseLater=input({submissionId:'false-later',submittedAt:last,acceptedPrivacy:false});await q.receive(db,falseLater,last);assert.equal(view(db).readyForPaymentLink,false);
 await q.receive(db,input({submissionId:'older-affirmative',submittedAt:now}),last);assert.equal(view(db).readyForPaymentLink,false);assert.equal(view(db).latestAcceptance.submissionId,'false-later');
});

for(const stage of ['quote','receipt'])test('interrupted '+stage+' resumes once without overwriting evidence or its original time',async()=>{
 const db=memory();await save(db);db.failOnce((path,op)=>stage==='quote'?path.startsWith('prospects/quotes/'):path.startsWith('prospects/quoteAcceptanceEvents/')&&op==='update');
 await assert.rejects(q.receive(db,input(),last),/interruption/);await q.receive(db,input(),'2026-11-17T15:04:00Z');assert.equal(view(db).acceptanceCount,1);assert.equal(view(db).latestAcceptance.receivedAt,last);assert.equal(view(db).readyForPaymentLink,true);
});

test('policy text is pinned and a new current policy makes historical acceptance insufficient',async()=>{
 const db=memory();await save(db);await q.receive(db,input(),last);
 const changed=structuredClone(cfg);changed.forms[formId].acceptance.conditionsText='Texto alterado';await assert.rejects(q.receive(db,input({submissionId:'altered'},changed),last),/versión/);
 changed.forms[formId].acceptance.conditionsVersion='2026-11-18';const next=q.policy(changed);assert.equal(q.quoteView(db.read(path),next).readyForPaymentLink,false);
 assert.equal(q.quoteView(db.read(path),current).latestAcceptance.conditionsText,current.conditionsText);
 const independent=structuredClone(cfg);independent.forms[formId].acceptance.privacyVersion='2026-11-18';independent.forms[formId].acceptance.conditionsText='Condiciones reescritas con la misma versión';
 await assert.rejects(q.receive(db,input({submissionId:'independent',privacyVersion:'2026-11-18'},independent),last),/versión/);
});

test('equal Wix timestamps prefer the later received response; tied unchecked evidence fails closed',async()=>{
 const db=memory();await save(db);await q.receive(db,input(),last);assert.equal(view(db).readyForPaymentLink,true);
 await q.receive(db,input({submissionId:'same-date-unchecked',acceptedPrivacy:false}),'2026-11-17T15:03:00.000Z');assert.equal(view(db).readyForPaymentLink,false);
 const tied=memory();await save(tied);await q.receive(tied,input({submissionId:'unchecked-first',acceptedPrivacy:false}),last);await q.receive(tied,input(),last);assert.equal(view(tied).readyForPaymentLink,false);
});

test('list/detail paginate, include unmatched review items and disclose no tokens or receipt internals',async()=>{
 const db=memory();await save(db);await q.receive(db,input(),last);
 for(let i=0;i<22;i++)await q.receive(db,input({submissionId:'page-'+i}),last);
 const first=await q.handle(db,'quote-detail',{id},actor,current);assert.equal(first.acceptances.length,20);assert(first.nextCursor);const second=await q.handle(db,'quote-detail',{id,cursor:first.nextCursor},actor,current);assert.equal(second.acceptances.length,3);assert(!second.acceptances.some(e=>first.acceptances.some(a=>a.id===e.id)));
 const list=await q.handle(db,'quote-list',{},actor,current);assert.equal(list.quotes.length,1);assert.equal(list.quotes[0].readyForPaymentLink,true);assert(!JSON.stringify(list).includes(cfg.token));assert.equal(list.quotes[0].digest,undefined);
 await assert.rejects(q.handle(db,'quote-detail',{id:'../../dashboard'},actor,current),/válida/);
});

function endpoint(db){
 let user={uid:'fictional-user',email:'staff@example.test',emailVerified:true,disabled:false},account={role:'Administrativo',assignedAt:now,prospectAccess:{area:'charters',email:'staff@example.test',assignedAt:now}},policy={};
 const exports={},database={ref:path=>path==='accountRequests/'+user.uid?{get:async()=>({val:()=>account})}:path==='dashboard/payload'?{get:async()=>({val:()=>JSON.stringify({school:{accessConfiguration:{roles:{Administrativo:policy}}}})})}:db.ref(path)};
 const dependencies={'firebase-functions/v2/https':{onRequest:(_options,fn)=>fn},'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>({verifyIdToken:async()=>({uid:user.uid}),getUser:async()=>user})},'firebase-admin/database':{getDatabase:()=>database}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../functions/index'),'utf8'),{exports,process:{env:{HP_WIX_INTERESTS_CONFIG:JSON.stringify(cfg)}},require:id=>dependencies[id]||require(id.startsWith('./')?'../functions/'+id.slice(2):id),console});
 return {setUser:patch=>{user={...user,...patch};},setAccount:value=>{account=value;},setPolicy:value=>{policy=value;},async call(action,extra={},authorized=true){let status=200,data;await exports.accountRegistration({method:'POST',headers:{authorization:authorized?'Bearer fictional':''},body:{action,...extra}},{set(){},status(v){status=v;return this;},json(v){data=v;},end(){}});return {status,data};}};
}
test('authentication and area gate deny school/unverified/disabled accounts and honor read-only policy',async()=>{
 const db=memory(),api=endpoint(db);assert.equal((await api.call('quote-list',{},false)).status,401);
 assert.equal((await api.call('quote-save',{record})).status,200);assert.equal((await api.call('quote-detail',{id})).status,200);
 const session=await api.call('quote-session');assert.equal(session.data.access.edit,true);assert(!JSON.stringify(session).includes(cfg.token));
 api.setUser({emailVerified:false});assert.equal((await api.call('quote-list')).status,403);api.setUser({emailVerified:true,disabled:true});assert.equal((await api.call('quote-list')).status,403);api.setUser({disabled:false});
 api.setAccount({role:'Administrativo',assignedAt:now,prospectAccess:{area:'school',email:'staff@example.test',assignedAt:now}});for(const action of ['quote-list','quote-detail','quote-save','quote-session'])assert.equal((await api.call(action,{id,record})).status,403);
 api.setAccount({role:'Director',assignedAt:now});assert.equal((await api.call('quote-list')).status,200);
 api.setAccount({role:'Administrativo',assignedAt:now});api.setPolicy({interesados:{actions:{view:true,edit:false},boxes:{contacts:{view:true,edit:false}}}});
 // Use the same permission schema and precedence as existing CRM role tests.
 const scope=require('../functions/prospect-access').scope({emailVerified:true,email:'staff@example.test'}, {role:'Administrativo',assignedAt:now},false,{interesados:{actions:{view:true,edit:false},boxes:{contacts:{view:true,edit:false}}}});
 assert.equal(scope?.edit,false);assert.equal((await api.call('quote-list')).status,200);assert.equal((await api.call('quote-save',{record:{...record,version:1}})).status,403);
});

test('HTTP receiver routes quote acceptance only to private quotation records and preserves CRM route',async()=>{
 const db=memory(),exports={},dependencies={'firebase-functions/v2/https':{onRequest:(_o,fn)=>fn},'firebase-functions/params':{defineSecret:()=>({value:()=>JSON.stringify(cfg)})},'firebase-admin/database':{getDatabase:()=>db}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../functions/wix-interests'),'utf8'),{exports,require:id=>dependencies[id]||require(id.startsWith('./')?'../functions/'+id.slice(2):id)});
 async function post(value){let status=200,result;await exports.wixInterests({method:'POST',body:value},{set(){},status(v){status=v;return this;},json(v){result=v;},end(){}});return {status,result};}
 assert.equal((await post(body)).status,200);assert.equal((await post({data:body})).result.duplicate,true);assert.equal(db.read('prospects/inquiries'),undefined);assert.equal(db.read('prospects/contacts'),undefined);
 assert.equal((await post({...body,token:'wrong'})).status,401);
 assert.equal((await post({...body,formId:'charters',submissionId:'crm',interest:'Consulta ficticia'})).status,200);assert.equal(Object.keys(db.read('prospects/contacts')).length,1);
});

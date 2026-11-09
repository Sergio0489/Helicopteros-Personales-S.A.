'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const p=require('../functions/prospects');
const {now,statement,policy,config,body,memory}=require('./helpers/consent-fixtures.cjs');
const input=(patch={},cfg=config)=>p.webhookInput({...body,...patch},cfg,now);
const key=p.hash(body.email),contactPath='prospects/contacts/'+key;
const contact=db=>db.read(contactPath);
const inquiries=db=>Object.values(db.read('prospects/inquiries/'+key)||{});
const later='2026-11-09T15:02:00.000Z';
async function manual(db,status,at=later,patch={}){
 const record={...contact(db),consentStatus:status,consentEvidence:'Constancia ficticia: '+status,...patch};
 return p.handle(db,'prospect-save',{record},{uid:'fictional-school-staff',prospectArea:'school'},at);
}

for(const formId of ['school-contact','school-contact-2']){
 test(formId+': only an explicit affirmative checkbox grants consent; every query is retained',async()=>{
  for(const [i,value] of [true,'true',false,'false',undefined,null,'',1,'1','yes','sí','on','TRUE',[],{}].entries()){
   const db=memory();await p.receive(db,input({formId,courseUpdates:value,submissionId:'fictitious-'+i}),now);
   const accepted=value===true||value==='true';
   assert.equal(contact(db).consent.status,accepted?'granted':'unknown');
   assert.equal(inquiries(db).length,1);assert.equal(inquiries(db)[0].consentResponse.accepted,accepted);
   assert.equal(inquiries(db)[0].consentResponse.statement,statement);
   assert.equal(inquiries(db)[0].consentResponse.version,'hpfs-cursos-email-v1');
   assert.equal(inquiries(db)[0].consentResponse.at,now);assert.equal(inquiries(db)[0].receivedAt,now);
   assert.equal(inquiries(db)[0].requestedCourse,'Piloto privado');assert.equal(inquiries(db)[0].contact.phone,'TEST-ONLY');
   assert.equal(p.publicContact(contact(db),[]).courseUpdatesEligible,accepted);
   assert(!JSON.stringify(db.root()).includes(config.token));
  }
 });
}
test('server catalog owns wording and channels; grant without a known version fails closed',()=>{
 const parsed=input({consentStatement:'Forged text',channels:['sms'],consentStatus:'withdrawn'});
 assert.equal(parsed.consent.evidence,statement);assert.deepEqual(parsed.consent.channels,['email']);
 for(const consentVersion of [undefined,'',' ','unknown','toString','__proto__',1,{},'x'.repeat(101)])assert.throws(()=>input({consentVersion}));
 for(const policy of [{statement:' ',channels:['email']},{statement:'x',channels:['sms']},{statement:'x',channels:[]}]){
  const cfg=structuredClone(config);cfg.forms['school-contact'].consentPolicies['hpfs-cursos-email-v1']=policy;
  assert.throws(()=>input({},cfg));
 }
});
test('a query without the new fields remains unknown and does not claim displayed wording',async()=>{
 const db=memory();await p.receive(db,input({courseUpdates:undefined,consentVersion:undefined}),now);
 assert.equal(contact(db).consent.status,'unknown');assert.equal(inquiries(db)[0].consentResponse.accepted,false);
 assert.equal(inquiries(db)[0].consentResponse.version,'');assert.equal(inquiries(db)[0].consentResponse.statement,'');
 assert.equal(db.read('prospects/consentPolicies'),undefined);
});
test('new versions retain old evidence and identical retries, even if course mappings change',async()=>{
 const db=memory();await p.receive(db,input(),now);const original=inquiries(db)[0];
 const cfg=structuredClone(config);cfg.forms['school-contact'].consentPolicies.v2={statement:'Otro texto ficticio.',channels:['email']};
 cfg.forms['school-contact'].courseMap['Piloto privado']='comercial';
 assert.equal((await p.receive(db,input({},cfg),later)).duplicate,true);
 assert.deepEqual(inquiries(db)[0],original);assert.equal(contact(db).inquiryCount,1);
 await p.receive(db,input({submissionId:'v2-submission',consentVersion:'v2'},cfg),later);
 assert.equal(inquiries(db).length,2);assert(inquiries(db).some(q=>q.consentResponse.version==='v2'));
 assert.deepEqual(inquiries(db).find(q=>q.submissionId===body.submissionId),original);
});
test('a policy version cannot silently change its wording, even after an unchecked delivery',async()=>{
 const db=memory();await p.receive(db,input({courseUpdates:false}),now);
 const cfg=structuredClone(config);cfg.forms['school-contact'].consentPolicies['hpfs-cursos-email-v1'].statement='Altered wording';
 const before=contact(db);
 await assert.rejects(p.receive(db,input({submissionId:'another'},cfg),later),/no puede cambiarse/);
 assert.deepEqual(contact(db),before);assert.equal(inquiries(db).length,1);
});
test('a version is allowlisted independently for each form',()=>{
 const cfg=structuredClone(config);cfg.forms['school-contact-2'].consentPolicies={};
 assert.throws(()=>input({formId:'school-contact-2'},cfg));assert.equal(input({},cfg).consent.status,'granted');
});
test('concurrent and repeated deliveries leave one query and one authorization event',async()=>{
 const db=memory();await Promise.all([p.receive(db,input(),now),p.receive(db,input(),later)]);
 assert.equal(inquiries(db).length,1);assert.equal(contact(db).inquiryCount,1);assert.equal(Object.keys(contact(db).consentHistory).length,1);
 assert.equal((await p.receive(db,input(),later)).duplicate,true);
 for(const patch of [{email:'other@example.test'},{courseUpdates:false},{phone:'changed'},{interest:'changed'},{submittedAt:'2026-11-09T14:59:00.000Z'}]){
  await assert.rejects(p.receive(db,input(patch),later),/identificador/);
 }
});
for(const stage of ['contact','inquiry','receipt'])test('interruption at '+stage+' resumes the frozen snapshot and original receipt time',async()=>{
 const db=memory();db.failOnce((path,op)=>stage==='contact'?path===contactPath:stage==='inquiry'?path.startsWith('prospects/inquiries/'):path.startsWith('prospects/receipts/')&&op==='update');
 await assert.rejects(p.receive(db,input(),now),/interruption/);
 const cfg=structuredClone(config);cfg.forms['school-contact'].courseMap['Piloto privado']='comercial';
 cfg.forms['school-contact'].consentPolicies.v2={statement:'Texto futuro ficticio.',channels:['email']};
 await p.receive(db,input({},cfg),later);
 assert.equal(contact(db).inquiryCount,1);assert.equal(inquiries(db).length,1);
 assert.deepEqual(inquiries(db)[0].courses,['privado']);assert.equal(inquiries(db)[0].receivedAt,now);
 assert.equal(inquiries(db)[0].consentResponse.statement,statement);
});
test('legacy unversioned retries after an interrupted receipt preserve the first resolved wording',async()=>{
 const db=memory(),patch={formId:'legacy',consentVersion:undefined};
 db.failOnce((path,op)=>path.startsWith('prospects/receipts/')&&op==='update');
 await assert.rejects(p.receive(db,input(patch),now));
 const cfg=structuredClone(config);cfg.forms.legacy.consentVersion='legacy-v2';cfg.forms.legacy.consentStatement='New legacy wording';
 await p.receive(db,input(patch,cfg),later);
 assert.equal(contact(db).consent.version,'legacy-v1');assert.equal(inquiries(db)[0].consentResponse.statement,'Autorización ficticia anterior.');
 assert.equal(inquiries(db)[0].receivedAt,now);
});
test('a delayed recovery preserves evidence time without rewinding the contact update time',async()=>{
 const db=memory();db.failOnce(path=>path===contactPath);
 await assert.rejects(p.receive(db,input(),now));
 await p.receive(db,input({submissionId:'second-submission',courseUpdates:false}),later);
 const recoveredAt='2026-11-09T15:05:00.000Z';await p.receive(db,input(),recoveredAt);
 assert.equal(contact(db).updatedAt,recoveredAt);
 assert.equal(inquiries(db).find(q=>q.submissionId===body.submissionId).receivedAt,now);
 assert.equal(Object.values(contact(db).consentHistory)[0].receivedAt,now);
});
test('pre-upgrade receipts still deduplicate without inventing historical evidence',async()=>{
 const parsed=input({formId:'legacy',consentVersion:undefined});
 const {consentResponse,submittedCourses,submittedConsentVersion,...old}=parsed;
 const {status,evidence,at,source}=old.consent;old.consent={status,evidence,at,source};
 const id=p.hash(old.formId+'\0'+old.submissionId),receipt={digest:p.hash(JSON.stringify(old)),contact:key,createdAt:now,done:true};
 const db=memory({prospects:{receipts:{[id]:receipt}}});
 assert.equal((await p.receive(db,parsed,later)).duplicate,true);
 assert.equal(db.read('prospects/contacts'),undefined);assert.equal(db.read('prospects/inquiries'),undefined);
});
test('unchecked submissions preserve a grant or withdrawal; only a newer acceptance reauthorizes',async()=>{
 const db=memory();await p.receive(db,input(),now);
 await p.receive(db,input({submissionId:'unchecked',courseUpdates:false}),later);assert.equal(contact(db).consent.status,'granted');
 await manual(db,'withdrawn');const withdrawn=contact(db).consent;
 await p.receive(db,input({submissionId:'older-acceptance'}),later);assert.deepEqual(contact(db).consent,withdrawn);
 await p.receive(db,p.webhookInput({...body,submissionId:'same-time',submittedAt:later},config,later),later);assert.deepEqual(contact(db).consent,withdrawn);
 await p.receive(db,p.webhookInput({...body,submissionId:'after-unchecked',submittedAt:'2026-11-09T15:03:00Z',courseUpdates:false},config,'2026-11-09T15:04:00Z'),'2026-11-09T15:04:00Z');assert.deepEqual(contact(db).consent,withdrawn);
 await p.receive(db,p.webhookInput({...body,submissionId:'new-acceptance',submittedAt:'2026-11-09T15:04:00Z'},config,'2026-11-09T15:04:00Z'),'2026-11-09T15:04:00Z');
 assert.equal(contact(db).consent.status,'granted');
 const history=Object.values(contact(db).consentHistory);assert.deepEqual(history.map(e=>e.status),['granted','withdrawn','granted']);
 assert.equal(history[1].previous.evidence,statement);assert.equal(inquiries(db)[0].consentResponse.statement,statement);
});
test('manual withdrawal evidence is atomic with state and survives a subsequent inquiry failure',async()=>{
 const db=memory();await p.receive(db,input(),now);
 db.failOnce((path,op)=>path.startsWith('prospects/inquiries/')&&op==='set');
 await assert.rejects(manual(db,'withdrawn',later,{interest:'Consulta ficticia adicional.'}),/interruption/);
 assert.equal(contact(db).consent.status,'withdrawn');const events=Object.values(contact(db).consentHistory);
 assert.equal(events.length,2);assert.equal(events[1].actor,'fictional-school-staff');assert.equal(events[1].status,'withdrawn');
 assert.equal(p.publicContact(contact(db),[]).courseUpdatesEligible,false);
});
test('changing consent alone creates no new query or email notification event',async()=>{
 const db=memory();await p.receive(db,input(),now);await manual(db,'withdrawn');
 assert.equal(inquiries(db).length,1);assert.equal(contact(db).inquiryCount,1);
 await manual(db,'withdrawn','2026-11-09T15:03:00Z',{consentHistory:{forged:{status:'granted'}}});
 assert.equal(Object.keys(contact(db).consentHistory).length,2);assert.equal(contact(db).consentHistory.forged,undefined);
});
test('Charters cannot grant course consent or see school evidence on a shared contact',async()=>{
 for(const extra of [{courseUpdates:true},{consentVersion:'hpfs-cursos-email-v1'},{requestedCourse:'Piloto privado'},{courses:['privado']}])assert.throws(()=>input({formId:'charters',requestedCourse:undefined,courseUpdates:false,consentVersion:undefined,...extra}));
 const db=memory();await p.receive(db,input(),now);
 await p.receive(db,input({formId:'charters',requestedCourse:undefined,courseUpdates:false,consentVersion:undefined}),now);
 const actor={uid:'fictional-charters-staff',prospectArea:'charters'},view=p.scopedContact(contact(db),[],'charters');
 assert.equal(view.consent.status,'unknown');assert.equal(view.consentHistory,undefined);assert.deepEqual(view.courses,[]);
 const result=await p.handle(db,'prospect-detail',{id:key},actor);
 assert.equal(result.inquiries.length,1);assert.equal(result.inquiries[0].consentResponse,undefined);
 await assert.rejects(p.handle(db,'prospect-consent-history',{id:key},actor),/acceso/);
 await assert.rejects(p.handle(db,'prospect-save',{record:{...view,consentStatus:'granted',consentEvidence:'Forged'}},actor),/área/);
 assert.equal(contact(db).consent.evidence,statement);
});
test('consent history is paginated, private and available to authorized read-only access',async()=>{
 const db=memory();await p.receive(db,input(),now);
 for(let i=0;i<22;i++)await manual(db,i%2?'granted':'withdrawn',new Date(Date.parse(later)+i*1000).toISOString());
 const actor={uid:'fictional-school-staff',prospectArea:'school'};
 const first=await p.handle(db,'prospect-consent-history',{id:key},actor),second=await p.handle(db,'prospect-consent-history',{id:key,cursor:first.nextCursor},actor);
 assert.equal(first.events.length,20);assert.equal(second.events.length,3);assert.equal(second.nextCursor,null);
 assert(!first.events.some(a=>second.events.some(b=>b.id===a.id)));
 assert.equal(p.publicContact(contact(db),[]).consentHistory,undefined);
 await assert.rejects(p.handle(db,'prospect-consent-history',{id:'f'.repeat(64)},actor));
 await assert.rejects(p.handle(db,'prospect-consent-history',{id:key,cursor:'bad'},actor));
});
test('eligibility still excludes enrolled and ambiguous students without changing consent',async()=>{
 const db=memory();await p.receive(db,input(),now);const record=contact(db);
 assert.equal(p.publicContact(record,[]).courseUpdatesEligible,true);
 for(const students of [[{email:body.email,stage:'Matriculado'}],[{email:body.email,courses:[{payments:[{cents:100}]}]}],[{email:body.email},{email:body.email}]])assert.equal(p.publicContact(record,students).courseUpdatesEligible,false);
 assert.equal(record.consent.status,'granted');assert.equal(db.root().dashboard,undefined);assert.equal(db.root().accountRequests,undefined);
});
test('HTTP validation rejects invalid deliveries before storage and accepts both supported envelopes',async()=>{
 const db=memory(),exports={};
 class FixtureDate extends Date{constructor(...args){super(...(args.length?args:[now]));}}
 vm.runInNewContext(fs.readFileSync(require.resolve('../functions/wix-interests'),'utf8'),{exports,Date:FixtureDate,require:id=>({'firebase-functions/v2/https':{onRequest:(_o,f)=>f},'firebase-functions/params':{defineSecret:()=>({value:()=>JSON.stringify(config)})},'firebase-admin/database':{getDatabase:()=>db},'./prospects':p}[id])});
 async function call(payload,method='POST'){let code=200,result;await exports.wixInterests({method,body:payload},{set(){},status(v){code=v;return this;},json(v){result=v;},end(){}});return {code,result};}
 assert.equal((await call(body,'GET')).code,405);
 for(const patch of [{token:'wrong'},{siteId:'wrong'},{formId:'wrong'},{consentVersion:'unknown'},{consentVersion:undefined},{submittedAt:'2099-01-01T00:00:00Z'},{email:'invalid'},{interest:'x'.repeat(33000)}])assert((await call({...body,...patch})).code>=400);
 assert.equal(db.writes.length,0);
 assert.equal((await call(body)).code,200);assert.equal((await call({data:body})).result.duplicate,true);
 assert.equal(inquiries(db).length,1);
});

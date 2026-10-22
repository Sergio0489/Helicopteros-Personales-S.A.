'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const p=require('../functions/prospects');
const now='2026-10-22T18:00:00.000Z';
const cfg={token:'x'.repeat(50),siteId:'fixture-site',forms:{school:{area:'school',courseMap:{'Piloto privado':'privado'},consentVersion:'fixture-v1',consentStatement:'Acepto recibir información sobre nuevos cursos.'},legacy:{area:'school'},charters:{area:'charters',consentVersion:'fixture-v1',consentStatement:'No debe otorgar permiso.'}}};
const base={token:cfg.token,siteId:cfg.siteId,formId:'school',submissionId:'fixture-1',submittedAt:now,name:'Prueba Escuela',email:'fixture@example.test',phone:'TEST-ONLY',requestedCourse:'Piloto privado',interest:'Consulta ficticia sobre horarios.'};
function memory(){const values=new Map(),writes=[];return {values,writes,ref(path){assert(path.startsWith('prospects/'),'Escritura fuera del CRM');const snap=()=>({val:()=>structuredClone(values.get(path)??null)});return {transaction:async fn=>{const next=fn(structuredClone(values.get(path)??null));if(next===undefined)return {committed:false,snapshot:snap()};writes.push(path);values.set(path,structuredClone(next));return {committed:true,snapshot:snap()};},set:async v=>{writes.push(path);values.set(path,structuredClone(v));},update:async v=>{writes.push(path);values.set(path,{...values.get(path),...v});}};}};}
test('legacy mapping preserves requested course separately and requires explicit consent',()=>{
 const minimal=p.webhookInput({...base,formId:'legacy',phone:undefined,requestedCourse:undefined},cfg,now);assert.equal(minimal.phone,'');assert.deepEqual(minimal.courses,[]);assert.equal(minimal.consent,undefined);assert.equal(minimal.requestedCourse,undefined);
 const input=p.webhookInput(base,cfg,now);assert.deepEqual(input.courses,['privado']);assert.equal(input.requestedCourse,base.requestedCourse);assert.equal(input.interest,base.interest);assert.equal(input.consent,undefined);
 for(const value of [false,'false',undefined,'yes',1])assert.equal(p.webhookInput({...base,courseUpdates:value},cfg,now).consent,undefined);
 assert.equal(p.webhookInput({...base,courseUpdates:true},cfg,now).consent.status,'granted');
 assert.throws(()=>p.webhookInput({...base,formId:'legacy',courseUpdates:true},cfg,now));
 assert.equal(p.webhookInput({...base,formId:'legacy'},cfg,now).requestedCourse,base.requestedCourse);
 assert.throws(()=>p.webhookInput(base,{...cfg,forms:{school:{area:'school',courseMap:{'Piloto privado':'invalid'}}}},now));
 for(const extra of [{courseUpdates:true},{courses:['privado']},{requestedCourse:'Piloto privado'}])assert.throws(()=>p.webhookInput({...base,formId:'charters',requestedCourse:'',...extra},cfg,now));
});
test('HTTP receiver stores fictitious school/charters submissions once and writes only CRM',async()=>{
 const db=memory(),exports={};vm.runInNewContext(fs.readFileSync(require.resolve('../functions/wix-interests'),'utf8'),{exports,require:id=>({'firebase-functions/v2/https':{onRequest:(_o,fn)=>fn},'firebase-functions/params':{defineSecret:()=>({value:()=>JSON.stringify(cfg)})},'firebase-admin/database':{getDatabase:()=>db},'./prospects':p}[id])});
 async function post(body){let status=200,result;await exports.wixInterests({method:'POST',body},{set(){},status(v){status=v;return this;},json(v){result=v;},end(){}});assert.equal(status,200);return result;}
 await post(base);assert.equal((await post({data:base})).duplicate,true);
 await post({...base,formId:'charters',requestedCourse:'',interest:'Consulta ficticia de vuelo.'});
 const key=p.hash(base.email),contact=db.values.get('prospects/contacts/'+key);assert.equal(contact.inquiryCount,2);assert.deepEqual(contact.areas,['charters','school']);assert.equal(contact.consent.status,'unknown');
 const inquiries=[...db.values.entries()].filter(([path])=>path.startsWith('prospects/inquiries/')).map(([,v])=>v);assert.equal(inquiries.length,2);
 const school=inquiries.find(v=>v.areas.includes('school'));assert.equal(school.requestedCourse,base.requestedCourse);assert.equal(school.at,now);assert.equal(school.interest,base.interest);
 assert.equal(contact.name,base.name);assert.equal(contact.phone,base.phone);assert.equal(contact.email,base.email);
 const view=p.scopedContact(contact,[],'charters');assert(!JSON.stringify(view).includes(base.interest));assert.deepEqual(view.courses,[]);
 assert(db.writes.every(path=>/^prospects\/(contacts|inquiries|receipts)\//.test(path)));
 const before=db.writes.length;await assert.rejects(p.receive(db,p.webhookInput({...base,interest:'Otro contenido'},cfg,now),now));assert.equal(db.writes.length,before);
});

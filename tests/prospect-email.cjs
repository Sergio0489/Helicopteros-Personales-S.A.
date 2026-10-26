'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const mail=require('../functions/prospect-email'),prospects=require('../functions/prospects');
const now=Date.parse('2026-10-26T18:00:00Z'),contactId='a'.repeat(64),inquiryId=String(now)+'_'+'b'.repeat(64);
const contact={name:'Persona de prueba',email:'fixture@example.test',phone:''};
const inquiry={areas:['school'],courses:['privado'],interest:'Quiero información del curso.',at:new Date(now).toISOString(),channel:'Formulario web',contact};
const event={params:{contactId,inquiryId},data:{val:()=>structuredClone(inquiry)}};
const config={host:'smtp.example.test',port:587,user:'test',password:'synthetic-fixture',from:'avisos@example.test'};
function memory(){const values=new Map();let fail=false;return {values,failReceipt(){fail=true;},ref(path){return {get:async()=>({val:()=>values.get(path)||null}),transaction:async fn=>{const next=fn(structuredClone(values.get(path)||null));if(next===undefined)return {committed:false,snapshot:{val:()=>structuredClone(values.get(path)||null)}};if(fail&&next.status==='sent'){fail=false;throw Error('Database unavailable');}values.set(path,structuredClone(next));return {committed:true,snapshot:{val:()=>structuredClone(next)}};},set:async v=>{values.set(path,structuredClone(v));},update:async v=>{values.set(path,{...values.get(path),...v});}};}};}
const options=(db,send,extra={})=>({db,event,from:config.from,send,now:()=>now,...extra});

test('SMTP configuration requires encryption and never copies arbitrary transport options',()=>{
 const cfg=mail.configuration(JSON.stringify({...config,to:'outsider@example.test',ignoreTLS:true,tls:{rejectUnauthorized:false}}));
 assert.equal(cfg.transport.requireTLS,true);assert.equal(cfg.transport.secure,false);assert.equal(cfg.transport.tls.minVersion,'TLSv1.2');assert.equal(cfg.transport.tls.rejectUnauthorized,undefined);assert.equal(cfg.transport.to,undefined);assert.equal(cfg.transport.ignoreTLS,undefined);assert.equal(cfg.transport.debug,false);
 assert.equal(mail.configuration(JSON.stringify({...config,port:465})).transport.secure,true);
 for(const patch of [{port:25},{password:''},{host:'smtp://bad.test'},{from:'x@example.test\r\nBcc: other@example.test'}])assert.throws(()=>mail.configuration(JSON.stringify({...config,...patch})));
 assert.throws(()=>mail.configuration('null'));assert.throws(()=>mail.configuration('bad'));
});
test('notification includes contact, interest, source, Spanish dates and safe reply-to',()=>{
 const msg=mail.message({...inquiry,interest:'<script>alert(1)</script>\nMás información'},contact,config.from,mail.RECIPIENTS[0],'fixture');
 assert.equal(msg.to,mail.RECIPIENTS[0]);assert.equal(msg.replyTo.address,contact.email);assert.equal(msg.subject,'Nuevo interesado · Escuela');
 assert(msg.text.includes('26/10/2026 13:00 (Panamá)'));assert(msg.text.includes('Piloto privado'));assert(msg.text.includes('Celular: No proporcionado'));assert(msg.text.includes(contact.name));assert(msg.html.includes('&lt;script&gt;'));assert(!msg.html.includes('<script>'));assert.equal(msg.disableFileAccess,true);
 assert.equal(mail.panamaDate('2026-11-01T03:00:00Z'),'31/10/2026 22:00 (Panamá)');
 assert.equal(mail.message(inquiry,{...contact,email:'bad@example.test,other@example.test'},config.from,mail.RECIPIENTS[0],'x').replyTo,undefined);
});
test('both fixed recipients receive once despite duplicate and concurrent events',async()=>{
 const db=memory(),sent=[],send=async msg=>{sent.push(msg);return {accepted:[msg.to]};};
 const results=await Promise.allSettled([mail.deliver(options(db,send)),mail.deliver(options(db,send))]);assert(results.some(r=>r.status==='fulfilled'));
 await mail.deliver(options(db,send));assert.equal(sent.length,2);assert.deepEqual(sent.map(m=>m.to).sort(),[...mail.RECIPIENTS].sort());
 assert([...db.values.values()].every(v=>v.status==='sent'));assert(!JSON.stringify([...db.values.values()]).includes(contact.email));
});
test('a temporary failure retries only the remaining recipient',async()=>{
 const db=memory(),sent=[];let fail=true;
 const send=async msg=>{sent.push(msg.to);if(fail&&msg.to===mail.RECIPIENTS[1]){fail=false;throw {responseCode:451};}return {accepted:[msg.to]};};
 await assert.rejects(mail.deliver(options(db,send)),/reintento/);await mail.deliver(options(db,send));
 assert.deepEqual(sent,[...mail.RECIPIENTS,mail.RECIPIENTS[1]]);
});
test('permanent SMTP rejection is recorded while the second mailbox still receives',async()=>{
 const db=memory(),reports=[],sent=[];
 const send=async msg=>{sent.push(msg.to);if(msg.to===mail.RECIPIENTS[0])throw {responseCode:550,message:'private details'};return {accepted:[msg.to]};};
 await mail.deliver(options(db,send,{report:(code,id)=>reports.push({code,id})}));await mail.deliver(options(db,send));
 assert.equal(sent.length,2);assert([...db.values.values()].some(v=>v.status==='failed'));assert(!JSON.stringify(reports).includes('private details'));
});
test('ambiguous SMTP acceptance and interrupted receipts are held for review without resending',async()=>{
 const db=memory(),sent=[];await mail.deliver(options(db,async msg=>{sent.push(msg.to);throw {code:'ETIMEDOUT',command:'DATA'};}));
 await mail.deliver(options(db,async()=>{throw Error('must not send');}));assert.equal(sent.length,2);assert([...db.values.values()].every(v=>v.status==='review'));
 const interrupted=memory(),delivered=[];interrupted.failReceipt();const send=async msg=>{delivered.push(msg.to);return {accepted:[msg.to]};};
 await assert.rejects(mail.deliver(options(interrupted,send)),/Database/);
 await mail.deliver(options(interrupted,send,{now:()=>now+240001}));assert.deepEqual(delivered,[...mail.RECIPIENTS]);assert([...interrupted.values.values()].some(v=>v.status==='review'));
});
test('transient errors are bounded to eight attempts per recipient',async()=>{
 const db=memory();let attempts=0;const send=async()=>{attempts++;throw {responseCode:421};};
 for(let i=0;i<7;i++)await assert.rejects(mail.deliver(options(db,send)));
 await mail.deliver(options(db,send));await mail.deliver(options(db,send));assert.equal(attempts,16);assert([...db.values.values()].every(v=>v.status==='failed'));
});
test('original inquiry contact is used even if contact directory was edited',async()=>{
 const db=memory(),sent=[];db.values.set('prospects/contacts/'+contactId,{name:'Edited',email:'edited@example.test'});
 await mail.deliver(options(db,async msg=>{sent.push(msg);return {accepted:[msg.to]};}));assert(sent.every(m=>m.replyTo.address===contact.email));
 const legacy={...event,data:{val:()=>({...inquiry,contact:undefined})}},legacyDb=memory();legacyDb.values.set('prospects/contacts/'+contactId,contact);let count=0;
 await mail.deliver(options(legacyDb,async msg=>{count++;return {accepted:[msg.to]};},{event:legacy}));assert.equal(count,2);
});
test('new manual contact without inquiry text creates one event; editing notes creates none',async()=>{
 const db=memory(),record={...contact,areas:['school'],courses:[],version:0};
 await prospects.handle(db,'prospect-save',{record},{uid:'director'},new Date(now).toISOString());
 const key=prospects.hash(record.email),saved=db.values.get('prospects/contacts/'+key);
 assert.equal([...db.values.keys()].filter(k=>k.startsWith('prospects/inquiries/')).length,1);
 await prospects.handle(db,'prospect-save',{record:{...saved,notes:'Seguimiento'}},{uid:'director'},new Date(now+1000).toISOString());
 assert.equal([...db.values.keys()].filter(k=>k.startsWith('prospects/inquiries/')).length,1);
 await prospects.handle(db,'prospect-save',{record:{...db.values.get('prospects/contacts/'+key),interest:'Nueva consulta'}},{uid:'director'},new Date(now+2000).toISOString());
 const entries=[...db.values.entries()].filter(([k])=>k.startsWith('prospects/inquiries/'));assert.equal(entries.length,2);assert.deepEqual(entries[1][1].contact,contact);
});
test('webhook snapshots contact data and duplicate submissions reuse the same inquiry',async()=>{
 const db=memory(),p={...contact,areas:['school'],courses:['privado'],interest:'Consulta de prueba',formId:'form',submissionId:'submission',submittedAt:new Date(now).toISOString()};
 await prospects.receive(db,p,new Date(now).toISOString());await prospects.receive(db,p,new Date(now+1000).toISOString());
 const entries=[...db.values.entries()].filter(([k])=>k.startsWith('prospects/inquiries/'));assert.equal(entries.length,1);assert.deepEqual(entries[0][1].contact,contact);
});
test('trigger is create-only, server-side, private and does not depend on a browser session',async()=>{
 let registered,delivered=false,closed=false;const exports={};
 vm.runInNewContext(fs.readFileSync(require.resolve('../functions/prospect-email-trigger'),'utf8'),{exports,require:id=>({
  'firebase-functions/v2/database':{onValueCreated:(o,fn)=>{registered=o;return fn;}},'firebase-functions/params':{defineSecret:name=>({name,value:()=>JSON.stringify(config)})},'firebase-admin/database':{getDatabase:()=>({})},'firebase-functions/logger':{error(){}},
  './prospect-email':{configuration:mail.configuration,deliver:async args=>{delivered=true;assert(args.event===event);}},nodemailer:{createTransport:()=>({sendMail(){},close(){closed=true;}})}}[id])});
 assert.equal(registered.ref,'/prospects/inquiries/{contactId}/{inquiryId}');assert.equal(registered.secrets[0].name,'HP_PROSPECT_EMAIL_CONFIG');assert.equal(registered.retry,true);assert.equal(registered.minInstances,0);
 await exports.emailProspectInquiry(event);assert(delivered&&closed);
 const rules=JSON.parse(fs.readFileSync(require.resolve('../database.rules.json'),'utf8')).rules;assert.equal(rules['.read'],false);assert.equal(rules['.write'],false);assert.equal(rules.prospects,undefined);
});

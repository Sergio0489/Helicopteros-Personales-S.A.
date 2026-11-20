const test=require('node:test'),assert=require('node:assert/strict');
const {recipients,deliver}=require('../functions/itinerary-email');

const fixture={
 publication:{id:'modified-2026-10-31-1234567890abcdef',date:'2026-10-31',action:'updated',flights:[{aircraft:'HP-1784',model:'Piper Warrior',pilot:'Piloto Ficticio',start:'06:30',end:'09:30',route:'MPMG – Chitré – MPMG'}],pilotRecipients:['pilot@example.test','pilot@example.test','invalid-address']},
 accounts:{
  director:{assignedAt:'fixture',role:'Director'},
  pilot:{assignedAt:'fixture',role:'Piloto'},
  disabled:{assignedAt:'fixture',role:'Gerente'},
  unverified:{assignedAt:'fixture',role:'Administrativo'},
  merged:{assignedAt:'fixture',role:'Piloto',mergedInto:'replacement'},
  student:{assignedAt:'fixture',role:'Estudiante'},
  unassigned:{role:'Director'}
 },
 users:{
  director:{email:'director@example.test',emailVerified:true,disabled:false},
  pilot:{email:'pilot@example.test',emailVerified:true,disabled:false},
  disabled:{email:'disabled@example.test',emailVerified:true,disabled:true},
  unverified:{email:'unverified@example.test',emailVerified:false,disabled:false}
 }
};

test('modified schedule recipients include only deduplicated roster and verified active authorized accounts',async()=>{
 const lookups=[],auth={getUser:async uid=>{lookups.push(uid);return fixture.users[uid]||null;}};
 const targets=await recipients(fixture.publication,fixture.accounts,auth,'director');
 assert.deepEqual(targets,['director@example.test','pilot@example.test'].sort());
 assert.equal(new Set(targets).size,targets.length);
 assert.deepEqual(new Set(lookups),new Set(['director','pilot','disabled','unverified']));
 for(const excluded of ['disabled@example.test','unverified@example.test','student@example.test','merged@example.test','unassigned@example.test'])assert.ok(!targets.includes(excluded));
});

test('fake delivery sends a queued update once per authorized address and never duplicates a retry',async()=>{
 const auth={getUser:async uid=>fixture.users[uid]||null};
 const targets=await recipients(fixture.publication,fixture.accounts,auth,'director');
 const receipts=new Map(),sent=[],reported=[];let clock=100;
 const db={ref:path=>({transaction:async update=>{
  const old=receipts.get(path)||null,next=update(old);
  if(next===undefined)return {committed:false,snapshot:{val:()=>structuredClone(old)}};
  receipts.set(path,structuredClone(next));return {committed:true,snapshot:{val:()=>structuredClone(next)}};
 }})};
 const event={params:{publicationId:fixture.publication.id},data:{val:()=>fixture.publication}};
 const send=async message=>{sent.push(message);return {accepted:[message.to]};};
 const options={db,event,from:'scheduling@example.test',recipients:targets,send,report:(code,id)=>reported.push({code,id}),now:()=>++clock};
 await deliver(options);await deliver(options);
 assert.deepEqual(sent.map(m=>m.to).sort(),targets);
 assert.equal(new Set(sent.map(m=>m.to)).size,sent.length);
 assert.deepEqual(reported,[]);
 assert.equal(receipts.size,targets.length);
});

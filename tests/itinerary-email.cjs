const test=require('node:test');
const assert=require('node:assert/strict');
const service=require('../functions/itinerary-service');
const email=require('../functions/itinerary-email');

function database(data){
 let root={payload:JSON.stringify(data),operation:'fictional-start',revision:1};
 return {
  get value(){return structuredClone(root);},
  ref(path){
   assert.equal(path,'dashboard');
   return {transaction:async callback=>{
    const next=callback(structuredClone(root));
    if(next===undefined)return {committed:false,snapshot:{val:()=>root}};
    root=next;return {committed:true,snapshot:{val:()=>structuredClone(root)}};
   }};
  }
 };
}

test('Director draft is queued once for tomorrow without publishing',async()=>{
 const db=database({itinerary:{version:1,config:{},days:{},notices:[]},fleet:{},itinerarios:[],pilotos:[],school:{}});
 const now='2026-11-23T20:00:00-05:00',id='draft-2026-11-24';
 await service.scheduledDraft(db,now);
 const data=JSON.parse(db.value.payload),draft=db.value.itineraryEmailOutbox[id];
 assert.equal(draft.draft,true);
 assert.deepEqual(draft.pilotRecipients,[]);
 assert.equal(data.itinerary.days['2026-11-24'].draftEmail.id,id);
 assert.equal(data.itinerary.days['2026-11-24'].published,false);
 const saved=db.value;
 await service.scheduledDraft(db,now);
 assert.deepEqual(db.value,saved);
});

test('draft recipient resolver returns only the verified Director',async()=>{
 const auth={
  getUser:async uid=>({uid,email:'director@example.test',emailVerified:true,disabled:false}),
  listUsers:async()=>{throw Error('Draft must not enumerate users.');}
 };
 const recipients=await email.recipients(
  {id:'draft-2026-11-24',date:'2026-11-24',draft:true,pilotRecipients:['pilot@example.test']},
  {pilot:{email:'pilot@example.test'}},auth,'director-fictional'
 );
 assert.deepEqual(recipients,['director@example.test']);
});

test('draft and published schedules render aircraft cards in three columns',()=>{
 const flight={aircraft:'HP-1784',model:'Piper Warrior',pilot:'Piloto Ficticio',student:'Estudiante Ficticio',start:'08:00',end:'11:00',type:'Privado',route:'MPMG - Chitré - MPMG'};
 for(const publication of [
  {id:'draft-2026-11-24',date:'2026-11-24',draft:true,flights:[flight]},
  {id:'publication-2026-11-24',date:'2026-11-24',flights:[flight]}
 ]){
  const message=email.message(publication,'noreply@example.test','director@example.test');
  assert.match(message.html,/class="hp-aircraft-cell"/);
  assert.equal((message.html.match(/class="hp-aircraft-cell"/g)||[]).length,3);
  assert.match(message.html,/Piloto Ficticio/);
  assert.match(message.html,/Estudiante Ficticio/);
  assert.match(message.html,/@media\(max-width:700px\)/);
  if(publication.draft)assert.match(message.subject,/BORRADOR/);
  else assert.match(message.subject,/Horario de vuelo publicado/);
 }
});

test('empty schedule still renders a readable email',()=>{
 const message=email.message({id:'draft-2026-11-24',date:'2026-11-24',draft:true,flights:[]},'noreply@example.test','director@example.test');
 assert.match(message.html,/No hay vuelos programados/);
});

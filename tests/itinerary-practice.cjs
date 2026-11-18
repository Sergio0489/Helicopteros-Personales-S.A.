const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../functions/itinerary-practice'),M=require('../functions/itinerary-model');
const I=require('../functions/itinerary-email');
function db(data){
 let dashboard={payload:JSON.stringify(data),operation:'before',revision:1};const mail={};
 const ref=path=>({get:async()=>({val:()=>path==='dashboard'?structuredClone(dashboard):structuredClone(mail[path.split('/')[1]]||null)}),transaction:async cb=>{
  if(path==='dashboard'){const next=cb(structuredClone(dashboard));if(next===undefined)return {committed:false,snapshot:{val:()=>dashboard}};dashboard=next;return {committed:true,snapshot:{val:()=>structuredClone(dashboard)}};}
  const id=path.split('/')[1],next=cb(structuredClone(mail[id]||null));if(next===undefined)return {committed:false,snapshot:{val:()=>mail[id]||null}};mail[id]=next;return {committed:true,snapshot:{val:()=>structuredClone(next)}};
 }});
 return {ref,get data(){return JSON.parse(dashboard.payload);},get emailOutbox(){return structuredClone(dashboard.itineraryEmailOutbox||{});},get mail(){return structuredClone(mail);}};
}
const director={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:'yes'},director:true};
const date=M.E.panamaClock(new Date()).tomorrow;
function fixture(){return {fleet:{HP_1784:{status:'operativo'},HP_1819:{status:'mantenimiento'}},itinerarios:[{id:'real-flight',fecha:date,aeronave:'HP-1784',piloto:'Piloto real'}],pilotos:[],school:{students:[]}};}

test('practice read shows simulated fleet without mutating live schedule',async()=>{
 const d=db(fixture()),before=d.data.itinerarios;
 const result=await S.handle(d,director,{action:'itinerary-practice-read',date});
 assert.deepEqual(result.state.aircraft.filter(a=>a.status==='operativo').map(a=>a.id),['HP1784']);
 assert.equal(result.state.aircraft.find(a=>a.id==='HP1819').status,'mantenimiento');
 assert.equal(result.state.confirmed.length,0);assert.deepEqual(d.data.itinerarios,before);
});

test('director aircraft status is practice-only and readers cannot change it',async()=>{
 const d=db(fixture());
 await S.handle(d,director,{action:'itinerary-practice-status',aircraft:'HP1819',status:'operativo'});
 assert.equal(d.data.itineraryPractice.aircraftStatus.HP1819,'operativo');
 assert.equal(d.data.fleet.HP_1819.status,'mantenimiento');
 await assert.rejects(()=>S.handle(d,{...director,director:false,account:{role:'Piloto',assignedAt:'yes'}},{action:'itinerary-practice-status',aircraft:'HP1784',status:'grounded'}),/Solo el Director/);
 await assert.rejects(()=>S.handle(d,{...director,account:{...director.account,identityReviewPending:true}},{action:'itinerary-practice-read',date}),/pendiente de revisión/);
});

test('practice publication stays outside real flights and creates simulation email outbox',async()=>{
 const d=db(fixture());
 const result=await S.handle(d,director,{action:'itinerary-practice-command',command:'publish',date,revision:0,configurationRevision:0,actionId:'practice-publish-0001'});
 assert.equal(result.state.published,true);assert.deepEqual(d.data.itinerarios,fixture().itinerarios);
 const messages=Object.values(d.emailOutbox);assert.equal(messages.length,1);assert.equal(messages[0].practice,true);assert.match(messages[0].id,/^practice-/);
});

test('practice publication email reaches all verified accounts and is unmistakably marked',async()=>{
 const pages=[{users:[{uid:'pilot',email:'pilot@example.test',emailVerified:true,disabled:false},{uid:'student',email:'student@example.test',emailVerified:true,disabled:false},{uid:'disabled',email:'off@example.test',emailVerified:true,disabled:true}],pageToken:null}];
 const recipients=await I.recipients({practice:true},{}, {listUsers:async()=>pages.shift()},'director');
 assert.deepEqual(recipients,['pilot@example.test','student@example.test']);
 const message=I.message({id:'practice-'+date+'-practice-publish-0001',date,practice:true,flights:[]},'app@example.test','pilot@example.test');
 assert.match(message.subject,/SIMULACIÓN/);assert.match(message.text,/no es un horario oficial y no reserva vuelos/i);assert.match(message.html,/SIMULACIÓN DE REUNIÓN/);
});

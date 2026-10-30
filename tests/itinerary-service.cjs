const test=require('node:test'),assert=require('node:assert/strict'),S=require('../functions/itinerary-service'),M=require('../functions/itinerary-model');
function database(data){
 let root={payload:JSON.stringify(data),operation:'original',revision:1},transactions=0;
 return {
  get value(){return structuredClone(root);},get transactions(){return transactions;},
  ref(path){
   assert.equal(path,'dashboard');
   return {
    get:async()=>({val:()=>structuredClone(root)}),
    transaction:async cb=>{
     transactions++;assert.equal(cb(null),null,'cold transaction must retry');
     const next=cb(structuredClone(root));
     if(next===undefined)return {committed:false,snapshot:{val:()=>root}};
     root=next;return {committed:true,snapshot:{val:()=>structuredClone(root)}};
    }
   };
  }
 };
}
const actor={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:'yes'},director:true};
test('activation is idempotent, preserves permission boxes and existing flights',async()=>{const data={fleet:{},itinerarios:[{id:'keep',fecha:'2030-01-02'}],pilotos:[],school:{accessConfiguration:{roles:{Piloto:{itinerario:{actions:{view:true},areas:{Calendario:true},boxes:{flights:{view:true,edit:false}}}}}}}},db=database(data);const a=await S.handle(db,actor,{action:'itinerary-read',date:'2030-01-02'}),b=await S.handle(db,actor,{action:'itinerary-read',date:'2030-01-02'});assert.equal(a.operation,b.operation);const stored=JSON.parse(db.value.payload);assert.deepEqual(stored.itinerarios,data.itinerarios);const p=stored.school.accessConfiguration.roles.Piloto.itinerario;assert.equal(p.boxes.requests.edit,true);assert.equal(p.boxes.flights.edit,false);assert.equal(p.boxes.create.edit,false);});
test('service validates in a transaction, journals save and rejects stale edits atomically',async()=>{const data={fleet:{HP_1784:{status:'operativo'}},pilotos:[{id:'p',nombre:'Piloto Prueba'}],itinerarios:[],school:{students:[]}},db=database(data),date=M.E.panamaClock(new Date()).tomorrow;await S.handle(db,actor,{action:'itinerary-read',date});const body={action:'itinerary-command',command:'flight',date,revision:0,actionId:'service-save-001',flight:{aircraft:'HP1784',pilot:'p',start:'06:30',end:'09:30',flightType:'privado'}};await S.handle(db,actor,body);const saved=db.value;assert.equal(JSON.parse(saved.payload).itinerarios.length,1);assert.ok(saved.auditPending);await S.handle(db,actor,body);assert.deepEqual(db.value,saved);await assert.rejects(()=>S.handle(db,actor,{...body,actionId:'service-save-002'}),/cambió/);assert.deepEqual(db.value,saved);});
test('daily task ignores inactive integration and publishes once per scheduled date',async()=>{const data={fleet:{},itinerarios:[],school:{}},db=database(data);await S.scheduled(db,'2026-10-30T20:15:00-05:00');assert.equal(JSON.parse(db.value.payload).itinerary,undefined);await S.handle(db,actor,{action:'itinerary-read',date:'2026-10-31'});await S.scheduled(db,'2026-10-30T20:15:00-05:00');const saved=db.value;await S.scheduled(db,'2026-10-30T20:15:00-05:00');assert.deepEqual(db.value,saved);assert.equal(JSON.parse(saved.payload).itinerary.notices[0].date,'2026-10-31');});

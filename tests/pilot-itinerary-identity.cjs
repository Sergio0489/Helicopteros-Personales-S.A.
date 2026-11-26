'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../functions/itinerary-model');
const date='2030-06-15',editDate='2030-06-16',now='2030-06-15T12:05:00-05:00';
const pilotPolicy={itinerario:{actions:{view:true,edit:true},areas:{Calendario:true,'Programación de vuelos':true,'Solicitudes de vuelos':true},boxes:{planner:{view:true},flights:{view:true,edit:false},create:{view:true,edit:true},requests:{view:true,edit:true}}}};
function fleet(){return Object.fromEntries(M.E.fleet.map(([id])=>[id==='HP1186'?id:id.replace(/^HP/,'HP_'),{status:'operativo',serial:'FICTICIO'}]));}
function flightRequest(id,pilot,aircraft,start,end,created){return {id,pilot,aircraft,start,end,slot:'b1',flightType:'privado',route:'MPMG - MPCE - MPMG',note:'',studentId:'student:identity-fixture',studentName:'Estudiante Ficticio',created,status:'pending'};}
function fixture(){
 const pilots=[
  {authUid:'pilot-ana',email:'ana@example.test',nombre:'Ana Ficticia',medico:'2035-12-31'},
  {authUid:'pilot-beto',email:'beto@example.test',nombre:'Beto Ficticio',medico:'2035-12-31'},
  {authUid:'pilot-cami',email:'cami@example.test',nombre:'Cami Ficticia',medico:'2035-12-31'}
 ];
 return {
  fleet:fleet(),pilotos:pilots,
  itinerarios:[
   {id:'flight-ana',fecha:date,aeronave:'HP-1907',piloto:'Ana Ficticia',horaInicio:'06:30',horaFin:'09:30',schedule:{pilot:'legacy-pilot-0',start:'06:30',end:'09:30',flightType:'privado',fixed:true}},
   {id:'flight-beto-legacy',fecha:date,aeronave:'HP-1819',piloto:'Beto Ficticio',horaInicio:'09:30',horaFin:'11:00'}
  ],
  school:{students:[{id:'identity-fixture',name:'Estudiante Ficticio',courses:[],stage:'Interesado'}],registry:{clients:[]},accessConfiguration:{roles:{Piloto:structuredClone(pilotPolicy)}}},
  itinerary:{version:1,config:{revision:9,aircraft:{HP1907:{pilots:['legacy-pilot-1','legacy-pilot-0','legacy-pilot-2']}}},days:{
   [date]:{revision:4,nightEnabled:false,published:true,requests:[
    flightRequest('request-ana','legacy-pilot-0','HP1819','07:00','08:30',1),
    flightRequest('request-beto','legacy-pilot-1','HP1907','12:30','14:00',2),
    flightRequest('request-deleted-cami','legacy-pilot-2','HP1907','15:00','16:30',3)
   ],held:[{id:'held-cami',pilot:'legacy-pilot-2',aircraft:'HP1907',start:'16:30',end:'18:00',flightType:'privado',fixed:true}],cancelled:[],cancelledFlights:[{id:'cancel-ana',pilot:'legacy-pilot-0'}],openSlots:[],results:[{id:'request-beto',pilot:'legacy-pilot-1',status:'waiting'}]},
   [editDate]:{revision:3,nightEnabled:false,published:false,requests:[flightRequest('request-beto-edit','legacy-pilot-1','HP1907','12:30','14:00',4)],held:[],cancelled:[],cancelledFlights:[],openSlots:[],results:[]}
  },notices:[{id:'notice-ana',createdAt:new Date().toISOString(),recipients:[{kind:'pilot',id:'legacy-pilot-0'}],before:{pilot:'legacy-pilot-0'},after:{pilot:'legacy-pilot-1'}}]}
 };
}
function endpointHarness(data){
 const user={uid:'test-director',email:'director@example.test',emailVerified:true,disabled:false};
 const store={dashboard:{schemaVersion:1,operation:'fixture-operation-1',revision:1,payload:JSON.stringify(data)},accountRequests:{'test-director':{role:'Director',assignedAt:'fixture',profile:{name:'Directora Ficticia'}}}};
 let transactions=0;
 const get=route=>route.split('/').filter(Boolean).reduce((v,k)=>v?.[k],store)??null;
 const put=(route,value)=>{const keys=route.split('/').filter(Boolean),last=keys.pop();let target=store;for(const key of keys)target=target[key]||={};target[last]=value;};
 const db={ref:(route='')=>{const ref={
  get:async()=>({val:()=>structuredClone(get(route))}),
  transaction:async update=>{transactions++;const current=structuredClone(get(route)),next=update(current);if(next===undefined)return {committed:false,snapshot:{val:()=>current}};put(route,next);return {committed:true,snapshot:{val:()=>structuredClone(next)}};},
  update:async changes=>{for(const [key,value]of Object.entries(changes))put([route,key].filter(Boolean).join('/'),value);}
 };for(const name of ['orderByKey','startAt','endAt','endBefore','limitToLast'])ref[name]=()=>ref;return ref;}};
 const exports={};
 const localRequire=require;
 const moduleRequire=name=>({
  'firebase-functions/v2/https':{onRequest:(_,handler)=>handler},
  'firebase-admin/app':{initializeApp(){}},
  'firebase-admin/auth':{getAuth:()=>({verifyIdToken:async()=>({uid:user.uid}),getUser:async()=>user})},
  'firebase-admin/database':{getDatabase:()=>db}
 }[name]||localRequire(name.startsWith('./')?path.join(__dirname,'../functions',name.slice(2)):name));
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../functions/index.js'),'utf8'),{Buffer,exports,require:moduleRequire});
 async function save(payload,operation=store.dashboard.operation){
  let status=200,body;const response={set(){},status(code){status=code;return response;},json(value){body=value;},end(){}};
  await exports.accountRegistration({method:'POST',headers:{authorization:'Bearer fixture'},body:{action:'director-save',payload:JSON.stringify(payload),operation,reason:'Prueba ficticia de migración de identidades'}},response);
  return {status,body};
 }
 return {store,save,transactions:()=>transactions};
}
function reorderDeleteOne(data){
 const [ana,beto]=data.pilotos;
 data.pilotos=[{...beto},{...ana}];
 return data;
}
test('director save migrates pending requests, published flights, priorities, notices and ownership in the same transaction',async()=>{
 const initial=fixture(),h=endpointHarness(initial),submitted=reorderDeleteOne(structuredClone(initial));
 const saved=await h.save(submitted);
 assert.equal(saved.status,200,JSON.stringify(saved.body));
 assert.equal(h.transactions(),1);
 const data=JSON.parse(h.store.dashboard.payload),ana=data.pilotos.find(p=>p.authUid==='pilot-ana'),beto=data.pilotos.find(p=>p.authUid==='pilot-beto');
 assert.ok(ana.id&&beto.id);assert.notEqual(ana.id,beto.id);
 assert.deepEqual(data.itinerary.config.aircraft.HP1907.pilots,[beto.id,ana.id,'legacy-pilot-2']);
 assert.equal(data.itinerary.config.revision,10);
 const day=data.itinerary.days[date];assert.equal(day.revision,5);
 assert.deepEqual(day.requests.map(q=>q.pilot),[ana.id,beto.id,'legacy-pilot-2']);
 assert.equal(day.held[0].pilot,'legacy-pilot-2');
 assert.equal(day.cancelledFlights[0].pilot,ana.id);
 assert.equal(day.results[0].pilot,beto.id);
 assert.equal(data.itinerary.notices[0].recipients[0].id,ana.id);
 assert.equal(data.itinerary.notices[0].before.pilot,ana.id);
 assert.equal(data.itinerary.notices[0].after.pilot,beto.id);
 assert.equal(data.itinerarios.find(f=>f.id==='flight-ana').schedule.pilot,ana.id);
 assert.equal(data.itinerarios.find(f=>f.id==='flight-beto-legacy').pilotId,beto.id);
 const state=M.stateFor(data,date,now),simulated=M.E.simulate(state),anaResult=simulated.results.find(q=>q.id==='request-ana');
 assert.equal(anaResult.status,'assigned');const anaAssignment=simulated.assignments.find(q=>q.sourceRequestId==='request-ana');assert.equal(anaAssignment.pilot,ana.id);assert.ok(M.E.minutes(anaAssignment.start)>=M.E.minutes('09:30'));assert.equal(M.E.overlaps(anaAssignment,state.confirmed.find(q=>q.id==='flight-ana')),false);
 const actor={user:{uid:'pilot-beto',email:'beto@example.test',emailVerified:true},account:{role:'Piloto',assignedAt:'fixture'},director:false};
 assert.equal(M.scope(data,actor).pilot,beto.id);
 const editDay=data.itinerary.days[editDate];assert.equal(editDay.revision,4);
 const updated=M.apply(data,actor,{date:editDate,command:'request',actionId:'update-own-request-fictitious-01',id:'request-beto-edit',revision:editDay.revision,flight:{aircraft:'HP1907',pilot:'legacy-pilot-0',start:'12:30',end:'14:00',slot:'b3',flightType:'privado',route:'MPMG - MPCE - MPMG',note:'',studentId:'student:identity-fixture',studentName:'Estudiante Ficticio'}},now);
 assert.equal(updated.duplicate,false);
 const own=data.itinerary.days[editDate].requests.find(q=>q.id==='request-beto-edit');
 assert.equal(own.pilot,beto.id);assert.equal(own.start,'12:30');
 assert.equal(data.itinerary.days[date].requests.find(q=>q.id==='request-deleted-cami').pilot,'legacy-pilot-2');
});
test('ambiguous legacy name flight stays unresolved after a duplicate pilot is deleted and migration is repeated',async()=>{
 const data=fixture();data.pilotos=[
  {authUid:'pilot-removed',email:'removed@example.test',nombre:'Nombre Repetido'},
  {authUid:'pilot-current',email:'current@example.test',nombre:'Nombre Repetido'}
 ];data.itinerarios=[{fecha:date,aeronave:'HP-1907',piloto:'Nombre Repetido',horaInicio:'06:30',horaFin:'08:00'}];
 data.itinerary.days[date]={revision:2,published:true,requests:[],held:[],cancelled:[],cancelledFlights:[],openSlots:[],results:[]};
 const h=endpointHarness(data),submitted=structuredClone(data);submitted.pilotos=[{...data.pilotos[1]}];
 const first=await h.save(submitted);assert.equal(first.status,200,JSON.stringify(first.body));
 let migrated=JSON.parse(h.store.dashboard.payload);
 const surviving=migrated.pilotos[0],flight=migrated.itinerarios[0];
 assert.ok(surviving.id);assert.equal(flight.pilotId,undefined);assert.equal(flight.pilotIdentityUnresolved,true);
 assert.equal(M.stateFor(migrated,date,now).confirmed[0].pilot,'legacy-name:Nombre Repetido');
 const stable=structuredClone(migrated),second=await h.save(migrated,h.store.dashboard.operation);
 assert.equal(second.status,200,JSON.stringify(second.body));
 migrated=JSON.parse(h.store.dashboard.payload);
 assert.deepEqual(migrated.itinerarios,stable.itinerarios);
 assert.equal(migrated.pilotos[0].id,surviving.id);
 assert.equal(M.stateFor(migrated,date,now).confirmed[0].pilot,'legacy-name:Nombre Repetido');
});
test('a protected itinerary edit aborts pilot and itinerary migration together',async()=>{
 const initial=fixture(),h=endpointHarness(initial),submitted=reorderDeleteOne(structuredClone(initial));
 submitted.itinerarios[0].horaInicio='00:00';
 const saved=await h.save(submitted);
 assert.equal(saved.status,409);
 assert.equal(h.transactions(),1);
 assert.deepEqual(JSON.parse(h.store.dashboard.payload),initial);
 assert.equal(h.store.dashboard.operation,'fixture-operation-1');
});


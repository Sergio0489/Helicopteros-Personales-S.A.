'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../functions/itinerary-engine'),M=require('../functions/itinerary-model'),initial=require('./fixtures/itinerary-initial.cjs');
const base=()=>{const state=initial();state.requests=[];state.confirmed=[];return state;};
const request=(id='q1',pilot='a',type='privado',aircraft='HP1907')=>({id,pilot,flightType:type,aircraft,slot:'b1',start:'06:30',end:'09:30',route:'Ruta ficticia',note:'Solicitud ficticia',created:Number(id.slice(1))||1});
const assigned=result=>result.results.filter(q=>q.status==='assigned');
test('an available compatible aircraft requested without competition is retained',()=>{
 const state=base();state.requests=[request()];const before=structuredClone(state),result=E.simulate(state);
 assert.equal(assigned(result)[0].assignedAircraft,'HP1907');assert.match(assigned(result)[0].reason,/aeronave solicitada/);assert.deepEqual(state,before);
});
test('historical aircraft priority overrides an unopposed preference only at three complete idle days',()=>{
 for(const [idleDays,wanted]of [[undefined,'HP1907'],[2,'HP1907'],[3,'HP1784']]){
  const state=base();state.requests=[request()];state.aircraft.find(a=>a.id==='HP1784').idleDays=idleDays;
  const result=E.simulate(state);assert.equal(assigned(result)[0].assignedAircraft,wanted,String(idleDays));if(idleDays===3)assert.match(assigned(result)[0].reason,/3 días sin vuelos/);
 }
});
test('competition for the first-priority aircraft can use lower-ranked eligible alternatives',()=>{
 const state=base();state.requests=[request('q1','a','privado','HP1784'),request('q2','b','privado','HP1784')];
 const result=E.simulate(state);assert.equal(assigned(result).length,2);assert.deepEqual(assigned(result).map(q=>q.assignedAircraft),['HP1784','HP1819']);
 assert(assigned(result).every(q=>q.start==='06:30'&&q.end==='09:30'));
});
test('accepted requests outside the type list are allocated to allowed aircraft rather than waiting without a capacity conflict',()=>{
 for(const [type,preferred,wanted,custom]of [['ifr','HP1907','HP1579'],['solo','HP1579','HP1819'],['privado','HP1784','HP1907',['HP1907']]]){
  const state=base(),q=request('q1','a',type,preferred);if(custom)state.typeRules[type]=custom;state.requests=[q];
  assert.equal(E.requestError(state,q),'',type);const result=E.simulate(state);assert.equal(assigned(result)[0]?.assignedAircraft,wanted,type);assert(E.allowedForType(state,type).includes(assigned(result)[0].assignedAircraft));assert.match(assigned(result)[0].reason,/no disponible para este tipo/);
 }
});
test('loss of availability after a request keeps status unchanged and uses a free compatible aircraft',()=>{
 const state=base(),q=request();assert.equal(E.requestError(state,q),'');state.requests=[q];state.aircraft.find(a=>a.id==='HP1907').status='grounded';
 const before=structuredClone(state),result=E.simulate(state);assert.equal(assigned(result)[0]?.assignedAircraft,'HP1784');assert.equal(assigned(result)[0].conditional,false);assert.deepEqual(state,before);
});
test('a Director-approved fixed flight keeps its exact assignment while another pending pilot can use an alternative',()=>{
 const state=base(),fixed={...request('fixed1','b'),fixed:true,createdByRole:'director'};state.confirmed=[fixed];state.requests=[request()];
 const result=E.simulate(state);assert.deepEqual(result.assignments.find(q=>q.id==='fixed1'),fixed);assert.equal(assigned(result)[0]?.assignedAircraft,'HP1784');
});
test('fallback never broadens the type list or allocates an unavailable aircraft',()=>{
 const state=base();state.requests=[request('q1','a','ifr')];state.aircraft.find(a=>a.id==='HP1579').status='grounded';state.aircraft.find(a=>a.id==='HP1815').status='mantenimiento';
 const result=E.simulate(state);assert.equal(assigned(result).length,0);assert.equal(result.results[0].status,'waiting');assert.equal(result.assignments.length,0);
});
test('server history calculates idle days from positive past flight records before applying aircraft priority',()=>{
 for(const [last,days,wanted]of [['2026-11-14',2,'HP1907'],['2026-11-13',3,'HP1784']]){
  const data={fleet:{HP_1784:{status:'operativo',bitacora_horas:[{fecha:last,hv:1},{fecha:'2026-11-16',hv:0},{fecha:'2026-11-18',hv:2}]},HP_1907:{status:'operativo'}},pilotos:[{id:'a',nombre:'Piloto Ficticio'}],itinerarios:[],school:{students:[],registry:{clients:[]}}};
  const before=structuredClone(data),state=M.stateFor(data,'2026-11-17','2026-11-16T13:00:00-05:00');assert.equal(state.aircraft.find(a=>a.id==='HP1784').idleDays,days);state.requests=[request()];assert.equal(assigned(E.simulate(state))[0]?.assignedAircraft,wanted);assert.deepEqual(data,before);
 }
});

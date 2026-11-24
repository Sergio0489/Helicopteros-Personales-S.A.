'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../functions/itinerary-model'),mail=require('../functions/itinerary-email');

const now='2026-11-24T10:00:00-05:00',date='2026-11-25';
const policy={itinerario:{actions:{view:true,edit:true},areas:{Calendario:true,'Programación de vuelos':true,'Solicitudes de vuelos':true},boxes:{planner:{view:true},flights:{view:true,edit:false},create:{view:true,edit:true},requests:{view:true,edit:true}}}};
const director={user:{uid:'director',email:'director@example.test',emailVerified:true},account:{role:'Director',assignedAt:now},director:true};
const pilot={user:{uid:'p1',email:'p1@example.test',emailVerified:true},account:{role:'Piloto',assignedAt:now},director:false};
function fixture(){
 const d={fleet:Object.fromEntries(M.E.fleet.map(([id])=>[id==='HP1186'?id:id.replace(/^HP/,'HP_'),{status:'operativo'}])),pilotos:[{id:'p1',nombre:'Piloto Uno',email:'p1@example.test',medico:'2027-12-31'},{id:'p2',nombre:'Piloto Dos',email:'p2@example.test',medico:'2027-12-31'}],itinerarios:[],school:{students:[{id:'s1',name:'Estudiante Uno'}],registry:{clients:[]},accessConfiguration:{roles:{Piloto:structuredClone(policy),Administrativo:structuredClone(policy),Estudiante:structuredClone(policy)}}},itinerary:{version:1,config:{},days:{},notices:[]}};
 d.school.personnel=[{position:'Mecánico',email:'mechanic-list@example.test'}];return d;
}
let sequence=0;
function request(d){
 M.apply(d,pilot,{date,command:'request',actionId:'maintenance-test-'+(++sequence).toString().padStart(12,'0'),revision:M.day(d,date).revision,flight:{aircraft:'HP1907',pilot:'p1',start:'06:30',end:'09:30',slot:'b1',flightType:'privado',route:'MPMG - MPCE - MPMG',studentId:'student:s1',studentName:'Estudiante Uno',note:''}},now);
 M.publish(d,date,now);
}
test('maintenance immediately alerts the required roles and reassigns only to a free aircraft at the same time',()=>{
 const d=fixture();request(d);assert.equal(d.itinerarios.length,1);d.itinerarios.push({id:'independent-flight',fecha:date,aeronave:'HP-1815',piloto:'Piloto Dos',horaInicio:'06:30',horaFin:'09:30',tipo:'Privado',ruta:'MPMG - MPDA - MPMG',schedule:{id:'independent-flight',aircraft:'HP1815',pilot:'p2',start:'06:30',end:'09:30',slot:'b1',flightType:'privado',studentName:'Cliente Diferente'}});
 const original=structuredClone(d.itinerarios[0]),before=structuredClone(d);d.fleet.HP_1907.status='mantenimiento';const events=[];
 assert.equal(M.reconcile(before,d,now,events),true);assert.equal(events.length,1);
 const alert=events[0];assert.deepEqual(alert.notificationRoles,['Director','Piloto','Mecánico']);assert.deepEqual(alert.pilotRecipients,['p1@example.test','p2@example.test']);assert.deepEqual(alert.mechanicRecipients,['mechanic-list@example.test']);
 assert.equal(alert.aircraftStatus.aircraft,'HP-1907');assert.equal(alert.aircraftStatus.status,'mantenimiento');
 assert.equal(alert.followups.length,1);const updated=alert.followups[0];assert.equal(updated.action,'updated');assert.equal(updated.notificationRoles.join(','),'Director,Piloto,Mecánico');
 const moved=d.itinerarios.find(f=>f.id===original.id);assert.notEqual(moved.aeronave,original.aeronave);assert.equal(moved.horaInicio,original.horaInicio);assert.equal(moved.horaFin,original.horaFin);assert.equal(moved.schedule.relocation.from,'HP1907');
 assert.equal(updated.flights.find(f=>f.pilot==='Piloto Uno').relocationFrom,original.aeronave);
 assert.ok(d.operationalNotices.some(n=>n.kind==='aircraft-status'&&n.aircraft==='HP-1907'));
});
test('restoring operations republishes the original aircraft and preserves pilot and time if the slot is still free',()=>{
 const d=fixture();request(d);const original=structuredClone(d.itinerarios[0]);let before=structuredClone(d);d.fleet.HP_1907.status='grounded';let events=[];M.reconcile(before,d,now,events);
 assert.notEqual(d.itinerarios[0].aeronave,original.aeronave);
 before=structuredClone(d);d.fleet.HP_1907.status='operativo';events=[];assert.equal(M.reconcile(before,d,now,events),true);
 const restored=d.itinerarios.find(f=>f.id===original.id);assert.equal(restored.aeronave,original.aeronave);assert.equal(restored.piloto,original.piloto);assert.equal(restored.horaInicio,original.horaInicio);assert.equal(restored.horaFin,original.horaFin);
 assert.equal(restored.schedule.relocation,undefined);assert.equal(events.length,1);assert.equal(events[0].aircraftStatus.restoring,true);assert.equal(events[0].followups.length,1);assert.equal(events[0].followups[0].flights[0].aircraft,original.aeronave);
});
test('restoration does not reclaim the original slot when another published flight now occupies it',()=>{
 const d=fixture();request(d);const original=structuredClone(d.itinerarios[0]);let before=structuredClone(d);d.fleet.HP_1907.status='mantenimiento';M.reconcile(before,d,now,[]);
 d.itinerarios.push({id:'fictional-overlap',fecha:date,aeronave:'HP-1907',piloto:'Piloto Dos',horaInicio:original.horaInicio,horaFin:original.horaFin,tipo:'Privado',ruta:'MPMG - MPDA - MPMG',schedule:{id:'fictional-overlap',aircraft:'HP1907',pilot:'p2',start:original.horaInicio,end:original.horaFin,slot:'b1',flightType:'privado'}});
 before=structuredClone(d);d.fleet.HP_1907.status='operativo';const events=[];M.reconcile(before,d,now,events);
 const moved=d.itinerarios.find(f=>f.id===original.id),overlap=d.itinerarios.find(f=>f.id==='fictional-overlap');assert.notEqual(moved.aeronave,original.aeronave);assert.equal(overlap.aeronave,original.aeronave);assert.equal(moved.schedule.relocationPending,true);
 assert.ok(d.itinerary.notices.some(n=>n.kind==='review'&&n.after?.id===original.id));
});
test('status mail reaches pilots, mechanics and director, while student accounts are excluded; schedule is marked red',async()=>{
 const publication={id:'aircraft-status-2026-11-24-test-event123456',date:'2026-11-24',notificationType:'aircraft-status',notificationRoles:['Director','Piloto','Mecánico'],pilotRecipients:['pilot-list@example.test'],mechanicRecipients:['mechanic@example.test'],aircraftStatus:{aircraft:'HP-1815',status:'mantenimiento',previous:'operativo'},flights:[]};
 const accounts={director:{role:'Director',assignedAt:now},pilot1:{role:'Piloto',assignedAt:now},mech:{role:'Mecánico',assignedAt:now},student:{role:'Estudiante',assignedAt:now},old:{role:'Mecánico',mergedInto:'mech'}};
 const users={director:{email:'director@example.test',emailVerified:true},pilot1:{email:'pilot@example.test',emailVerified:true},mech:{email:'mechanic@example.test',emailVerified:true},student:{email:'student@example.test',emailVerified:true},old:{email:'old@example.test',emailVerified:true}};
 const targets=await mail.recipients(publication,accounts,{getUser:async uid=>{if(!users[uid])throw Error('missing');return users[uid];}},'director');
 assert.deepEqual(targets,['director@example.test','mechanic@example.test','pilot-list@example.test','pilot@example.test'].sort());
 const statusMessage=mail.message(publication,'sender@example.test','director@example.test');assert.match(statusMessage.subject,/MANTENIMIENTO/);assert.match(statusMessage.html,/ALERTA OPERATIVA/);
 const updated=mail.message({...publication,id:'modified-2026-11-24-123456789012',notificationType:undefined,action:'updated',flights:[{aircraft:'HP-1784',aircraftStatus:'operativo',relocationFrom:'HP-1815',model:'Piper Warrior',pilot:'Piloto Uno',start:'06:30',end:'09:30',type:'Privado'}]},'sender@example.test','pilot@example.test');
 assert.match(updated.html,/REUBICADO POR MANTENIMIENTO/);assert.match(updated.html,/MANTENIMIENTO/);
});

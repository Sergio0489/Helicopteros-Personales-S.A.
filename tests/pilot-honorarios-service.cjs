'use strict';
const assert=require('node:assert/strict');
const Honorarios=require('../functions/honorarios');
const HonorariosService=require('../functions/honorarios-service');

const date='2026-11-18';
const data={
 fleet:{HP_1784:{reg:'HP-1784'}},
 pilotos:[
  {id:'legacy-pilot-0',nombre:'Carol',email:'carol@example.test'},
  {id:'legacy-pilot-1',nombre:'Bob',email:'bob@example.test'}
 ],
 itinerarios:[],
 school:{registry:{clients:[],entries:[]},honorarios:{rates:{},records:[
  {id:'bob-ledger',pilot:'Bob',pilotId:'legacy-pilot-0',date,aircraft:'HP1784',kind:'flight',flightHours100:100,totalCents:3000},
  {id:'carol-ledger',pilot:'Carol',pilotId:'legacy-pilot-1',date,aircraft:'HP1784',kind:'flight',flightHours100:200,totalCents:6000}
 ]}}
};
const root={operation:'fake-operation',payload:JSON.stringify(data)};
const db={ref:()=>({get:async()=>({val:()=>root})})};

(async()=>{
 const context={
  user:{uid:'bob-user',email:'bob@example.test',emailVerified:true,disabled:false},
  account:{role:'Piloto',assignedAt:'2026-01-01T00:00:00.000Z',syncStatus:'matched',recordKind:'pilot',recordId:'legacy-pilot-0',recordName:'Bob'}
 };
 const result=await HonorariosService.read(db,context,date);
 const bobId=Honorarios.pilotReportId(data,context.account,context.user.uid);
 assert.match(bobId,/^legacy-name-/);
 assert.equal(result.pilotId,bobId,'legacy account uses the report synthetic identity rather than its positional ID');
 assert.equal(result.report.pilots.length,1);
 assert.equal(result.report.pilots[0].name,'Bob');
 assert.equal(result.report.rows.length,1);
 assert.equal(result.report.rows[0].pilot,'Bob');
 assert.equal(result.report.rows[0].totalCents,3000);
 assert.equal(result.report.rows.some(row=>row.pilot==='Carol'),false,'pilot cannot see another dossier ledger');

 const ambiguous={...data,pilotos:[
  {id:'legacy-pilot-0',nombre:'Mismo Nombre',authUid:'pilot-one'},
  {id:'legacy-pilot-1',nombre:'Mismo Nombre',authUid:'pilot-two'}
 ]};
 assert.equal(Honorarios.pilotReportId(ambiguous,{recordId:'legacy-pilot-0',recordName:'Mismo Nombre'},'pilot-one'),'',
  'duplicate legacy names do not create a synthetic person identity');
 console.log('PASS legacy pilot report filter uses a unique dossier identity without positional attribution');
})().catch(error=>{console.error(error);process.exit(1);});

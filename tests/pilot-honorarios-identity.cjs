'use strict';
const assert=require('node:assert/strict');
const {pilotIdentity}=require('../functions/pilot-identities');
const Honorarios=require('../functions/honorarios');

const date='2026-11-18';
const fakeId=(()=>{let n=0;return()=>`fixture-pilot-${++n}`;})();
function fixture(pilotos){return {fleet:{HP_1784:{reg:'HP-1784',model:'Aeronave ficticia'}},pilotos,itinerarios:[],school:{students:[],registry:{clients:[],entries:[]},honorarios:{rates:{},records:[]}}};}
function migrate(before,after){return pilotIdentity(before,after,fakeId);}

// Reproduce the reported state after Alice was removed: Bob's stored legacy
// reference still says index 1, while Carol currently occupies index 1.
{
 const before=fixture([{nombre:'Bob Piloto',email:'bob@example.test'},{nombre:'Carol Piloto',email:'carol@example.test'}]);
 before.school.registry.entries=[{id:'flight-bob-old',date,aircraft:'HP1784',book:'B-101',bookStatus:'flown',operationType:'instruction',pilot:'Bob Piloto',pilotId:'legacy-pilot-1',hours100:150}];
 before.school.honorarios.records=[{id:'ledger-bob-old',entryId:'flight-bob-old',pilot:'Bob Piloto',pilotId:'legacy-pilot-1',date,aircraft:'HP1784',kind:'flight',flightHours100:150,totalCents:4500}];
 const after=structuredClone(before),bob=migrate(before,after),bobId=after.pilotos.find(p=>p.nombre==='Bob Piloto').id,carolId=after.pilotos.find(p=>p.nombre==='Carol Piloto').id;
 assert.notEqual(bobId,carolId);assert.equal(after.school.registry.entries[0].pilotId,bobId);assert.equal(after.school.honorarios.records[0].pilotId,bobId);
 const report=Honorarios.report(after,bobId,date);assert.equal(report.rows.length,1);assert.equal(report.rows[0].pilot,'Bob Piloto');assert.equal(report.rows[0].flightHours100,150);assert.equal(report.rows[0].totalCents,4500);
 const wrong=Honorarios.report(after,carolId,date);assert.equal(wrong.rows.length,0);assert.equal(wrong.pilots[0].totalCents,0);
}

// Reordering and deleting dossiers after migration cannot change the owner of
// historical flight rows because their permanent IDs no longer depend on index.
{
 const before=fixture([{nombre:'Alice',email:'alice@example.test'},{nombre:'Bob',email:'bob@example.test'},{nombre:'Carol',email:'carol@example.test'}]);
 before.school.honorarios.records=[{id:'bob-flight',entryId:'bob-flight',pilot:'Bob',pilotId:'legacy-pilot-1',date,aircraft:'HP1784',kind:'flight',flightHours100:125,totalCents:3750}];
 const after=structuredClone(before);migrate(before,after,fakeId);
 const bobId=after.pilotos.find(p=>p.nombre==='Bob').id,carolId=after.pilotos.find(p=>p.nombre==='Carol').id;
 after.pilotos.splice(after.pilotos.findIndex(p=>p.nombre==='Alice'),1);after.pilotos.reverse();
 assert.equal(Honorarios.report(after,bobId,date).rows[0].pilotId,bobId);
 assert.equal(Honorarios.report(after,carolId,date).rows.length,0);
 assert(Honorarios.report(after,bobId,date).pilots.some(p=>p.id===bobId));
}

// A rename during migration is matched by stable dossier data; subsequent
// names can change while the historical ledger retains the same pilot ID.
{
 const before=fixture([{nombre:'Roberto Original',email:'roberto@example.test'}]);
 before.school.registry.entries=[{id:'rename-flight',date,aircraft:'HP1784',book:'R-9',bookStatus:'flown',operationType:'instruction',pilot:'Roberto Original',pilotId:'legacy-pilot-0',hours100:100}];
 before.school.honorarios.records=[{id:'rename-ledger',entryId:'rename-flight',pilot:'Roberto Original',pilotId:'legacy-pilot-0',date,aircraft:'HP1784',kind:'flight',flightHours100:100,totalCents:3000}];
 const after=structuredClone(before);after.pilotos[0].nombre='Roberto Actual';migrate(before,after,fakeId);const id=after.pilotos[0].id;
 assert.equal(after.school.honorarios.records[0].pilotId,id);
 const next=structuredClone(after);next.pilotos[0].nombre='Roberto Renombrado';
 const report=Honorarios.report(next,id,date);assert.equal(report.rows[0].pilotId,id);assert.equal(report.rows[0].totalCents,3000);
}

// IDs must be unique. Equal names without another key remain unassigned rather
// than being silently attached to whichever pilot currently has that index.
{
 const before=fixture([]),after=fixture([{id:'same-id',nombre:'Uno'},{id:'same-id',nombre:'Dos'}]);
 assert.throws(()=>migrate(before,after),/identificadores de piloto duplicados/);
 const duplicate=fixture([{nombre:'Mismo Nombre'},{nombre:'Mismo Nombre'}]);
 duplicate.school.honorarios.records=[{id:'ambiguous',entryId:'ambiguous',pilot:'Mismo Nombre',pilotId:'legacy-pilot-1',date,aircraft:'HP1784',kind:'flight',flightHours100:200,totalCents:6000}];
 const migrated=structuredClone(duplicate);migrate(duplicate,migrated,fakeId);
 const report=Honorarios.report(migrated,'',date);assert.equal(report.rows[0].pilotId,'');assert.equal(report.rows[0].pilot,'Mismo Nombre');assert(report.pilots.every(p=>p.totalCents===0));
 const replaced=fixture([{nombre:'Mismo Nombre',email:'old@example.test'}]),replacement=fixture([{nombre:'Mismo Nombre',email:'new@example.test'}]);
 assert.throws(()=>migrate(replaced,replacement),/sin ambigüedad/,'same-name replacement must not inherit the previous pilot identity');
 const synthetic=fixture([{id:'legacy-pilot-0',nombre:'Piloto con ID temporal',email:'legacy@example.test'}]),syntheticNext=structuredClone(synthetic);migrate(synthetic,syntheticNext);assert.notEqual(syntheticNext.pilotos[0].id,'legacy-pilot-0');
}

// Deleting the historical dossier leaves an unassigned visible ledger row;
// the remaining pilot at its former index does not inherit it.
{
 const before=fixture([{nombre:'Bob Eliminado',email:'bob@example.test'},{nombre:'Carol Vigente',email:'carol@example.test'}]);
 before.school.honorarios.records=[{id:'orphaned',entryId:'orphaned',pilot:'Bob Eliminado',pilotId:'legacy-pilot-1',date,aircraft:'HP1784',kind:'flight',flightHours100:75,totalCents:2250}];
 const after=structuredClone(before);after.pilotos=[{nombre:'Carol Vigente',email:'carol@example.test'}];migrate(before,after,fakeId);
 const carolId=after.pilotos[0].id,report=Honorarios.report(after,'',date);
 assert.equal(report.rows[0].pilot,'Bob Eliminado');assert.equal(report.rows[0].pilotId,'');assert.equal(Honorarios.report(after,carolId,date).rows.length,0);
}

// Deleting a dossier that already has a permanent ID keeps its prior reports
// available as an archived pilot option.
{
 const before=fixture([{id:'bob-permanent',nombre:'Bob Archivado'},{id:'carol-permanent',nombre:'Carol'}]);
 before.school.honorarios.records=[{id:'archived-ledger',entryId:'archived-ledger',pilot:'Bob Archivado',pilotId:'bob-permanent',date,aircraft:'HP1784',kind:'flight',flightHours100:60,totalCents:1800}];
 const after=structuredClone(before);after.pilotos=after.pilotos.filter(p=>p.id!=='bob-permanent');migrate(before,after);
 const archived=Honorarios.report(after,'bob-permanent',date);assert.equal(archived.rows[0].pilotId,'bob-permanent');assert.equal(archived.rows[0].totalCents,1800);assert(archived.pilots.some(p=>p.id==='bob-permanent'&&p.name==='Bob Archivado'));
}

// A deleted same-name legacy dossier keeps the surviving dossier from
// inheriting the removed pilot's ledger rows, including on repeated migration.
{
  const before=fixture([{nombre:'Mismo Nombre',email:'removed@example.test'},{nombre:'Mismo Nombre',email:'survivor@example.test'}]);
  before.school.registry.entries=[{id:'removed-flight',date,aircraft:'HP1784',book:'M-1',bookStatus:'flown',operationType:'instruction',pilot:'Mismo Nombre',pilotId:'legacy-pilot-0',hours100:200}];
  before.school.honorarios.records=[{id:'removed-ledger',entryId:'removed-flight',pilot:'Mismo Nombre',pilotId:'legacy-pilot-0',date,aircraft:'HP1784',kind:'flight',flightHours100:200,totalCents:6000}];
  const after=structuredClone(before);after.pilotos=[{nombre:'Mismo Nombre',email:'survivor@example.test'}];migrate(before,after,fakeId);
  const survivorId=after.pilotos[0].id;
  assert.equal(after.school.registry.entries[0].pilotId,'legacy-pilot-0');
  assert.equal(after.school.registry.entries[0].pilotIdentityUnresolved,true);
  assert.equal(after.school.honorarios.records[0].pilotId,'legacy-pilot-0');
  assert.equal(after.school.honorarios.records[0].pilotIdentityUnresolved,true);
  assert.equal(Honorarios.report(after,'',date).rows[0].pilotId,'');
  assert.equal(Honorarios.report(after,'',date).rows[0].totalCents,6000);
  assert.equal(Honorarios.report(after,survivorId,date).rows.length,0);
  const repeated=structuredClone(after);migrate(after,repeated,fakeId);
  assert.equal(repeated.school.honorarios.records[0].pilotIdentityUnresolved,true);
  assert.equal(Honorarios.report(repeated,survivorId,date).rows.length,0);
}

// New flights write the permanent ID and reject ambiguous name-only links.
{
 const before=fixture([{id:'pilot-bob',nombre:'Bob'},{id:'pilot-carol',nombre:'Carol'}]);
 const after=structuredClone(before);after.school.registry.entries=[{id:'new-flight',date,aircraft:'HP1784',book:'B-102',bookStatus:'flown',operationType:'instruction',pilot:'Bob',pilotId:'pilot-bob',hours100:100}];
 Honorarios.applyNewEntries(before,after,{role:'Director'});
 assert.equal(after.school.honorarios.records.length,1);assert.equal(after.school.honorarios.records[0].pilotId,'pilot-bob');
 const ambiguous=structuredClone(after);ambiguous.school.registry.entries[1]={id:'ambiguous-flight',date,aircraft:'HP1784',book:'B-103',bookStatus:'flown',operationType:'instruction',pilot:'Mismo',hours100:100};ambiguous.pilotos.push({id:'pilot-one',nombre:'Mismo'},{id:'pilot-two',nombre:'Mismo'});
 assert.throws(()=>Honorarios.applyNewEntries(after,ambiguous,{role:'Director'}),/identificador permanente/);
}

console.log('PASS permanent pilot identity migration, legacy history queries, deletion/reorder, renames, duplicate IDs and safe unassigned history');


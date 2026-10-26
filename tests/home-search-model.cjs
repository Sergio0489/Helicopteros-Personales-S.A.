'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../home-search-model'),B=require('../functions/boxes'),{boxView}=require('../functions/box-view');
const grant=(page,ids)=>({[page]:{actions:{view:true},boxes:Object.fromEntries(ids.map(id=>[id,{view:true}]))}});
test('Role priorities only reorder authorized pages; search handles accents, spaces and registration punctuation',()=>{
 const pages=['aeronaves','pagos','estudiantes'].map(id=>({id,name:M.catalog[id][0]}));assert.deepEqual(M.ordered(pages,'Contabilidad').map(p=>p.id),['pagos','estudiantes','aeronaves']);
 const rows=M.build({fleet:{HP_1784:{serial:'TEST'}},school:{students:[{id:'s',name:'Belén García'}]}},{pages,director:true});assert.equal(M.search(rows,'HP1784')[0].target.reg,'HP-1784');assert.equal(M.search(rows,'belen garcia')[0].kind,'student');assert.equal(M.search(rows,'belen','aircraft').length,0);
});
test('Hidden pages, personal identifiers, receipts and aircraft fields never enter the index',()=>{
 const policy=B.normalize({...grant('estudiantes',['account']),...grant('aeronaves',['status'])}),pages=[{id:'estudiantes'},{id:'aeronaves'}];
 const rows=M.build({fleet:{HP_1784:{serial:'HIDDEN-SERIAL',documentos:[{nombre:'HIDDEN-DOCUMENT'}]}},pilotos:[{nombre:'HIDDEN-PILOT'}],school:{students:[{id:'s',name:'Permitido',email:'hidden@example.test',identity:'HIDDEN-ID'}],paymentReceipts:[{id:'r',number:'HIDDEN-RECEIPT'}]}},{pages,policy});
 const text=JSON.stringify(rows);assert(!text.includes('HIDDEN'));assert(!text.includes('hidden@example'));assert.equal(M.search(rows,'Permitido').length,1);
});
test('Student search uses the server-matched dossier and schedule respects permitted aircraft and crew visibility',()=>{
 const policy=B.normalize({...grant('estudiantes',['account']),...grant('horario',['schedule'])});policy.horario.aircraft={mode:'selected',registrations:['HP1784']};
 const data={fleet:{},pilotos:[],itinerarios:[{id:'f1',aeronave:'HP-1784',fecha:'2026-10-20',piloto:'HIDDEN-CREW'},{id:'f2',aeronave:'HP1819',fecha:'2026-10-20'}],school:{students:[{id:'own',name:'Own'},{id:'other',name:'Other'}],registry:{clients:[],entries:[]}}};
 const pages=[{id:'estudiantes'},{id:'horario'}],native=boxView(data,{role:'Estudiante',recordId:'own',recordKind:'student',syncStatus:'matched'},policy,'estudiantes');const rows=M.build(native.data,{pages,policy:native.policy});assert.equal(M.search(rows,'Other').length,0);assert.equal(M.search(rows,'Own').length,1);
 const flights=M.build(data,{pages:[{id:'horario'}],policy}).filter(r=>r.kind==='flight');assert.equal(flights.length,1);assert(!JSON.stringify(flights).includes('HIDDEN-CREW'));
});

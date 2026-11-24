'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Estudiantes / Clientes shows additional system accounts and pilot or staff dossiers in the alphabetical list',()=>{
 const ui=fs.readFileSync(require.resolve('../students.js'),'utf8');
 assert.match(ui,/schoolRequest\('directory-users'/);
 assert.match(ui,/for\(const pilot of list\(previewData\.pilotos\)\)/);
 assert.match(ui,/for\(const person of list\(school\.personnel\)\)/);
 assert.match(ui,/Usuarios del sistema/);
 assert.match(ui,/systemUsers\(school\)\.filter/);
 assert.match(ui,/const represented=representedDirectoryDossiers\(school\)/);
 assert.match(ui,/return unique\.sort\(comparePersonNames\)/);
});

test('only dossiers actually shown in the selected directory suppress a system user',()=>{
 const ui=fs.readFileSync(require.resolve('../students.js'),'utf8'),helper=ui.match(/function representedDirectoryDossiers\(school\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(helper,'directory representation helper exists');
 const list=value=>Array.isArray(value)?value:[],select=new Function('list','view','stageFilter','query',helper+';return representedDirectoryDossiers;');
 const school={students:[
  {id:'former-pilot',name:'Piloto Antiguo',directoryKind:'pilot',stage:'Retirado',email:'pilot@example.test'},
  {id:'student-visible',name:'Ana Estudiante',directoryKind:'student',stage:'Matriculado',email:'ana@example.test'},
  {id:'student-filtered',name:'Beatriz Estudiante',directoryKind:'student',stage:'Interesado',email:'beatriz@example.test'}
 ],registry:{clients:[{id:'client-visible',name:'Cliente Activo',email:'client@example.test'}]}};
 let represented=select(list,'students','Matriculado','') (school);
 assert.deepEqual(represented.map(row=>row.record.id),['student-visible'],'hidden former student dossiers do not suppress the corresponding system account');
 represented=select(list,'clients','','') (school);
 assert.deepEqual(represented.map(row=>row.record.id),['client-visible'],'the client directory only suppresses users whose client dossier is displayed');
 represented=select(list,'students','','beatriz') (school);
 assert.deepEqual(represented.map(row=>row.record.id),['student-filtered'],'search-filtered student dossiers remain represented only while visible');
});

test('all-user directory endpoint is Director-only and reads auth pages without synchronizing account data',()=>{
 const api=fs.readFileSync(require.resolve('../functions/index.js'),'utf8');
 const action=api.match(/if\(action==='directory-users'\)\{([\s\S]*?)\n \}/)?.[1]||'';
 assert.match(action,/if\(!isDirector\)/);
 assert.match(action,/db\.ref\('accountRequests'\)\.get\(\)/);
 assert.match(action,/getAuth\(\)\.listUsers/);
 assert.doesNotMatch(action,/syncAccount|transaction\(/,'listing users must remain read-only');
});

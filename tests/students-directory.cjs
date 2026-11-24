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
 assert.match(ui,/return unique\.sort\(comparePersonNames\)/);
});

test('all-user directory endpoint is Director-only and reads auth pages without synchronizing account data',()=>{
 const api=fs.readFileSync(require.resolve('../functions/index.js'),'utf8');
 const action=api.match(/if\(action==='directory-users'\)\{([\s\S]*?)\n \}/)?.[1]||'';
 assert.match(action,/if\(!isDirector\)/);
 assert.match(action,/db\.ref\('accountRequests'\)\.get\(\)/);
 assert.match(action,/getAuth\(\)\.listUsers/);
 assert.doesNotMatch(action,/syncAccount|transaction\(/,'listing users must remain read-only');
});

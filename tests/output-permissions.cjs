'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{normalize,outputAllowed}=require('../functions/boxes');
test('Print/export require explicit page and box grants, independent of editing',()=>{
 const policy={estudiantes:{actions:{view:true,edit:false,print:true},boxes:{personal:{view:true,edit:false,print:true},account:{view:true}}},estadisticas:{actions:{view:true,export:true},boxes:{aac:{view:true,export:true},company:{view:true}}}};
 const p=normalize(policy);assert(outputAllowed(p,'estudiantes','personal','print'));assert(outputAllowed(p,'estadisticas','aac','export'));assert(!outputAllowed(p,'estudiantes','account','print'));assert(!outputAllowed(p,'estadisticas','company','export'));
 assert.deepEqual(normalize(p),p,'Grants survive normalization round trips');p.estudiantes.actions.print=false;assert(!outputAllowed(p,'estudiantes','personal','print'));p.estadisticas.boxes.aac.view=false;assert(!outputAllowed(p,'estadisticas','aac','export'));
 const legacy=normalize({estudiantes:{actions:{view:true,edit:true,print:true},areas:{'Datos personales':true}}});assert(!outputAllowed(legacy,'estudiantes','personal','print'),'Legacy read/edit never silently grants output');
});

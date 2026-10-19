'use strict';
(function(root){
 const defaults={
  "people": [
    {
      "id": "manager",
      "role": "Gerente General",
      "name": "Cap. Mario Barcenas Chiari",
      "parent": ""
    },
    {
      "id": "director",
      "role": "Director / Jefe de Instrucción",
      "name": "Cap. Sergio Herrera Castro",
      "parent": "manager"
    },
    {
      "id": "deputy",
      "role": "Asistente del Director / Jefe de Instrucción",
      "name": "Cap. Sadot Ríos",
      "parent": "director"
    },
    {
      "id": "instructor",
      "role": "Instructor de Tierra y Vuelo",
      "name": "Cap. Alcibíades Bustamante",
      "parent": "director"
    },
    {
      "id": "administration",
      "role": "Asistente Administrativo",
      "name": "Cap. Fernando Alvarado",
      "parent": "director"
    }
  ],
  "courses": [
    {
      "id": "course-1",
      "name": "Curso Piloto Privado – Avión",
      "approvedOn": "2017-05-03"
    },
    {
      "id": "course-2",
      "name": "Curso Piloto Comercial – Avión",
      "approvedOn": "2017-05-03"
    },
    {
      "id": "course-3",
      "name": "Curso Piloto de Transporte de Línea Aérea – Avión",
      "approvedOn": "2017-05-03"
    },
    {
      "id": "course-4",
      "name": "Habilitación Multimotor Terrestre – Avión",
      "approvedOn": "2017-05-03"
    },
    {
      "id": "course-5",
      "name": "Habilitación por Instrumentos – Avión",
      "approvedOn": "2017-05-03"
    },
    {
      "id": "course-6",
      "name": "Curso Instructor de Vuelo – Avión",
      "approvedOn": "2017-05-03"
    },
    {
      "id": "course-7",
      "name": "Curso Piloto de Aeronave Pilotada a Distancia",
      "approvedOn": "2021-07-15"
    }
  ],
  "institution": [
    {
      "id": "institution-1",
      "label": "Razón social y comercial",
      "value": "Helicópteros Personales, S.A."
    },
    {
      "id": "institution-2",
      "label": "Registro público",
      "value": "Ficha 563687 · Documento 1117805 · Sección de micropelículas mercantil"
    },
    {
      "id": "institution-3",
      "label": "Base de operaciones",
      "value": "Aeropuerto Internacional Marcos A. Gelabert, Hangar 19ª, Vía Diógenes de la Rosa, Albrook, corregimiento de Ancón, Panamá, República de Panamá."
    },
    {
      "id": "institution-4",
      "label": "Oficinas administrativas",
      "value": "Urbanización Obarrio N.º 4, calle 54."
    },
    {
      "id": "institution-5",
      "label": "Mantenimiento",
      "value": "Contratado a Talleres Aeronáuticos de Mantenimiento (TAM) habilitados por la AAC."
    },
    {
      "id": "institution-6",
      "label": "Teléfono y fax",
      "value": "(507) 315-0612"
    }
  ],
  "note": "El Gerente General debe notificar a la AAC cualquier cambio de ubicación de la base de operaciones.",
  "certificates": [
    {
      "id": "exploitation",
      "name": "Certificado de Explotación"
    },
    {
      "id": "operation",
      "name": "Certificado de Operación"
    },
    {
      "id": "simulator",
      "name": "Certificado de Simulador"
    }
  ]
};
 const clone=v=>JSON.parse(JSON.stringify(v));
 const value=school=>clone({...defaults,...school?.information});
 function validDate(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===v;}
 function validate(info){
  if(!info||typeof info!=='object'||Array.isArray(info)||Object.keys(info).some(k=>!Object.hasOwn(defaults,k)))throw Error('Información de Escuela no válida.');
  const text=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Completa los campos y revisa la longitud del texto.');};
  const limits={people:50,courses:100,institution:30,certificates:30};
  const keys={people:['id','name','role','parent'],courses:['id','name','approvedOn'],institution:['id','label','value'],certificates:['id','name']};
  for(const kind of Object.keys(keys)){
   const rows=info[kind];if(!Array.isArray(rows)||!rows.length||rows.length>limits[kind])throw Error('Cantidad de registros no válida.');
   const ids=new Set();for(const row of rows){
    if(!row||typeof row!=='object'||Object.keys(row).length!==keys[kind].length||Object.keys(row).some(k=>!keys[kind].includes(k)))throw Error('Campos de Escuela no válidos.');
    if(typeof row.id!=='string'||!/^[a-z][a-z0-9-]{0,79}$/.test(row.id)||ids.has(row.id))throw Error('Identificador de registro no válido.');ids.add(row.id);
    if(kind==='people'){text(row.name,150);text(row.role,150);if(row.parent!==(row.id==='manager'?'':row.id==='director'?'manager':'director'))throw Error('Conserva la jerarquía del organigrama.');}
    if(kind==='courses'){text(row.name,200);if(!validDate(row.approvedOn))throw Error('Ingresa una fecha de aprobación válida.');}
    if(kind==='institution'){text(row.label,120);text(row.value,2000);}
    if(kind==='certificates')text(row.name,200);
   }
   for(const row of defaults[kind])if(!ids.has(row.id))throw Error('No se pueden retirar los registros iniciales.');
  }
  if(typeof info.note!=='string'||info.note.length>2000)throw Error('Nota institucional no válida.');
 }
 function validateChanges(before,after){if(JSON.stringify(before.school?.information)===JSON.stringify(after.school?.information))return;validate(after.school?.information);}
 const api={defaults,value,validate,validateChanges};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.HPSchoolInformation=api;
})(typeof globalThis==='undefined'?this:globalThis);

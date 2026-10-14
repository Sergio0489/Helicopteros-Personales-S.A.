'use strict';
const {normalize}=require('./boxes');
const PAGES={horario:'Horario del día',pendientes:'Pendientes',aeronaves:'Aeronaves',pilotos:'Pilotos',bitacora:'Registro de bitácora',pagos:'Registro de pago',itinerario:'Itinerario',estudiantes:'Estudiantes / Clientes',escuela:'Escuela',charter:'HP CHARTER',estadisticas:'Estadísticas',saldos:'Alerta de saldos'};
const ROLES=['Gerente','Administrativo','Piloto','Estudiante','Mecánico','Contabilidad'];
const arr=v=>Array.isArray(v)?v:[];
const fields=(o,names)=>Object.fromEntries(names.split(' ').filter(k=>o?.[k]!=null&&typeof o[k]!=='object').map(k=>[k,o[k]]));
const personal='name identity birthDate nationality address previousSchool phone residentialPhone email fatherName motherName emergencyName emergencyPhone referredBy enrolledDate createdAt stage';
const entry='date aircraft book pilot copilot personName origin hours100 equipmentKind operationType observation paxOut paxBack voidedAt';
const flight='fecha aeronave piloto estudiante cliente destino origen hora horaInicio horaFin tipo observaciones';
function policyFor(data,account){if(!account?.assignedAt||!ROLES.includes(account.role))return {};return normalize(data.school?.accessConfiguration?.roles?.[account.role]||{});}
function can(policy,page,area){return policy?.[page]?.actions?.view===true&&policy[page].areas?.[area]===true;}
function visiblePages(policy){return Object.entries(PAGES).filter(([id])=>policy[id]?.actions?.view===true&&Object.values(policy[id].areas||{}).some(v=>v===true)).map(([id,name])=>({id,name}));}
function projectPage(data,account,policy,page){
 if(!Object.hasOwn(PAGES,page)||!visiblePages(policy).some(p=>p.id===page))throw Error('No tienes permiso para consultar esta página.');
 const school=data.school||{},sections=[];
 const add=(area,rows)=>{if(can(policy,page,area))sections.push({title:area,rows});};
 let people=[...arr(school.students).map(p=>({...p,recordKind:'student'})),...arr(school.registry?.clients).map(p=>({...p,recordKind:'client'}))];
 // A student can never use a page permission to enumerate other students.
 if(account.role==='Estudiante')people=people.filter(p=>p.id===account.recordId&&p.recordKind===account.recordKind&&account.syncStatus==='matched');
 const personIds=new Set(people.map(p=>p.recordKind+':'+p.id));
 const entries=arr(school.registry?.entries).filter(e=>account.role!=='Estudiante'||personIds.has(e.personKind+':'+e.personId));
 const receipts=arr(school.paymentReceipts).filter(r=>account.role!=='Estudiante'||personIds.has(r.personKey));
 const flights=arr(data.itinerarios).filter(f=>account.role!=='Estudiante'); // No name-only matching for personal flight access.
 const fleet=Object.entries(data.fleet||{});
 const fRows=keys=>fleet.map(([aircraft,d])=>({aircraft,...fields(d,keys)}));
 const nestedFleet=(key,keys)=>fleet.flatMap(([aircraft,d])=>arr(d[key]).map(r=>({aircraft,...fields(r,keys)})));
 const flightRows=flights.map(f=>fields(f,flight));
 const entryRows=entries.map(e=>({...fields(e,entry),destinations:arr(e.destinations).filter(x=>typeof x==='string').join(' → ')}));
 if(page==='aeronaves'){
  add('Información y estatus',fRows('serial year voltaje status estatus_nota'));
  add('Motores y hélices',fRows('motor_fabricante motor_modelo motor_serie motor_fabricante_izq motor_modelo_izq motor_serie_izq motor_fabricante_der motor_modelo_der motor_serie_der helice_fabricante helice_modelo helice_serie helice_fabricante_izq helice_modelo_izq helice_serie_izq helice_fabricante_der helice_modelo_der helice_serie_der'));
  add('Horas e inspecciones',fRows('tac_anterior horas_acum_50 horas_acum_100 ciclos_totales ciclos_limite limite_motor limite_helice helice1_ciclos helice2_ciclos helice1_limite helice2_limite fecha_motor fecha_helices'));
  add('Mantenimiento y taller',nestedFleet('mantenimiento','nombre fecha resuelto fecha_resuelto observaciones nota'));
  add('Documentos y emergencia',nestedFleet('documentos','nombre vence fecha numero'));
  add('Pedidos',nestedFleet('bitacora_pedidos','fecha nombre descripcion estado proveedor observaciones'));
  add('Tarifas',Object.entries(school.rates||{}).map(([aircraft,r])=>({aircraft,...fields(r,'cents')})));
 }
 if(page==='pilotos'){
  let pilots=arr(data.pilotos);if(account.role==='Estudiante')pilots=[];
  add('Datos personales',pilots.map(p=>fields(p,'nombre email telefono celular')));
  add('Licencias y habilitaciones',pilots.map(p=>fields(p,'nombre licencia tipo habilitaciones')));
  add('Vencimientos y documentos',pilots.flatMap(p=>[{...fields(p,'nombre licencia medico escuela')},...arr(p.verificaciones).map(v=>({piloto:p.nombre,...fields(v,'nombre fecha')}))]));
 }
 if(page==='horario'){
  add('Vuelos y rutas',flights.map(f=>fields(f,'fecha aeronave destino origen hora horaInicio horaFin tipo observaciones')));add('Tripulación y pasajeros',flights.map(f=>fields(f,'fecha aeronave piloto estudiante cliente pasajeros')));
 }
 if(page==='itinerario'){
  add('Calendario',flightRows);add('Programación de vuelos',flightRows);add('Solicitudes de vuelos',[]);
 }
 if(page==='bitacora'){
  add('Vuelos e instructores',entryRows);
  add('Tacómetros y horas',entries.map(e=>fields(e,'date aircraft book tacPrevious100 tacCurrent100 aircraftHours100 hours100')));
  add('Cargos por servicios',entries.map(e=>fields(e,'date aircraft book personName rateCents costCents charge voidedAt')));
  add('Historial de registros',entryRows);
 }
 if(page==='pagos'){
  add('Abonos y recibos',receipts.map(r=>fields(r,'number date personName identity totalCents method bank reference receivedBy source voidedAt')));
  add('Comprobantes de transferencia',receipts.filter(r=>r.attachment).map(r=>({...fields(r,'number date personName reference'),comprobante:'Adjunto registrado; consulta del archivo pendiente'})));
  add('Movimientos de pago',receipts.flatMap(r=>arr(r.lines).map(l=>({...fields(r,'number date personName voidedAt'),...fields(l,'service fee courseId cents amountCents note')}))));
 }
 if(page==='estudiantes'){
  add('Datos personales',people.map(p=>fields(p,personal)));
  add('Cursos y licencias',people.flatMap(p=>arr(p.courses).map(c=>({name:p.name,...fields(c,'type state startDate endDate licenseDate licenseNumber')}))));
  add('Horas registradas',people.flatMap(p=>[...arr(p.registryFlights),...arr(p.courses).flatMap(c=>arr(c.flights))].map(f=>({name:p.name,...fields(f,'date aircraft equipment hours100 kind note voidedAt')}))));
  add('Estado de cuenta y abonos',people.flatMap(p=>[...arr(p.extraPayments),...arr(p.courses).flatMap(c=>arr(c.payments))].map(r=>({name:p.name,...fields(r,'date fee cents source note voidedAt')}))));
  add('Documentos',people.flatMap(p=>arr(p.documents).map(d=>({name:p.name,...fields(d,'name date expiry number')}))));
 }
 if(page==='escuela'){
  add('Información y documentos',[]);add('Cursos y fechas',arr(school.intakes).map(i=>fields(i,'type startDate name notes')));
  add('Tarifas de servicios',Object.entries(school.courseRates||{}).flatMap(([course,r])=>Object.entries(r||{}).filter(([,v])=>typeof v==='number').map(([service,cents])=>({course,service,cents}))));
 }
 if(page==='charter'){add('Información de la empresa',[]);add('Documentos y vencimientos',[]);add('Servicios',[]);}
 if(page==='estadisticas'){add('Estadísticas generales',entryRows);add('Estadísticas para AAC',entryRows);add('Estadísticas Helicópteros Personales',entryRows);}
 // Derived alerts and balances must use the application's exact calculation engine.
 // Never expose all source records as a shortcut for these summaries.
 if(page==='pendientes'||page==='saldos')return {title:PAGES[page],sections:[],notice:'Esta consulta requiere completar la integración de los cálculos de alertas y saldos. No se muestran resultados incompletos.'};
 return {title:PAGES[page],sections};
}
module.exports={policyFor,visiblePages,projectPage};


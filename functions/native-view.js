'use strict';
const {visiblePages}=require('./access');
const list=v=>Array.isArray(v)?v:[];
const copy=v=>JSON.parse(JSON.stringify(v));
const pick=(v,keys)=>Object.fromEntries(keys.split(' ').filter(k=>v?.[k]!==undefined).map(k=>[k,copy(v[k])]));
// Only domain fields enter the view. Accounts, user profiles, roles and backups never do.
function nativeView(data,account,policy,page){
 if(!visiblePages(policy).some(p=>p.id===page))throw Error('No tienes permiso para consultar esta página.');
 const areas=policy[page].areas,has=a=>areas[a]===true,s=data.school||{};
 const out={fleet:{},pilotos:[],itinerarios:[],undoFleet:{},school:{version:1,students:[],rates:{},intakes:[],registry:{clients:[],entries:[]}}};
 const students=list(s.students).filter(p=>account.role!=='Estudiante'||(account.syncStatus==='matched'&&account.recordKind==='student'&&p.id===account.recordId));
 const clients=list(s.registry?.clients).filter(p=>account.role!=='Estudiante'||(account.syncStatus==='matched'&&account.recordKind==='client'&&p.id===account.recordId));
 const ids=new Set([...students.map(p=>'student:'+p.id),...clients.map(p=>'client:'+p.id)]);
 const entries=list(s.registry?.entries).filter(e=>account.role!=='Estudiante'||ids.has(e.personKind+':'+e.personId));
 const personKeys='id name identity birthDate nationality address previousSchool phone residentialPhone email fatherName motherName emergencyName emergencyPhone referredBy enrolledDate createdAt stage funding interests notes observation observations withdrawalReason completedDate completedCourses';
 const moneyKeys='expenses extraPayments registryFlights deletedCourses';
 const courseKeys='id type status state startDate endDate licenseDate licenseNumber createdAt';
 const entryKeys='id date aircraft book pilot pilotId copilot copilotId personName personId personKind origin destinations equipmentKind operationType observation paxOut paxBack hours100 voidedAt deletedAt createdAt';
 if(page==='aeronaves'){
  const groups={
   'Información y estatus':'status serial year voltaje estatus_nota horas_desde_revision horas_hasta_revision',
   'Motores y hélices':'motor_fabricante motor_modelo motor_serie motor_fabricante_izq motor_modelo_izq motor_serie_izq motor_fabricante_der motor_modelo_der motor_serie_der helice_fabricante helice_modelo helice_serie helice_fabricante_izq helice_modelo_izq helice_serie_izq helice_fabricante_der helice_modelo_der helice_serie_der component_schema_v2',
   'Horas e inspecciones':'tac_anterior tac_actual horas_diarias horas_acum_50 horas_acum_100 horas_totales horas_limite fecha_50 fecha_100 ciclos_totales ciclos_limite limite_motor limite_helice fecha_motor fecha_helices helice1_ciclos helice2_ciclos helice1_limite helice2_limite fecha_helice1 fecha_helice2 bitacora_horas bitacora_vencimientos bitacora_tac bitacora_tacometros proxima_inspeccion bitacora_inspecciones tacometros inspecciones tac_log inspection_log ultimo_venc_hv ultimo_venc_fecha',
   'Mantenimiento y taller':'mantenimiento',
   'Documentos y emergencia':'emerg_salvavidas emerg_extintor emerg_flares emerg_botiquin emerg_salvavidas_fechas emerg_extintor_fechas emerg_flares_fechas emerg_botiquin_fechas documentos salvavidas extintores flares botiquin salvavidas_fechas extintores_fechas flares_fechas botiquin_fechas',
   'Pedidos':'pedidos bitacora_pedidos seguimiento_pedidos'
  };
  for(const [id,ac]of Object.entries(data.fleet||{})){out.fleet[id]={component_schema_v2:true};for(const [area,keys]of Object.entries(groups))if(has(area))Object.assign(out.fleet[id],pick(ac,keys));}
  if(has('Tarifas'))out.school.rates=copy(s.rates||{});
 }
 if(page==='pilotos'&&account.role!=='Estudiante')out.pilotos=list(data.pilotos).map(p=>({...pick(p,'id nombre'),...(has('Datos personales')||has('Expedientes')?pick(p,'email telefono celular'):{}),...(has('Expedientes')?pick(p,'identity birthDate nationality address emergencyName emergencyPhone notes peso fechaInicioHP'):{}),...(has('Licencias y habilitaciones')?pick(p,'licencia numeroLicencia tipo habilitaciones licenseTypes instructorRatings instructorExpiry rpaInstructor rpaInstructorExpiry'):{}),...(has('Vencimientos y documentos')?pick(p,'medico medicoClase charter escuela verificaciones'): {})}));
 if(['horario','itinerario'].includes(page)&&account.role!=='Estudiante'){
  const route=page==='itinerario'?(has('Calendario')||has('Programación de vuelos')):has('Vuelos y rutas');
  const crew=page==='itinerario'?route:has('Tripulación y pasajeros');
  out.itinerarios=list(data.itinerarios).map(f=>({...pick(f,'id fecha aeronave'),...(route?pick(f,'destino origen hora horaInicio horaFin tipo observaciones'):{}),...(crew?pick(f,'piloto estudiante cliente pasajeros'): {})}));
 }
 if(page==='estudiantes'||page==='saldos'){
  const personal=page==='estudiantes'&&has('Datos personales'),finance=page==='saldos'||has('Estado de cuenta y abonos'),courses=page==='estudiantes'&&has('Cursos y licencias'),hours=page==='estudiantes'&&has('Horas registradas');
  if(page==='saldos')out.school.balanceAlertDismissals=Object.fromEntries(Object.entries(s.balanceAlertDismissals||{}).filter(([key])=>ids.has(key)));
  const project=p=>{
   const q=pick(p,personal?personKeys:finance?'id name identity':'id name stage phone');q.courses=[];
   if(finance)Object.assign(q,pick(p,moneyKeys));
   if(hours&&!finance)q.registryFlights=list(p.registryFlights).map(f=>pick(f,'id date aircraft equipment hours100 kind fee note voidedAt'));
   if(finance||courses||hours)q.courses=list(p.courses).map(c=>({...pick(c,courseKeys),payments:finance?copy(list(c.payments)):[],flights:finance?copy(list(c.flights)):hours?list(c.flights).map(f=>pick(f,'id date aircraft equipment hours100 kind fee note voidedAt')):[],...(finance?pick(c,'budgets tutoriaEnabled'): {})}));
   if(has('Documentos'))q.documents=copy(list(p.documents));return q;
  };
  if(page==='estudiantes'||has('Estudiantes'))out.school.students=students.map(project);
  if(page==='estudiantes'||has('Clientes'))out.school.registry.clients=clients.map(project);
  if(finance)out.school.registry.entries=entries.map(e=>pick(e,entryKeys+' costCents rateCents charge'));
 }
 if(page==='estadisticas'&&has('Estadísticas generales')){for(const [id,ac]of Object.entries(data.fleet||{}))out.fleet[id]=pick(ac,'bitacora_horas');}
 if(page==='bitacora'||page==='estadisticas'){
  const info=page==='estadisticas'||has('Vuelos e instructores')||has('Historial de registros');
  out.school.registry.entries=entries.map(e=>({...pick(e,info?entryKeys:'id date aircraft book voidedAt'),...(page==='bitacora'&&has('Tacómetros y horas')?pick(e,'tacPrevious100 tacCurrent100 aircraftHours100 hours100'):{}),...(page==='bitacora'&&has('Cargos por servicios')?pick(e,'personName rateCents costCents charge'): {})}));
 }
 if(page==='pagos'){
  const receipts=list(s.paymentReceipts).filter(r=>account.role!=='Estudiante'||ids.has(r.personKey));
  out.school.paymentReceipts=receipts.map(r=>({...pick(r,'id personKey date number'),...(has('Abonos y recibos')?pick(r,'personName identity totalCents method bank reference receivedBy source voidedAt'):{}),...(has('Movimientos de pago')?pick(r,'lines'):{}),...(has('Comprobantes de transferencia')?pick(r,'attachment'): {})}));
  out.school.students=students.map(p=>({...pick(p,'id name'),courses:has('Movimientos de pago')?list(p.courses).map(c=>({...pick(c,'id type'),payments:copy(list(c.payments)),flights:[]})):[],...(has('Movimientos de pago')?pick(p,'extraPayments'): {})}));out.school.registry.clients=clients.map(p=>pick(p,has('Movimientos de pago')?'id name extraPayments':'id name'));
 }
 if(page==='escuela'){if(has('Cursos y fechas'))out.school.intakes=copy(list(s.intakes));if(has('Tarifas de servicios'))out.school.courseRates=copy(s.courseRates||{});}

 if(page==='pendientes'){
  if(has('Alertas de aeronaves')){
   const records=v=>Array.isArray(v)?v:v&&typeof v==='object'?Object.keys(v).sort().map(k=>v[k]):[];
   const hourFields='ciclos_totales ciclos_limite limite_motor limite_helice helice1_ciclos helice2_ciclos helice1_limite helice2_limite proxima_inspeccion horas_acum_50 horas_acum_100 horas_totales horas_limite';
   for(const [id,ac]of Object.entries(data.fleet||{})){
    const aircraft={component_schema_v2:true,...pick(ac,hourFields)};
    aircraft.documentos=records(ac.documentos).map(doc=>pick(doc,'nombre vence'));
    for(const kind of ['salvavidas','extintor','flares','botiquin'])
     Object.assign(aircraft,pick(ac,'emerg_'+kind+' emerg_'+kind+'_fechas'));
    aircraft.mantenimiento=records(ac.mantenimiento).filter(m=>m.nombre&&!m.resuelto).map(m=>({
     ...pick(m,'nombre resuelto'),piezas:list(m.piezas).filter(p=>p.estado==='pedida'&&p.nombre).map(p=>pick(p,'nombre estado fecha_pedido proveedor'))
    }));
    out.fleet[id]=aircraft;
   }
  }
  if(has('Alertas de pilotos')&&account.role!=='Estudiante')
   out.pilotos=list(data.pilotos).map(p=>({...pick(p,'nombre licencia instructorExpiry rpaInstructorExpiry medico charter escuela'),verificaciones:list(p.verificaciones).map(v=>pick(v,'nombre fecha'))}));
 }

 return {data:out,areas,notice:page==='pendientes'&&!has('Alertas de aeronaves')&&(!has('Alertas de pilotos')||account.role==='Estudiante')?'No hay una fuente de alertas disponible para las categorías autorizadas en este cargo.':null};
}
module.exports={nativeView};



Warning: truncated output (original token count: 53357)
Total output lines: 3568

'use strict';
(function(root){
 const iso=v=>{const s=String(v||'');if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';};
 function monthEnd(value){const m=String(value||'').match(/^(\d{2})\/(\d{4})$/)||String(value||'').match(/^(\d{4})-(\d{2})$/)?.slice(0,1).concat(String(value).slice(5,7),String(value).slice(0,4));if(!m||+m[1]<1||+m[1]>12)return '';return new Date(Date.UTC(+m[2],+m[1],0)).toISOString().slice(0,10);}
 function items(p){return [['Licencia de instructor',p.instructorExpiry],['Instructor de RPA',p.rpaInstructorExpiry],['Certificado médico',monthEnd(iso(p.medico).slice(0,7))],['Verificación de chárter',p.charter],...(p.verificaciones||[]).map(v=>['Verificación '+(v.nombre||''),v.fecha])].filter(([,d])=>iso(d)).map(([label,d])=>({label,date:iso(d)}));}
 function alerts(p,date='',time='',now=Date.now()){const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Panama'}).format(now);const target=iso(date)||today;const at=Math.max(now,Date.parse(target+'T'+(time||'00:00')+':00-05:00')||now);return items(p).map(i=>{const days=Math.round((Date.parse(i.date)-Date.parse(target>today?target:today))/86400000),expired=at>=Date.parse(i.date+'T12:01:00-05:00');return {...i,days,expired,level:expired?'danger':days<=5?'orange':days<=30?'warn':'ok'};});}
 function assertAssignment(pilots,names,date,time){for(const name of names.filter(Boolean)){const p=(pilots||[]).find(p=>String(p.nombre||'').trim().toLowerCase()===String(name).trim().toLowerCase());if(!p)continue;const expired=alerts(p,date,time).filter(a=>a.expired);if(expired.length)throw Error('No se puede asignar a '+name+': '+expired.map(a=>a.label+' vencido ('+a.date+')').join(', ')+'. Actualiza su expediente.');}}
 function validateChanges(before,after){for(const [oldRows,newRows,registry]of [[before.itinerarios,after.itinerarios,false],[before.school?.registry?.entries,after.school?.registry?.entries,true]])for(const f of newRows||[]){const old=(oldRows||[]).find(x=>x.id===f.id);if(old&&(registry?['pilot','copilot','date','aircraft']:['piloto','fecha','horaInicio','horaFin','aeronave']).every(k=>old[k]===f[k]))continue;if(f.deleted||f.cancelled||f.anulado)continue;assertAssignment(before.pilotos,registry?[f.pilot,f.copilot]:[f.piloto],registry?f.date:f.fecha,registry?'':f.horaFin||f.horaInicio);}}
 const api={iso,monthEnd,items,alerts,assertAssignment,validateChanges};if(typeof module==='object'&&module.exports)module.exports=api;else root.PilotValidity=api;
})(typeof globalThis!=='undefined'?globalThis:this);

function isMultimotor(reg){return ['HP-880BL','HP-18BLM','HP-1805BLM','HP1186'].includes(reg);}
// ===== DRAWER HAMBURGUESA (móvil) =====
function openDrawer() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('active');
  document.body.style.overflow = '';
}
function initDrawer() {
  // Cerrar drawer al seleccionar un tab
  var sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.addEventListener('click', function(e) {
      if (e.target.closest('.aircraft-tab')) closeDrawer();
    });
  }
}

// Vista independiente: copia inicial + almacenamiento solo en este navegador.
let previewData = structuredClone(window.CLOUD_INITIAL);
// Initialize missing per-side data without assuming an engine or propeller value.
for(const reg of ['HP-880BL','HP-18BLM','HP-1805BLM','HP1186']){
 const d=previewData.fleet[reg.replace(/[^a-zA-Z0-9]/g,'_')]||{};
 if(!d.component_schema_v2){
   for(const kind of ['motor','helice']){
     d[kind+'_serie_izq'] ??= d[kind+'_serie']||'';
     for(const field of ['fabricante','modelo','serie']) d[kind+'_'+field+'_der'] ??= '';
   }
   if(reg==='HP1186'){
     d.motor_fabricante_der ||= 'Lycoming';d.motor_modelo_der ||= 'TIO-540-J2BD';
     d.helice_fabricante_der ||= 'Hartzell';d.helice_modelo_der ||= 'HC-C4YR-2';
   }else{
     if(reg!=='HP-880BL'){
       d.helice_horas_sin_lado=d.ciclos_limite;
       d.ciclos_limite='';d.limite_helice='';
       if(parseFloat(d.helice_horas_sin_lado)>0)d.estatus_nota=(d.estatus_nota||'')+'\nHoras de hélices del registro anterior, sin lado identificado: '+d.helice_horas_sin_lado+' h. Pendiente de distribuir por lado.';
     }
     for(const key of ['ciclos_totales','ciclos_limite','helice1_ciclos','helice2_ciclos'])if(d[key]==null || parseFloat(d[key])===0)d[key]='';
     for(const key of ['limite_motor','limite_helice','helice1_limite','helice2_limite'])d[key]='';
   }
   d.component_schema_v2=true;
 }
 previewData.fleet[reg.replace(/[^a-zA-Z0-9]/g,'_')]=d;
}
const db={ref(path){return {
 async set(value){const next=structuredClone(previewData);next[path]=structuredClone(value);return commitPreview(next);},
 on(event,cb){cb({val:()=>structuredClone(previewData[path]||null)});},
 once(event,cb){cb({val:()=>structuredClone(previewData[path]||null)});}
};}};
function exportPreview(){ const blob=new Blob([JSON.stringify(window.failedCloudData||previewData,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob);a.download='respaldo-charters-sergio.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
function panamaISO(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function isoFecha(s){if(!s)return ''; if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:'';}
function fechaVista(s){const v=isoFecha(s);return v?v.slice(8)+'/'+v.slice(5,7)+'/'+v.slice(0,4):s;}
function dayNumber(s){const iso=isoFecha(s); if(!iso)return NaN;const [y,m,d]=iso.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?dt.getTime()/86400000:NaN;}
// Firebase save/load
const aircraftDirty = new Set();
previewData.undoFleet ||= {};
function aircraftKey(reg){return reg.replace(/[^a-zA-Z0-9]/g,'_');}
function decodeAircraft(value){
  const d=structuredClone(value||{});
  for(const key of ['mantenimiento','documentos','bitacora_horas','bitacora_pedidos','bitacora_vencimientos']){
    if(d[key] && !Array.isArray(d[key]))d[key]=Object.keys(d[key]).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(k=>d[key][k]);
  }
  return d;
}
function updateUndoButtons(){
  fleet.forEach((ac,idx)=>{const b=document.getElementById('undo-btn-'+idx);if(b)b.disabled=!aircraftDirty.has(idx)&&!(previewData.undoFleet[aircraftKey(ac.reg)]||[]).length;});
}
async function commitPreview(next){
 try{window.HPCompany?.validateChanges(previewData,arguments[0]);window.HPSchoolInformation?.validateChanges(previewData,arguments[0]);PilotValidity.validateChanges(previewData,arguments[0]);window.HPSchoolCertificates?.validateChanges(previewData,arguments[0]);}catch(e){alert(e.message);return false;}

 try{await window.cloudWrite(next);const flightsChanged=JSON.stringify(previewData.itinerarios)!==JSON.stringify(next.itinerarios);previewData=structuredClone(next);if(flightsChanged&&window.DASHBOARD_READY){flightsData=structuredClone(next.itinerarios||[]);renderDailySchedule();}return true;}
 catch(e){if(window.ROLE_VIEW){pilotosData.splice(0,pilotosData.length,...structuredClone(previewData.pilotos||[]));flightsData=structuredClone(previewData.itinerarios||[]);renderPilotos();renderCalendar();if(calSelectedDate)renderDayFlights(calSelectedDate);}window.showCloudError(e);return false;}
}
async function saveData(reg,data){
  const key=aircraftKey(reg),next=structuredClone(previewData);
  const before=decodeAircraft(previewData.fleet[key]),after=decodeAircraft(data);
  appendVencimientoRecord(reg,before,after);
  if(JSON.stringify(before)!==JSON.stringify(after)){
    const history=next.undoFleet[key] ||= [];history.push(before);if(history.length>20)history.shift();
    next.fleet[key]=after;
  }
  const ok=await commitPreview(next);
  if(ok){
    data.bitacora_vencimientos=structuredClone(after.bitacora_vencimientos||[]);
    const idx=fleet.findIndex(ac=>ac.reg===reg);
    if(idx>=0){state[idx].bitacora_vencimientos=structuredClone(data.bitacora_vencimientos);renderVencimientoLog(idx);}
  }
  return ok;
}
async function undoAircraft(idx){
  const key=aircraftKey(fleet[idx].reg),next=structuredClone(previewData);
  let restored;
  if(aircraftDirty.has(idx)) restored=decodeAircraft(next.fleet[key]);
  else {const history=next.undoFleet[key]||[];if(!history.length)return;restored=decodeAircraft(history.pop());next.fleet[key]=restored;}
  const linked=d=>(d.bitacora_tac||[]).filter(r=>r.registryId).map(r=>[r.registryId,r.anterior,r.actual,r.hv]);
  if(!aircraftDirty.has(idx)&&JSON.stringify(linked(previewData.fleet[key]||{}))!==JSON.stringify(linked(restored))){alert('Este cambio está vinculado a Registro. Usa Corregir horas / TAC allí para mantener la sincronización.');return;}
  if(!await commitPreview(next))return;
  state[idx]=structuredClone(restored);aircraftDirty.delete(idx);
  const old=document.getElementById('panel-'+idx),replacement=buildPanel(fleet[idx],state[idx],idx);
  replacement.className=old.className;old.replaceWith(replacement);
  refreshPanel(idx);setupDates();updateSummary();buildResumen();updateUndoButtons();
  const msg=document.getElementById('save-msg-'+idx);msg.textContent='↶ Cambios deshechos';msg.style.opacity='1';
}
function loadData(reg) {
  return null;
}

async function loadAllFromFirebase() {
  if (!db) return {};
  return new Promise((resolve) => {
    db.ref('fleet').once('value', (snapshot) => {
      resolve(snapshot.val() || {});
    });
  });
}

async function savePilotos() {
  if (db) {
    const ok=await db.ref('pilotos').set(pilotosData);
    if(ok){
      renderPilotos();
      updatePilotDropdown();
      buildResumen();
      window.PilotDossiers?.refresh();
      window.Registro?.refresh();
    }
    return ok;
  }
}

const fleet = [
  { reg: "HP-1784", model: "Piper Warrior",        type: "fixed" },
  { reg: "HP-1819", model: "Piper Cherokee",       type: "fixed" },
  { reg: "HP-1930", model: "Grob G115",            type: "fixed" },
  { reg: "HP-1815", model: "Piper Warrior",        type: "fixed" },
  { reg: "HP-1579", model: "Piper Archer",         type: "fixed" },
  { reg: "HP-1907", model: "Piper Cherokee",       type: "fixed" },
  { reg: "HP-880BL",  model: "Piper Seneca",         type: "fixed" },
  { reg: "HP-18BLM",  model: "Beechcraft King Air",  type: "fixed" },
  {reg:"HP1186",model:"Piper Navajo Panther PA-31-325",type:"fixed"},
  { reg: "HP-1805BLM",model: "Piper Navajo", type: "fixed" },
  {reg:"HP-11BL",model:"Bell 206",type:"rotor"},
];

// Persistent data store (localStorage)
// localStorage saveData removed - using Firebase only
function loadData(reg) { return null; }

// Default empty aircraft data
function defaultAc(ac) {
  return {
    status: "",
    serial: "", year: "", voltaje: "", motor_fabricante: "", motor_modelo: "", motor_serie: "", helice_fabricante: "", helice_modelo: "", helice_serie: "", limite_motor: "", limite_helice: "", horas_diarias: "", horas_acum_50: "", horas_acum_100: "", bitacora_horas: [], ultimo_venc_hv: "", ultimo_venc_fecha: "",
    horas_totales: "", horas_limite: "", fecha_50: "", fecha_100: "",
    ciclos_totales: "", ciclos_limite: "",
    helice1_ciclos: "", helice1_limite: "", fecha_helice1: "",
    helice2_ciclos: "", helice2_limite: "", fecha_helice2: "",
    horas_desde_revision: "", horas_hasta_revision: "", estatus_nota: "",
    mantenimiento: [
      { nombre: "", fecha: "", resuelto: false, piezas: [] },
      { nombre: "", fecha: "", resuelto: false, piezas: [] },
      { nombre: "", fecha: "", resuelto: false, piezas: [] },
    ],
    documentos: [
      { nombre: "Certificado de Aeronavegabilidad", vence: "", estado: "" },
      { nombre: "Matrícula", vence: "", estado: "" },
      { nombre: "ELT", vence: "", estado: "" },
      { nombre: "Pitot Estático", vence: "", estado: "" },
      { nombre: "Transponder/Encoder", vence: "", estado: "" },
      { nombre: "Peso y Balance", vence: "", estado: "" },

    ]
  };
}

function daysUntil(dateStr) { const n=dayNumber(dateStr)-dayNumber(panamaISO());return Number.isFinite(n)?n:null; }
function daysBadge(days) {
  if (days === null) return '<span class="days-badge days-empty">—</span>';
  if (days < 0) return `<span class="days-badge days-danger">VENC</span>`;
  if (days <= 5) return `<span class="days-badge days-orange">${days}d</span>`;
  if (days <= 30) return `<span class="days-badge days-warn">${days}d</span>`;
  return `<span class="days-badge days-ok">${days}d</span>`;
}
function pct(v, l) {
  const n = parseFloat(v), lim = parseFloat(l);
  if (!n || !lim) return null;
  return Math.min(100, Math.round(n / lim * 100));
}
// Hour indicators use the configured component limit.
function updateHorasWarning(input,limit) {
  if(!input)return;
  const value=Number(input.value||0);
  const level=[50,100].includes(limit)?inspectionFill(value,limit):(value>=limit?'fill-danger':'fill-ok');
  input.style.background=level==='fill-danger'?'rgba(204,17,34,.12)':level==='fill-warn'?'rgba(234,190,0,.15)':'';
  input.style.borderColor=level==='fill-danger'?'var(--danger)':level==='fill-warn'?'var(--warn)':'';
}

function setFechaHoy(elemId) {
  const el = document.getElementById(elemId);
  if (el) el.textContent = fechaVista(panamaISO());
}

// Shared by aircraft bars, Pendientes and itinerary warnings. Never invent a limit.
function vencHoursLevel(hv, limit) {
  if(hv==='' || hv==null || !Number.isFinite(Number(hv)) || !(Number(limit)>0) || !Number.isFinite(Number(limit)))return 'empty';
  const used=Number(hv),max=Number(limit);
  return used>=max?'danger':used>=max*.8?'warn':'ok';
}
function vencBarPct(hv, limit) {
  if(vencHoursLevel(hv,limit)==='empty')return 0;
  return Math.max(0,Math.min(100,Math.round(Number(hv)/Number(limit)*100)));
}
function vencBarCls(hv, limit) {
  return 'fill-'+vencHoursLevel(hv,limit);
}
function vencBarLabel(hv, limit) {
  if(!(Number(limit)>0)||!Number.isFinite(Number(limit)))return 'Límite pendiente de confirmar';
  if(vencHoursLevel(hv,limit)==='empty')return '—';
  const rem=Number(limit)-Number(hv),used=Math.round(Number(hv)/Number(limit)*100);
  return rem>0?`Quedan ${rem.toFixed(2)} HV (${100-used}%)`:'VENCIDO';
}
function aircraftHourAlerts(reg,d) {
  return vencimientoSnapshot(reg,d).map(c=>({...c,level:vencHoursLevel(c.total,c.limite)}))
    .filter(c=>c.level==='warn'||c.level==='danger');
}
// Configuration notices belong in Pendientes, not in expiration calculations.
function aircraftHourConfigurationAlerts(reg,d) {
  return vencimientoSnapshot(reg,d)
    .filter(c=>c.total!==null && (!(c.limite>0) || !Number.isFinite(c.limite)))
    .map(c=>({...c,level:'info'}));
}
function updateVencBar(tipo, idx, val, limit) {
  limit=state[idx][VENC_FIELD_MAP[tipo].limiteField];
  const tipoId = tipo === 'motor' ? 'motor' : (tipo === 'helices' ? 'helices' : tipo);
  const pb = document.getElementById('pb-' + tipoId + '-' + idx);
  const pct = document.getElementById('pct-' + tipoId + '-' + idx);
  if (pb) { pb.style.width = vencBarPct(val, limit) + '%'; pb.className = 'progress-fill ' + vencBarCls(val, limit); }
  if (pct) pct.textContent = vencBarLabel(val, limit);
  renderVencimientoLog(idx);
}

function fillCls(p) {
  if (p === null) return 'fill-empty';
  if (p >= 90) return 'fill-danger';
  if (p >= 70) return 'fill-warn';
  return 'fill-ok';
}
function buildGauge(val, max, color) {
  const v = parseFloat(val), m = parseFloat(max);
  if (!v || !m) return `<svg class="gauge-svg" viewBox="0 0 120 70"><path d="M 5 65 A 55 55 0 0 1 115 65" fill="none" stroke="#243550" stroke-width="10" stroke-linecap="round"/></svg>`;
  const p = Math.min(1, v / m);
  const r=55, cx=60, cy=65;
  const x2 = cx + r * Math.cos(Math.PI + p * Math.PI);
  const y2 = cy + r * Math.sin(Math.PI + p * Math.PI);
  const lg = p > 0.5 ? 1 : 0;
  return `<svg class="gauge-svg" viewBox="0 0 120 70">
    <path d="M 5 65 A 55 55 0 0 1 115 65" fill="none" stroke="#243550" stroke-width="10" stroke-linecap="round"/>
    <path d="M 5 65 A 55 55 0 ${lg} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" opacity="0.9"/>
  </svg>`;
}
function gaugeColor(v, m) {
  const p = parseFloat(v) / parseFloat(m);
  if (!p || isNaN(p)) return '#243550';
  if (p >= 0.85) return '#ff4455';
  if (p >= 0.6) return '#ffaa00';
  return '#00e599';
}

// Render one "Vencimiento en Horas" item (Motor, Helices, Helice1, Helice2, etc.)
// fieldMapKey: key in VENC_FIELD_MAP. manualInputId: id for the manual total input.
function vencItemHtml(idx, label, fieldMapKey, manualInputId, value, limite, fechaField, data, isLast) {
  const v = value !== undefined && value !== '' ? parseFloat(value).toFixed(2) : '';
  return `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span class="field-label">${label}</span>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">Total manual:</span>
              <input type="number" class="field-input" id="${manualInputId}-${idx}" value="${v}" placeholder="0.00" min="0" step="0.01" inputmode="decimal" style="width:75px;font-size:10px" oninput="establecerTotalVenc('${fieldMapKey}',${idx},this.value)">
              <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">HV</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-bottom:2px">
            <span style="font-family:'Orbitron',sans-serif;font-size:13px;color:var(--text)" id="acum-${fieldMapKey}-${idx}">${value!=='' && value!=null ? parseFloat(value).toFixed(2) : '—'}</span>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">/</span>
            <input type="number" id="limite-${fieldMapKey}-${idx}" value="${limite??''}" placeholder="Pendiente" min="0" step="0.01" inputmode="decimal" style="width:65px;font-family:'IBM Plex Mono',monospace;font-size:9px;border:1px solid var(--border);border-radius:8px;background:var(--panel2);color:var(--accent);text-align:center;padding:1px 4px" oninput="updateLimiteVenc('${fieldMapKey}',${idx},this.value)">
            <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--accent)">HV</span>
          </div>
          <div class="progress-bar" style="margin-bottom:2px">
            <div id="pb-${fieldMapKey}-${idx}" class="progress-fill ${vencBarCls(value,limite)}" style="width:${vencBarPct(value,limite)}%"></div>
          </div>
          <div style="display:flex;justify-content:space-between${isLast ? '' : ';margin-bottom:10px'}">
            <span class="pct-text" id="pct-${fieldMapKey}-${idx}">${vencBarLabel(value,limite)}</span>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">Actualizado: <span id="fecha-${fieldMapKey}-${idx}" style="color:var(--accent)">${fechaField||'—'}</span></span>
          </div>`;
}

function componentIcon(kind){
 const shape=kind==='motor'
 ? '<rect x="9" y="8" width="10" height="12" rx="2"/><path d="M9 10H4v3h5M9 16H3v3h6M19 10h5v3h-5M19 16h6v3h-6M11 8V5h6v3M12 20v3h4v-3M6 9v5M5 15v5M22 9v5M23 15v5"/>'
 : '<path d="M14 12C11 8 10 2 14 2c4 0 3 6 0 10ZM16 15c5-1 10 1 8 4s-7 1-8-4ZM12 15c-2 5-7 8-9 5s3-6 9-5Z"/><circle cx="14" cy="14" r="2.5"/>';
 return `<svg class="component-icon" viewBox="0 0 28 28" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
}

function componentInfoMultimotor(kind, data, idx) {
  const title = kind === 'motor' ? componentIcon('motor')+' MOTORES' : componentIcon('helice')+' HÉLICES';
  const escapeAttr = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
    <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--accent2);letter-spacing:2px;margin-bottom:6px">${title}</div>
    ${['izq','der'].map(side => {
      const name = side === 'izq' ? 'IZQUIERDO' : 'DERECHO';
      return `<div style="margin-top:8px">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:6px">${kind === 'motor' ? 'MOTOR' : 'HÉLICE'} ${side === 'izq' && kind === 'helice' ? 'IZQUIERDA' : side === 'der' && kind === 'helice' ? 'DERECHA' : name}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        ${[['fabricante','FABRICANTE'],['modelo','MODELO'],['serie','N.º DE SERIE']].map(([field,label]) => {
          const key = kind + '_' + field + (side === 'der' ? '_der' : '');
          const initial = field === 'serie' ? data[kind + '_serie_' + side] : data[key];
          return `<div><div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">${label}</div><input type="text" class="field-input" id="${key}-${idx}" aria-label="${kind === 'motor' ? 'Motor' : 'Hélice'} ${side === 'izq' ? 'izquierdo' : 'derecho'} ${label.toLowerCase()}" value="${escapeAttr(initial)}" placeholder="${label === 'N.º DE SERIE' ? 'N.º de serie' : label}" style="width:100%;font-size:11px"></div>`;
        }).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function buildPanel(ac, data, idx) {
  const panel = document.createElement('div');
  panel.className = 'aircraft-panel';
  panel.id = 'panel-' + idx;

  panel.innerHTML = `

    <div class="aircraft-header aircraft-detail-header">
      <div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div class="aircraft-reg">${ac.reg}</div>
          <button class="save-btn" style="padding:8px 12px" onclick="savePanel(${idx})">💾 GUARDAR</button>
          <button class="save-btn" id="undo-btn-${idx}" style="padding:8px 12px;background:var(--panel2);color:var(--accent);box-shadow:none;border:1px solid var(--border)" onclick="undoAircraft(${idx})" title="Deshacer últimos cambios" aria-label="Deshacer últimos cambios" disabled>↶</button>
          <span class="save-msg" style="margin-left:0" id="save-msg-${idx}" aria-live="polite">✓ Guardado</span>
        </div>
        <div class="aircraft-model-line">${ac.model} ${ac.type === 'rotor' ? '· Helicóptero' : '· Ala fija'}</div>
      </div>
      <div class="status-select-wrap">
        <select class="status-select" id="status-${idx}" onchange="onStatusChange(${idx},this.value)">
          <option value="" ${!data.status?'selected':''}>Sin registrar</option>
          <option value="operativo" ${data.status==='operativo'?'selected':''}>✅ Operativo</option>
          <option value="mantenimiento" ${data.status==='mantenimiento'?'selected':''}>🔧 Mantenimiento</option>
          <option value="aog" ${data.status==='aog'?'selected':''}>🔴 GROUNDED</option>
        </select>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">N.º DE SERIE</div>
            <input type="text" class="field-input" id="serial-${idx}" value="${data.serial||''}" placeholder="Ej: 12345" style="width:100%;font-size:11px">
          </div>
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">AÑO</div>
            <input type="text" class="field-input" id="year-${idx}" value="${data.year||''}" placeholder="2020" style="width:100%;font-size:11px">
          </div>
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">VOLTAJE</div>
            <input type="text" class="field-input" id="voltaje-${idx}" value="${data.voltaje||''}" placeholder="12V / 24V" style="width:100%;font-size:11px">
          </div>
        </div>
        ${isMultimotor(ac.reg) ? componentInfoMultimotor('motor', data, idx) : `
        <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--accent2);letter-spacing:2px;margin-bottom:6px">${componentIcon('motor')} MOTOR</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">FABRICANTE</div>
              <input type="text" class="field-input" id="motor_fabricante-${idx}" value="${data.motor_fabricante||''}" placeholder="Ej: Lycoming" style="width:100%;font-size:11px">
            </div>
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">MODELO</div>
              <input type="text" class="field-input" id="motor_modelo-${idx}" value="${data.motor_modelo||''}" placeholder="Ej: O-360" style="width:100%;font-size:11px">
            </div>
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">N.º DE SERIE</div>
              <input type="text" class="field-input" id="motor_serie-${idx}" value="${data.motor_serie||''}" placeholder="N.º de serie" style="width:100%;font-size:11px">
            </div>
          </div>
        </div>
        `}
        ${isMultimotor(ac.reg) ? componentInfoMultimotor('helice', data, idx) : `
        <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--accent2);letter-spacing:2px;margin-bottom:6px">${componentIcon('helice')} HÉLICE</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">FABRICANTE</div>
              <input type="text" class="field-input" id="helice_fabricante-${idx}" value="${data.helice_fabricante||''}" placeholder="Ej: Hartzell" style="width:100%;font-size:11px">
            </div>
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">MODELO</div>
              <input type="text" class="field-input" id="helice_modelo-${idx}" value="${data.helice_modelo||''}" placeholder="Ej: HC-C2YK" style="width:100%;font-size:11px">
            </div>
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">N.º DE SERIE</div>
              <input type="text" class="field-input" id="helice_serie-${idx}" value="${data.helice_serie||''}" placeholder="N.º de serie" style="width:100%;font-size:11px">
            </div>
          </div>
        </div>
        `}
      </div>
    </div>

    <div class="divider-label">⏱ Horas de vuelo y ciclos</div>
    <div class="section-grid">
      <div class="card">
        <div class="card-title">✈ Inspección de 50 / 100 horas</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <label class="field-label">TAC anterior<input type="number" class="field-input" id="tac-anterior-${idx}" aria-label="TAC anterior" min="0" max="99999.99" step="0.01" inputmode="decimal" placeholder="00000.00" value="${data.tac_anterior||''}" style="width:100%;margin-top:6px" oninput="updateTAC(${idx})"></label>
          <label class="field-label">TAC actual<input type="number" class="field-input" id="tac-actual-${idx}" aria-label="TAC actual" min="0" max="99999.99" step="0.01" inputmode="decimal" placeholder="00000.00" style="width:100%;margin-top:6px" oninput="updateTAC(${idx})"></label>
        </div>
        <div id="tac-msg-${idx}" aria-live="polite" style="font-size:11px;color:var(--muted);margin-bottom:10px">Ingresa ambos TAC para calcular las horas.</div>
        <div class="inspection-controls"><button type="button" class="record-btn" onclick="openRecordEditor('inspection',${idx},-1,50)">✓ Resuelto · 50 horas</button><button type="button" class="record-btn" onclick="openRecordEditor('inspection',${idx},-1,100)">✓ Resuelto · 100 horas</button></div>
        <div class="field-row" style="margin-bottom:4px">
          <span class="field-label">Horas del día</span>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" class="field-input" id="horas_diarias-${idx}" value="${data.horas_diarias||''}" placeholder="0.00" min="0" step="0.01" inputmode="decimal" style="width:80px">
            <span class="field-unit">HV</span>
          </div>
        </div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);text-align:right;margin-bottom:10px">
          Último ingreso: <span id="fecha-diaria-${idx}" style="color:var(--accent)">${data.fecha_diaria||'—'}</span>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px">
          <div class="field-row" style="margin-bottom:2px">
            <span class="field-label">Acum. 50 h</span>
            <div><input type="number" class="field-input" id="edit-acum50-${idx}" min="0" max="99999.99" step="0.01" inputmode="decimal" aria-label="Horas acumuladas de 50 horas" value="${parseFloat(data.horas_acum_50||0).toFixed(2)}" oninput="editInspectionHours(${idx},this)" style="width:100px"><span class="field-unit"> HV</span><span id="acum50-${idx}" hidden>${parseFloat(data.horas_acum_50||0).toFixed(2)} HV</span></div>
          </div>
          <div class="progress-bar" style="margin-bottom:8px">
            <div id="pb-50-${idx}" class="progress-fill ${inspectionFill(data.horas_acum_50, 50)}" style="width:${Math.min(100,parseFloat(data.horas_acum_50||0)/50*100)}%"></div>
          </div>
          <div class="field-row" style="margin-bottom:2px">
            <span class="field-label">Acum. 100 h</span>
            <span style="font-family:'Orbitron',sans-serif;font-size:13px;color:var(--text)" id="acum100-${idx}">${parseFloat(data.horas_acum_100||0).toFixed(2)} HV</span>
          </div>
          <div class="progress-bar">
            <div id="pb-100-${idx}" class="progress-fill ${inspectionFill(data.horas_acum_100, 100)}" style="width:${Math.min(100,parseFloat(data.horas_acum_100||0)/100*100)}%"></div>
          </div>
        </div>
        <input type="hidden" id="horas_totales-${idx}" value="${data.horas_acum_50||''}">
        <input type="hidden" id="horas_limite-${idx}" value="${data.horas_acum_100||''}">
        <span id="fecha50-${idx}" style="display:none"></span>
        <span id="fecha100-${idx}" style="display:none"></span>
        <div id="pct-horas-${idx}" style="display:none"></div>
        <div id="pb-horas-${idx}" style="display:none"></div>
      </div>

      <div class="card">
        <div class="card-title">📋 Bitácora de Horas de Vuelo</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 80px 80px 30px;gap:6px;padding:4px 0;border-bottom:1px solid var(--dim)">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">FECHA</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">HORA</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">HV DÍA</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">ACUM.</span>
          <span></span>
        </div>
        <div id="bitacora-horas-${idx}">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted);text-align:center;padding:8px 0">Sin registros</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">⚙️ Vencimientos en Horas</div>
        <div class="field-row" style="margin-bottom:4px">
          <span class="field-label">Horas del día</span>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" class="field-input" id="horas-venc-dia-${idx}" placeholder="0.00" min="0" step="0.01" inputmode="decimal" style="width:80px">
            <span class="field-unit">HV</span>
          </div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
          ${vencItemHtml(idx, isMultimotor(ac.reg) ? 'Motor izquierdo' : 'Motor', 'motor', 'motor-manual', data.ciclos_totales, (isMultimotor(ac.reg)?data.limite_motor:data.limite_motor), data.fecha_motor, data, false)}
          ${vencItemHtml(idx, isMultimotor(ac.reg) ? 'Motor derecho' : 'Hélices', 'helices', 'helices-manual', data.ciclos_limite, data.limite_helice, data.fecha_helices, data, !isMultimotor(ac.reg))}
          ${isMultimotor(ac.reg) ? `
          <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:6px">
            ${vencItemHtml(idx, 'Hélice izquierda', 'helice1', 'helice1-manual', data.helice1_ciclos, data.helice1_limite, data.fecha_helice1, data, false)}
            ${vencItemHtml(idx, 'Hélice derecha', 'helice2', 'helice2-manual', data.helice2_ciclos, data.helice2_limite, data.fecha_helice2, data, true)}
          </div>` : ''}
        </div>
        <input type="hidden" id="ciclos_totales-${idx}" value="${data.ciclos_totales||''}">
        <input type="hidden" id="ciclos_limite-${idx}" value="${data.ciclos_limite||''}">
        ${isMultimotor(ac.reg) ? `
        <input type="hidden" id="helice1_ciclos-${idx}" value="${data.helice1_ciclos||''}">
        <input type="hidden" id="helice2_ciclos-${idx}" value="${data.helice2_ciclos||''}">` : ''}
        <div style="display:none"><div id="pb-ciclos-${idx}"></div><span id="pct-ciclos-${idx}"></span></div>
        <div id="ultimo-venc-${idx}" style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px;display:${data.ultimo_venc_hv?'flex':'none'};justify-content:space-between;align-items:center">
          <div>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">ÚLTIMO REGISTRO: </span>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--accent);font-weight:700">${data.ultimo_venc_hv ? parseFloat(data.ultimo_venc_hv).toFixed(2) : ''} HV</span>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-left:8px">${data.ultimo_venc_fecha||''}</span>
          </div>
          <button onclick="revertirVenc(${idx})" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:16px;padding:0 4px" title="Revertir último ingreso">✕</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📊 Estatus</div>
        <div style="text-align:center;padding:12px 0 8px">
          <div id="estatus-badge-${idx}" style="font-family:'Orbitron',sans-serif;font-size:14px;font-weight:900;letter-spacing:1px;padding:10px 16px;border-radius:8px;display:inline-block;${
            data.status==='operativo'?'color:var(--ok);background:rgba(0,119,68,0.1);border:1px solid var(--ok)':
            data.status==='mantenimiento'?'color:var(--warn);background:rgba(204,119,0,0.1);border:1px solid var(--warn)':
            'color:var(--danger);background:rgba(204,17,34,0.1);border:1px solid var(--danger)'
          }">${
            (
              data.status==='operativo'?'✅ OPERATIVO':
              data.status==='mantenimiento'?'🔧 MANTENIMIENTO':
              data.status==='aog'?'🔴 GROUNDED':'SIN REGISTRAR'
            )
          }</div>
        </div>
        <div style="margin-top:8px">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:4px">NOTA</div>
          <textarea id="estatus_nota-${idx}" placeholder="Motivo o descripción..." style="width:100%;font-family:'IBM Plex Sans',sans-serif;font-size:11px;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--panel2);color:var(--text);resize:vertical;min-height:60px">${data.estatus_nota||''}</textarea>
        </div>
        <input type="hidden" id="horas_desde-${idx}" value="${data.horas_desde_revision||''}">
        <input type="hidden" id="horas_hasta-${idx}" value="${data.horas_hasta_revision||''}">
        <div id="gauge-wrap-${idx}" style="display:none"></div>
        <div id="gauge-val-${idx}" style="display:none"></div>
      </div>
    </div>

    <div class="divider-label">🔧 Taller</div>
    <div class="section-grid-2">
      <div class="card">
        <div class="card-title">🔧 Pendientes de Taller</div>
        <div style="display:grid;grid-template-columns:1fr 150px 60px auto auto;gap:8px;border-bottom:1px solid var(--dim);padding-bottom:6px;margin-bottom:4px">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">TAREA</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">FECHA DE INICIO</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">DÍAS</span>
          <span></span>
          <span></span>
        </div>
        <div id="maint-list-${idx}"></div>
        <button class="add-row-btn" onclick="addMaintRow(${idx})">+ Agregar tarea</button>
      </div>
      <div class="card">
        <div class="card-title">📖 Bitácora de Mantenimientos</div>
        <div id="bitacora-list-${idx}">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted);text-align:center;padding:8px 0">Sin registros</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📦 Seguimiento de Pedidos</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 80px 60px;gap:8px;padding:4px 0;border-bottom:1px solid var(--dim);margin-bottom:4px">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">PIEZA</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">TAREA</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">PROVEEDOR</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">F. PEDIDO</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--warn)">DÍAS</span>
        </div>
        <div id="seguimiento-${idx}">
          <div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-align:center;padding:8px 0">Sin pedidos pendientes</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📦 Bitácora de Pedidos Recibidos</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 80px 80px 60px 30px;gap:6px;padding:4px 0;border-bottom:1px solid var(--dim);margin-bottom:4px">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">PIEZA</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">TAREA</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">PROVEEDOR</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">PEDIDA</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">RECIBIDA</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">DÍAS</span>
          <span></span>
        </div>
        <div id="bitacora-pedidos-${idx}">
          <div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-align:center;padding:8px 0">Sin registros</div>
        </div>
      </div>

      <div class="card" style="grid-column:1 / -1">
        <div class="card-title">📋 Bitácora de Vencimientos en Horas</div>
        <div id="venc-log-${idx}"></div>
      </div>
      <div class="card">
        <div class="card-title">📋 Documentos y certificaciones</div>
        <div id="doc-list-${idx}"></div>
        <button class="add-row-btn" onclick="addDocRow(${idx})">+ Agregar documento</button>
        <div class="emerg-section">
          <div class="emerg-title" onclick="toggleEmerg(${idx})">🚨 Equipos de Emergencia <span id="emerg-arrow-${idx}">▾</span></div>
          <div class="emerg-body" id="emerg-body-${idx}">${emergencyFieldsHtml(idx,data)}</div>
        </div>
      </div>
    </div>



    <div class="divider-label">📋 Bitácoras de tacómetros e inspecciones</div>
    <div class="section-grid-2">
      <div class="card"><div class="card-title">📋 Bitácora de Tacómetros</div><div id="tac-log-${idx}"></div></div>
      <div class="card"><div class="card-title">🔧 Bitácora de Inspecciones</div><div id="inspection-log-${idx}"></div></div>
    </div>
  `;

  arrangeAircraftHeader(panel);
  arrangeAircraftCards(panel);
  window.School?.decorateAircraftPanel(panel,ac.reg);
  return panel;
}

function arrangeAircraftHeader(panel){
 const header=panel.querySelector('.aircraft-detail-header');if(!header)return;
 const identity=header.firstElementChild,info=header.querySelector('.status-select-wrap');
 const reg=identity.querySelector('.aircraft-reg'),model=identity.querySelector('.aircraft-model-line');
 const buttons=Array.from(identity.querySelectorAll('.save-btn')),msg=identity.querySelector('.save-msg');
 const select=info.querySelector('.status-select');
 const intro=document.createElement('div');intro.className='aircraft-heading';intro.append(reg,model);
 const toolbar=document.createElement('div');toolbar.className='aircraft-toolbar';
 const statusLabel=document.createElement('label');statusLabel.className='aircraft-status-control';
 const caption=document.createElement('span');caption.textContent='ESTATUS';statusLabel.append(caption,select);
 toolbar.append(...buttons,statusLabel);
 const details=document.createElement('div');details.className='aircraft-header-details';
 Array.from(info.children).forEach(child=>details.appendChild(child));
 Array.from(details.children).slice(1).forEach((child,i)=>{child.classList.add('header-component',i===0?'header-motor':'header-propeller');child.firstElementChild.classList.add('header-component-title');});
 header.replaceChildren(intro,toolbar,msg,details);
}

function arrangeAircraftCards(panel) {
  const sections = [
    ['inspection', 'Inspección de 50 / 100 horas'],
    ['flight', 'Bitácora de Horas de Vuelo'],
    ['venc', 'Vencimientos en Horas'],
    ['status', 'Estatus'],
    ['tac', 'Bitácora de Tacómetros'],
    ['inspections', 'Bitácora de Inspecciones'],
    ['pending', 'Pendientes de Taller'],
    ['maintenance', 'Bitácora de Mantenimientos'],
    ['tracking', 'Seguimiento de Pedidos'],
    ['orders', 'Bitácora de Pedidos Recibidos']
  ];
  const cards = Array.from(panel.querySelectorAll('.card'));
  const grid = document.createElement('div');
  grid.className = 'aircraft-layout';
  const anchor = panel.querySelector('.divider-label');
  panel.insertBefore(grid, anchor);
  sections.push(['hours-history','Bitácora de Vencimientos en Horas'],['documents','Documentos y certificaciones']);
  sections.forEach(([key, title]) => {
    const card = cards.find(c => c.querySelector('.card-title')?.textContent.includes(title));
    if (!card) return;
    card.dataset.section = key;
    grid.appendChild(card);
    if (['tracking', 'orders'].includes(key)) {
      const header = card.querySelector('.card-title').nextElementSibling;
      const list = header.nextElementSibling;
      const scroll = document.createElement('div');
      scroll.className = 'compact-table-scroll';
      scroll.tabIndex = 0;
      scroll.setAttribute('role', 'region');
      scroll.setAttribute('aria-label', title + ': desplazar horizontalmente');
      const content = document.createElement('div');
      content.className = 'compact-table-content';
      card.insertBefore(scroll, header);
      scroll.appendChild(content);
      content.append(header, list);
    }
  });
  const workshop=document.createElement('div');
  workshop.className='workshop-row';
  const pending=grid.querySelector('[data-section="pending"]');
  const maintenance=grid.querySelector('[data-section="maintenance"]');
  if(pending&&maintenance){grid.insertBefore(workshop,pending);workshop.append(pending,maintenance);}
  const ordersRow=document.createElement('div');
  ordersRow.className='workshop-row orders-row';
  const tracking=grid.querySelector('[data-section="tracking"]');
  const orders=grid.querySelector('[data-section="orders"]');
  if(tracking&&orders){grid.insertBefore(ordersRow,tracking);ordersRow.append(tracking,orders);}
  panel.querySelectorAll(':scope > .divider-label').forEach(el => el.remove());
  panel.querySelectorAll(':scope > .section-grid, :scope > .section-grid-2').forEach(el => {
    if (!el.children.length) el.remove();
  });
}


function adjustedInspectionHours(old50,old100,new50){
 const a=tacCents(String(new50));if(!Number.isFinite(a))return null;
 const b=Math.round(Number(old100||0)*100)+a-Math.round(Number(old50||0)*100);
 if(b<0)return null;
 return {h50:(a/100).toFixed(2),h100:(b/100).toFixed(2)};
}
function editInspectionHours(idx,input){
 const d=state[idx],v=adjustedInspectionHours(d.horas_acum_50,d.horas_acum_100,input.value);
 input.setCustomValidity(v?'':'Ingresa horas válidas; el acumulado de 100 no puede quedar negativo.');
 if(!v)return;
 d.horas_acum_50=v.h50;d.horas_acum_100=v.h100;d.horas_totales=v.h50;d.horas_limite=v.h100;
 for(const n of [50,100]){
  const value=d['horas_acum_'+n],label=document.getElementById('acum'+n+'-'+idx),bar=document.getElementById('pb-'+n+'-'+idx);
  if(label)label.textContent=value+' HV';
  if(bar){bar.style.width=Math.min(100,Number(value)/n*100)+'%';bar.className='progress-fill '+(inspectionFill(value,n));}
 }
}
const EMERGENCY_TYPES=[['salvavidas','🦺 Salvavidas',4],['extintor','🧯 Extintores',1],['flares','🚨 Flares',2],['botiquin','🩹 Botiquín',1]];
function equipmentDates(d,key,min){
 const stored=d['emerg_'+key+'_fechas'];const dates=Array.isArray(stored)?stored.slice():[d['emerg_'+key]||''];
 while(dates.length<min)dates.push('');return dates;
}
function emergencyFieldsHtml(idx,d){
 return '<div class="emergency-equipment-grid">'+EMERGENCY_TYPES.map(([key,label,min])=>{
 const dates=equipmentDates(d,key,min),canAdd=true;
 return `<div class="equipment-column"><div class="field-label">${label}</div><div class="equipment-dates">${dates.map((value,j)=>`<div class="equipment-date"><label for="emerg-${key}-${idx}-${j}">${key==='botiquin'?'Vencimiento':'Unidad '+(j+1)}</label><input type="date" class="doc-date-input" data-equipment="${key}" data-preserve-empty data-default-today-on-open id="emerg-${key}-${idx}-${j}" value="${value}" onchange="changeEmergencyDate(${idx},'${key}',${j},this)"><span class="emerg-badge">${docStatusBadge(value)}</span></div>`).join('')}</div>${canAdd?`<button type="button" class="add-row-btn" onclick="addEmergencyDate(${idx},'${key}')">+ Agregar fecha</button>`:''}</div>`;
 }).join('')+'</div>';
}
function changeEmergencyDate(idx,key,j,input){
 const d=state[idx],min=EMERGENCY_TYPES.find(x=>x[0]===key)[2],dates=equipmentDates(d,key,min);
 dates[j]=input.value;d['emerg_'+key+'_fechas']=dates;d['emerg_'+key]=dates[0]||'';
 input.closest('.equipment-date').querySelector('.emerg-badge').innerHTML=docStatusBadge(input.value);
}
function collectEmergencyDates(idx,d){
 for(const [key,,min] of EMERGENCY_TYPES){
  const fields=Array.from(document.querySelectorAll('#emerg-body-'+idx+' input[data-equipment="'+key+'"]'));
  const dates=fields.length?fields.map(x=>x.value):equipmentDates(d,key,min);
  d['emerg_'+key+'_fechas']=dates;d['emerg_'+key]=dates[0]||'';
 }
}
function addEmergencyDate(idx,key){
 if(!EMERGENCY_TYPES.some(t=>t[0]===key))return;
 const d=state[idx];collectEmergencyDates(idx,d);d['emerg_'+key+'_fechas'].push('');
 document.getElementById('emerg-body-'+idx).innerHTML=emergencyFieldsHtml(idx,d);
}
function emergencyAlerts(d){return EMERGENCY_TYPES.flatMap(([key,label,min])=>equipmentDates(d,key,min).map((fecha,j)=>[label.replace(/^\S+\s/, '')+' '+(j+1),fecha]));}

function diasTranscurridos(fechaStr) {const n=dayNumber(panamaISO())-dayNumber(fechaStr);return Number.isFinite(n)?n:null;}

function estadoPiezaBadge(estado) {
  if (estado === 'disponible') return '<span style="font-family:IBM Plex Mono,monospace;font-size:8px;padding:1px 6px;border-radius:8px;background:rgba(0,102,204,0.1);color:var(--accent)">DISPONIBLE</span>';
  if (estado === 'pedida') return '<span style="font-family:IBM Plex Mono,monospace;font-size:8px;padding:1px 6px;border-radius:8px;background:rgba(204,119,0,0.1);color:var(--warn)">PEDIDA</span>';
  if (estado === 'recibida') return '<span style="font-family:IBM Plex Mono,monospace;font-size:8px;padding:1px 6px;border-radius:8px;background:rgba(0,119,68,0.1);color:var(--ok)">RECIBIDA</span>';
  return '<span style="font-family:IBM Plex Mono,monospace;font-size:8px;padding:1px 6px;border-radius:8px;background:var(--dim);color:var(--muted)">PENDIENTE</span>';
}

function isDirectorView() {
  return !window.ROLE_VIEW || window.ROLE_VIEW.role === 'Director';
}

function diasEntreFechas(inicio, fin) {
  const a = dayNumber(inicio), b = dayNumber(fin);
  return Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
}

function diasEntregaVista(dias) {
  return dias === null || dias === undefined ? '—' : dias < 0 ? 'Revisar fechas' : dias + 'd';
}

function renderMaintList(idx, items) {
  const container = document.getElementById('maint-list-' + idx);
  if (!container) return;
  container.innerHTML = '';
  if (!items || !items.length) return;
  items.forEach((m, mi) => {
    if (m.resuelto) return; // skip resolved tasks
    const director = isDirectorView();
    const dias = diasTranscurridos(m.fecha);
    const piezas = Array.isArray(m.piezas) ? m.piezas : [];
    const wrap = document.createElement('div');
    wrap.style = 'border-bottom:1px solid var(--border);padding:10px 0';
    wrap.id = 'maint-wrap-' + idx + '-' + mi;

    // Main row
    const mainRow = document.createElement('div');
    mainRow.className = 'workshop-task-row' + (director ? ' workshop-task-row-director' : '');
    mainRow.style = `display:grid;grid-template-columns:1fr 150px 60px auto auto${director ? ' auto' : ''};gap:8px;align-items:center;margin-bottom:6px`;
    mainRow.innerHTML = `
      <input type="text" class="maint-input" placeholder="Tarea de mantenimiento" value="${m.nombre||''}" onchange="updateMaint(${idx},${mi},'nombre',this.value)">
      <input type="date" class="maint-input" aria-label="Fecha de inicio de la tarea" title="Fecha de inicio" value="${m.fecha||''}" onchange="updateMaint(${idx},${mi},'fecha',this.value);renderMaintList(${idx},state[${idx}].mantenimiento)">
      <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--accent);font-weight:700;text-align:center">${dias !== null ? dias + 'd' : '—'}</span>
      <button onclick="togglePiezas(${idx},${mi})" style="font-family:'IBM Plex Mono',monospace;font-size:8px;background:transparent;border:1px solid var(--border);border-radius:8px;padding:2px 7px;cursor:pointer;color:var(--muted)">🔩 Piezas</button>
      <button onclick="resolverTarea(${idx},${mi})" style="font-family:'IBM Plex Mono',monospace;font-size:8px;background:rgba(0,119,68,0.1);border:1px solid var(--ok);border-radius:8px;padding:2px 7px;cursor:pointer;color:var(--ok)">✓ Resuelto</button>
      ${director ? `<button type="button" onclick="eliminarPendienteTaller(${idx},${mi})" title="Eliminar pendiente de taller" aria-label="Eliminar pendiente de taller" style="font-family:'IBM Plex Mono',monospace;font-size:8px;background:rgba(180,30,30,.08);border:1px solid var(--danger);border-radius:8px;padding:2px 7px;cursor:pointer;color:var(--danger)">✕ Eliminar</button>` : ''}
    `;
    wrap.appendChild(mainRow);

    // Piezas section
    const piezasDiv = document.createElement('div');
    piezasDiv.id = 'piezas-' + idx + '-' + mi;
    piezasDiv.style = 'display:none;margin-left:12px;margin-top:4px';

    piezas.forEach((p, pi) => {
      const pRow = document.createElement('div');
      const isPedida = p.estado === 'pedida';
      pRow.style = 'padding:6px 0;border-bottom:1px solid var(--dim)';
      const pedidaExtra = isPedida ? `
        <div style="display:grid;grid-template-columns:${director ? '1fr 1fr 1fr auto' : '1fr 1fr auto'};gap:6px;align-items:end;padding-left:8px;margin-top:4px">
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:2px">FECHA DE PEDIDO</div>
            <input type="date" class="maint-input" value="${p.fecha_pedido||''}" style="font-size:10px;width:100%" onchange="${director ? `updatePendingOrderDate(${idx},${mi},${pi},this.value)` : `updatePieza(${idx},${mi},${pi},'fecha_pedido',this.value);renderSeguimiento(${idx})`}">
          </div>
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:2px">PROVEEDOR</div>
            <input type="text" class="maint-input" placeholder="Proveedor" value="${p.proveedor||''}" style="font-size:10px;width:100%" onchange="updatePieza(${idx},${mi},${pi},'proveedor',this.value)">
          </div>
          ${director ? `<div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:2px">FECHA RECIBIDO</div>
            <input type="date" class="maint-input" id="received-date-${idx}-${mi}-${pi}" aria-label="Fecha real de recepción del pedido" value="${p.fecha_recibida||panamaISO()}" style="font-size:10px;width:100%">
          </div>` : ''}
          <button onclick="recibirPieza(${idx},${mi},${pi})" style="font-family:'IBM Plex Mono',monospace;font-size:9px;background:rgba(0,119,68,0.1);color:var(--ok);border:1px solid var(--ok);border-radius:8px;padding:4px 8px;cursor:pointer">✓ Recibido</button>
        </div>` : '';
      pRow.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 100px auto;gap:6px;align-items:center">
          <input type="text" class="maint-input" placeholder="Nombre de la pieza" value="${p.nombre||''}" style="font-size:10px" onchange="updatePieza(${idx},${mi},${pi},'nombre',this.value)">
          <select onchange="updatePieza(${idx},${mi},${pi},'estado',this.value);renderMaintList(${idx},state[${idx}].mantenimiento);renderSeguimiento(${idx})" style="font-family:'IBM Plex Mono',monospace;font-size:9px;padding:3px 6px;border:1px solid var(--border);border-radius:8px;background:var(--panel2);color:var(--text)">
            <option value="disponible" ${(p.estado||'disponible')==='disponible'?'selected':''}>Disponible</option>
            <option value="pedida" ${p.estado==='pedida'?'selected':''}>Pedida</option>
            <option value="recibida" ${p.estado==='recibida'?'selected':''}>Recibida</option>
          </select>
          <button onclick="removePieza(${idx},${mi},${pi})" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:12px">✕</button>
        </div>${pedidaExtra}
      `;
      piezasDiv.appendChild(pRow);
    });

    const addPiezaBtn = document.createElement('button');
    addPiezaBtn.className = 'add-row-btn';
    addPiezaBtn.style = 'margin-top:4px;font-size:10px';
    addPiezaBtn.textContent = '+ Agregar pieza';
    addPiezaBtn.onclick = () => addPieza(idx, mi);
    piezasDiv.appendChild(addPiezaBtn);
    wrap.appendChild(piezasDiv);
    container.appendChild(wrap);
  });
}

function togglePiezas(idx, mi) {
  const d = document.getElementById('piezas-' + idx + '-' + mi);
  if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none';
}

function updatePieza(idx, mi, pi, key, val) {
  if (!state[idx].mantenimiento[mi].piezas) state[idx].mantenimiento[mi].piezas = [];
  state[idx].mantenimiento[mi].piezas[pi][key] = val;
}

function addPieza(idx, mi) {
  if (!state[idx].mantenimiento[mi].piezas) state[idx].mantenimiento[mi].piezas = [];
  state[idx].mantenimiento[mi].piezas.push({ nombre: '', estado: 'disponible' });
  renderMaintList(idx, state[idx].mantenimiento);
  // Re-open piezas section
  setTimeout(() => {
    const d = document.getElementById('piezas-' + idx + '-' + mi);
    if (d) d.style.display = 'block';
  }, 50);
}

function removePieza(idx, mi, pi) {
  if (!window.confirm("¿Eliminar esta pieza del mantenimiento?")) return;
  state[idx].mantenimiento[mi].piezas.splice(pi, 1);
  renderMaintList(idx, state[idx].mantenimiento);
}

async function recibirPieza(idx, mi, pi) {
  const pieza = state[idx].mantenimiento[mi].piezas[pi];
  if (!pieza) return;
  const previous = structuredClone(state[idx]);
  const receivedDateInput = document.getElementById(`received-date-${idx}-${mi}-${pi}`);
  const receivedDate = isDirectorView() ? receivedDateInput?.value : panamaISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate || '')) {
    alert('Selecciona la fecha en que llegó el pedido.');
    return;
  }
  pieza.estado = 'recibida';
  pieza.id ||= `pedido-${Date.now()}-${mi}-${pi}`;
  pieza.fecha_recibida = receivedDate;
  const dias = diasEntreFechas(pieza.fecha_pedido, pieza.fecha_recibida);
  pieza.dias_entrega = dias;
  // Add to bitacora_pedidos
  if (!state[idx].bitacora_pedidos) state[idx].bitacora_pedidos = [];
  state[idx].bitacora_pedidos.push({
    id: pieza.id,
    piezaId: pieza.id,
    pieza: pieza.nombre,
    tarea: state[idx].mantenimiento[mi].nombre,
    proveedor: pieza.proveedor || '—',
    fecha_pedido: pieza.fecha_pedido || '—',
    fecha_recibida: pieza.fecha_recibida,
    dias: dias
  });
  const saved = await savePanel(idx);
  if (!saved) state[idx] = previous;
  renderMaintList(idx, state[idx].mantenimiento);
  renderSeguimiento(idx);
  renderBitacoraPedidos(idx);
}

function renderBitacoraPedidos(idx) {
  const container = document.getElementById('bitacora-pedidos-' + idx);
  if (!container) return;
  const items = state[idx].bitacora_pedidos || [];
  if (!items.length) {
    container.innerHTML = '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-align:center;padding:8px 0">Sin registros</div>';
    return;
  }
  const director = isDirectorView();
  container.innerHTML = [...items].reverse().map((r, ri) => {
    const origIdx = items.length - 1 - ri;
    const isLast = origIdx === items.length - 1;
    return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 80px 80px 60px ${isLast?'30px':'30px'};gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="font-family:'IBM Plex Sans',sans-serif;font-size:11px;font-weight:700;color:var(--text)">${r.pieza}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">${r.tarea||'—'}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--text)">${r.proveedor}</sp…23357 tokens truncated…el+(c.level==='danger'?' VENCIDO':' próximo')+' ('+c.total.toFixed(2)+' / '+c.limite+' HV)'});
  }
  emergencyAlerts(d).forEach(([label,date])=>{
    const days=daysUntil(date);
    if(days!==null&&days<=30)warnings.push({level:dateAlertLevel(days),msg:label+(days<0?' VENCIDO':' vence en '+days+'d')});
  });

  // Documentos vencidos o por vencer
  if (d.documentos) {
    d.documentos.forEach(doc => {
      if (!doc.nombre || !doc.vence) return;
      const days = daysUntil(doc.vence);
      if (days !== null && days < 0) warnings.push({ level: 'danger', msg: `📄 ${doc.nombre} VENCIDO` });
      else if (days !== null && days <= 30) warnings.push({ level: dateAlertLevel(days), msg: `📄 ${doc.nombre} vence en ${days}d` });
    });
  }

  return warnings;
}

function timesToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function hasConflict(fecha, horaInicio, horaFin, aeronave, excludeIdx) {
  if (!aeronave || !horaInicio || !horaFin) return false;
  const newStart = timesToMinutes(horaInicio);
  const newEnd = timesToMinutes(horaFin);
  if (newStart === null || newEnd === null || newStart >= newEnd) return false;
  return flightsData.some((f, i) => {
    if (i === excludeIdx) return false;
    if (f.fecha !== fecha || f.aeronave !== aeronave) return false;
    const s = timesToMinutes(f.horaInicio || f.hora);
    const e = timesToMinutes(f.horaFin);
    if (s === null) return false;
    const end = e !== null ? e : s + 60; // si no tiene fin, asumir 1 hora
    return newStart < end && newEnd > s;
  });
}

function renderDayFlights(dateStr) {
  renderAircraftPlanner();
  if (!document.getElementById('cal-day-title')) return;
  const [y, m, d] = dateStr.split('-');
  const label = fechaVista(dateStr);
  document.getElementById('cal-day-title').textContent = label;

  const flights = flightsData.filter(f => f.fecha === dateStr).sort((a,b) => (a.horaInicio||a.hora||'').localeCompare(b.horaInicio||b.hora||''));
  const container = document.getElementById('cal-day-flights');

  if (flights.length === 0) {
    container.innerHTML = `<div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);text-align:center;padding:16px 0">Sin vuelos programados</div>`;
    return;
  }

  // Agrupar por aeronave (sin asignar = grupo propio)
  const groups = {};
  flights.forEach(f => {
    const key = f.aeronave || '__sin_asignar__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  });

  // Ordenar grupos: aeronaves asignadas primero (por orden de flota), sin asignar al final
  const fleetOrder = fleet.map(a => a.reg);
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === '__sin_asignar__') return 1;
    if (b === '__sin_asignar__') return -1;
    return fleetOrder.indexOf(a) - fleetOrder.indexOf(b);
  });

  let html = '';
  sortedKeys.forEach(key => {
    const isUnassigned = key === '__sin_asignar__';
    const color = isUnassigned ? 'var(--muted)' : acColor(key);
    const groupFlights = groups[key];

    html += `<div style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid ${color}40">
        <span style="font-family:'Orbitron',sans-serif;font-size:10px;font-weight:700;color:${color}">${isUnassigned ? 'SIN ASIGNAR' : key}</span>
        <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">${groupFlights.length} vuelo${groupFlights.length>1?'s':''}</span>
      </div>`;

    groupFlights.forEach(f => {
      const globalIdx = flightsData.indexOf(f);
      const horaInicio = f.horaInicio || f.hora || '';
      const horaFin = f.horaFin || '';
      const timeStr = horaInicio ? (horaFin ? `${fmt12h(horaInicio)} → ${fmt12h(horaFin)}` : fmt12h(horaInicio)) : '-- : --';
      const acVal = f.aeronave || '';

      const warnings = acVal ? getAircraftWarnings(acVal) : [];
      const warningsHtml = warnings.length ? `
        <div style="margin-top:4px;display:flex;flex-direction:column;gap:3px">
          ${warnings.map(w => `
            <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;padding:2px 8px;border-radius:4px;
              background:${w.level==='danger'?'rgba(184,15,30,0.1)':w.level==='orange'?'rgba(234,110,10,0.1)':'rgba(234,190,0,0.12)'};
              color:${w.level==='danger'?'var(--danger)':w.level==='orange'?'var(--orange)':'var(--warn)'}">
              ${w.msg}
            </div>`).join('')}
        </div>` : '';

      const pilotOptions = pilotosData.filter(p=>p.nombre).map(p => {
        const status = getPilotoStatus(p);
        const prefix = status === 'vencido' ? '🔴 ' : status === 'urgente' ? '🟠 ' : status === 'proximo' ? '🟡 ' : '';
        const disabled = ''; // Vencimientos requieren confirmación al guardar.
        return `<option value="${p.nombre}" ${p.nombre===f.piloto?'selected':''}${disabled}>${prefix}${p.nombre}</option>`;
      }).join('');

      html += `<div id="planner-flight-${globalIdx}" tabindex="-1" class="flight-card" style="flex-direction:column;align-items:stretch;gap:6px;border-left:3px solid ${color};margin-bottom:6px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div class="flight-time" style="font-size:13px">${timeStr}</div>
          <button type="button" class="record-btn" onclick="openFlightTimeEditor(${globalIdx})">Editar horas</button>
          <button onclick="deleteFlight(${globalIdx})" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:16px;padding:4px;-webkit-tap-highlight-color:transparent;flex-shrink:0">✕</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <select onchange="updateFlightAc(${globalIdx},this.value,'${dateStr}')" style="font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid ${color};background:${acVal ? color+'22' : 'var(--panel2)'};color:${color};cursor:pointer;-webkit-tap-highlight-color:transparent">
            <option value="" ${!acVal?'selected':''}>Sin asignar</option>
            ${fleet.map(a => `<option value="${a.reg}" ${a.reg===acVal?'selected':''}>${a.reg}</option>`).join('')}
          </select>
          <select onchange="updateFlightPilot(${globalIdx},this.value)" style="font-family:'IBM Plex Sans',sans-serif;font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:var(--panel2);color:var(--text);cursor:pointer;-webkit-tap-highlight-color:transparent">
            <option value="">👨‍✈️ Sin piloto</option>
            ${pilotOptions}
          </select>
          ${f.estudiante ? `<span style="font-family:'IBM Plex Sans',sans-serif;font-size:10px;color:var(--muted)">🎓 ${f.estudiante}</span>` : ''}
        </div>
        ${warningsHtml}
      </div>`;
    });

    html += `</div>`;
  });

  container.innerHTML = html;
}

function getPilotoStatus(p){const a=PilotValidity.alerts(p);return a.some(x=>x.expired)?'vencido':a.some(x=>x.level==='orange')?'urgente':a.some(x=>x.level==='warn')?'proximo':'ok';}
function getPilotoVencimientos(p,flightDate=panamaISO(),time=''){return PilotValidity.alerts(p,flightDate,time).filter(a=>a.level!=='ok').map(a=>({...a,estado:a.expired?'VENCIDO':`vence en ${a.days}d`}));}

function updatePilotDropdown() {
  const sel = document.getElementById('flight-pilot');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Seleccionar...</option>' +
    pilotosData.filter(p => p.nombre).map(p => {
      const status = getPilotoStatus(p);
      const prefix = status === 'vencido' ? '🔴 ' : status === 'urgente' ? '🟠 ' : status === 'proximo' ? '🟡 ' : '';
      const disabled = ''; // Vencimientos requieren confirmación al guardar.
      return `<option value="${p.nombre}"${disabled}>${prefix}${p.nombre}${status === 'vencido' ? ' (VENCIDO)' : (status === 'proximo'||status === 'urgente') ? ' (por vencer)' : ''}</option>`;
    }).join('');
  sel.value = current;
}

function addFlight() {
  const fecha = document.getElementById('flight-date').value;
  const horaInicio = document.getElementById('flight-time-start').value;
  const horaFin = document.getElementById('flight-time-end').value;
  const aeronave = document.getElementById('flight-ac').value;
  const piloto = document.getElementById('flight-pilot').value;
  const estudiante = document.getElementById('flight-student').value.trim();

  if (!fecha || !Number.isFinite(dayNumber(fecha))) { alert('Ingresa una fecha válida.'); return; }
  if (!horaInicio || !horaFin || timesToMinutes(horaFin)<=timesToMinutes(horaInicio)) { alert('Ingresa las horas de inicio y finalización. La hora de fin debe ser posterior, dentro del mismo día.'); return; }

  // Validar conflicto de horario si hay aeronave asignada
  if (aeronave && horaInicio && horaFin) {
    if (hasConflict(fecha, horaInicio, horaFin, aeronave, -1)) {
      alert(`⚠️ ${aeronave} ya tiene un vuelo en ese horario.\n\nVerifica los vuelos del día antes de asignar.`);
      return;
    }
  }

  if(!confirmFlightScheduling({fecha,aeronave,piloto,horaInicio,horaFin}))return;

  const person=resolveFlightPerson();
  if(estudiante&&!person){alert('Selecciona un estudiante o cliente de la lista de expedientes.');document.getElementById('flight-student').focus();return;}
  const flight = { fecha, horaInicio, horaFin, aeronave, piloto, estudiante:person?person.record.name:'', ...(person?{personId:person.record.id,personKind:person.kind}:{}), id: Date.now() };
  flightsData.push(flight);
  if (db) db.ref('itinerarios').set(flightsData);

  document.getElementById('flight-time-start').value = '';
  document.getElementById('flight-time-end').value = '';
  document.getElementById('flight-ac').value = '';updateFlightAircraftPicker();
  document.getElementById('flight-pilot').value = '';
  document.getElementById('flight-student').value = '';document.getElementById('flight-student').dataset.personKey='';document.getElementById('flight-person-options').hidden=true;

  renderCalendar();
  if (calSelectedDate === fecha) renderDayFlights(fecha);
}

function updateFlightPilot(globalIdx, newPilot) {
  if (!flightsData[globalIdx]) return;
  if(!confirmFlightScheduling({...flightsData[globalIdx],piloto:newPilot})){
    if(calSelectedDate)renderDayFlights(calSelectedDate);
    return;
  }
  flightsData[globalIdx].piloto = newPilot;
  if (db) db.ref('itinerarios').set(flightsData);
  if (calSelectedDate) renderDayFlights(calSelectedDate);
}

function updateFlightAc(globalIdx, newAc, dateStr) {
  if (!flightsData[globalIdx]) return;
  const f = flightsData[globalIdx];

  // Validar conflicto si se está asignando una aeronave
  if (newAc && f.horaInicio && f.horaFin) {
    if (hasConflict(f.fecha, f.horaInicio, f.horaFin, newAc, globalIdx)) {
      alert(`⚠️ ${newAc} ya tiene un vuelo en ese horario.\n\nNo se puede asignar esta aeronave.`);
      // Revertir el select visualmente
      if (calSelectedDate) renderDayFlights(calSelectedDate);
      return;
    }
  }

  if(!confirmFlightScheduling({...f,aeronave:newAc})){
    if(calSelectedDate)renderDayFlights(calSelectedDate);
    return;
  }
  flightsData[globalIdx].aeronave = newAc;
  if (db) db.ref('itinerarios').set(flightsData);
  renderCalendar();
  if (calSelectedDate) renderDayFlights(calSelectedDate);
}

function deleteFlight(idx) {
  if (!window.confirm("¿Eliminar este vuelo del itinerario?")) return;
  flightsData.splice(idx, 1);
  if (db) db.ref('itinerarios').set(flightsData);
  renderCalendar();
  if (calSelectedDate) renderDayFlights(calSelectedDate);
}

// Clock
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('es-PA', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Panama' });
  document.getElementById('dateStr').textContent = fechaVista(panamaISO()) + ' · PANAMÁ';
}
updateClock(); setInterval(updateClock, 1000);

// Refresh a single aircraft panel from state
function refreshPanel(idx) {
  const d = state[idx];
  const prev=document.getElementById('tac-anterior-'+idx);if(prev)prev.value=d.tac_anterior||'';
  renderVencimientoLog(idx);
  renderTACLogs(idx);
  const g = id => document.getElementById(id + idx);
  const sv = (id, val) => { const el = g(id); if (el) el.value = val || ''; };
  const st = (id, val) => { const el = g(id); if (el) el.textContent = val || '—'; };

  sv('status-', d.status);
  updateEstatusBadge(idx, d.status, d.estatus_label || '');
  const notaEl2 = document.getElementById('estatus_nota-' + idx);
  if (notaEl2 && d.estatus_nota) notaEl2.value = d.estatus_nota;
  sv('serial-', d.serial);
  sv('year-', d.year);
  sv('voltaje-', d.voltaje);
  sv('motor_fabricante-', d.motor_fabricante);
  sv('motor_modelo-', d.motor_modelo);
  sv('motor_serie-', d.motor_serie);
  sv('helice_fabricante-', d.helice_fabricante);
  sv('helice_modelo-', d.helice_modelo);
  sv('helice_serie-', d.helice_serie);
  if (isMultimotor(fleet[idx].reg)) {
    for (const kind of ['motor','helice']) {
      sv(kind + '_serie-', d[kind + '_serie_izq']);
      for (const field of ['fabricante','modelo','serie']) {
        const key = kind + '_' + field + '_der';
        sv(key + '-', d[key]);
      }
    }
  }

  sv('horas_diarias-', '');
  // Update accumulators display
  const a50 = document.getElementById('acum50-' + idx);
  const a100 = document.getElementById('acum100-' + idx);
  if (a50) a50.textContent = parseFloat(d.horas_acum_50||0).toFixed(2) + ' HV';
  {const edit=document.getElementById('edit-acum50-'+idx);if(edit)edit.value=Number(d.horas_acum_50||0).toFixed(2);}
  if (a100) a100.textContent = parseFloat(d.horas_acum_100||0).toFixed(2) + ' HV';
  const pb50r = document.getElementById('pb-50-' + idx);
  const pb100r = document.getElementById('pb-100-' + idx);
  if (pb50r) { pb50r.style.width = Math.min(100,parseFloat(d.horas_acum_50||0)/50*100)+'%'; pb50r.className='progress-fill '+(inspectionFill(d.horas_acum_50, 50)); }
  if (pb100r) { pb100r.style.width = Math.min(100,parseFloat(d.horas_acum_100||0)/100*100)+'%'; pb100r.className='progress-fill '+(inspectionFill(d.horas_acum_100, 100)); }
  const fd = document.getElementById('fecha-diaria-' + idx);
  if (fd && d.fecha_diaria) fd.textContent = d.fecha_diaria;
  renderBitacoraHoras(idx, d.bitacora_horas);
  sv('horas_totales-', d.horas_acum_50);
  sv('horas_limite-', d.horas_limite);
  sv('ciclos_totales-', d.ciclos_totales);
  sv('ciclos_limite-', d.ciclos_limite);
  // Update motor/helices accum display
  const amot = document.getElementById('acum-motor-' + idx);
  const ahel = document.getElementById('acum-helices-' + idx);
  if (amot) amot.textContent = d.ciclos_totales!=='' && d.ciclos_totales!=null ? parseFloat(d.ciclos_totales).toFixed(2) : '—';
  if (ahel) ahel.textContent = d.ciclos_limite!=='' && d.ciclos_limite!=null ? parseFloat(d.ciclos_limite).toFixed(2) : '—';
  if (d.ciclos_totales) updateVencBar('motor', idx, d.ciclos_totales, parseFloat(d.limite_motor||2000));
  if (d.ciclos_limite) updateVencBar('helices', idx, d.ciclos_limite, parseFloat(d.limite_helice||2000));
  const fm = document.getElementById('fecha-motor-' + idx);
  if (fm && d.fecha_motor) fm.textContent = d.fecha_motor;
  const fh = document.getElementById('fecha-helices-' + idx);
  if (fh && d.fecha_helices) fh.textContent = d.fecha_helices;
  // Helice1/Helice2 (HP-880BL)
  if (isMultimotor(fleet[idx].reg)) {
    sv('helice1_ciclos-', d.helice1_ciclos);
    sv('helice2_ciclos-', d.helice2_ciclos);
    const ah1 = document.getElementById('acum-helice1-' + idx);
    const ah2 = document.getElementById('acum-helice2-' + idx);
    if (ah1) ah1.textContent = d.helice1_ciclos!=='' && d.helice1_ciclos!=null ? parseFloat(d.helice1_ciclos).toFixed(2) : '—';
    if (ah2) ah2.textContent = d.helice2_ciclos!=='' && d.helice2_ciclos!=null ? parseFloat(d.helice2_ciclos).toFixed(2) : '—';
    if (d.helice1_ciclos) updateVencBar('helice1', idx, d.helice1_ciclos, parseFloat(d.helice1_limite||2000));
    if (d.helice2_ciclos) updateVencBar('helice2', idx, d.helice2_ciclos, parseFloat(d.helice2_limite||2000));
    const fh1 = document.getElementById('fecha-helice1-' + idx);
    if (fh1 && d.fecha_helice1) fh1.textContent = d.fecha_helice1;
    const fh2 = document.getElementById('fecha-helice2-' + idx);
    if (fh2 && d.fecha_helice2) fh2.textContent = d.fecha_helice2;
  }
  // Ultimo venc registro
  const ulDiv = document.getElementById('ultimo-venc-' + idx);
  if (ulDiv && d.ultimo_venc_hv) {
    ulDiv.style.display = 'flex';
    const spans = ulDiv.querySelectorAll('span');
    if (spans[1]) spans[1].textContent = parseFloat(d.ultimo_venc_hv).toFixed(2) + ' HV';
    if (spans[2]) spans[2].textContent = d.ultimo_venc_fecha || '';
  }
  sv('horas_desde-', d.horas_desde_revision);
  sv('horas_hasta-', d.horas_hasta_revision);
  const emergencyBody=document.getElementById('emerg-body-'+idx);if(emergencyBody)emergencyBody.innerHTML=emergencyFieldsHtml(idx,d);
  const edit50=document.getElementById('edit-acum50-'+idx);if(edit50)edit50.value=Number(d.horas_acum_50||0).toFixed(2);
  st('fecha50-', d.fecha_50);
  st('fecha100-', d.fecha_100);

  if (d.horas_totales) updateHorasWarning(g('horas_totales-'), 50);
  if (d.horas_limite) updateHorasWarning(g('horas_limite-'), 100);
  if (d.ciclos_totales) { updateVencBar('motor', idx, d.ciclos_totales, 2000); updateHorasWarning(g('ciclos_totales-'), 2000); }
  if (d.ciclos_limite) { updateVencBar('helices', idx, d.ciclos_limite, 2000); updateHorasWarning(g('ciclos_limite-'), 2000); }

  renderMaintList(idx, d.mantenimiento);
  renderBitacora(idx, d.mantenimiento);
  renderSeguimiento(idx);
  renderBitacoraPedidos(idx);
  renderBitacoraHoras(idx, d.bitacora_horas);
  renderDocList(idx, d.documentos);

  // Update sidebar badge
  const tab = document.querySelector('#sidebar-tabs .aircraft-tab[data-idx="'+idx+'"]');
  if (tab) {
    const badge = tab.querySelector('.tab-badge');
    if (badge) badge.className = 'tab-badge ' + (d.status === 'operativo' ? 'badge-ok' : d.status === 'mantenimiento' ? 'badge-warn' : d.status === 'aog' ? 'badge-danger' : 'badge-empty');
  }
}

// Load all data from Firebase with real-time listener
if (db) {
  db.ref('fleet').on('value', (snapshot) => {
    const firebaseData = snapshot.val() || {};
    fleet.forEach((ac, idx) => {
      const key = ac.reg.replace(/[^a-zA-Z0-9]/g, '_');
      if (firebaseData[key]) {
        const fbData = firebaseData[key];
        // Convert Firebase objects back to arrays
        ['mantenimiento','documentos','bitacora_horas','bitacora_pedidos','bitacora_vencimientos'].forEach(arrKey => {
          if (fbData[arrKey] && typeof fbData[arrKey] === 'object' && !Array.isArray(fbData[arrKey])) {
            fbData[arrKey] = Object.keys(fbData[arrKey]).sort().map(k => fbData[arrKey][k]);
          }
        });
        Object.assign(state[idx], fbData);
        refreshPanel(idx);
      }
    });
    updateSummary();
    buildResumen();
    // Also rebuild resumen if it's currently visible
    const resPanel = document.getElementById('panel-resumen');
    if (resPanel && resPanel.classList.contains('active')) buildResumen();
    const statsPanelEl = document.getElementById('panel-estadisticas');
    if (statsPanelEl && statsPanelEl.classList.contains('active')) buildEstadisticas();

  });

  db.ref('pilotos').on('value', (snapshot) => {
    const saved = snapshot.val();
    if (saved && Array.isArray(saved)) {
      const activeEl = document.activeElement;
      const inPilotosTable = activeEl && activeEl.closest && activeEl.closest('#pilotos-list');
      if (inPilotosTable) return;
      pilotosData.length = 0;
      saved.forEach(p => pilotosData.push(p));
      renderPilotos();
      updatePilotDropdown();
    }
  });

  db.ref('itinerarios').on('value', (snapshot) => {
    const saved = snapshot.val();
    flightsData.length = 0;
    if (saved && Array.isArray(saved)) {
      saved.forEach(f => flightsData.push(f));
    }
    renderDailySchedule();
    // Re-render calendar if visible
    const panel = document.getElementById('panel-itinerarios');
    if (panel && panel.classList.contains('active')) {
      renderCalendar();
      if (calSelectedDate) renderDayFlights(calSelectedDate);
    }
  });
}

// Inicializar drawer hamburguesa
initDrawer();

// Actualización desde la app
function checkForUpdate() {
  const btn = document.getElementById('updateBtn');
  if (btn) btn.textContent = '⏳';
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
  }
  // Forzar recarga desde red ignorando caché
  setTimeout(() => {
    window.location.reload(true);
  }, 400);
}

// Mostrar el botón solo cuando la app está instalada (standalone) o en móvil
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
  const btn = document.getElementById('updateBtn');
  if (btn) btn.style.display = 'block';
}

// Register service worker for PWA (installable + offline app shell)
// Service worker desactivado en esta copia de revisión.

const valueDescriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
let datePicker=null,dateInput=null,dateView='';
function calendarDays(month){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();}
function shiftCalendarMonth(month,delta){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);}
function closeDatePicker(){dateInput?.setAttribute('aria-expanded','false');datePicker?.remove();datePicker=null;dateInput=null;}
function positionDatePicker(){
 if(!datePicker)return;if(!dateInput?.isConnected){closeDatePicker();return;}
 const rect=dateInput.getBoundingClientRect(),w=datePicker.offsetWidth,h=datePicker.offsetHeight;
 datePicker.style.left=Math.max(8,Math.min(rect.left,innerWidth-w-8))+'px';
 datePicker.style.top=Math.max(8,rect.bottom+h+8<innerHeight?rect.bottom+5:rect.top-h-5)+'px';
}
function selectInputDate(value){const input=dateInput;if(!input)return;closeDatePicker();input.value=value;input.setCustomValidity('');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));if(input.isConnected)input.focus({preventScroll:true});}
function drawDatePicker(){
 const [year,month]=dateView.split('-').map(Number),selected=isoFecha(valueDescriptor.get.call(dateInput)),today=panamaISO();
 const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 const cells=Array((new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7).fill('<span></span>');
 for(let d=1;d<=calendarDays(dateView);d++){const value=dateView+'-'+String(d).padStart(2,'0');cells.push('<button type="button" data-day="'+value+'" aria-label="'+fechaVista(value)+'" aria-pressed="'+(value===selected)+'"'+(value===today?' aria-current="date"':'')+'>'+d+'</button>');}
 datePicker.innerHTML='<div class="app-calendar-title"><strong>Elegir fecha</strong><button type="button" data-close aria-label="Cerrar calendario">×</button></div><div class="app-calendar-nav"><button type="button" data-prev aria-label="Mes anterior">‹</button><select aria-label="Mes">'+months.map((name,i)=>'<option value="'+(i+1)+'"'+(i+1===month?' selected':'')+'>'+name+'</option>').join('')+'</select><input type="number" aria-label="Año" min="1900" max="9999" value="'+year+'"><button type="button" data-next aria-label="Mes siguiente">›</button></div><div class="app-calendar-grid">'+['L','M','M','J','V','S','D'].map(d=>'<span>'+d+'</span>').join('')+cells.join('')+'</div><div class="app-calendar-footer"><button type="button" data-today>Hoy</button><button type="button" data-clear>Borrar fecha</button></div><small>También puedes escribir DD/MM/AAAA.</small>';
 const update=()=>{const y=Number(datePicker.querySelector('input').value),m=Number(datePicker.querySelector('select').value);if(Number.isInteger(y)&&y>=1900&&y<=9999){dateView=y+'-'+String(m).padStart(2,'0');drawDatePicker();}};
 datePicker.querySelector('input').onchange=update;datePicker.querySelector('select').onchange=update;positionDatePicker();
}
function openDatePicker(input){
 if(input.disabled||input.readOnly)return;closeDatePicker();
 if(input.hasAttribute('data-default-today-on-open')&&!valueDescriptor.get.call(input)){
  input.value=panamaISO();
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
 }
 dateInput=input;
 const raw=valueDescriptor.get.call(input);dateView=(Number.isFinite(dayNumber(raw))?isoFecha(raw):panamaISO()).slice(0,7);
 datePicker=document.createElement('div');datePicker.className='app-calendar';datePicker.id='app-date-calendar';datePicker.setAttribute('role','dialog');datePicker.setAttribute('aria-label','Elegir fecha');
 input.setAttribute('aria-expanded','true');input.setAttribute('aria-controls',datePicker.id);(input.closest('dialog')||document.body).appendChild(datePicker);
 for(const type of ['pointerdown','input','change'])datePicker.addEventListener(type,e=>e.stopPropagation());
 datePicker.onclick=e=>{const b=e.target.closest('button');if(!b)return;e.preventDefault();if(b.dataset.day)return selectInputDate(b.dataset.day);if(b.hasAttribute('data-today'))return selectInputDate(panamaISO());if(b.hasAttribute('data-clear'))return selectInputDate('');if(b.hasAttribute('data-close')){closeDatePicker();input.focus();return;}if(b.hasAttribute('data-prev')||b.hasAttribute('data-next')){const next=shiftCalendarMonth(dateView,b.hasAttribute('data-prev')?-1:1);if(/^\d{4}-\d{2}$/.test(next)&&Number(next.slice(0,4))>=1900){dateView=next;drawDatePicker();}}};
 datePicker.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(e.target.tagName==='BUTTON')e.target.click();else e.target.dispatchEvent(new Event('change'));}});drawDatePicker();
}
function prepareDateInput(el){
 if(el.dataset.dateReady)return;el.dataset.dateReady='1';const native=el.type==='date',old=el.value;
 el.type='text';el.placeholder='DD/MM/AAAA';el.inputMode='numeric';el.autocomplete='off';el.dataset.fecha='1';el.classList.add('app-date-input');el.setAttribute('aria-haspopup','dialog');el.setAttribute('aria-expanded','false');
 if(native)Object.defineProperty(el,'value',{get(){return isoFecha(valueDescriptor.get.call(this));},set(v){valueDescriptor.set.call(this,fechaVista(v));},configurable:true});
 el.value=fechaVista(old||(!window.ROLE_VIEW&&!el.hasAttribute('data-preserve-empty')&&!el.closest('.school-stage-panel[hidden]')?panamaISO():''));
 const validate=()=>{const raw=valueDescriptor.get.call(el);el.setCustomValidity(raw&&!Number.isFinite(dayNumber(raw))?'Usa una fecha válida DD/MM/AAAA.':'');};
 el.addEventListener('input',()=>{const raw=valueDescriptor.get.call(el);if(/^\d{8}$/.test(raw))valueDescriptor.set.call(el,raw.slice(0,2)+'/'+raw.slice(2,4)+'/'+raw.slice(4));validate();});
 el.addEventListener('change',e=>{validate();if(!el.checkValidity()){el.reportValidity();e.stopImmediatePropagation();return;}el.value=fechaVista(el.value);},true);
 el.addEventListener('click',()=>openDatePicker(el));el.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();openDatePicker(el);datePicker.querySelector('[aria-pressed="true"]')?.focus();}});
}
function setupDates(){document.querySelectorAll('input[type="date"],input[placeholder="DD/MM/AAAA"]').forEach(prepareDateInput);if(dateInput&&!dateInput.isConnected)closeDatePicker();}
setupDates();new MutationObserver(setupDates).observe(document.body,{childList:true,subtree:true});
document.addEventListener('pointerdown',e=>{if(datePicker&&e.target!==dateInput&&!datePicker.contains(e.target))closeDatePicker();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&datePicker){e.preventDefault();e.stopImmediatePropagation();const input=dateInput;closeDatePicker();input?.focus();}},true);
window.addEventListener('resize',positionDatePicker);document.addEventListener('scroll',positionDatePicker,true);

function markAircraftDirty(event){
  const panel=event.target.closest('.aircraft-panel');const match=panel?.id.match(/^panel-(\d+)$/);
  if(match){aircraftDirty.add(Number(match[1]));updateUndoButtons();}
}
document.addEventListener('input',markAircraftDirty,true);
document.addEventListener('change',markAircraftDirty,true);
let confirmedNavigation=false;
document.addEventListener('click',async event=>{
  if(confirmedNavigation)return;
  const tab=event.target.closest('#sidebar-tabs .aircraft-tab');if(!tab)return;
  const active=Array.from(document.querySelectorAll('.aircraft-panel.active')).find(p=>/^panel-\d+$/.test(p.id));
  if(!active)return;const idx=Number(active.id.slice(6));
  if(tab.dataset.idx===String(idx))return;
  const key=aircraftKey(fleet[idx].reg);
  // Restricted views normalize/redact previewData after building the panels.
  // Those differences are not user edits and must never trigger a write on navigation.
  const changed=window.ROLE_VIEW
    ? window.ROLE_VIEW.editable&&aircraftDirty.has(idx)
    : aircraftDirty.has(idx)||JSON.stringify(decodeAircraft(state[idx]))!==JSON.stringify({...defaultAc(fleet[idx]),...decodeAircraft(previewData.fleet[key])});
  if(changed){event.preventDefault();event.stopImmediatePropagation();if(await savePanel(idx)){confirmedNavigation=true;try{tab.click();}finally{confirmedNavigation=false;}}}
},true);
updateUndoButtons();

// Datos consultables copiados el 08/10/2026. Itinerarios históricos pendientes del respaldo JSON.

let panelSavePending=false;
async function savePanel(idx){
 if(panelSavePending)return false;
 panelSavePending=true;
 try{window.DraftRecovery?.capture('aircraft:'+fleet[idx].reg);const ok=await savePanelInternal(idx);if(ok)await window.DraftRecovery?.clear('aircraft:'+fleet[idx].reg);return ok;}catch(e){showCloudError(e);return false;}finally{panelSavePending=false;}
}
window.installAircraftDrafts=()=>{
 const install=()=>fleet.forEach((ac,idx)=>{
  const root=document.getElementById('panel-'+idx);if(!root)return;
  window.DraftRecovery?.bind('aircraft:'+ac.reg,root,()=>({state:structuredClone(state[idx]),fields:DraftRecovery.fields(root)}),draft=>{
   state[idx]=structuredClone(draft.state);const replacement=buildPanel(ac,state[idx],idx);replacement.className=root.className;root.replaceWith(replacement);refreshPanel(idx);setupDates();
   DraftRecovery.applyFields(replacement,draft.fields);aircraftDirty.add(idx);updateTAC(idx);updateSummary();buildResumen();updateUndoButtons();
  },ac.reg);
 });install();new MutationObserver(install).observe(contentEl,{childList:true,subtree:true});
};
window.hasDraftChanges=()=>aircraftDirty.size>0;
window.exportCurrentData=()=>exportPreview();

window.DASHBOARD_READY=true;

function eliminarPiloto(index) {
  if (!window.confirm('¿Eliminar este piloto y todos sus registros?')) return;
  pilotosData.splice(index, 1);
  renderPilotos();
  savePilotos();
}
function eliminarVerificacionPiloto(index, verificationIndex) {
  if (!window.confirm('¿Eliminar esta verificación del piloto?')) return;
  pilotosData[index].verificaciones.splice(verificationIndex, 1);
  renderPilotos();
  savePilotos();
}


// Component snapshots use the same fields as the first-row expiration card.
function vencimientoComponents(reg) {
  return isMultimotor(reg)
    ? [['motor','Motor izquierdo','Motor'],['helices','Motor derecho','Motor'],['helice1','Hélice izquierda','Hélice'],['helice2','Hélice derecha','Hélice']]
    : [['motor','Motor','Motor'],['helices','Hélice','Hélice']];
}
function vencimientoSnapshot(reg,d) {
  return vencimientoComponents(reg).map(([key,label,group])=>{
    const map=VENC_FIELD_MAP[key];
    const value=d[map.dataField],limit=d[map.limiteField];
    const total=value!==''&&value!=null&&Number.isFinite(Number(value))?Number(value):null;
    const limite=Number(limit)>0?Number(limit):null;
    return {key,label,group,total,limite,remanentes:total!==null&&limite!==null?+(limite-total).toFixed(2):null};
  });
}
function appendVencimientoRecord(reg,before,after) {
  const old=vencimientoSnapshot(reg,before),current=vencimientoSnapshot(reg,after);
  if(!current.some((c,i)=>c.total!==old[i].total||c.limite!==old[i].limite))return;
  const components=current.map((c,i)=>({...c,ingresadas:c.total!==null?+(c.total-(old[i].total||0)).toFixed(2):null,limiteModificado:c.limite!==old[i].limite}));
  after.bitacora_vencimientos=structuredClone(before.bitacora_vencimientos||[]);
  after.bitacora_vencimientos.push({fecha:getFechaPanama(),hora:getHoraPanama(),componentes:components});
}
function renderVencimientoLog(idx) {
  const el=document.getElementById('venc-log-'+idx);if(!el)return;
  const d=state[idx],current=vencimientoSnapshot(fleet[idx].reg,d);
  const records=Array.isArray(d.bitacora_vencimientos)?d.bitacora_vencimientos:[];
  const number=v=>v===null||v===undefined?'—':Number(v).toFixed(2);
  el.innerHTML='<div class="venc-log-groups">'+['Motor','Hélice'].map(group=>
    '<section class="venc-log-group">'+current.filter(c=>c.group===group).map(c=>{
      const entries=[...records].reverse().map(r=>({r,c:(r.componentes||[]).find(x=>x.key===c.key)})).filter(x=>x.c);
      return '<div class="venc-log-component"><div class="venc-log-label">'+c.label+'</div>'+
        '<div class="venc-log-row venc-log-head"><span>FECHA</span><span>HORA</span><span>HORAS INGRESADAS</span><span>HORAS TOTALES</span><span>HORAS REMANENTES</span></div>'+
        (entries.length?entries.map(({r,c},i)=>'<div class="venc-log-row'+(i===0?' venc-log-latest':'')+'"><span>'+escapeRecord(fechaVista(r.fecha))+'</span><span class="venc-log-time">'+escapeRecord(r.hora||'—')+'</span><span class="venc-log-hours">'+number(c.ingresadas)+'</span><span>'+number(c.total)+'</span><span>'+number(c.remanentes)+'</span></div>').join(''):'<div class="venc-log-empty">Sin registros</div>')+'</div>';
    }).join('')+'</section>'
  ).join('')+'</div>';
}

function dailyScheduleDate(now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(now).map(p=>[p.type,p.value]));
  const tomorrow=Number(parts.hour)*60+Number(parts.minute)>=20*60+30;
  const date=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)+(tomorrow?1:0))).toISOString().slice(0,10);
  return {date,tomorrow};
}

function dailyScheduleGroups(date) {
  const allowed=reg=>!window.ROLE_VIEW||HPBoxes.aircraftAllowed(window.ROLE_VIEW.policy,reg);
  const groups=new Map(fleet.filter(ac=>allowed(ac.reg)).map(ac=>[ac.reg,[]]));
  flightsData.filter(f=>isoFecha(f.fecha)===date&&allowed(f.aeronave)).slice().sort((a,b)=>
    (a.horaInicio||a.hora||'99:99').localeCompare(b.horaInicio||b.hora||'99:99')
  ).forEach(f=>{
    const reg=String(f.aeronave||'').trim();
    if(!groups.has(reg))groups.set(reg,[]);
    groups.get(reg).push(f);
  });
  const rank=reg=>{const i=fleet.findIndex(ac=>ac.reg===reg);return i<0?fleet.length:i;};
  return [...groups.entries()].sort(([a,af],[b,bf])=>{
    if(!a)return 1;
    if(!b)return -1;
    return bf.length-af.length||rank(a)-rank(b)||a.localeCompare(b);
  });
}
function scheduleWeekday(date) {
  return new Intl.DateTimeFormat('es-PA',{weekday:'long',timeZone:'America/Panama'})
    .format(new Date(date+'T12:00:00Z'));
}
function scheduleAircraftColors(reg) {
  const colors={
    HP1579:['#b9e4f7','#83c9ec','#163c50'],
    HP1815:['#f9bf77','#f39836','#4b2705'],
    HP1784:['#b62532','#8e1622','#ffffff'],
    HP1819:['#70412c','#4e2d1f','#ffffff'],
    HP1907:['#292b30','#111216','#ffffff'],
    HP1930:['#267146','#14532d','#ffffff'],
    HP880BL:['#164a89','#991f2f','#ffffff'],
    HP18BLM:['#181a1f','#991f2f','#ffffff'],
    HP1805BLM:['#164a89','#526174','#ffffff'],
    HP11BL:['#7c243d','#501328','#ffffff'],
    HP1186:['#ffffff','#ffffff','#25354a']
  };
  const key=String(reg||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  return colors[key]||colors[key.replace(/BL$/,'')]||['#e9eff6','#dbe5f0','#25354a'];
}

function renderDailySchedule() {
  const panel=document.getElementById('panel-horario-dia');if(!panel)return;
  const base=dailyScheduleDate().date;
  if(panel.dataset.scheduleBase!==base){panel.dataset.scheduleBase=base;panel.dataset.dayOffset='0';panel.dataset.scheduleSelectedDate='';}
  const offset=Number(panel.dataset.dayOffset||0);
  const date=panel.dataset.scheduleSelectedDate||scheduleOffsetDate(base,offset),groups=dailyScheduleGroups(date);
  panel.dataset.scheduleDate=date;
  const dayLabel=document.getElementById('schedule-tab-day');
  if(dayLabel)dayLabel.textContent='('+scheduleWeekday(date)+')';
  const count=groups.reduce((sum,[,flights])=>sum+flights.length,0);
  panel.innerHTML='<div class="card daily-schedule-header"><div><div class="card-title">HORARIO DEL DÍA ('+escapeRecord(scheduleWeekday(date).toUpperCase())+')</div><div class="daily-schedule-date">'+escapeRecord(fechaVista(date))+' · Hora de Panamá</div></div><div class="daily-schedule-count">'+count+' vuelo'+(count===1?'':'s')+'<small>Solo lectura · Itinerario</small></div></div>'+
    '<div class="schedule-day-picker" role="group" aria-label="Seleccionar día del horario">'+[0,1,2,3].map(n=>{
      const optionDate=scheduleOffsetDate(base,n);
      return '<button type="button" class="schedule-day-option" data-day-offset="'+n+'" aria-pressed="'+(n===offset)+'" onclick="selectScheduleOffset('+n+')"><span>'+escapeRecord(scheduleWeekday(optionDate))+'</span><strong>'+escapeRecord(fechaVista(optionDate))+'</strong><small>'+(n===0?'Día inicial':'+'+n+' día'+(n===1?'':'s'))+'</small></button>';
    }).join('')+'</div>'+
    '<div class="daily-schedule-grid">'+groups.map(([reg,flights])=>{
      const ac=fleet.find(a=>a.reg===reg);
      const [first,second,ink]=scheduleAircraftColors(reg);
      return '<section class="card daily-schedule-aircraft"><div class="daily-schedule-heading" style="--aircraft-header-start:'+first+';--aircraft-header-end:'+second+';--aircraft-header-ink:'+ink+'"><div><h2>'+escapeRecord(reg||'Sin aeronave asignada')+'</h2>'+(ac?'<small>'+escapeRecord(ac.model)+'</small>':'')+'</div><span>'+flights.length+' vuelo'+(flights.length===1?'':'s')+'</span></div>'+
        (flights.length?flights.map(f=>{
          const start=f.horaInicio||f.hora,end=f.horaFin;
          const time=start?fmt12h(start)+(end?' → '+fmt12h(end):''):'Hora por definir';
          const index=flightsData.indexOf(f);
          return '<article id="schedule-flight-'+index+'" data-flight-index="'+index+'" tabindex="-1" class="daily-schedule-flight"><div class="flight-time">'+escapeRecord(time)+'</div><div class="daily-schedule-person"><small>Piloto</small><span>'+escapeRecord(f.piloto||'Sin asignar')+'</span></div>'+(f.estudiante?'<div class="daily-schedule-person"><small>Estudiante</small><span>'+escapeRecord(f.estudiante)+'</span></div>':'')+'</article>';
        }).join(''):'<div class="daily-schedule-empty">Sin vuelos programados</div>')+'</section>';
    }).join('')+'</div>';
}
const dailySchedulePanel=document.createElement('div');
dailySchedulePanel.id='panel-horario-dia';
dailySchedulePanel.className='aircraft-panel';
contentEl.appendChild(dailySchedulePanel);
const dailyScheduleTab=document.createElement('div');
dailyScheduleTab.className='aircraft-tab';
dailyScheduleTab.innerHTML='<div class="tab-reg" style="font-size:10px;color:var(--accent)">🕒 HORARIO DEL DÍA<small id="schedule-tab-day" class="schedule-tab-day"></small></div>';
dailyScheduleTab.addEventListener('click',()=>{
  document.querySelectorAll('.aircraft-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.aircraft-panel').forEach(p=>p.classList.remove('active'));
  dailyScheduleTab.classList.add('active');
  dailySchedulePanel.classList.add('active');
  renderDailySchedule();
});
sidebarEl.prepend(dailyScheduleTab);
renderDailySchedule();
setInterval(()=>{
  if(dailySchedulePanel.dataset.scheduleBase!==dailyScheduleDate().date)renderDailySchedule();
},1000);

function plannerRange(f) {
  const start=timesToMinutes(f.horaInicio||f.hora),rawEnd=timesToMinutes(f.horaFin);
  if(!Number.isFinite(start)||start<0||start>=1440)return null;
  const end=Number.isFinite(rawEnd)&&rawEnd>start?Math.min(rawEnd,1440):Math.min(start+60,1440);
  return {start,end,estimated:!Number.isFinite(rawEnd)||rawEnd<=start};
}
function plannerTime(minutes) {
  return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
}
function plannerChangeDay(offset) {
  const date=new Date((calSelectedDate||panamaISO())+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+offset);
  plannerSelectDate(date.toISOString().slice(0,10));
}
function plannerSelectDate(date) {
  calYear=Number(date.slice(0,4));calMonth=Number(date.slice(5,7))-1;
  selectDate(date);
}
function plannerChooseSlot(idx,minutes) {
  const date=calSelectedDate||panamaISO(),reg=fleet[idx].reg;
  const flights=flightsData.filter(f=>f.fecha===date&&f.aeronave===reg);
  const ranges=flights.map(plannerRange).filter(Boolean);
  if(ranges.some(r=>minutes>=r.start&&minutes<r.end)){alert('Ese horario ya tiene un vuelo programado.');return;}
  const next=ranges.filter(r=>r.start>minutes).reduce((n,r)=>Math.min(n,r.start),1439);
  const end=Math.min(minutes+60,next);
  if(end<=minutes)return;
  document.getElementById('flight-date').value=date;
  document.getElementById('flight-ac').value=reg;updateFlightAircraftPicker();
  document.getElementById('flight-time-start').value=plannerTime(minutes);
  document.getElementById('flight-time-end').value=plannerTime(end);
  document.getElementById('planner-form-context').textContent=reg+' · '+fechaVista(date)+' · '+fmt12h(plannerTime(minutes));
  const form=document.querySelector('#panel-itinerarios .add-flight-form');
  form.scrollIntoView({behavior:'smooth',block:'center'});
  document.getElementById('flight-pilot').focus({preventScroll:true});
}
function plannerShowFlight(index) {
  const f=flightsData[index];if(!f)return;
  const target=document.getElementById('planner-flight-'+index);
  if(target){target.scrollIntoView({behavior:'smooth',block:'center'});target.focus({preventScroll:true});}
}
function renderAircraftPlanner() {
  const body=document.getElementById('planner-timeline');if(!body)return;
  const date=calSelectedDate||panamaISO();
  document.getElementById('planner-date-label').textContent=scheduleWeekday(date)+' · '+fechaVista(date);
  const filter=document.getElementById('planner-aircraft-filter').value;
  const daily=flightsData.map((f,i)=>({f,i})).filter(({f})=>isoFecha(f.fecha)===date);
  const shown=fleet.map((ac,idx)=>({ac,idx})).filter(({ac})=>!filter||ac.reg===filter);
  const left=body.scrollLeft,top=body.scrollTop;
  body.innerHTML='<div class="planner-grid"><div class="planner-row planner-hours"><div class="planner-reg">Aeronave</div><div class="planner-track"><div class="planner-normal-band"></div><span class="planner-boundary-label" style="left:27.083333%">6:30 AM</span><span class="planner-boundary-label" style="left:77.083333%">6:30 PM</span>'+Array.from({length:24},(_,h)=>'<span style="left:'+(h/24*100)+'%">'+fmt12h(plannerTime(h*60))+'</span>').join('')+'</div></div>'+
    shown.map(({ac,idx})=>{
      const colors=scheduleAircraftColors(ac.reg);
      const entries=daily.filter(({f})=>f.aeronave===ac.reg&&plannerRange(f));
      // Give overlapping imported flights separate lanes so none are hidden.
      const lanes=[];const placed=entries.slice().sort((a,b)=>plannerRange(a.f).start-plannerRange(b.f).start).map(item=>{
        const r=plannerRange(item.f);let lane=lanes.findIndex(end=>end<=r.start);
        if(lane<0)lane=lanes.length;lanes[lane]=r.end;return {...item,r,lane};
      });
      return '<div class="planner-row"><div class="planner-reg" style="background:linear-gradient(110deg,'+colors[0]+','+colors[1]+');color:'+colors[2]+'">'+escapeRecord(ac.reg)+'</div><div class="planner-track" style="height:'+Math.max(80,lanes.length*70+10)+'px">'+
        Array.from({length:48},(_,i)=>'<button type="button" class="planner-slot'+(i>=13&&i<37?' planner-normal-hours':'')+(i===13||i===37?' planner-hours-boundary':'')+'" style="left:'+(i/48*100)+'%" onclick="plannerChooseSlot('+idx+','+(i*30)+')" aria-label="Programar '+escapeRecord(ac.reg)+' a las '+plannerTime(i*30)+'" title="Programar a las '+plannerTime(i*30)+'"></button>').join('')+
        placed.map(({f,i,r,lane})=>'<button type="button" class="planner-flight '+(r.end-r.start<45?'planner-flight-tiny':r.end-r.start<110?'planner-flight-compact':'planner-flight-wide')+'" style="left:'+(r.start/1440*100)+'%;width:'+((r.end-r.start)/1440*100)+'%;top:'+(lane*70+5)+'px;background:'+colors[0]+';color:'+colors[2]+'" onclick="plannerShowFlight('+i+')" aria-label="'+escapeRecord('Ver vuelo: '+fmt12h(plannerTime(r.start))+' a '+(f.horaFin?fmt12h(f.horaFin):'fin pendiente'))+'" title="'+escapeRecord(fmt12h(plannerTime(r.start))+' – '+(f.horaFin?fmt12h(f.horaFin):'Fin pendiente')+' · '+(f.piloto||'Sin piloto'))+'">'+plannerFlightLabel(f,r)+'</button>').join('')+'</div></div>';
    }).join('')+'</div>';
  body.scrollLeft=body.dataset.positioned?left:360;
  body.scrollTop=top;body.dataset.positioned='1';
  const incomplete=daily.filter(({f})=>!fleet.some(ac=>ac.reg===f.aeronave)||!plannerRange(f)).length;
  document.getElementById('planner-summary').textContent=daily.length+' vuelo'+(daily.length===1?' programado':'s programados')+(incomplete?' · '+incomplete+' sin aeronave u horario: consulta el detalle inferior.':'');
}
function installAircraftPlanner() {
  const panel=document.getElementById('panel-itinerarios');
  const layout=panel.querySelector('.section-grid-2');layout.classList.add('planner-lower');
  const board=document.createElement('section');board.className='card planner-board';
  board.innerHTML='<div class="planner-toolbar"><div><div class="card-title">CALENDARIO POR AERONAVE</div><div id="planner-date-label"></div></div><div class="planner-day-controls"><button type="button" class="record-btn" onclick="plannerChangeDay(-1)" aria-label="Día anterior">‹</button><button type="button" class="record-btn" onclick="plannerSelectDate(panamaISO())">Hoy</button><button type="button" class="record-btn" onclick="plannerChangeDay(1)" aria-label="Día siguiente">›</button></div><label>Aeronave<select id="planner-aircraft-filter" onchange="renderAircraftPlanner()"><option value="">Todas las aeronaves</option>'+fleet.map(ac=>'<option value="'+escapeRecord(ac.reg)+'">'+escapeRecord(ac.reg)+'</option>').join('')+'</select></label></div><p class="planner-help">Toca un espacio sin vuelo programado para preparar una reserva. Toca un vuelo para ver su detalle y horas completas. Las barras muy cortas usan un reloj. Horas de Panamá.</p><div id="planner-summary" class="planner-help"></div><div id="planner-timeline" class="planner-scroll" tabindex="0" role="region" aria-label="Calendario de aeronaves. Desplaza horizontalmente para ver las horas."></div><p class="planner-help">Franja sombreada: 6:30 AM a 6:30 PM. Los espacios vacíos indican disponibilidad de horario; las alertas de la aeronave se revisan al guardar. Los vuelos antiguos sin hora de fin ocupan una hora estimada.</p>';
  panel.insertBefore(board,layout);
  const form=panel.querySelector('.add-flight-form');
  form.insertAdjacentHTML('afterbegin','<p id="planner-form-context" class="planner-help">Selecciona una aeronave y un horario en el calendario, o completa los campos.</p>');
  plannerSelectDate(panamaISO());
}
installAircraftPlanner();

function validFlightTime(value) {return /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);}
async function saveFlightTimes(index,start,end,expected) {
  const current=flightsData[index];
  if(!current||JSON.stringify(current)!==expected)return 'El vuelo cambió. Cierra y vuelve a abrir la edición.';
  if(!validFlightTime(start)||!validFlightTime(end)||timesToMinutes(end)<=timesToMinutes(start))return 'Ingresa inicio y fin válidos; el fin debe ser posterior dentro del mismo día.';
  if(hasConflict(current.fecha,start,end,current.aeronave,index))return 'La aeronave ya tiene otro vuelo en ese horario.';
  if(!confirmFlightScheduling(current))return 'Cambio cancelado: no se confirmó la programación con alertas.';
  const updated=structuredClone(flightsData);
  updated[index]={...updated[index],horaInicio:start,horaFin:end};
  if(Object.hasOwn(updated[index],'hora'))updated[index].hora=start;
  const next=structuredClone(previewData);next.itinerarios=updated;
  if(!await commitPreview(next))return 'No se pudo guardar. Se conservan las horas anteriores.';
  flightsData.splice(0,flightsData.length,...updated);
  renderCalendar();
  if(calSelectedDate)renderDayFlights(calSelectedDate);
  return '';
}
function openFlightTimeEditor(index) {
  const flight=flightsData[index];if(!flight)return;
  const expected=JSON.stringify(flight),dialog=document.createElement('dialog');
  dialog.className='record-dialog';
  dialog.innerHTML='<h3>Editar horas del vuelo</h3><p class="planner-help">'+escapeRecord(flight.aeronave||'Sin aeronave')+' · '+escapeRecord(fechaVista(flight.fecha))+' · Hora de Panamá</p><form><div class="record-form"><label>Hora de inicio<input name="start" type="time" required value="'+escapeRecord(flight.horaInicio||flight.hora||'')+'"></label><label>Hora de culminación<input name="end" type="time" required value="'+escapeRecord(flight.horaFin||'')+'"></label></div><p class="record-error" role="alert"></p><div class="record-actions"><button type="button" class="record-btn" data-cancel>Cancelar</button><button type="submit" class="record-btn">Guardar horas</button></div></form>';
  document.body.appendChild(dialog);
  let saving=false;
  dialog.querySelector('[data-cancel]').onclick=()=>{if(!saving)dialog.close();};
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();if(saving)return;
    saving=true;const button=dialog.querySelector('[type="submit"]');button.disabled=true;
    try{
      const result=await saveFlightTimes(index,dialog.querySelector('[name="start"]').value,dialog.querySelector('[name="end"]').value,expected);
      if(result)dialog.querySelector('.record-error').textContent=result;else dialog.close();
    }catch(error){dialog.querySelector('.record-error').textContent='No se pudo guardar. Intenta nuevamente.';}
    finally{saving=false;button.disabled=false;}
  };
  dialog.showModal();
}

function flightDaysUntil(value,flightDate) {
  const expiry=dayNumber(value),today=dayNumber(panamaISO()),scheduled=dayNumber(flightDate);
  if(!Number.isFinite(expiry))return null;
  return expiry-Math.max(today,Number.isFinite(scheduled)?scheduled:today);
}
function confirmFlightScheduling(flight) {
  try{PilotValidity.assertAssignment(pilotosData,[flight.piloto],flight.fecha,flight.horaFin||flight.horaInicio);}catch(e){alert(e.message);return false;}
  const warnings=[];
  const pilot=pilotosData.find(p=>p.nombre===flight.piloto);
  if(pilot){
    getPilotoVencimientos(pilot,flight.fecha).forEach(item=>{
      warnings.push('Piloto '+flight.piloto+': '+item.label+' — '+item.estado);
    });
  }
  if(flight.aeronave){
    getAircraftWarnings(flight.aeronave,flight.fecha).filter(w=>w.level==='danger').forEach(w=>{
      warnings.push('Aeronave '+flight.aeronave+': '+w.msg);
    });
  }
  if(!warnings.length)return true;
  return window.confirm('CONFIRMACIÓN REQUERIDA\nVuelo: '+fechaVista(flight.fecha)+'\n\n'+warnings.map(w=>'• '+w).join('\n')+'\n\n¿Confirmas guardar la programación con estas alertas?\nCancelar impide guardar el cambio.');
}


function dateAlertLevel(days){return days<0?'danger':days<=5?'orange':days<=30?'warn':'ok';}
function inspectionFill(hours,limit){const n=Number(hours||0);return n>=limit?'fill-danger':n>=limit-10?'fill-warn':'fill-ok';}

function plannerFlightLabel(f,r){
  if(r.end-r.start<45)return '<b class="planner-tiny-icon" aria-hidden="true">◷</b>';
  const start=escapeRecord(fmt12h(plannerTime(r.start))),end=escapeRecord(f.horaFin?fmt12h(f.horaFin):'Fin pendiente');
  return '<div class="planner-flight-times"><b class="planner-start">'+start+'</b><b class="planner-end">'+end+'</b></div><span class="planner-flight-pilot">'+escapeRecord(f.piloto||'Sin piloto')+'</span>';
}

function comparePendingAlerts(a,b){
  const dateA=Number.isFinite(a.dueDays)?a.dueDays:Infinity;
  const dateB=Number.isFinite(b.dueDays)?b.dueDays:Infinity;
  if(dateA!==dateB)return dateA<dateB?-1:1;
  const severity={danger:0,orange:1,warn:2};
  return (severity[a.type]??3)-(severity[b.type]??3);
}

function scheduleOffsetDate(base,offset){
  const date=new Date(base+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+offset);
  return date.toISOString().slice(0,10);
}
function selectScheduleOffset(offset){
  if(!Number.isInteger(offset)||offset<0||offset>3)return;
  const panel=document.getElementById('panel-horario-dia');
  const base=dailyScheduleDate().date;
  if(panel.dataset.scheduleBase!==base)renderDailySchedule();
  const target=scheduleOffsetDate(base,offset);
  if(target===panel.dataset.scheduleDate)return;
  if(target!==panamaISO()&&!window.confirm('¿Estás seguro de que quieres ver una fecha diferente a la de hoy?\n\nVer: '+scheduleWeekday(target)+' '+fechaVista(target)+'\nHoy: '+fechaVista(panamaISO())))return;
  panel.dataset.scheduleSelectedDate='';
  panel.dataset.dayOffset=String(offset);
  renderDailySchedule();
  panel.querySelector('[data-day-offset="'+offset+'"]')?.focus({preventScroll:true});
}

function selectScheduleDate(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return;
  const parsed=new Date(date+'T12:00:00Z');
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return;
  const panel=document.getElementById('panel-horario-dia');if(!panel)return;
  panel.dataset.scheduleSelectedDate=date;
  renderDailySchedule();
}

// Keep the existing tab nodes and their click/save handlers while grouping the fleet.
function organizeSidebar(){
 const group=document.createElement('details');group.id='sidebar-aircraft-group';group.className='sidebar-aircraft-group';
 const summary=document.createElement('summary');summary.className='sidebar-aircraft-toggle';summary.textContent='✈️ AERONAVES';
 const items=document.createElement('div');items.id='sidebar-aircraft-items';items.className='sidebar-aircraft-items';summary.setAttribute('aria-controls',items.id);
 group.append(summary,items);
 Array.from(sidebarEl.children).forEach(node=>{
  if(node.matches('.aircraft-tab[data-idx]')||(node.classList.contains('sidebar-group-title')&&['MONOMOTOR','MULTIMOTOR','HELICÓPTERO'].includes(node.textContent.trim())))items.appendChild(node);
 });
 adminHdr.remove();
 sidebarEl.replaceChildren(dailyScheduleTab,resumenTab,group,pilotosTab,itinerariosTab,escuelaTab,empresaTab,statsTab);
 // Students inserts its tab immediately after Itinerario when its module loads.
}
organizeSidebar();





function updateFlightAircraftPicker(){
 const select=document.getElementById('flight-ac'),button=document.querySelector('.flight-aircraft-picker');
 if(select&&button)button.textContent=select.value||'Elegir aeronave';
}
function openFlightAircraftPicker(){
 const select=document.getElementById('flight-ac');
 if(!select||select.disabled||(window.ROLE_VIEW&&!window.ROLE_VIEW.editable))return;
 closeDatePicker();
 const dialog=document.createElement('dialog');dialog.className='flight-aircraft-dialog';
 dialog.innerHTML='<div class="flight-aircraft-picker-heading"><strong>Seleccionar aeronave</strong><button type="button" class="record-btn" data-close aria-label="Cerrar">×</button></div><div class="flight-aircraft-options">'+Array.from(select.options).map((option,i)=>'<button type="button" data-option="'+i+'" aria-pressed="'+(option.value===select.value)+'" '+(option.disabled?'disabled':'')+'>'+escapeRecord(option.textContent)+'</button>').join('')+'</div>';
 dialog.addEventListener('click',event=>{
  const choice=event.target.closest('[data-option]');
  if(choice&&!choice.disabled){select.selectedIndex=Number(choice.dataset.option);select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));updateFlightAircraftPicker();dialog.close();}
  else if(event.target.closest('[data-close]'))dialog.close();
 });
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 document.body.appendChild(dialog);dialog.showModal();
}
document.getElementById('flight-ac')?.addEventListener('change',updateFlightAircraftPicker);
updateFlightAircraftPicker();


function flightPeople(){
 const school=previewData.school||{};
 return [...(Array.isArray(school.students)?school.students:[]).map(record=>({kind:'student',record})),...(Array.isArray(school.registry?.clients)?school.registry.clients:[]).map(record=>({kind:'client',record}))].filter(p=>p.record.id&&p.record.name).sort((a,b)=>a.record.name.localeCompare(b.record.name,'es'));
}
function flightPersonKey(p){return p.kind+':'+p.record.id;}
function resolveFlightPerson(){
 const input=document.getElementById('flight-student'),people=flightPeople();
 const chosen=people.find(p=>flightPersonKey(p)===input.dataset.personKey&&p.record.name===input.value.trim());
 if(input.dataset.personKey)return chosen||null;
 const matches=people.filter(p=>p.record.name.trim().toLocaleLowerCase('es')===input.value.trim().toLocaleLowerCase('es'));
 return matches.length===1?matches[0]:null;
}
function renderFlightPeople(){
 const input=document.getElementById('flight-student'),box=document.getElementById('flight-person-options');
 const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const q=normalize(input.value.trim()),people=flightPeople().filter(p=>normalize(p.record.name).includes(q));
 box.innerHTML=people.length?people.map((p,i)=>'<button type="button" data-person-index="'+i+'"><strong>'+escapeRecord(p.record.name)+'</strong><small>'+ (p.kind==='student'?'Estudiante':'Cliente')+(p.record.identity?' · '+escapeRecord(p.record.identity):'')+'</small></button>').join(''):'<p>No hay expedientes coincidentes.</p>';
 box.hidden=false;
 box.onclick=event=>{const button=event.target.closest('[data-person-index]');if(!button)return;const p=people[Number(button.dataset.personIndex)];if(!p)return;input.value=p.record.name;input.dataset.personKey=flightPersonKey(p);box.hidden=true;input.dispatchEvent(new Event('change',{bubbles:true}));};
}
document.addEventListener('pointerdown',event=>{const box=document.getElementById('flight-person-options'),input=document.getElementById('flight-student');if(box&&event.target!==input&&!box.contains(event.target))box.hidden=true;});
document.getElementById('flight-student')?.addEventListener('keydown',event=>{const box=document.getElementById('flight-person-options');if(event.key==='Escape')box.hidden=true;if(event.key==='ArrowDown'){event.preventDefault();if(box.hidden)renderFlightPeople();box.querySelector('button')?.focus();}});



setInterval(()=>{if(!document.hidden){buildResumen();updatePilotDropdown();window.PilotDossiers?.refresh();}},30000);

function personAge(birthDate,at=panamaISO()){const born=isoFecha(birthDate);if(!Number.isFinite(dayNumber(born))||born>at)return '';const years=Number(at.slice(0,4))-Number(born.slice(0,4))-(at.slice(5)<born.slice(5)?1:0);return years;}

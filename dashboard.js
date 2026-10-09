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
 try{await window.cloudWrite(next);previewData=structuredClone(next);return true;}
 catch(e){window.showCloudError(e);return false;}
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

function savePilotos() {
  if (db) db.ref('pilotos').set(pilotosData);
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
    serial: "", year: "", voltaje: "", motor_fabricante: "", motor_modelo: "", motor_serie: "", helice_fabricante: "", helice_modelo: "", helice_serie: "", limite_motor: "2000", limite_helice: "2000", horas_diarias: "", horas_acum_50: "", horas_acum_100: "", bitacora_horas: [], ultimo_venc_hv: "", ultimo_venc_fecha: "",
    horas_totales: "", horas_limite: "", fecha_50: "", fecha_100: "",
    ciclos_totales: "", ciclos_limite: "",
    helice1_ciclos: "", helice1_limite: "2000", fecha_helice1: "",
    helice2_ciclos: "", helice2_limite: "2000", fecha_helice2: "",
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
// Vencimiento bar helpers (shows remaining hours, green < 70% used, red >= 70%)
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

function vencBarPct(hv, limit) {
  if(!parseFloat(limit)) return 0;
  const v = parseFloat(hv), l = parseFloat(limit) || 2000;
  if (!v) return 0; // empty bar if no data
  return Math.min(100, Math.round(v / l * 100)); // shows USED %
}
function vencBarCls(hv, limit) {
  const v = parseFloat(hv), l = parseFloat(limit) || 2000;
  if (!v) return 'fill-ok';
  const remaining = (l - v) / l * 100; // % remaining
  return remaining <= 20 ? 'fill-danger' : 'fill-ok';
}
function vencBarLabel(hv, limit) {
  if(!parseFloat(limit)) return 'Límite pendiente de confirmar';
  const v = parseFloat(hv), l = parseFloat(limit) || 2000;
  if (!v) return '—';
  const rem = (l - v).toFixed(2);
  const used = Math.round(v / l * 100);
  return parseFloat(rem) > 0 ? `Quedan ${rem} HV (${100-used}%)` : 'VENCIDO';
}
function updateVencBar(tipo, idx, val, limit) {
  if(isMultimotor(fleet[idx].reg)) limit=state[idx][VENC_FIELD_MAP[tipo].limiteField];
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
              <input type="number" class="field-input" id="${manualInputId}-${idx}" value="${v}" placeholder="0.0" step="0.1" style="width:75px;font-size:10px" oninput="establecerTotalVenc('${fieldMapKey}',${idx},this.value)">
              <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">HV</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-bottom:2px">
            <span style="font-family:'Orbitron',sans-serif;font-size:13px;color:var(--text)" id="acum-${fieldMapKey}-${idx}">${value!=='' && value!=null ? parseFloat(value).toFixed(2) : '—'}</span>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">/</span>
            <input type="number" id="limite-${fieldMapKey}-${idx}" value="${limite??''}" placeholder="Pendiente" step="100" style="width:65px;font-family:'IBM Plex Mono',monospace;font-size:9px;border:1px solid var(--border);border-radius:8px;background:var(--panel2);color:var(--accent);text-align:center;padding:1px 4px" oninput="updateLimiteVenc('${fieldMapKey}',${idx},this.value)">
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
        ${[['fabricante','FABRICANTE'],['modelo','MODELO'],['serie','NO. SERIE']].map(([field,label]) => {
          const key = kind + '_' + field + (side === 'der' ? '_der' : '');
          const initial = field === 'serie' ? data[kind + '_serie_' + side] : data[key];
          return `<div><div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">${label}</div><input type="text" class="field-input" id="${key}-${idx}" aria-label="${kind === 'motor' ? 'Motor' : 'Hélice'} ${side === 'izq' ? 'izquierdo' : 'derecho'} ${label.toLowerCase()}" value="${escapeAttr(initial)}" placeholder="${label === 'NO. SERIE' ? 'No. Serie' : label}" style="width:100%;font-size:11px"></div>`;
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
        <div class="aircraft-model-line">${ac.model} ${ac.type === 'rotor' ? '· Helicóptero' : '· Ala Fija'}</div>
      </div>
      <div class="status-select-wrap">
        <select class="status-select" id="status-${idx}" onchange="onStatusChange(${idx},this.value)">
          <option value="" ${!data.status?'selected':''}>Sin registrar</option>
          <option value="operativo" ${data.status==='operativo'?'selected':''}>✅ Operativo</option>
          <option value="mantenimiento" ${data.status==='mantenimiento'?'selected':''}>🔧 Mantenimiento</option>
          <option value="aog" ${data.status==='aog'?'selected':''}>🔴 GROUNDED</option>
        </select>
        <!-- Aeronave info grid -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">NO. SERIE</div>
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
        <!-- Motor info -->
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
              <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">NO. SERIE</div>
              <input type="text" class="field-input" id="motor_serie-${idx}" value="${data.motor_serie||''}" placeholder="No. Serie" style="width:100%;font-size:11px">
            </div>
          </div>
        </div>
        `}
        ${isMultimotor(ac.reg) ? componentInfoMultimotor('helice', data, idx) : `
        <!-- Helice info -->
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
              <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px">NO. SERIE</div>
              <input type="text" class="field-input" id="helice_serie-${idx}" value="${data.helice_serie||''}" placeholder="No. Serie" style="width:100%;font-size:11px">
            </div>
          </div>
        </div>
        `}
      </div>
    </div>

    <div class="divider-label">⏱ Horas de Vuelo & Ciclos</div>
    <div class="section-grid">
      <div class="card">
        <div class="card-title">✈ Inspección 50 / 100 Horas</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <label class="field-label">TAC anterior<input type="number" class="field-input" id="tac-anterior-${idx}" aria-label="TAC anterior" min="0" max="99999.99" step="0.01" placeholder="00000.00" value="${data.tac_anterior||''}" style="width:100%;margin-top:6px" oninput="updateTAC(${idx})"></label>
          <label class="field-label">TAC actual<input type="number" class="field-input" id="tac-actual-${idx}" aria-label="TAC actual" min="0" max="99999.99" step="0.01" placeholder="00000.00" style="width:100%;margin-top:6px" oninput="updateTAC(${idx})"></label>
        </div>
        <div id="tac-msg-${idx}" aria-live="polite" style="font-size:11px;color:var(--muted);margin-bottom:10px">Ingresa ambos TAC para calcular las horas.</div>
        <div class="inspection-controls"><button type="button" class="record-btn" onclick="openRecordEditor('inspection',${idx},-1,50)">✓ Resuelto · 50 horas</button><button type="button" class="record-btn" onclick="openRecordEditor('inspection',${idx},-1,100)">✓ Resuelto · 100 horas</button></div>
        <!-- Daily hours input -->
        <div class="field-row" style="margin-bottom:4px">
          <span class="field-label">Horas del día</span>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" class="field-input" id="horas_diarias-${idx}" value="${data.horas_diarias||''}" placeholder="0.0" step="0.1" style="width:80px">
            <span class="field-unit">HV</span>
          </div>
        </div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);text-align:right;margin-bottom:10px">
          Último ingreso: <span id="fecha-diaria-${idx}" style="color:var(--accent)">${data.fecha_diaria||'—'}</span>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px">
          <div class="field-row" style="margin-bottom:2px">
            <span class="field-label">Acum. 50 hrs</span>
            <div><input type="number" class="field-input" id="edit-acum50-${idx}" min="0" max="99999.99" step="0.01" aria-label="Horas acumuladas de 50 horas" value="${parseFloat(data.horas_acum_50||0).toFixed(2)}" oninput="editInspectionHours(${idx},this)" style="width:100px"><span class="field-unit"> HV</span><span id="acum50-${idx}" hidden>${parseFloat(data.horas_acum_50||0).toFixed(2)} HV</span></div>
          </div>
          <div class="progress-bar" style="margin-bottom:8px">
            <div id="pb-50-${idx}" class="progress-fill ${inspectionFill(data.horas_acum_50, 50)}" style="width:${Math.min(100,parseFloat(data.horas_acum_50||0)/50*100)}%"></div>
          </div>
          <div class="field-row" style="margin-bottom:2px">
            <span class="field-label">Acum. 100 hrs</span>
            <span style="font-family:'Orbitron',sans-serif;font-size:13px;color:var(--text)" id="acum100-${idx}">${parseFloat(data.horas_acum_100||0).toFixed(2)} HV</span>
          </div>
          <div class="progress-bar">
            <div id="pb-100-${idx}" class="progress-fill ${inspectionFill(data.horas_acum_100, 100)}" style="width:${Math.min(100,parseFloat(data.horas_acum_100||0)/100*100)}%"></div>
          </div>
        </div>
        <!-- Hidden fields for compatibility -->
        <input type="hidden" id="horas_totales-${idx}" value="${data.horas_acum_50||''}">
        <input type="hidden" id="horas_limite-${idx}" value="${data.horas_acum_100||''}">
        <span id="fecha50-${idx}" style="display:none"></span>
        <span id="fecha100-${idx}" style="display:none"></span>
        <div id="pct-horas-${idx}" style="display:none"></div>
        <div id="pb-horas-${idx}" style="display:none"></div>
      </div>

      <!-- Bitacora de horas -->
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
        <!-- Daily hours input for motor+helices -->
        <div class="field-row" style="margin-bottom:4px">
          <span class="field-label">Horas del día</span>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" class="field-input" id="horas-venc-dia-${idx}" placeholder="0.0" step="0.1" style="width:80px">
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
        <!-- Hidden fields for compatibility -->
        <input type="hidden" id="ciclos_totales-${idx}" value="${data.ciclos_totales||''}">
        <input type="hidden" id="ciclos_limite-${idx}" value="${data.ciclos_limite||''}">
        ${isMultimotor(ac.reg) ? `
        <input type="hidden" id="helice1_ciclos-${idx}" value="${data.helice1_ciclos||''}">
        <input type="hidden" id="helice2_ciclos-${idx}" value="${data.helice2_ciclos||''}">` : ''}
        <div style="display:none"><div id="pb-ciclos-${idx}"></div><span id="pct-ciclos-${idx}"></span></div>
        <!-- Ultimo registro -->
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
          <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">FECHA INICIO</span>
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
        <div class="card-title">📋 Documentos & Certificaciones</div>
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
    ['inspection', 'Inspección 50 / 100 Horas'],
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
  sections.push(['hours-history','Bitácora de Vencimientos en Horas'],['documents','Documentos & Certificaciones']);
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
 return `<div class="equipment-column"><div class="field-label">${label}</div><div class="equipment-dates">${dates.map((value,j)=>`<div class="equipment-date"><label for="emerg-${key}-${idx}-${j}">${key==='botiquin'?'Vencimiento':'Unidad '+(j+1)}</label><input type="date" class="doc-date-input" data-equipment="${key}" id="emerg-${key}-${idx}-${j}" value="${value}" onchange="changeEmergencyDate(${idx},'${key}',${j},this)"><span class="emerg-badge">${docStatusBadge(value)}</span></div>`).join('')}</div>${canAdd?`<button type="button" class="add-row-btn" onclick="addEmergencyDate(${idx},'${key}')">+ Agregar fecha</button>`:''}</div>`;
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

function renderMaintList(idx, items) {
  const container = document.getElementById('maint-list-' + idx);
  if (!container) return;
  container.innerHTML = '';
  if (!items || !items.length) return;
  items.forEach((m, mi) => {
    if (m.resuelto) return; // skip resolved tasks
    const dias = diasTranscurridos(m.fecha);
    const piezas = Array.isArray(m.piezas) ? m.piezas : [];
    const wrap = document.createElement('div');
    wrap.style = 'border-bottom:1px solid var(--border);padding:10px 0';
    wrap.id = 'maint-wrap-' + idx + '-' + mi;

    // Main row
    const mainRow = document.createElement('div');
    mainRow.className = 'workshop-task-row';
    mainRow.style = 'display:grid;grid-template-columns:1fr 150px 60px auto auto;gap:8px;align-items:center;margin-bottom:6px';
    mainRow.innerHTML = `
      <input type="text" class="maint-input" placeholder="Tarea de mantenimiento" value="${m.nombre||''}" onchange="updateMaint(${idx},${mi},'nombre',this.value)">
      <input type="date" class="maint-input" aria-label="Fecha de inicio de la tarea" title="Fecha de inicio" value="${m.fecha||''}" onchange="updateMaint(${idx},${mi},'fecha',this.value);renderMaintList(${idx},state[${idx}].mantenimiento)">
      <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--accent);font-weight:700;text-align:center">${dias !== null ? dias + 'd' : '—'}</span>
      <button onclick="togglePiezas(${idx},${mi})" style="font-family:'IBM Plex Mono',monospace;font-size:8px;background:transparent;border:1px solid var(--border);border-radius:8px;padding:2px 7px;cursor:pointer;color:var(--muted)">🔩 Piezas</button>
      <button onclick="resolverTarea(${idx},${mi})" style="font-family:'IBM Plex Mono',monospace;font-size:8px;background:rgba(0,119,68,0.1);border:1px solid var(--ok);border-radius:8px;padding:2px 7px;cursor:pointer;color:var(--ok)">✓ Resuelto</button>
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
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:end;padding-left:8px;margin-top:4px">
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:2px">FECHA PEDIDO</div>
            <input type="date" class="maint-input" value="${p.fecha_pedido||''}" style="font-size:10px;width:100%" onchange="updatePieza(${idx},${mi},${pi},'fecha_pedido',this.value);renderSeguimiento(${idx})">
          </div>
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:2px">PROVEEDOR</div>
            <input type="text" class="maint-input" placeholder="Proveedor" value="${p.proveedor||''}" style="font-size:10px;width:100%" onchange="updatePieza(${idx},${mi},${pi},'proveedor',this.value)">
          </div>
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

function recibirPieza(idx, mi, pi) {
  const pieza = state[idx].mantenimiento[mi].piezas[pi];
  pieza.estado = 'recibida';
  pieza.fecha_recibida = getFechaPanama();
  // Calculate days it took
  const dias = pieza.fecha_pedido ? diasTranscurridos(pieza.fecha_pedido) : null;
  pieza.dias_entrega = dias;
  // Add to bitacora_pedidos
  if (!state[idx].bitacora_pedidos) state[idx].bitacora_pedidos = [];
  state[idx].bitacora_pedidos.push({
    pieza: pieza.nombre,
    tarea: state[idx].mantenimiento[mi].nombre,
    proveedor: pieza.proveedor || '—',
    fecha_pedido: pieza.fecha_pedido || '—',
    fecha_recibida: pieza.fecha_recibida,
    dias: dias
  });
  renderMaintList(idx, state[idx].mantenimiento);
  renderSeguimiento(idx);
  renderBitacoraPedidos(idx);
  savePanel(idx);
}

function renderBitacoraPedidos(idx) {
  const container = document.getElementById('bitacora-pedidos-' + idx);
  if (!container) return;
  const items = state[idx].bitacora_pedidos || [];
  if (!items.length) {
    container.innerHTML = '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-align:center;padding:8px 0">Sin registros</div>';
    return;
  }
  container.innerHTML = [...items].reverse().map((r, ri) => {
    const origIdx = items.length - 1 - ri;
    const isLast = origIdx === items.length - 1;
    return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 80px 80px 60px ${isLast?'30px':'30px'};gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="font-family:'IBM Plex Sans',sans-serif;font-size:11px;font-weight:700;color:var(--text)">${r.pieza}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">${r.tarea||'—'}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--text)">${r.proveedor}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">${fechaVista(r.fecha_pedido)}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--ok)">${fechaVista(r.fecha_recibida)}</span>
      <span style="font-family:'Orbitron',monospace;font-size:10px;color:var(--accent);font-weight:700">${r.dias !== null && r.dias !== undefined ? r.dias+'d' : '—'}</span>
      ${isLast ? `<button onclick="eliminarBitacoraPedido(${idx},${origIdx})" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:12px;padding:0">✕</button>` : '<span></span>'}
    </div>`;
  }).join('');
}

function eliminarBitacoraPedido(idx, ri) {
  if (!window.confirm("¿Eliminar este registro de la bitácora de pedidos?")) return;
  state[idx].bitacora_pedidos.splice(ri, 1);
  renderBitacoraPedidos(idx);
  savePanel(idx);
}

function renderSeguimiento(idx) {
  const container = document.getElementById('seguimiento-' + idx);
  if (!container) return;
  const items = state[idx].mantenimiento || [];
  const pedidas = [];
  items.forEach(m => {
    if (!m.nombre || m.resuelto) return;
    (m.piezas || []).forEach(p => {
      if (p.estado === 'pedida' && p.nombre) {
        const dias = p.fecha_pedido ? diasTranscurridos(p.fecha_pedido) : null;
        pedidas.push({ tarea: m.nombre, pieza: p.nombre, proveedor: p.proveedor||'—', fecha: p.fecha_pedido||'—', dias });
      }
    });
  });
  if (!pedidas.length) {
    container.innerHTML = '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-align:center;padding:8px 0">Sin pedidos pendientes</div>';
    return;
  }
  container.innerHTML = pedidas.map(p => `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 80px 60px;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
      <span style="font-family:'IBM Plex Sans',sans-serif;font-size:11px;font-weight:700;color:var(--text)">${p.pieza}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">${p.tarea}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--text)">${p.proveedor}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">${fechaVista(p.fecha)}</span>
      <span style="font-family:'Orbitron',monospace;font-size:10px;color:var(--warn);font-weight:700">${p.dias !== null ? p.dias+'d' : '—'}</span>
    </div>`).join('');
}

function resolverTarea(idx, mi) {
  const today = fechaVista(panamaISO());
  state[idx].mantenimiento[mi].resuelto = true;
  state[idx].mantenimiento[mi].fecha_resuelto = today;
  savePanel(idx);
  renderMaintList(idx, state[idx].mantenimiento);
  renderBitacora(idx, state[idx].mantenimiento);
}

function renderBitacora(idx, items) {
  const container = document.getElementById('bitacora-list-' + idx);
  if (!container) return;
  const resueltos = (items || []).filter(m => m.resuelto && m.nombre);
  if (!resueltos.length) {
    container.innerHTML = `<div style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted);text-align:center;padding:8px 0">Sin registros</div>`;
    return;
  }
  // Need original indices for delete
  const allItems = items || [];
  container.innerHTML = allItems.map((m, origIdx) => {
    if (!m.resuelto || !m.nombre) return '';
    const piezas = Array.isArray(m.piezas) ? m.piezas.filter(p => p.nombre) : [];
    const diasTotal = m.fecha && m.fecha_resuelto ? (() => {
      const n=dayNumber(m.fecha_resuelto)-dayNumber(m.fecha);
      return Number.isFinite(n) && n>=0 ? n+'d' : 'Revisar fechas';
    })() : '—';
    return `<div style="padding:8px 12px;border-bottom:1px solid var(--border);background:rgba(0,119,68,0.03)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-family:'IBM Plex Sans',sans-serif;font-size:11px;font-weight:700;color:var(--text)">${m.nombre}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">Inicio: ${fechaVista(m.fecha)||'—'}</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">Duración: ${diasTotal}</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--ok);font-weight:700">✓ ${m.fecha_resuelto||'—'}</span>
          <button onclick="eliminarBitacora(${idx},${origIdx})" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:14px;padding:0 4px" title="Eliminar registro">✕</button>
        </div>
      </div>
      ${piezas.length ? `<div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-top:2px">
        Piezas: ${piezas.map(p => `<span style="margin-right:8px">${p.nombre} (${p.estado||'disponible'})</span>`).join('')}
      </div>` : ''}
    </div>`;
  }).join('');
  if (!container.innerHTML.trim()) container.innerHTML = '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-align:center;padding:8px 0">Sin registros</div>';
}

function eliminarBitacora(idx, mi) {
  if (!window.confirm("¿Eliminar este registro de la bitácora de mantenimiento?")) return;
  state[idx].mantenimiento.splice(mi, 1);
  savePanel(idx);
  renderBitacora(idx, state[idx].mantenimiento);
}

function docStatusBadge(vence) {
  if (!vence) return '<span class="doc-status-badge-inner" style="color:var(--muted)">—</span>';
  const days = daysUntil(vence);
  if (days === null) return `<span class="doc-status-badge-inner" style="color:var(--muted)">—</span>`;
  if (days < 0) return `<span class="doc-status-badge-inner" style="color:var(--danger)"><span class="dot" style="background:var(--danger)"></span>VENCIDO</span>`;
  if (days <= 5) return `<span class="doc-status-badge-inner" style="color:var(--orange)"><span class="dot" style="background:var(--orange)"></span>POR VENCER (${days}d)</span>`;
  if (days <= 30) return `<span class="doc-status-badge-inner" style="color:var(--warn)"><span class="dot" style="background:var(--warn)"></span>POR VENCER (${days}d)</span>`;
  return `<span class="doc-status-badge-inner" style="color:var(--ok)"><span class="dot" style="background:var(--ok)"></span>VIGENTE</span>`;
}

function renderDocList(idx, items) {
  const container = document.getElementById('doc-list-' + idx);
  container.innerHTML = '';
  items.forEach((d, di) => {
    const row = document.createElement('div');
    row.className = 'doc-row';
    row.innerHTML = `
      <input type="text" class="doc-name-input" value="${d.nombre}" placeholder="Nombre del documento" onchange="updateDoc(${idx},${di},'nombre',this.value)">
      <input type="date" class="doc-date-input" value="${d.vence}" onchange="updateDoc(${idx},${di},'vence',this.value);this.closest('.doc-row').querySelector('.doc-status-badge').innerHTML=docStatusBadge(this.value)">
      <span class="doc-status-badge">${docStatusBadge(d.vence)}</span>
    `;
    container.appendChild(row);
  });
}

// Preset statuses
const presetStatus = {
  "HP-1819":  "operativo",
  "HP-1907":  "mantenimiento",
  "HP-1784":  "aog",
  "HP-1815":  "operativo",
  "HP-1579":  "mantenimiento",
  "HP-1930":  "operativo",
  "HP-880BL":   "mantenimiento",
  "HP-18BLM":   "operativo",
  "HP-11BL":    "operativo",
  "HP-1805BLM": "aog",
};

// Preset data per aircraft
const presetData = {
  "HP-1819": { ciclos_totales: "500", ciclos_limite: "1150" },
};

// State - initialized with presets, then overwritten by Firebase data
const state = fleet.map((ac, idx) => {
  const base = defaultAc(ac);
  Object.assign(base,previewData.fleet[ac.reg.replace(/[^a-zA-Z0-9]/g,'_')]||{});
  return base;
});

function updateMaint(idx, mi, key, val) {
  state[idx].mantenimiento[mi][key] = val;
}
function updateMaintDate(idx, mi, val) {
  state[idx].mantenimiento[mi].fecha = val;
  document.getElementById(`days-badge-${idx}-${mi}`).innerHTML = daysBadge(daysUntil(val));
}
function updateDoc(idx, di, key, val) {
  state[idx].documentos[di][key] = val;
}

function addMaintRow(idx) {
  state[idx].mantenimiento.push({ nombre: '', fecha: '', resuelto: false, piezas: [] });
  renderMaintList(idx, state[idx].mantenimiento);
}
function addDocRow(idx) {
  state[idx].documentos.push({ nombre: '', vence: '', estado: '' });
  renderDocList(idx, state[idx].documentos);
}

function toggleEmerg(idx) {
  const body = document.getElementById('emerg-body-' + idx);
  const arrow = document.getElementById('emerg-arrow-' + idx);
  const visible = body.style.display !== 'none';
  body.style.display = visible ? 'none' : 'block';
  arrow.textContent = visible ? '▸' : '▾';
}

function getHoraPanama() {
  return new Date().toLocaleTimeString('es-PA', {hour:'2-digit',minute:'2-digit',timeZone:'America/Panama',hour12:true});
}
function getFechaPanama() {
  return fechaVista(panamaISO());
}

function renderBitacoraHoras(idx, items) {
  const container = document.getElementById('bitacora-horas-' + idx);
  if (!container) return;
  const registros = Array.isArray(items) ? items : [];
  if (!registros.length) {
    container.innerHTML = '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-align:center;padding:8px 0">Sin registros</div>';
    return;
  }
  // Show most recent first
  const lastIdx = registros.length - 1;
  container.innerHTML = [...registros].reverse().map((r, ri) => {
    const origIdx = registros.length - 1 - ri;
    const isLast = origIdx === lastIdx;
    return `<div style="display:grid;grid-template-columns:1fr 1fr 80px 80px 30px;gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)${isLast?';background:rgba(0,102,204,0.04)':''}">
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--text)">${r.fecha||'—'}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">${r.hora||'—'}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--accent);font-weight:700">${parseFloat(r.hv||0).toFixed(2)}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--text)">${parseFloat(r.acum||0).toFixed(2)}</span>
      ${isLast ? `<button onclick="eliminarHoraBitacora(${idx},${origIdx})" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:12px;padding:0" title="Eliminar último registro">✕</button>` : '<span></span>'}
    </div>`;
  }).join('');
}

// Allow correcting the date of any bitacora_horas entry (e.g. when hours were
// entered in bulk today but actually correspond to a previous month).
function editarFechaBitacora(idx, ri, isoValue) {
  const d = state[idx];
  if (!d.bitacora_horas || !d.bitacora_horas[ri] || !isoValue) return;
  const [yyyy, mm, dd] = isoValue.split('-');
  d.bitacora_horas[ri].fecha = `${dd}/${mm}/${yyyy}`;
  savePanel(idx);
  // Refresh stats if visible
  const statsPanelEl = document.getElementById('panel-estadisticas');
  if (statsPanelEl && statsPanelEl.classList.contains('active')) buildEstadisticas();
}


function eliminarHoraBitacora(idx, ri) {
  if (!window.confirm("¿Eliminar este registro de horas de vuelo? Sus horas se descontarán de los acumulados de inspección.")) return;
  const d = state[idx];
  if (!d.bitacora_horas || !d.bitacora_horas[ri]) return;
  const hv = parseFloat(d.bitacora_horas[ri].hv || 0);
  // Subtract from accumulators
  d.horas_acum_50 = Math.max(0, parseFloat(d.horas_acum_50||0) - hv).toFixed(2);
  d.horas_acum_100 = Math.max(0, parseFloat(d.horas_acum_100||0) - hv).toFixed(2);
  d.bitacora_horas.splice(ri, 1);
  // Update display
  const a50 = document.getElementById('acum50-' + idx);
  const a100 = document.getElementById('acum100-' + idx);
  if (a50) a50.textContent = parseFloat(d.horas_acum_50).toFixed(2) + ' HV';
  {const edit=document.getElementById('edit-acum50-'+idx);if(edit)edit.value=Number(d.horas_acum_50||0).toFixed(2);}
  if (a100) a100.textContent = parseFloat(d.horas_acum_100).toFixed(2) + ' HV';
  const pb50 = document.getElementById('pb-50-' + idx);
  const pb100 = document.getElementById('pb-100-' + idx);
  if (pb50) pb50.style.width = Math.min(100, parseFloat(d.horas_acum_50)/50*100) + '%';
  if (pb100) pb100.style.width = Math.min(100, parseFloat(d.horas_acum_100)/100*100) + '%';
  if(pb50)pb50.className='progress-fill '+inspectionFill(d.horas_acum_50,50);
  if(pb100)pb100.className='progress-fill '+inspectionFill(d.horas_acum_100,100);
  renderBitacoraHoras(idx, d.bitacora_horas);
  savePanel(idx);
}

function updateEstatusBadge(idx, status, label) {
  const badge = document.getElementById('estatus-badge-' + idx);
  if (!badge) return;
  const styles = {
    operativo:    'color:var(--ok);background:rgba(0,119,68,0.1);border:1px solid var(--ok)',
    mantenimiento:'color:var(--warn);background:rgba(204,119,0,0.1);border:1px solid var(--warn)',
    aog:          'color:var(--danger);background:rgba(204,17,34,0.1);border:1px solid var(--danger)'
  };
  badge.style.cssText = `font-family:'Orbitron',sans-serif;font-size:14px;font-weight:900;letter-spacing:1px;padding:10px 16px;border-radius:8px;display:inline-block;${styles[status]||styles.operativo}`;
  badge.textContent = (status==='operativo'?'✅ OPERATIVO':status==='mantenimiento'?'🔧 MANTENIMIENTO':status==='aog'?'🔴 GROUNDED':'SIN REGISTRAR');
}

// Generic mapping for "Vencimientos en Horas" fields, supports motor/helices and helice1/helice2 (HP-880BL)
const VENC_FIELD_MAP = {
  motor:    { dataField: 'ciclos_totales', limiteField: 'limite_motor',  acumId: 'acum-motor-',    hiddenId: 'ciclos_totales-' },
  helices:  { dataField: 'ciclos_limite',  limiteField: 'limite_helice', acumId: 'acum-helices-',  hiddenId: 'ciclos_limite-' },
  helice1:  { dataField: 'helice1_ciclos', limiteField: 'helice1_limite',acumId: 'acum-helice1-',  hiddenId: 'helice1_ciclos-' },
  helice2:  { dataField: 'helice2_ciclos', limiteField: 'helice2_limite',acumId: 'acum-helice2-',  hiddenId: 'helice2_ciclos-' }
};

function getLimite(tipo, idx) {
  const map = VENC_FIELD_MAP[tipo];
  const el = document.getElementById('limite-' + tipo + '-' + idx);
  return parseFloat(el ? el.value : (state[idx][map.limiteField]) || 2000) || 2000;
}

function updateLimiteVenc(tipo, idx, val) {
  const d = state[idx];
  const map = VENC_FIELD_MAP[tipo];
  const l = parseFloat(val) || 2000;
  d[map.limiteField] = l.toString();
  updateVencBar(tipo, idx, d[map.dataField], l);
}

function establecerTotalVenc(tipo, idx, val) {
  const d = state[idx];
  const map = VENC_FIELD_MAP[tipo];
  const v = parseFloat(val) || 0;
  d[map.dataField] = v.toFixed(2);
  const el = document.getElementById(map.hiddenId + idx);
  if (el) el.value = d[map.dataField];
  const am = document.getElementById(map.acumId + idx);
  if (am) am.textContent = v.toFixed(2);
  updateVencBar(tipo, idx, v, getLimite(tipo, idx));
}


function revertirVenc(idx) {
  if (!window.confirm("¿Revertir el último ingreso de horas? Sus horas se descontarán de los acumulados de vencimiento.")) return;
  const d = state[idx];
  if (!d.ultimo_venc_hv) return;
  const hv = parseFloat(d.ultimo_venc_hv);
  const isHP880 = isMultimotor(fleet[idx].reg);
  const vencTipos = isHP880 ? ['motor','helices','helice1','helice2'] : ['motor','helices'];
  vencTipos.forEach(tipo => {
    const map = VENC_FIELD_MAP[tipo];
    d[map.dataField] = Math.max(0, parseFloat(d[map.dataField]||0) - hv).toFixed(2);
    const manInp = document.getElementById((tipo==='motor'?'motor-manual':tipo==='helices'?'helices-manual':tipo+'-manual') + '-' + idx);
    if (manInp) manInp.value = d[map.dataField] || '';
    const limInp = document.getElementById('limite-' + tipo + '-' + idx);
    if (limInp) limInp.value = d[map.limiteField] || '2000';
    const acumEl = document.getElementById(map.acumId + idx);
    if (acumEl) acumEl.textContent = parseFloat(d[map.dataField]||0).toFixed(2);
    updateVencBar(tipo, idx, d[map.dataField], 2000);
    const hiddenEl = document.getElementById(map.hiddenId + idx);
    if (hiddenEl) hiddenEl.value = d[map.dataField];
  });
  d.ultimo_venc_hv = '';
  d.ultimo_venc_fecha = '';
  const ulDiv = document.getElementById('ultimo-venc-' + idx);
  if (ulDiv) ulDiv.style.display = 'none';
  savePanel(idx);
}

function getVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }

// Sync status dropdown with estatus badge
function onStatusChange(idx, val) {
  const d = state[idx];
  d.status = val;
  d.estatus_label = '';
  const label = val==='operativo'?'✅ OPERATIVO':val==='mantenimiento'?'🔧 MANTENIMIENTO':val==='aog'?'🔴 GROUNDED':'SIN REGISTRAR';
  updateEstatusBadge(idx, val, d.estatus_label || label);
  // Update tab badge
  const aircraftTab = document.querySelector('#sidebar-tabs .aircraft-tab[data-idx="'+idx+'"]');
  if (aircraftTab) {
    const dot = aircraftTab.querySelector('.tab-badge');
    if (dot) dot.className = 'tab-badge ' + (val==='operativo'?'badge-ok':val==='mantenimiento'?'badge-warn':val==='aog'?'badge-danger':'badge-empty');
  }
}


function tacCents(raw){
  if(raw==='' || raw==null)return null;
  if(!/^\d{1,5}(?:\.\d{1,2})?$/.test(String(raw)))return NaN;
  const [whole,frac='']=String(raw).split('.');return Number(whole)*100+Number(frac.padEnd(2,'0'));
}
function tacDifference(previous,current){
  const a=tacCents(previous),b=tacCents(current);
  if(a===null || b===null)return null;
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return NaN;
  return (b-a)/100;
}
function updateTAC(idx){
  const previous=document.getElementById('tac-anterior-'+idx),current=document.getElementById('tac-actual-'+idx);
  const delta=tacDifference(previous.value,current.value),msg=document.getElementById('tac-msg-'+idx);
  current.setCustomValidity(Number.isNaN(delta)?'El TAC actual debe ser igual o mayor al anterior, con máximo 5 dígitos y 2 decimales.':'');
  const hasTAC=current.value!=='';
  for(const id of ['horas_diarias-','horas-venc-dia-']){
    const el=document.getElementById(id+idx);if(!el)continue;
    if(hasTAC && !el.readOnly)el.dataset.manualHours=el.value;
    if(hasTAC)el.value=Number.isFinite(delta)?delta.toFixed(2):'';
    else if(el.readOnly)el.value=el.dataset.manualHours||'';
    el.readOnly=hasTAC;
  }
  msg.textContent=Number.isNaN(delta)?'Revisa el TAC: no se admiten diferencias negativas.':delta===null?'Ingresa ambos TAC para calcular las horas.':'Diferencia: '+delta.toFixed(2)+' HV · se aplica una vez al guardar.';
  msg.style.color=Number.isNaN(delta)?'var(--danger)':'var(--muted)';
}
function escapeRecord(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderAudit(audit){return (audit||[]).length?`<details><summary>Historial de modificaciones (${audit.length})</summary>${audit.map(a=>`<div class="record-audit"><b>${escapeRecord(a.fecha)} · ${escapeRecord(a.hora)}</b><div>Motivo: ${escapeRecord(a.razon)}</div><div>Antes: ${escapeRecord(JSON.stringify(a.antes))}</div><div>Después: ${escapeRecord(JSON.stringify(a.despues))}</div></div>`).join('')}</details>`:'';}
function inspectionTACRows(records){
  const ordered=records.map((r,index)=>({r,index})).sort((a,b)=>{
    const da=dayNumber(a.r.fecha),db=dayNumber(b.r.fecha);
    return (Number.isFinite(da)&&Number.isFinite(db)?da-db:0)||a.index-b.index;
  });
  return ordered.map((entry,i)=>{
    const previous=i>0?ordered[i-1].r.tac:null;
    const prior=previous===null||previous===''?null:tacCents(String(previous));
    const current=tacCents(String(entry.r.tac??''));
    return {...entry,previous:prior!==null&&Number.isFinite(prior)?(prior/100).toFixed(2):null,
      hours:prior!==null&&Number.isFinite(prior)&&Number.isFinite(current)?((current-prior)/100).toFixed(2):null};
  }).reverse();
}
function renderTACLogs(idx){
 const d=state[idx],tac=document.getElementById('tac-log-'+idx),insp=document.getElementById('inspection-log-'+idx);
 const number=v=>v!==''&&v!=null&&Number.isFinite(Number(v))?Number(v).toFixed(2):'—';
 const dateCell=(kind,r,i)=>'<td><span>'+escapeRecord(fechaVista(r.fecha))+'</span><small>'+escapeRecord(r.hora||'')+'</small>'+
   (kind==='inspection'?'<small>Insp. '+escapeRecord(r.tipo)+' h · Próxima '+escapeRecord(r.proxima)+' h</small>':'')+
   '<button type="button" class="log-row-edit" onclick="openRecordEditor(\''+kind+'\','+idx+','+i+')" aria-label="Modificar registro del '+escapeRecord(fechaVista(r.fecha))+'">Editar</button></td>';
 const audit=r=>(r.modificaciones||[]).length?'<tr class="log-audit-row"><td colspan="4">'+renderAudit(r.modificaciones)+'</td></tr>':'';
 const table=(headers,rows)=>'<table class="aircraft-log-table"><thead><tr>'+headers.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>';
 if(tac)tac.innerHTML=(d.bitacora_tac||[]).length?table(['Fecha','TAC Anterior','TAC Actual','Horas'],
   d.bitacora_tac.map((r,i)=>'<tr>'+dateCell('tac',r,i)+'<td>'+escapeRecord(number(r.anterior))+'</td><td>'+escapeRecord(number(r.actual))+'</td><td>'+escapeRecord(number(r.hv))+'</td></tr>'+audit(r)).reverse().join('')
 ):'<div class="record-empty">Sin tacómetros registrados</div>';
 if(insp)insp.innerHTML=(d.bitacora_inspecciones||[]).length?table(['Fecha','TAC Insp. Anterior','TAC Actual','Horas'],
   inspectionTACRows(d.bitacora_inspecciones).map(({r,index,previous,hours})=>'<tr>'+dateCell('inspection',r,index)+'<td title="'+(previous===null?'No hay un TAC de inspección anterior registrado':'TAC de la inspección anterior')+'">'+(previous===null?'Pendiente':escapeRecord(previous))+'</td><td>'+escapeRecord(number(r.tac))+'</td><td title="'+(hours!==null&&Number(hours)<0?'Revisar: el TAC actual es menor al anterior':'Diferencia entre los dos TAC')+'">'+(hours===null?'—':escapeRecord(hours))+'</td></tr>'+audit(r)).join('')
 ):'<div class="record-empty">Sin inspecciones registradas</div>';
}
async function openRecordEditor(kind,idx,ri=-1,tipo=50){
 if(aircraftDirty.has(idx)&&!await savePanel(idx))return;
 const d=state[idx],newInspection=kind==='inspection'&&ri===-1;
 const r=newInspection?{fecha:getFechaPanama(),tipo,tac:d.tac_anterior||'',proxima:tipo===50?100:50}:kind==='tac'?d.bitacora_tac[ri]:d.bitacora_inspecciones[ri];
 const dialog=document.createElement('dialog');dialog.className='record-dialog';
 dialog.innerHTML=`<form><h3>${newInspection?'Registrar inspección resuelta':kind==='tac'?'Modificar registro de TAC':'Modificar inspección'}</h3><div class="record-form"><label>Fecha<input name="fecha" value="${escapeRecord(r.fecha)}" placeholder="DD/MM/AAAA" required></label>${kind==='tac'?`<label>TAC anterior<input name="anterior" type="number" min="0" max="99999.99" step="0.01" value="${escapeRecord(r.anterior)}" required></label><label>TAC actual<input name="actual" type="number" min="0" max="99999.99" step="0.01" value="${escapeRecord(r.actual)}" required></label>`:`<label>Inspección realizada<select name="tipo"><option value="50" ${Number(r.tipo)===50?'selected':''}>50 horas</option><option value="100" ${Number(r.tipo)===100?'selected':''}>100 horas</option></select></label><label>Tacómetro<input name="tac" type="number" min="0" max="99999.99" step="0.01" value="${escapeRecord(r.tac)}" required></label><label>Próxima inspección<select name="proxima"><option value="50" ${Number(r.proxima)===50?'selected':''}>50 horas</option><option value="100" ${Number(r.proxima)===100?'selected':''}>100 horas</option></select></label>`}${!newInspection?'<label class="full-field">Motivo de la modificación<textarea name="razon" required placeholder="Explica por qué corriges este registro"></textarea></label>':''}</div><div class="record-error" role="alert"></div><div class="record-actions"><button type="button" class="record-btn" data-cancel>Cancelar</button><button class="save-btn" type="submit">Guardar registro</button></div></form>`;
 document.body.appendChild(dialog);dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
 dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const f=Object.fromEntries(new FormData(event.target));const error=await applyRecordChange(kind,idx,ri,f);if(error){dialog.querySelector('.record-error').textContent=error;return;}dialog.close();};dialog.showModal();
}
function adjustRecordedHours(d,r,delta){
 if(!delta)return;
 let hi=Number.isInteger(r.hour_index)?r.hour_index:(d.bitacora_horas||[]).findIndex(h=>h.tac_id===r.id || h.fecha===r.fecha&&h.hora===r.hora&&Number(h.hv)===Number(r.hv));
 if(hi<0)throw Error('No se encontró el registro de horas vinculado. No se aplicó la modificación.');
 const inspections=d.bitacora_inspecciones||[];
 const last50=[...inspections].reverse().find(x=>x.tipo===50||x.tipo===100),last100=[...inspections].reverse().find(x=>x.tipo===100);
 const add=key=>{const n=Number(d[key]||0)+delta;if(n<0)throw Error('La corrección produciría horas negativas. Revisa las lecturas.');d[key]=n.toFixed(2);};
 if(!last50||hi>=last50.hour_offset)add('horas_acum_50');
 if(!last100||hi>=last100.hour_offset)add('horas_acum_100');
 for(const key of ['ciclos_totales','ciclos_limite'])add(key);
 if(isMultimotor(fleetRecordReg(d)))for(const key of ['helice1_ciclos','helice2_ciclos'])add(key);
 d.bitacora_horas[hi].hv=(Number(d.bitacora_horas[hi].hv)+delta).toFixed(2);
 const nextReset=inspections.find(x=>x.tipo===100&&x.hour_offset>hi)?.hour_offset??Infinity;
 for(let i=hi;i<d.bitacora_horas.length&&i<nextReset;i++)d.bitacora_horas[i].acum=(Number(d.bitacora_horas[i].acum||0)+delta).toFixed(2);
 d.horas_totales=d.horas_acum_50;d.horas_limite=d.horas_acum_100;
}
function fleetRecordReg(d){return d.audit_aircraft_reg||'';}
async function applyRecordChange(kind,idx,ri,f){
 if(!Number.isFinite(dayNumber(f.fecha)))return 'Ingresa una fecha válida DD/MM/AAAA.';
 if(ri>=0&&!String(f.razon||'').trim())return 'El motivo de la modificación es obligatorio.';
 const original=structuredClone(state[idx]),d=structuredClone(state[idx]);d.audit_aircraft_reg=fleet[idx].reg;
 try{
 if(kind==='tac'){
   const r=d.bitacora_tac[ri],hv=tacDifference(f.anterior,f.actual);if(!Number.isFinite(hv))return 'Revisa los TAC: máximo 5 dígitos, 2 decimales y diferencia no negativa.';
   const before={fecha:r.fecha,anterior:r.anterior,actual:r.actual,hv:r.hv};
   adjustRecordedHours(d,r,hv-Number(r.hv));
   const linked=d.bitacora_horas[r.hour_index??-1];if(linked)linked.fecha=f.fecha;
   Object.assign(r,{fecha:f.fecha,anterior:Number(f.anterior).toFixed(2),actual:Number(f.actual).toFixed(2),hv:hv.toFixed(2)});
   r.modificaciones ||= [];r.modificaciones.push({fecha:getFechaPanama(),hora:getHoraPanama(),razon:f.razon.trim(),antes:before,despues:{fecha:r.fecha,anterior:r.anterior,actual:r.actual,hv:r.hv}});
   if(ri===d.bitacora_tac.length-1)d.tac_anterior=r.actual;
 }else{
   const tipo=Number(f.tipo),proxima=Number(f.proxima),tac=tacCents(f.tac);if(![50,100].includes(tipo)||![50,100].includes(proxima)||!Number.isFinite(tac))return 'Revisa el tipo de inspección y el tacómetro.';
   d.bitacora_inspecciones ||= [];
   if(ri===-1){
     const r={fecha:f.fecha,hora:getHoraPanama(),tac:(tac/100).toFixed(2),tipo,proxima,hour_offset:(d.bitacora_horas||[]).length,before50:d.horas_acum_50||'0',before100:d.horas_acum_100||'0',modificaciones:[]};
     d.bitacora_inspecciones.push(r);d.horas_acum_50='0.00';if(tipo===100)d.horas_acum_100='0.00';d.proxima_inspeccion=proxima;
   }else{
     const r=d.bitacora_inspecciones[ri],before={fecha:r.fecha,tac:r.tac,tipo:r.tipo,proxima:r.proxima};
     const oldTipo=r.tipo;Object.assign(r,{fecha:f.fecha,tac:(tac/100).toFixed(2),tipo,proxima});r.modificaciones ||= [];r.modificaciones.push({fecha:getFechaPanama(),hora:getHoraPanama(),razon:f.razon.trim(),antes:before,despues:{fecha:r.fecha,tac:r.tac,tipo,proxima}});
     if(ri===d.bitacora_inspecciones.length-1){d.proxima_inspeccion=proxima;if(oldTipo!==tipo){const since=(d.bitacora_horas||[]).slice(r.hour_offset).reduce((n,h)=>n+Number(h.hv||0),0);d.horas_acum_100=(tipo===100?since:Number(r.before100||0)+since).toFixed(2);}}
   }
   d.horas_totales=d.horas_acum_50;d.horas_limite=d.horas_acum_100;
 }
 delete d.audit_aircraft_reg;
 if(!await saveData(fleet[idx].reg,d))return 'No se pudo guardar. El registro anterior se conserva.';
 state[idx]=d;aircraftDirty.delete(idx);refreshPanel(idx);updateTAC(idx);updateSummary();buildResumen();updateUndoButtons();return '';
 }catch(e){state[idx]=original;return e.message;}
}
async function savePanelInternal(idx){
  const previous=document.getElementById('tac-anterior-'+idx),current=document.getElementById('tac-actual-'+idx);
  const priorRaw=previous?.value||'',currentRaw=current?.value||'';
  if(currentRaw!==''){
    updateTAC(idx);
    if(priorRaw===''){previous.setCustomValidity('Ingresa el TAC anterior.');previous.reportValidity();return false;}
    previous.setCustomValidity('');
  }else if(previous)previous.setCustomValidity('');
  const invalid=document.querySelector('#panel-'+idx+' input:invalid');if(invalid){invalid.reportValidity();return false;}
  const delta=currentRaw!==''?tacDifference(priorRaw,currentRaw):null;
  if(currentRaw!==''&&!Number.isFinite(delta))return false;
  const before=structuredClone(state[idx]);
  const manualHours=document.getElementById('horas_diarias-'+idx)?.value||'';
  const vencHours=document.getElementById('horas-venc-dia-'+idx)?.value||'';
  const d=state[idx],fecha=getFechaPanama(),hora=getHoraPanama();
  d.active_tac_id='';
  if(priorRaw!=='')d.tac_anterior=(tacCents(priorRaw)/100).toFixed(2);
  if(delta!==null){
    d.bitacora_tac ||= [];d.active_tac_id='tac-'+Date.now()+'-'+d.bitacora_tac.length;d.bitacora_tac.push({id:d.active_tac_id,hour_index:(d.bitacora_horas||[]).length,fecha,hora,anterior:(tacCents(priorRaw)/100).toFixed(2),actual:(tacCents(currentRaw)/100).toFixed(2),hv:delta.toFixed(2)});
    d.tac_anterior=(tacCents(currentRaw)/100).toFixed(2);
    if(delta===0){d.bitacora_horas ||= [];d.bitacora_horas.push({fecha,hora,hv:'0.00',tac_id:d.active_tac_id,acum:d.horas_acum_100||'0.00'});}
  }
  const ok=await savePanelLegacy(idx);
  if(!ok){
    state[idx]=before;const old=document.getElementById('panel-'+idx),replacement=buildPanel(fleet[idx],state[idx],idx);replacement.className=old.className;old.replaceWith(replacement);refreshPanel(idx);
    document.getElementById('tac-anterior-'+idx).value=priorRaw;document.getElementById('tac-actual-'+idx).value=currentRaw;
    document.getElementById('horas_diarias-'+idx).value=manualHours;document.getElementById('horas-venc-dia-'+idx).value=vencHours;
    updateTAC(idx);aircraftDirty.add(idx);updateUndoButtons();return false;
  }
  if(previous)previous.value=d.tac_anterior||'';
  if(current)current.value='';
  for(const id of ['horas_diarias-','horas-venc-dia-']){const el=document.getElementById(id+idx);el.value='';el.readOnly=false;delete el.dataset.manualHours;}
  const msg=document.getElementById('tac-msg-'+idx);if(msg)msg.textContent=delta!==null?'TAC registrado. Ingresa la siguiente lectura actual.':'Ingresa ambos TAC para calcular las horas.';
  renderVencimientoLog(idx);
  renderTACLogs(idx);return true;
}

async function savePanelLegacy(idx) {
  const invalid=document.querySelector('#panel-'+idx+' input:invalid');if(invalid){invalid.reportValidity();return false;}

  const d = state[idx];
  const ac = fleet[idx];
  d.status        = getVal('status-' + idx);
  d.estatus_label = '';
  updateEstatusBadge(idx,d.status,'');
  d.serial        = getVal('serial-' + idx);
  d.year          = getVal('year-' + idx);
  d.voltaje           = getVal('voltaje-' + idx);
  d.motor_fabricante  = getVal('motor_fabricante-' + idx);
  d.motor_modelo      = getVal('motor_modelo-' + idx);
  d.motor_serie       = getVal('motor_serie-' + idx);
  d.helice_fabricante = getVal('helice_fabricante-' + idx);
  d.helice_modelo     = getVal('helice_modelo-' + idx);
  d.helice_serie      = getVal('helice_serie-' + idx);
  if (isMultimotor(ac.reg)) {
    for (const kind of ['motor','helice']) {
      d[kind + '_serie_izq'] = getVal(kind + '_serie-' + idx);
      for (const field of ['fabricante','modelo','serie']) {
        d[kind + '_' + field + '_der'] = getVal(kind + '_' + field + '_der-' + idx);
      }
    }
  }

  // Daily hours accumulation
  const hvDiariasRaw = parseFloat(getVal('horas_diarias-' + idx) || 0);
  if (hvDiariasRaw > 0) {
    const fecha = getFechaPanama();
    const hora = getHoraPanama();
    d.horas_acum_50 = (parseFloat(d.horas_acum_50 || 0) + hvDiariasRaw).toFixed(2);
    d.horas_acum_100 = (parseFloat(d.horas_acum_100 || 0) + hvDiariasRaw).toFixed(2);
    d.fecha_diaria = fecha + ' ' + hora;
    if (!Array.isArray(d.bitacora_horas)) d.bitacora_horas = [];
    d.bitacora_horas.push({ fecha, hora, tac_id:d.active_tac_id||'', hv: hvDiariasRaw.toFixed(2), acum: d.horas_acum_100 });
    d.horas_diarias = '';
    // Status changes only through the manual selector.
    // Update display immediately
    const inp = document.getElementById('horas_diarias-' + idx);
    if (inp) inp.value = '';
    const fd = document.getElementById('fecha-diaria-' + idx);
    if (fd) fd.textContent = d.fecha_diaria;
    const a50 = document.getElementById('acum50-' + idx);
    const a100 = document.getElementById('acum100-' + idx);
    if (a50) a50.textContent = parseFloat(d.horas_acum_50).toFixed(2) + ' HV';
  {const edit=document.getElementById('edit-acum50-'+idx);if(edit)edit.value=Number(d.horas_acum_50||0).toFixed(2);}
    if (a100) a100.textContent = parseFloat(d.horas_acum_100).toFixed(2) + ' HV';
    const pb50 = document.getElementById('pb-50-' + idx);
    const pb100 = document.getElementById('pb-100-' + idx);
    if (pb50) { pb50.style.width = Math.min(100, parseFloat(d.horas_acum_50)/50*100) + '%'; pb50.className = 'progress-fill ' + (inspectionFill(d.horas_acum_50, 50)); }
    if (pb100) { pb100.style.width = Math.min(100, parseFloat(d.horas_acum_100)/100*100) + '%'; pb100.className = 'progress-fill ' + (inspectionFill(d.horas_acum_100, 100)); }
    renderBitacoraHoras(idx, d.bitacora_horas);
  }
  d.horas_totales = d.horas_acum_50 || '';
  d.horas_limite  = d.horas_acum_100 || '';
  d.fecha_50      = state[idx].fecha_50 || d.fecha_50 || '';
  d.fecha_100     = state[idx].fecha_100 || d.fecha_100 || '';
  // Daily hours for motor+helices (+ helice1/helice2 for HP-880BL)
  const hvVencDia = parseFloat(document.getElementById('horas-venc-dia-' + idx)?.value || 0);
  if (hvVencDia > 0) {
    const fechaV = getFechaPanama();
    const horaV = getHoraPanama();
    const isHP880 = isMultimotor(fleet[idx].reg);
    const vencTipos = isHP880 ? ['motor','helices','helice1','helice2'] : ['motor','helices'];
    vencTipos.forEach(tipo => {
      const map = VENC_FIELD_MAP[tipo];
      d[map.dataField] = (parseFloat(d[map.dataField] || 0) + hvVencDia).toFixed(2);
      const fechaFieldName = tipo === 'motor' ? 'fecha_motor' : tipo === 'helices' ? 'fecha_helices' : 'fecha_' + tipo;
      d[fechaFieldName] = fechaV + ' ' + horaV;
      const acumEl = document.getElementById(map.acumId + idx);
      if (acumEl) acumEl.textContent = parseFloat(d[map.dataField]||0).toFixed(2);
      updateVencBar(tipo, idx, d[map.dataField], getLimite(tipo, idx));
      const fEl = document.getElementById('fecha-' + tipo + '-' + idx);
      if (fEl) fEl.textContent = fechaV;
      const manualEl=document.getElementById(tipo+'-manual-'+idx);
      if(manualEl)manualEl.value=d[map.dataField];
      const hiddenEl = document.getElementById(map.hiddenId + idx);
      if (hiddenEl) hiddenEl.value = d[map.dataField];
    });
    // Save ultimo registro
    d.ultimo_venc_hv = hvVencDia.toFixed(2);
    d.ultimo_venc_fecha = fechaV + ' ' + horaV;
    const ulDiv = document.getElementById('ultimo-venc-' + idx);
    if (ulDiv) {
      ulDiv.style.display = 'flex';
      ulDiv.querySelector('span:nth-child(2)').textContent = hvVencDia.toFixed(2) + ' HV';
      ulDiv.querySelector('span:nth-child(3)').textContent = d.ultimo_venc_fecha;
    }
    // Clear input
    const vencInp = document.getElementById('horas-venc-dia-' + idx);
    if (vencInp) vencInp.value = '';
  }
  d.horas_desde_revision = getVal('horas_desde-' + idx);
  d.horas_hasta_revision = getVal('horas_hasta-' + idx);
  const notaEl = document.getElementById('estatus_nota-' + idx);
  if (notaEl) d.estatus_nota = notaEl.value;
  d.fecha_motor   = state[idx].fecha_motor   || d.fecha_motor   || '';
  d.fecha_helices = state[idx].fecha_helices || d.fecha_helices || '';
  d.limite_motor = getVal('limite-motor-' + idx) || (isMultimotor(ac.reg)?'':d.limite_motor||'2000');
  d.limite_helice = getVal('limite-helices-' + idx) || (isMultimotor(ac.reg)?'':d.limite_helice||'2000');
  if (isMultimotor(fleet[idx].reg)) {
    d.fecha_helice1  = state[idx].fecha_helice1  || d.fecha_helice1  || '';
    d.fecha_helice2  = state[idx].fecha_helice2  || d.fecha_helice2  || '';
    d.helice1_limite = getVal('limite-helice1-' + idx) || '';
    d.helice2_limite = getVal('limite-helice2-' + idx) || '';
  }
  collectEmergencyDates(idx,d);

  // Update progress bars
  const hp = pct(d.horas_totales, d.horas_limite);
  const pb_h = document.getElementById('pb-horas-' + idx);
  pb_h.style.width = (hp || 0) + '%';
  pb_h.className = 'progress-fill ' + fillCls(hp);
  document.getElementById('pct-horas-' + idx).textContent = hp !== null ? hp + '% del límite' : '—';

  const cp = pct(d.ciclos_totales, d.ciclos_limite);
  const pb_c = document.getElementById('pb-ciclos-' + idx);
  pb_c.style.width = (cp || 0) + '%';
  pb_c.className = 'progress-fill ' + fillCls(cp);
  document.getElementById('pct-ciclos-' + idx).textContent = cp !== null ? cp + '% del límite' : '—';

  // Update gauge
  const gc = gaugeColor(d.horas_desde_revision, d.horas_hasta_revision);
  const gw = document.getElementById('gauge-wrap-' + idx); if (gw) gw.innerHTML = buildGauge(d.horas_desde_revision, d.horas_hasta_revision, gc);
  const gaugeVal = document.getElementById('gauge-val-' + idx);
  if (gaugeVal) {
    gaugeVal.textContent = d.horas_desde_revision && d.horas_hasta_revision
      ? d.horas_desde_revision + ' / ' + d.horas_hasta_revision + ' HV' : '— / — HV';
    gaugeVal.style.color = gc;
  }

  // Update sidebar badge
  const badge = document.querySelector(`#sidebar-tabs .aircraft-tab[data-idx="${idx}"] .tab-badge`);
  if (badge) {
    badge.className = 'tab-badge ' + (d.status === 'operativo' ? 'badge-ok' : d.status === 'mantenimiento' ? 'badge-warn' : d.status === 'aog' ? 'badge-danger' : 'badge-empty');
  }

  const cleanData = structuredClone(d);

  const ok = await saveData(ac.reg, cleanData);
  if(ok) aircraftDirty.delete(idx);
  updateUndoButtons();
  updateSummary();

  const msg = document.getElementById('save-msg-' + idx);
  if (msg) {
    msg.textContent = ok ? '✓ Guardado' : '✗ Error al guardar';
    msg.style.color = ok ? 'var(--ok)' : 'var(--danger)';
    msg.style.opacity = '1';
    setTimeout(() => msg.style.opacity = '0', 2500);
  }
  return ok;
}

function updateSummary() {
  let ok=0, maint=0, aog=0;
  state.forEach(d => {
    if (d.status === 'operativo') ok++;
    else if (d.status === 'mantenimiento') maint++;
    else if (d.status === 'aog') aog++;
  });
  document.getElementById('sum-ok').textContent = ok || '—';
  document.getElementById('sum-maint').textContent = maint || '—';
  document.getElementById('sum-aog').textContent = aog || '—';
}

// Build everything
const sidebarEl = document.getElementById('sidebar-tabs');
const contentEl = document.getElementById('content-area');

// RESUMEN tab at top
const resumenTab = document.createElement('div');
resumenTab.className = 'aircraft-tab active';
resumenTab.innerHTML = '<div class="tab-reg" style="font-size:10px;color:var(--accent)">⚠️ PENDIENTES</div>';
resumenTab.addEventListener('click', () => {
  document.querySelectorAll('.aircraft-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.aircraft-panel').forEach(p => p.classList.remove('active'));
  resumenTab.classList.add('active');
  document.getElementById('panel-resumen').classList.add('active');
  buildResumen();
});
sidebarEl.insertBefore(resumenTab, sidebarEl.firstChild);

// ESTADISTICAS tab below PENDIENTES
const statsTab = document.createElement('div');
statsTab.className = 'aircraft-tab';
statsTab.innerHTML = '<div class="tab-reg" style="font-size:10px;color:var(--accent)">📊 ESTADÍSTICAS</div>';
statsTab.addEventListener('click', () => {
  document.querySelectorAll('.aircraft-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.aircraft-panel').forEach(p => p.classList.remove('active'));
  statsTab.classList.add('active');
  document.getElementById('panel-estadisticas').classList.add('active');
  buildEstadisticas();
});
sidebarEl.insertBefore(statsTab, resumenTab.nextSibling);

fleet.forEach((ac, idx) => {
  // Insert each category heading before its first aircraft.
  const category = ac.type==='rotor'?'HELICÓPTERO':isMultimotor(ac.reg)?'MULTIMOTOR':'MONOMOTOR';
  const prev = fleet[idx-1];
  const previousCategory = !prev?'':prev.type==='rotor'?'HELICÓPTERO':isMultimotor(prev.reg)?'MULTIMOTOR':'MONOMOTOR';
  if(category!==previousCategory){
    const hdr=document.createElement('div');
    hdr.className='sidebar-group-title';
    hdr.textContent=category;
    sidebarEl.appendChild(hdr);
  }
  const tab = document.createElement('div');
  tab.className = 'aircraft-tab' + (idx === 0 ? ' active' : '');
  tab.dataset.idx = idx;
  const d = state[idx];
  const badgeCls = d.status === 'operativo' ? 'badge-ok' : d.status === 'mantenimiento' ? 'badge-warn' : d.status === 'aog' ? 'badge-danger' : 'badge-empty';
  tab.innerHTML = `
    ${ac.img ? `<div style="width:100%;height:44px;margin-bottom:6px;overflow:hidden;position:relative">
      <img src="${ac.img}" style="width:100%;height:100%;object-fit:cover;object-position:center;filter:brightness(0.9) contrast(1.1)">
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,var(--panel) 100%)"></div>
    </div>` : ''}
    <div class="tab-reg">${ac.reg}</div>
    <div class="tab-model">${ac.model}</div>
    <div class="tab-badge ${badgeCls}"></div>
  `;
  tab.addEventListener('click', () => {
    document.querySelectorAll('.aircraft-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.aircraft-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + idx).classList.add('active');
  });
  sidebarEl.appendChild(tab);

  const panel = buildPanel(ac, d, idx);
  contentEl.appendChild(panel);
  renderMaintList(idx, d.mantenimiento);
  renderBitacora(idx, d.mantenimiento);
  renderSeguimiento(idx);
  renderBitacoraPedidos(idx);
  renderBitacoraHoras(idx, d.bitacora_horas);
  renderDocList(idx, d.documentos);
  renderVencimientoLog(idx);
  renderTACLogs(idx);
});

// Build Vigencia Pilotos panel
const pilotosPanel = document.createElement('div');
pilotosPanel.className = 'aircraft-panel';
pilotosPanel.id = 'panel-pilotos';
pilotosPanel.innerHTML = `
  <div class="aircraft-header">
    <div>
      <div class="aircraft-reg" >VIGENCIA PILOTOS</div>
      <div class="aircraft-model-line">ADMINISTRATIVOS · LICENCIAS Y HABILITACIONES</div>
    </div>
  </div>
  <div class="divider-label">✈ Pilotos</div>
  <div class="card">
    <div class="card-title">👨‍✈️ Registro de Vigencias</div>
    <div style="overflow-x:auto">
    <div class="pilotos-table-header" style="display:grid;grid-template-columns:160px 130px 60px 130px 60px 130px 60px 1fr 30px;gap:6px;padding:8px 0;border-bottom:1px solid var(--dim);min-width:900px">
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">NOMBRE DEL PILOTO</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">VEN. LICENCIA</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">DÍAS</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">CERT. MÉDICO</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">DÍAS</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">VERIF. ESCUELA</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">DÍAS</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted)">VERIFICACIONES ADICIONALES (POR AERONAVE)</span>
      <span></span>
    </div>
    <div id="pilotos-list"></div>
    </div>
    <button class="add-row-btn" onclick="addPilotoRow()">+ Agregar piloto</button>
  </div>
`;
contentEl.appendChild(pilotosPanel);

const pilotosData = [];
function renderPilotos() {
  const container = document.getElementById('pilotos-list');
  container.innerHTML = '';
  const isMobile = window.innerWidth <= 768;

  pilotosData.forEach((p, i) => {
    if (!Array.isArray(p.verificaciones)) p.verificaciones = [];

    // Verificaciones adicionales — mismo HTML para ambos layouts
    const verifHtml = `
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start">
        ${p.verificaciones.map((v, vi) => `
          <div style="display:flex;flex-direction:column;gap:2px;background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:4px 6px;min-width:120px">
            <div style="display:flex;align-items:center;gap:4px">
              <input type="text" class="maint-input" placeholder="Aeronave / tipo" value="${v.nombre||''}" onchange="pilotosData[${i}].verificaciones[${vi}].nombre=this.value;savePilotos()" style="font-size:9px;padding:3px 6px">
              <button onclick="eliminarVerificacionPiloto(${i},${vi})" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:12px;padding:0">✕</button>
            </div>
            ${v.fecha==='na' ?
              `<span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);cursor:pointer;text-decoration:underline;text-align:center" onclick="pilotosData[${i}].verificaciones[${vi}].fecha='';renderPilotos();savePilotos()">N/A</span>` :
              `<div style="display:flex;align-items:center;gap:4px">
                <input type="date" class="maint-input" value="${v.fecha||''}" onchange="pilotosData[${i}].verificaciones[${vi}].fecha=this.value;renderPilotos();savePilotos()" style="font-size:9px;padding:3px 4px;flex:1">
                ${daysBadge(daysUntil(v.fecha))}
              </div>
              <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);cursor:pointer;text-decoration:underline;text-align:right" onclick="pilotosData[${i}].verificaciones[${vi}].fecha='na';renderPilotos();savePilotos()">N/A</span>`
            }
          </div>
        `).join('')}
        <button onclick="pilotosData[${i}].verificaciones.push({nombre:'',fecha:''});renderPilotos();savePilotos()" style="background:transparent;border:1px dashed var(--border);border-radius:8px;color:var(--accent);cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:9px;padding:4px 10px;align-self:flex-start">+ Verificación</button>
      </div>
    `;

    const escuelaHtml = p.escuela==='na'
      ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted);cursor:pointer;text-decoration:underline" onclick="pilotosData[${i}].escuela='';renderPilotos();savePilotos()">N/A</span>`
      : `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <input type="date" class="maint-input" value="${p.escuela||''}" onchange="pilotosData[${i}].escuela=this.value;renderPilotos();savePilotos()" style="font-size:10px;flex:1;min-width:120px">
          ${daysBadge(daysUntil(p.escuela))}
          <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);cursor:pointer;text-decoration:underline" onclick="pilotosData[${i}].escuela='na';renderPilotos();savePilotos()">N/A</span>
        </div>`;

    const row = document.createElement('div');

    if (isMobile) {
      // ===== LAYOUT MÓVIL: tarjeta vertical por piloto =====
      row.style = 'background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px';
      row.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <input type="text" class="maint-input" placeholder="Nombre del piloto" value="${p.nombre}" onchange="pilotosData[${i}].nombre=this.value;savePilotos()" style="font-size:13px;font-weight:700;flex:1;margin-right:8px">
          <button onclick="eliminarPiloto(${i})" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:16px;padding:4px;flex-shrink:0">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:1px">Ven. Licencia</div>
            <input type="date" class="maint-input" value="${p.licencia}" onchange="pilotosData[${i}].licencia=this.value;renderPilotos();savePilotos()" style="width:100%">
            <div style="margin-top:3px">${daysBadge(daysUntil(p.licencia))}</div>
          </div>
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:1px">Cert. Médico</div>
            <input type="date" class="maint-input" value="${p.medico}" onchange="pilotosData[${i}].medico=this.value;renderPilotos();savePilotos()" style="width:100%">
            <div style="margin-top:3px">${daysBadge(daysUntil(p.medico))}</div>
          </div>
        </div>
        <div style="margin-bottom:8px">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:1px">Verif. Escuela</div>
          ${escuelaHtml}
        </div>
        ${p.verificaciones.length > 0 ? `
        <div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Verificaciones Adicionales</div>
          ${verifHtml}
        </div>` : `<div>${verifHtml}</div>`}
      `;
    } else {
      // ===== LAYOUT DESKTOP: tabla horizontal =====
      row.style = 'display:grid;grid-template-columns:160px 130px 60px 130px 60px 130px 60px 1fr 30px;gap:6px;align-items:start;padding:8px 0;border-bottom:1px solid var(--border);min-width:900px';
      row.innerHTML = `
        <input type="text" class="maint-input" placeholder="Nombre del piloto" value="${p.nombre}" onchange="pilotosData[${i}].nombre=this.value;savePilotos()">
        <input type="date" class="maint-input" value="${p.licencia}" onchange="pilotosData[${i}].licencia=this.value;renderPilotos();savePilotos()">
        <span>${daysBadge(daysUntil(p.licencia))}</span>
        <input type="date" class="maint-input" value="${p.medico}" onchange="pilotosData[${i}].medico=this.value;renderPilotos();savePilotos()">
        <span>${daysBadge(daysUntil(p.medico))}</span>
        ${p.escuela==='na' ? 
          `<span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted);cursor:pointer;text-decoration:underline" onclick="pilotosData[${i}].escuela='';renderPilotos();savePilotos()">N/A</span><span></span>` : 
          `<div style="display:flex;flex-direction:column;gap:2px"><input type="date" class="maint-input" value="${p.escuela||''}" onchange="pilotosData[${i}].escuela=this.value;renderPilotos();savePilotos()" style="font-size:10px"><span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);cursor:pointer;text-align:right" onclick="pilotosData[${i}].escuela='na';renderPilotos();savePilotos()">N/A</span></div><span>${daysBadge(daysUntil(p.escuela))}</span>`
        }
        ${verifHtml}
        <button onclick="eliminarPiloto(${i})" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:14px;padding:0">✕</button>
      `;
    }

    container.appendChild(row);
  });
}
function addPilotoRow() {
  pilotosData.push({ nombre: '', licencia: '', medico: '', charter: '', escuela: '', verificaciones: [] });
  renderPilotos();
}
// localStorage savePilotos removed - using Firebase only
renderPilotos();

// Build Escuela panel
const escuelaPanel = document.createElement('div');
escuelaPanel.className = 'aircraft-panel';
escuelaPanel.id = 'panel-escuela';
escuelaPanel.innerHTML = `
  <div class="aircraft-header">
    <div>
      <div class="aircraft-reg">ESCUELA</div>
      <div class="aircraft-model-line">ADMINISTRATIVOS · HP FLIGHT SCHOOL</div>
    </div>
  </div>
  <div class="divider-label">📚 Escuela</div>
  <div class="card">
    <div class="card-title">Próximamente...</div>
  </div>
`;
contentEl.appendChild(escuelaPanel);

// Build Empresa panel
const empresaPanel = document.createElement('div');
empresaPanel.className = 'aircraft-panel';
empresaPanel.id = 'panel-empresa';
empresaPanel.innerHTML = `
  <div class="aircraft-header">
    <div>
      <div class="aircraft-reg">EMPRESA</div>
      <div class="aircraft-model-line">ADMINISTRATIVOS · DOCUMENTOS EMPRESA</div>
    </div>
  </div>
  <div class="divider-label">🏢 Empresa</div>
  <div class="card">
    <div class="card-title">Próximamente...</div>
  </div>
`;
contentEl.appendChild(empresaPanel);

// Build Resumen panel
const resumenPanel = document.createElement('div');
resumenPanel.className = 'aircraft-panel active';
resumenPanel.id = 'panel-resumen';
resumenPanel.innerHTML = `
  <div style="margin-bottom:20px">
    <div class="aircraft-reg">PENDIENTES</div>
    <div class="aircraft-model-line">TAREAS PENDIENTES · ALERTAS ACTIVAS</div>
  </div>
  <div id="resumen-content"><div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);padding:20px 0">Cargando...</div></div>
`;
contentEl.insertBefore(resumenPanel, contentEl.firstChild);

// Build Estadisticas panel
const statsPanel = document.createElement('div');
statsPanel.className = 'aircraft-panel';
statsPanel.id = 'panel-estadisticas';
statsPanel.innerHTML = `
  <div style="margin-bottom:20px">
    <div class="aircraft-reg">ESTADÍSTICAS</div>
    <div class="aircraft-model-line">HORAS VOLADAS POR MES · POR MATRÍCULA</div>
  </div>
  <div class="card" style="margin-bottom:18px;padding:18px">
    <div class="card-title" style="margin-bottom:10px" id="stats-year-title">🏆 Horas Voladas por Aeronave — Año</div>
    <div id="stats-ranking-chart-wrap"><canvas id="stats-chart-ranking"></canvas></div>
  </div>
  <div class="card" style="margin-bottom:18px;padding:18px">
    <div style="height:340px"><canvas id="stats-chart"></canvas></div>
  </div>
  <div class="card" style="margin-bottom:18px;padding:18px">
    <div class="card-title" style="margin-bottom:10px">📈 Total de Horas Voladas — Flota Completa</div>
    <div style="height:260px"><canvas id="stats-chart-total"></canvas></div>
  </div>
  <div id="estadisticas-content"><div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);padding:20px 0">Cargando...</div></div>
`;
contentEl.insertBefore(statsPanel, resumenPanel.nextSibling);

function buildEstadisticas() {
  const container = document.getElementById('estadisticas-content');

  // Parse "MM/DD/YYYY" (es-PA locale format used by getFechaPanama) -> {year, month, monthKey "YYYY-MM"}
  function parseFecha(fecha) {
    if (!fecha) return null;
    const parts = fecha.split('/');
    if (parts.length !== 3) return null;
    const [dd, mm, yyyy] = parts;
    if (!dd || !mm || !yyyy) return null;
    const monthNum = parseInt(mm, 10);
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) return null;
    const mmPadded = mm.padStart(2, '0');
    return { year: yyyy, month: mmPadded, key: `${yyyy}-${mmPadded}` };
  }

  // Aggregate hours by aircraft + month
  const monthSet = new Set(); // all month keys seen, across fleet
  const dataByAc = []; // { reg, model, monthly: {key: hours}, total }

  state.forEach((d, idx) => {
    const monthly = {};
    let total = 0;
    (d.bitacora_horas || []).forEach(r => {
      const f = parseFecha(r.fecha);
      const hv = parseFloat(r.hv || 0);
      if (!f || isNaN(hv)) return;
      monthly[f.key] = (monthly[f.key] || 0) + hv;
      total += hv;
      monthSet.add(f.key);
    });
    dataByAc.push({ reg: fleet[idx].reg, model: fleet[idx].model, monthly, total });
  });

  if (monthSet.size === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px 0;font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--muted)">Sin registros de horas voladas todavía</div>`;
    return;
  }

  // Sort months chronologically
  const months = Array.from(monthSet).sort();
  const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  function monthLabel(key) {
    const [y, m] = key.split('-');
    return `${MESES[parseInt(m,10)]} ${y}`;
  }

  // ===== Horizontal ranking chart: total hours per aircraft for the most recent year =====
  const years = Array.from(new Set(months.map(m => m.split('-')[0]))).sort();
  const currentYear = years[years.length - 1];
  const ranking = dataByAc.map(ac => {
    let yearTotal = 0;
    Object.entries(ac.monthly).forEach(([key, hrs]) => {
      if (key.split('-')[0] === currentYear) yearTotal += hrs;
    });
    return { reg: ac.reg, model: ac.model, total: yearTotal };
  }).filter(a => a.total > 0).sort((a,b) => b.total - a.total);

  const titleEl = document.getElementById('stats-year-title');
  if (titleEl) titleEl.textContent = `🏆 Horas Voladas por Aeronave — ${currentYear}`;

  const rankingWrap = document.getElementById('stats-ranking-chart-wrap');
  const rankingCanvas = document.getElementById('stats-chart-ranking');
  if (rankingCanvas) {
    if (rankingWrap) rankingWrap.style.height = Math.max(180, ranking.length * 38) + 'px';
    if (window._statsChartRanking) { window._statsChartRanking.destroy(); }
    window._statsChartRanking = new Chart(rankingCanvas, {
      type: 'bar',
      data: {
        labels: ranking.map(a => a.reg),
        datasets: [{
          label: 'Horas voladas (HV)',
          data: ranking.map(a => +a.total.toFixed(2)),
          backgroundColor: ranking.map((_, i) => i === 0 ? '#0059b3' : '#7ea6d4'),
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { beginAtZero: true, title: { display: true, text: 'Horas (HV)', color: '#09142a' }, ticks: { font: { family: "'IBM Plex Mono', monospace", size: 10 }, color: '#4d6880' }, grid: { color: 'rgba(9,20,42,0.08)' } },
          y: { ticks: { font: { family: "'Orbitron', sans-serif", size: 11 }, color: '#09142a' }, grid: { display: false } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => item.parsed.x.toFixed(2) + ' HV'
            }
          }
        }
      }
    });
  }

  // ===== Bar chart: hours per month, grouped by aircraft =====
  const PALETTE = ['#0059b3','#c47000','#006638','#b80f1e','#6a3fb5','#0aa3a3','#a0522d','#3d5a80','#8a8a00','#9b1d6b','#2e8b57','#5a5a5a'];
  const chartCanvas = document.getElementById('stats-chart');
  if (chartCanvas) {
    if (window._statsChart) { window._statsChart.destroy(); }
    window._statsChart = new Chart(chartCanvas, {
      type: 'bar',
      plugins: [{
        id: 'aircraftRegistrationLabels',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          chart.data.datasets.forEach((dataset, datasetIndex) => {
            if (!chart.isDatasetVisible(datasetIndex)) return;
            chart.getDatasetMeta(datasetIndex).data.forEach((bar, index) => {
              if (!(Number(dataset.data[index]) > 0)) return;
              const { x, y, base, width } = bar.getProps(['x', 'y', 'base', 'width'], false);
              if (![x, y, base, width].every(Number.isFinite) || width <= 0) return;
              const label = dataset.label;
              ctx.save();
              ctx.font = 'bold ' + Math.min(10, Math.max(7, width - 2)) + 'px "IBM Plex Mono", monospace';
              const fitsInside = Math.abs(base - y) >= ctx.measureText(label).width + 10;
              ctx.translate(x, base - 5);
              ctx.rotate(-Math.PI / 2);
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = fitsInside ? '#ffffff' : '#09142a';
              if (!fitsInside) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.lineJoin = 'round';
                ctx.strokeText(label, 0, 0);
              }
              ctx.fillText(label, 0, 0);
              ctx.restore();
            });
          });
        }
      }],
      data: {
        labels: months.map(monthLabel),
        datasets: dataByAc.map((ac, i) => ({
          label: ac.reg,
          data: months.map(m => ac.monthly[m] ? +ac.monthly[m].toFixed(2) : 0),
          backgroundColor: PALETTE[i % PALETTE.length]
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { font: { family: "'IBM Plex Mono', monospace", size: 10 }, color: '#4d6880' }, grid: { display: false } },
          y: { beginAtZero: true, title: { display: true, text: 'Horas (HV)', color: '#09142a' }, ticks: { font: { family: "'IBM Plex Mono', monospace", size: 10 }, color: '#4d6880' }, grid: { color: 'rgba(9,20,42,0.08)' } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              footer: (items) => {
                const total = items.reduce((s, it) => s + it.parsed.y, 0);
                return 'Total mes: ' + total.toFixed(2) + ' HV';
              }
            }
          }
        }
      }
    });
  }

  // ===== Line chart: total fleet hours per month =====
  const totalsByMonth = months.map(m => {
    let t = 0;
    dataByAc.forEach(ac => { t += (ac.monthly[m] || 0); });
    return +t.toFixed(2);
  });
  const totalCanvas = document.getElementById('stats-chart-total');
  if (totalCanvas) {
    if (window._statsChartTotal) { window._statsChartTotal.destroy(); }
    window._statsChartTotal = new Chart(totalCanvas, {
      type: 'line',
      data: {
        labels: months.map(monthLabel),
        datasets: [{
          label: 'Total Flota (HV)',
          data: totalsByMonth,
          borderColor: '#0059b3',
          backgroundColor: 'rgba(0,89,179,0.12)',
          fill: true,
          tension: 0.25,
          pointBackgroundColor: '#0059b3',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { font: { family: "'IBM Plex Mono', monospace", size: 10 }, color: '#4d6880' }, grid: { display: false } },
          y: { beginAtZero: true, title: { display: true, text: 'Horas (HV)', color: '#09142a' }, ticks: { font: { family: "'IBM Plex Mono', monospace", size: 10 }, color: '#4d6880' }, grid: { color: 'rgba(9,20,42,0.08)' } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  // Build table: rows = aircraft, columns = months (+ total)
  let html = `<div class="card" style="overflow-x:auto;padding:0">
    <table style="width:100%;border-collapse:collapse;font-family:'IBM Plex Mono',monospace;font-size:11px">
      <thead>
        <tr style="background:var(--panel2)">
          <th style="text-align:left;padding:10px 14px;border-bottom:2px solid var(--border);position:sticky;left:0;background:var(--panel2);white-space:nowrap">Matrícula</th>
          ${months.map(m => `<th style="text-align:right;padding:10px 14px;border-bottom:2px solid var(--border);white-space:nowrap">${monthLabel(m)}</th>`).join('')}
          <th style="text-align:right;padding:10px 14px;border-bottom:2px solid var(--border);white-space:nowrap;color:var(--accent)">Total</th>
        </tr>
      </thead>
      <tbody>`;

  dataByAc.forEach(ac => {
    html += `<tr>
      <td style="padding:9px 14px;border-bottom:1px solid var(--border);font-weight:700;color:var(--text);position:sticky;left:0;background:var(--panel);white-space:nowrap">
        ${ac.reg}<div style="font-weight:400;color:var(--muted);font-size:9px;margin-top:2px">${ac.model||''}</div>
      </td>`;
    months.forEach(m => {
      const hrs = ac.monthly[m];
      html += `<td style="text-align:right;padding:9px 14px;border-bottom:1px solid var(--border);color:${hrs ? 'var(--text)' : 'var(--dim)'}">${hrs ? hrs.toFixed(2) : '—'}</td>`;
    });
    html += `<td style="text-align:right;padding:9px 14px;border-bottom:1px solid var(--border);font-weight:700;color:var(--accent)">${ac.total.toFixed(2)}</td>`;
    html += `</tr>`;
  });

  // Totals row across fleet
  html += `<tr style="background:var(--panel2)">
    <td style="padding:9px 14px;border-top:2px solid var(--border);font-weight:900;color:var(--accent);position:sticky;left:0;background:var(--panel2)">FLOTA TOTAL</td>`;
  let grandTotal = 0;
  months.forEach(m => {
    let monthTotal = 0;
    dataByAc.forEach(ac => { monthTotal += (ac.monthly[m] || 0); });
    grandTotal += monthTotal;
    html += `<td style="text-align:right;padding:9px 14px;border-top:2px solid var(--border);font-weight:700;color:var(--text)">${monthTotal ? monthTotal.toFixed(2) : '—'}</td>`;
  });
  html += `<td style="text-align:right;padding:9px 14px;border-top:2px solid var(--border);font-weight:900;color:var(--accent)">${grandTotal.toFixed(2)}</td>`;
  html += `</tr>`;

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

function buildResumen() {
  const DAYS_WARN = 30;
  const container = document.getElementById('resumen-content');
  let sections = {};

  // Helper to add alert
  function addAlert(category, reg, item, detail, type, dueDays=null) {
    if (!sections[category]) sections[category] = [];
    sections[category].push({ reg, item, detail, type, dueDays });
  }

  // Check each aircraft
  state.forEach((d, idx) => {
    const reg = fleet[idx].reg;

    // Documents & Certificaciones
    if (d.documentos) {
      d.documentos.forEach(doc => {
        if (!doc.nombre || !doc.vence) return;
        const days = daysUntil(doc.vence);
        if (days !== null && days <= DAYS_WARN) {
          addAlert('📋 Documentos & Certificaciones', reg, doc.nombre, days < 0 ? 'VENCIDO' : `Vence en ${days} días`, dateAlertLevel(days),days);
        }
      });
    }

    // Equipos de emergencia
    const emergs = emergencyAlerts(d);
    emergs.forEach(([name,fecha]) => {
      if (!fecha) return;
      const days=daysUntil(fecha);
      if(days!==null&&days<=DAYS_WARN)addAlert('🚨 Equipos de Emergencia',reg,name,days<0?'VENCIDO':`Vence en ${days} días`,dateAlertLevel(days),days);
    });

    // Motor (horas) - warn when <= 20% remaining (>= 80% used of 2000)
    if (d.ciclos_totales) {
      const pctUsed = parseFloat(d.ciclos_totales) / 2000 * 100;
      if (pctUsed >= 80) {
        const rem = (2000 - parseFloat(d.ciclos_totales)).toFixed(2);
        addAlert('⚙️ Vencimientos en Horas', reg, reg === 'HP-880BL' ? 'Motor izquierdo' : 'Motor', `Quedan ${rem} HV (${Math.round(100-pctUsed)}%)`, 'danger');
      }
    }

    // Helices / Motor 2 (horas)
    if (d.ciclos_limite) {
      const pctUsed = parseFloat(d.ciclos_limite) / 2000 * 100;
      if (pctUsed >= 80) {
        const rem = (2000 - parseFloat(d.ciclos_limite)).toFixed(2);
        addAlert('⚙️ Vencimientos en Horas', reg, reg === 'HP-880BL' ? 'Motor derecho' : 'Hélices', `Quedan ${rem} HV (${Math.round(100-pctUsed)}%)`, 'danger');
      }
    }

    // Helice 1 / Helice 2 (HP-880BL)
    if (reg === 'HP-880BL') {
      ['helice1','helice2'].forEach((tipo, i) => {
        const val = d[tipo + '_ciclos'];
        const limite = parseFloat(d[tipo + '_limite'] || 2000);
        if (val) {
          const pctUsed = parseFloat(val) / limite * 100;
          if (pctUsed >= 80) {
            const rem = (limite - parseFloat(val)).toFixed(2);
            addAlert('⚙️ Vencimientos en Horas', reg, 'Hélice ' + (i+1), `Quedan ${rem} HV (${Math.round(100-pctUsed)}%)`, 'danger');
          }
        }
      });
    }

    // Include every applicable inspection warning, including the yellow threshold.
    for(const limit of [50,100]){
      if(limit===50&&Number(d.proxima_inspeccion||50)===100)continue;
      const hours=Number(d['horas_acum_'+limit]||(limit===50?d.horas_totales:d.horas_limite)||0);
      if(hours>=limit-10){
        addAlert('✈ Inspecciones',reg,'Insp. '+limit+' hrs',
          hours>=limit?'Límite alcanzado ('+hours.toFixed(2)+' HV)':'Quedan '+(limit-hours).toFixed(2)+' HV',
          hours>=limit?'danger':'warn');
      }
    }
  });

  // Check piezas pedidas (seguimiento)
  state.forEach((d, idx) => {
    const reg = fleet[idx].reg;
    (d.mantenimiento || []).forEach(m => {
      if (!m.nombre || m.resuelto) return;
      (m.piezas || []).forEach(p => {
        if (p.estado === 'pedida' && p.nombre) {
          const dias = p.fecha_pedido ? diasTranscurridos(p.fecha_pedido) : null;
          const detail = dias !== null ? `${dias} días en tránsito${p.proveedor ? ' · ' + p.proveedor : ''}` : `Pendiente${p.proveedor ? ' · ' + p.proveedor : ''}`;
          addAlert('📦 Seguimiento de Pedidos', reg, p.nombre, detail, 'warn');
        }
      });
    });
  });

  // Check pilotos
  pilotosData.forEach(p => {
    if (!p.nombre) return;
    if (p.licencia) {
      const days = daysUntil(p.licencia);
      if (days !== null && days <= DAYS_WARN) {
        addAlert('👨‍✈️ Vigencia Pilotos', p.nombre, 'Licencia', days < 0 ? 'VENCIDA' : `Vence en ${days} días`, dateAlertLevel(days),days);
      }
    }
    if (p.medico) {
      const days = daysUntil(p.medico);
      if (days !== null && days <= DAYS_WARN) {
        addAlert('👨‍✈️ Vigencia Pilotos', p.nombre, 'Cert. Médico', days < 0 ? 'VENCIDO' : `Vence en ${days} días`, dateAlertLevel(days),days);
      }
    }
    if (p.escuela && p.escuela !== 'na') {
      const days = daysUntil(p.escuela);
      if (days !== null && days <= DAYS_WARN) {
        addAlert('👨‍✈️ Vigencia Pilotos', p.nombre, 'Verif. Escuela', days < 0 ? 'VENCIDA' : `Vence en ${days} días`, dateAlertLevel(days),days);
      }
    }
    (p.verificaciones || []).forEach(v => {
      if (!v.fecha || v.fecha === 'na') return;
      const days = daysUntil(v.fecha);
      if (days !== null && days <= DAYS_WARN) {
        const label = v.nombre ? `Verif. ${v.nombre}` : 'Verificación adicional';
        addAlert('👨‍✈️ Vigencia Pilotos', p.nombre, label, days < 0 ? 'VENCIDA' : `Vence en ${days} días`, dateAlertLevel(days),days);
      }
    });
  });

  // Render - grouped by aircraft registration
  if (Object.keys(sections).length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px 0;font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--ok)">Sin tareas registradas. Los datos faltantes requieren revisión.</div>`;
    return;
  }

  const byReg={};
  Object.entries(sections).forEach(([cat,items])=>items.forEach(item=>{
    const key=cat.includes('Pilotos')?'👨‍✈️ VIGENCIA PILOTOS':item.reg;
    (byReg[key]||=[]).push({...item,cat});
  }));
  const regOrder=fleet.map(ac=>ac.reg);
  Object.values(byReg).forEach(items=>items.sort(comparePendingAlerts));
  const sortedRegs=Object.keys(byReg).sort((a,b)=>{
    const priority=comparePendingAlerts(byReg[a][0],byReg[b][0]);
    if(priority)return priority;
    const ia=regOrder.indexOf(a),ib=regOrder.indexOf(b);
    return (ia<0?Infinity:ia)-(ib<0?Infinity:ib)||a.localeCompare(b);
  });
  const allItems=Object.values(byReg).flat();
  const urgent=allItems.filter(item=>item.type==='danger').length;
  let html=`<div class="pending-overview"><div><strong>${allItems.length}</strong><span>Alertas totales</span></div><div class="pending-urgent"><strong>${urgent}</strong><span>Prioridad alta</span></div><div class="pending-upcoming"><strong>${allItems.length-urgent}</strong><span>Avisos próximos</span></div></div><div class="pendientes-grid">`;
  sortedRegs.forEach(reg=>{
    const items=byReg[reg],total=items.length,isPilotoGroup=reg.includes('VIGENCIA');
    const regLabel=isPilotoGroup
      ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--accent2)">${escapeRecord(reg)}</span>`
      : `<span style="font-family:'Orbitron',sans-serif;font-size:11px;color:var(--accent)">${escapeRecord(reg)}</span>`;
    html+=`<div class="pending-uniform-card"><div class="divider-label pending-card-heading">${regLabel}<span style="font-family:'IBM Plex Mono',monospace;font-size:8px;background:rgba(204,17,34,0.1);color:var(--danger);padding:2px 6px;border-radius:8px">${total} pendiente${total>1?'s':''}</span></div><div class="card pending-card-scroll" tabindex="0" role="region" aria-label="Alertas de ${escapeRecord(reg)}">`;
    items.forEach(item=>{
      const color=item.type==='danger'?'var(--danger)':item.type==='orange'?'var(--orange)':'var(--warn)';
      const bg=item.type==='danger'?'rgba(255,0,40,.13)':item.type==='orange'?'#ffb268':'var(--signal-yellow)';
      const rowLabel=isPilotoGroup
        ? `<div style="font-family:'IBM Plex Sans',sans-serif;font-size:11px;font-weight:700;color:var(--text)">${escapeRecord(item.reg)}</div><div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);margin-top:2px">${escapeRecord(item.item)}</div>`
        : `<div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted)">${escapeRecord(item.cat)}</div><div style="font-family:'IBM Plex Sans',sans-serif;font-size:11px;font-weight:700;color:var(--text);margin-top:2px">${escapeRecord(item.item)}</div>`;
      html+=`<div class="alert-row" style="background:${bg}"><div>${rowLabel}</div><span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:${color};font-weight:700;white-space:nowrap">${escapeRecord(item.detail)}</span></div>`;
    });
    html+='</div></div>';
  });
  html+='</div>';
  container.innerHTML = html;
}

// Resolver horas — pone en 0 y guarda
function resolverHoras(reg, item) {
  const idx = fleet.findIndex(a => a.reg === reg);
  if (idx === -1) return;
  const d = state[idx];
  if(item.includes('50 hrs')||item.includes('100 hrs')){openRecordEditor('inspection',idx,-1,item.includes('100 hrs')?100:50);return;}

  if (item === 'Motor' || item === 'Motor 1') {
    d.ciclos_totales = '0';
    const el = document.getElementById('ciclos_totales-'+idx);
    if(el) { el.value='0'; updateVencBar('motor',idx,'0',parseFloat(d.limite_motor||2000)); updateHorasWarning(el,parseFloat(d.limite_motor||2000)); }
  }
  else if (item === 'Hélices' || item === 'Motor 2') {
    d.ciclos_limite = '0';
    const el = document.getElementById('ciclos_limite-'+idx);
    if(el) { el.value='0'; updateVencBar('helices',idx,'0',parseFloat(d.limite_helice||2000)); updateHorasWarning(el,parseFloat(d.limite_helice||2000)); }
  }
  else if (item === 'Hélice 1' || item === 'Hélice 2') {
    const tipo = item === 'Hélice 1' ? 'helice1' : 'helice2';
    const map = VENC_FIELD_MAP[tipo];
    d[map.dataField] = '0';
    const el = document.getElementById(map.hiddenId + idx);
    if (el) el.value = '0';
    const am = document.getElementById(map.acumId + idx);
    if (am) am.textContent = '0.0';
    const manInp = document.getElementById(tipo + '-manual-' + idx);
    if (manInp) manInp.value = '0.0';
    updateVencBar(tipo, idx, '0', parseFloat(d[map.limiteField]||2000));
  }
  else if (item.includes('50 hrs')) {
    // Resetear acum_50 a 0 y fijar acum_100 exactamente en 50
    d.horas_acum_50 = '0';
    d.horas_totales = '0';
    d.horas_acum_100 = '50';
    d.horas_limite = '50';
    const a50 = document.getElementById('acum50-'+idx);
    const pb50 = document.getElementById('pb-50-'+idx);
    const a100 = document.getElementById('acum100-'+idx);
    const pb100 = document.getElementById('pb-100-'+idx);
    if(a50) a50.textContent = '0.0 HV';
    if(pb50) { pb50.style.width='0%'; pb50.className='progress-fill fill-ok'; }
    if(a100) a100.textContent = '50.0 HV';
    if(pb100) { pb100.style.width='50%'; pb100.className='progress-fill fill-ok'; }
  }
  else if (item.includes('100 hrs')) {
    // Resetear todo — nuevo ciclo completo
    d.horas_acum_50 = '0';
    d.horas_totales = '0';
    d.horas_acum_100 = '0';
    d.horas_limite = '0';
    const a50 = document.getElementById('acum50-'+idx);
    const pb50 = document.getElementById('pb-50-'+idx);
    const a100 = document.getElementById('acum100-'+idx);
    const pb100 = document.getElementById('pb-100-'+idx);
    if(a50) a50.textContent = '0.0 HV';
    if(pb50) { pb50.style.width='0%'; pb50.className='progress-fill fill-ok'; }
    if(a100) a100.textContent = '0.0 HV';
    if(pb100) { pb100.style.width='0%'; pb100.className='progress-fill fill-ok'; }
  }

  d.estatus_label = ''; // Preserve the manually selected status.
  const sel2 = document.getElementById('status-' + idx);
  if (sel2) sel2.value = d.status || '';
  updateEstatusBadge(idx, d.status, '');
  savePanel(idx);
  setTimeout(() => buildResumen(), 500);
}

// Resolver doc — actualiza fecha y guarda
function resolverDoc(reg, item, cat, newDate) {
  if (!newDate) { alert('Por favor ingresa la nueva fecha de vencimiento.'); return; }
  const idx = fleet.findIndex(a => a.reg === reg);

  if (idx !== -1) {
    const d = state[idx];
    // Match document name
    if (cat.includes('Emergencia')) {
      if (item.includes('Salvavidas')) d.emerg_salvavidas = newDate;
      else if (item.includes('Extintor')) d.emerg_extintor = newDate;
      else if (item.includes('Flares')) d.emerg_flares = newDate;
      else if (item.includes('Botiquín')) d.emerg_botiquin = newDate;
      // Update field in panel
      const emerMap = {'Salvavidas':'salvavidas','Extintor':'extintor','Flares':'flares','Botiquín':'botiquin'};
      Object.entries(emerMap).forEach(([k,v]) => {
        if(item.includes(k)) { const el=document.getElementById('emerg-'+v+'-'+idx); if(el) el.value=newDate; }
      });
    } else {
      // Update in documentos array
      d.documentos.forEach(doc => {
        if (doc.nombre && doc.nombre.toLowerCase().includes(item.toLowerCase())) {
          doc.vence = newDate;
        }
      });
      renderDocList(idx, d.documentos);
    }
    savePanel(idx);
  } else {
    // Piloto
    pilotosData.forEach(p => {
      if (p.nombre === reg) {
        if (item === 'Licencia') p.licencia = newDate;
        if (item === 'Cert. Médico') p.medico = newDate;
        if (item === 'Verif. Escuela') p.escuela = newDate;
        if (item.startsWith('Verif. ') && item !== 'Verif. Escuela') {
          const nombreVerif = item.slice('Verif. '.length);
          (p.verificaciones || []).forEach(v => {
            if (v.nombre === nombreVerif) v.fecha = newDate;
          });
        }
        if (item === 'Verificación adicional') {
          (p.verificaciones || []).forEach(v => {
            if (!v.nombre) v.fecha = newDate;
          });
        }
      }
    });
    savePilotos();
    renderPilotos();
  }
  setTimeout(() => buildResumen(), 500);
}

buildResumen();

updateSummary();

// Rebuild resumen after Firebase loads (delayed)
setTimeout(() => { buildResumen(); updateSummary(); }, 3000);

// Add ADMINISTRATIVOS at bottom of sidebar
const adminHdr = document.createElement('div');
adminHdr.className = 'sidebar-group-title';
adminHdr.textContent = 'ADMINISTRATIVOS';
sidebarEl.appendChild(adminHdr);

// Vigencia Pilotos tab
const pilotosTab = document.createElement('div');
pilotosTab.className = 'aircraft-tab';
pilotosTab.innerHTML = '<div class="tab-reg" style="font-size:10px">VIGENCIA PILOTOS</div>';
pilotosTab.addEventListener('click', () => {
  document.querySelectorAll('.aircraft-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.aircraft-panel').forEach(p => p.classList.remove('active'));
  pilotosTab.classList.add('active');
  document.getElementById('panel-pilotos').classList.add('active');
});
sidebarEl.appendChild(pilotosTab);

// Escuela tab
const escuelaTab = document.createElement('div');
escuelaTab.className = 'aircraft-tab';
escuelaTab.innerHTML = '<div class="tab-reg" style="font-size:10px">ESCUELA</div>';
escuelaTab.addEventListener('click', () => {
  document.querySelectorAll('.aircraft-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.aircraft-panel').forEach(p => p.classList.remove('active'));
  escuelaTab.classList.add('active');
  document.getElementById('panel-escuela').classList.add('active');
});
sidebarEl.appendChild(escuelaTab);

// Empresa tab
const empresaTab = document.createElement('div');
empresaTab.className = 'aircraft-tab';
empresaTab.innerHTML = '<div class="tab-reg" style="font-size:10px">EMPRESA</div>';
empresaTab.addEventListener('click', () => {
  document.querySelectorAll('.aircraft-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.aircraft-panel').forEach(p => p.classList.remove('active'));
  empresaTab.classList.add('active');
  document.getElementById('panel-empresa').classList.add('active');
});
sidebarEl.appendChild(empresaTab);

// Itinerarios tab
const itinerariosTab = document.createElement('div');
itinerariosTab.className = 'aircraft-tab';
itinerariosTab.innerHTML = '<div class="tab-reg" style="font-size:10px">✈ ITINERARIOS</div>';
itinerariosTab.addEventListener('click', () => {
  document.querySelectorAll('.aircraft-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.aircraft-panel').forEach(p => p.classList.remove('active'));
  itinerariosTab.classList.add('active');
  document.getElementById('panel-itinerarios').classList.add('active');
  renderCalendar();
});
sidebarEl.appendChild(itinerariosTab);

// ===== ITINERARIOS PANEL =====
const itinerariosPanel = document.createElement('div');
itinerariosPanel.className = 'aircraft-panel';
itinerariosPanel.id = 'panel-itinerarios';
itinerariosPanel.innerHTML = `
  <div class="aircraft-header">
    <div>
      <div class="aircraft-reg" style="font-size:20px">✈ ITINERARIOS</div>
      <div class="aircraft-model-line">PROGRAMACIÓN DE VUELOS</div>
    </div>
  </div>

  <div class="section-grid-2">
    <!-- Calendario -->
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <button onclick="changeMonth(-1)" style="background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--text);cursor:pointer;padding:4px 12px;font-size:16px;-webkit-tap-highlight-color:transparent">‹</button>
        <span id="cal-month-label" style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;color:var(--text)"></span>
        <button onclick="changeMonth(1)" style="background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--text);cursor:pointer;padding:4px 12px;font-size:16px;-webkit-tap-highlight-color:transparent">›</button>
      </div>
      <div class="cal-grid" style="margin-bottom:6px">
        <div class="cal-header-cell">DOM</div>
        <div class="cal-header-cell">LUN</div>
        <div class="cal-header-cell">MAR</div>
        <div class="cal-header-cell">MIÉ</div>
        <div class="cal-header-cell">JUE</div>
        <div class="cal-header-cell">VIE</div>
        <div class="cal-header-cell">SÁB</div>
      </div>
      <div class="cal-grid" id="cal-cells"></div>
    </div>

    <!-- Detalle del día -->
    <div class="card">
      <div class="card-title" id="cal-day-title">Selecciona una fecha</div>
      <div id="cal-day-flights" style="margin-bottom:12px">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);text-align:center;padding:20px 0">Toca una fecha en el calendario</div>
      </div>

      <!-- Formulario agregar vuelo -->
      <div class="add-flight-form">
        <div class="card-title" style="margin-bottom:10px">+ Agregar Vuelo</div>
        <div class="form-grid">
          <div class="form-field" style="grid-column:1/-1">
            <label class="form-label">Fecha</label>
            <input type="date" id="flight-date" class="maint-input" style="font-size:11px">
          </div>
          <div class="form-field">
            <label class="form-label">Hora Inicio</label>
            <input type="time" id="flight-time-start" class="maint-input" style="font-size:11px">
          </div>
          <div class="form-field">
            <label class="form-label">Hora Fin</label>
            <input type="time" id="flight-time-end" class="maint-input" style="font-size:11px">
          </div>
          <div class="form-field">
            <label class="form-label">Piloto</label>
            <select id="flight-pilot" class="form-select">
              <option value="">Seleccionar...</option>
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Aeronave <span style="font-size:8px;color:var(--muted)">(opcional)</span></label>
            <select id="flight-ac" class="form-select">
              <option value="">Sin asignar</option>
              ${fleet.map(a => `<option value="${a.reg}">${a.reg} — ${a.model}</option>`).join('')}
            </select>
          </div>
          <div class="form-field" style="grid-column:1/-1">
            <label class="form-label">Estudiante / Pasajero</label>
            <input type="text" id="flight-student" class="maint-input" placeholder="Nombre..." style="font-size:11px">
          </div>
        </div>
        <button onclick="addFlight()" style="margin-top:10px;width:100%;padding:8px;background:linear-gradient(135deg,var(--accent2),var(--accent));border:none;border-radius:8px;color:#fff;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent">
          GUARDAR VUELO
        </button>
      </div>
    </div>
  </div>
`;
contentEl.appendChild(itinerariosPanel);

// ===== ITINERARIOS LOGIC =====
let flightsData = [];
let calYear = Number(panamaISO().slice(0,4));
let calMonth = Number(panamaISO().slice(5,7))-1;
let calSelectedDate = null;

// Colores por aeronave
const AC_COLORS = [
  '#0059b3','#c47000','#006638','#b80f1e','#6a0dad',
  '#007b8a','#8b4513','#2e8b57','#8b0000','#4682b4'
];
function acColor(reg) {
  const idx = fleet.findIndex(a => a.reg === reg);
  return AC_COLORS[idx % AC_COLORS.length] || '#0059b3';
}

// ===== FERIADOS PANAMA =====
const FERIADOS_PA = {
  // Fijos todos los años
  '01-01': 'Año Nuevo',
  '01-09': 'Día de los Mártires',
  '05-01': 'Día del Trabajo',
  '11-03': 'Separación de Panamá de Colombia',
  '11-04': 'Separación de Panamá de Colombia',
  '11-05': 'Día de Colón',
  '11-10': 'Grito de Independencia',
  '11-28': 'Independencia de España',
  '12-08': 'Día de las Madres',
  '12-20': 'Día de Duelo Nacional',
  '12-25': 'Navidad',
  // Carnaval y Semana Santa varían por año
  // 2025
  '2025-03-04': 'Carnaval',
  '2025-04-18': 'Viernes Santo',
  // 2026
  '2026-02-16': 'Lunes de Carnaval',
  '2026-02-17': 'Martes de Carnaval',
  '2026-04-03': 'Viernes Santo',
  // 2027
  '2027-02-08': 'Lunes de Carnaval',
  '2027-02-09': 'Martes de Carnaval',
  '2027-03-26': 'Viernes Santo',
};

function getFeriado(dateStr) {
  // Buscar primero fecha exacta (YYYY-MM-DD), luego patrón fijo (MM-DD)
  if (FERIADOS_PA[dateStr]) return FERIADOS_PA[dateStr];
  const mmdd = dateStr.slice(5); // MM-DD
  return FERIADOS_PA[mmdd] || null;
}

function changeMonth(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

function renderCalendar() {
  renderAircraftPlanner();
  renderDailySchedule();
  const label = new Date(calYear, calMonth, 1).toLocaleDateString('es-PA', { month:'long', year:'numeric' }).toUpperCase();
  document.getElementById('cal-month-label').textContent = label;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();
  const todayStr = panamaISO();

  // Build map of flights per date
  const flightsByDate = {};
  flightsData.forEach(f => {
    if (!flightsByDate[f.fecha]) flightsByDate[f.fecha] = [];
    flightsByDate[f.fecha].push(f);
  });

  const container = document.getElementById('cal-cells');
  container.innerHTML = '';

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-cell other-month';
    container.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cell = document.createElement('div');
    const feriado = getFeriado(dateStr);
    const isHoliday = !!feriado;
    cell.className = 'cal-cell' +
      (dateStr === todayStr ? ' today' : '') +
      (dateStr === calSelectedDate ? ' selected' : '') +
      (isHoliday ? ' holiday' : '');
    const flights = flightsByDate[dateStr] || [];
    const dots = flights.slice(0,6).map(f => `<span class="cal-dot" style="background:${acColor(f.aeronave)}"></span>`).join('');
    const feriadoLabel = feriado ? `<div class="cal-holiday-label">${feriado}</div>` : '';
    cell.innerHTML = `<div class="cal-day-num">${d}</div><div class="cal-dots">${dots}</div>${feriadoLabel}`;
    cell.addEventListener('click', () => selectDate(dateStr));
    container.appendChild(cell);
  }
}

function selectDate(dateStr) {
  calSelectedDate = dateStr;
  // Update date input in form
  document.getElementById('flight-date').value = dateStr;
  // Update selected cell style
  document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('selected'));
  renderCalendar();
  renderDayFlights(dateStr);
}

function fmt12h(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function getAircraftWarnings(reg, flightDate=panamaISO()) {
  const daysUntil=value=>flightDaysUntil(value,flightDate);
  const idx = fleet.findIndex(a => a.reg === reg);
  if (idx === -1) return [];
  const d = state[idx];
  const warnings = [];

  // En mantenimiento
  if (d.status === 'mantenimiento' || d.status === 'aog') {
    warnings.push({ level: 'danger', msg: d.estatus_label || (d.status === 'aog' ? '🔴 GROUNDED' : '🔧 EN MANTENIMIENTO') });
  }

  // Inspección 50 hrs
  const acum50 = parseFloat(d.horas_acum_50 || 0);
  if (acum50 >= 50 && Number(d.proxima_inspeccion||50)!==100) warnings.push({ level: 'danger', msg: `🔧 INSP. 50 HRS VENCIDA (${acum50.toFixed(2)} HV)` });
  else if (acum50 >= 40) warnings.push({ level: 'warn', msg: `⚠️ Insp. 50 hrs próxima (${acum50.toFixed(2)}/50 HV)` });

  // Inspección 100 hrs
  const acum100 = parseFloat(d.horas_acum_100 || 0);
  if (acum100 >= 100) warnings.push({ level: 'danger', msg: `🔧 INSP. 100 HRS VENCIDA (${acum100.toFixed(2)} HV)` });
  else if (acum100 >= 90) warnings.push({ level: 'warn', msg: `⚠️ Insp. 100 hrs próxima (${acum100.toFixed(2)}/100 HV)` });

  for(const [key,label] of vencimientoComponents(reg)){
    const map=VENC_FIELD_MAP[key],hours=Number(d[map.dataField]||0),limit=Number(d[map.limiteField]);
    if(!(limit>0))continue;
    if(hours>=limit)warnings.push({level:'danger',msg:label+' VENCIDO ('+hours.toFixed(2)+' / '+limit+' HV)'});
    else if(hours>=limit*.8)warnings.push({level:'warn',msg:label+' próximo ('+hours.toFixed(2)+' / '+limit+' HV)'});
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

function getPilotoStatus(p) {
  // Retorna: 'vencido', 'proximo', 'ok'
  // Revisa licencia, medico, escuela y todas las verificaciones adicionales
  const checks = [];
  if (p.licencia) checks.push(daysUntil(p.licencia));
  if (p.medico) checks.push(daysUntil(p.medico));
  if (p.escuela && p.escuela !== 'na') checks.push(daysUntil(p.escuela));
  (p.verificaciones || []).forEach(v => {
    if (v.fecha && v.fecha !== 'na') checks.push(daysUntil(v.fecha));
  });
  const valid = checks.filter(d => d !== null);
  if (valid.some(d => d < 0)) return 'vencido';
  if (valid.some(d => d <= 5)) return 'urgente';
  if (valid.some(d => d <= 30)) return 'proximo';
  return 'ok';
}

function getPilotoVencimientos(p, flightDate=panamaISO()) {
  const daysUntil=value=>flightDaysUntil(value,flightDate);
  // Retorna lista de items vencidos o por vencer para mostrar al usuario
  const items = [];
  const check = (label, fecha) => {
    if (!fecha || fecha === 'na') return;
    const d = daysUntil(fecha);
    if (d === null) return;
    if (d < 0) items.push({ label, estado: 'VENCIDO', days: d });
    else if (d <= 30) items.push({ label, estado: `vence en ${d}d`, days: d });
  };
  check('Licencia', p.licencia);
  check('Cert. Médico', p.medico);
  check('Verif. Escuela', p.escuela);
  (p.verificaciones || []).forEach(v => check(v.nombre || 'Verificación adicional', v.fecha));
  return items;
}

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
  if (!horaInicio || !horaFin || timesToMinutes(horaFin)<=timesToMinutes(horaInicio)) { alert('Ingresa hora de inicio y fin. La hora de fin debe ser posterior, dentro del mismo día.'); return; }

  // Validar conflicto de horario si hay aeronave asignada
  if (aeronave && horaInicio && horaFin) {
    if (hasConflict(fecha, horaInicio, horaFin, aeronave, -1)) {
      alert(`⚠️ ${aeronave} ya tiene un vuelo en ese horario.\n\nVerifica los vuelos del día antes de asignar.`);
      return;
    }
  }

  if(!confirmFlightScheduling({fecha,aeronave,piloto}))return;

  const flight = { fecha, horaInicio, horaFin, aeronave, piloto, estudiante, id: Date.now() };
  flightsData.push(flight);
  if (db) db.ref('itinerarios').set(flightsData);

  document.getElementById('flight-time-start').value = '';
  document.getElementById('flight-time-end').value = '';
  document.getElementById('flight-ac').value = '';
  document.getElementById('flight-pilot').value = '';
  document.getElementById('flight-student').value = '';

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
function setupDates(){document.querySelectorAll('input[type="date"]').forEach(el=>{let iso=el.value;el.type='text';el.placeholder='DD/MM/AAAA';el.inputMode='numeric';el.dataset.fecha='1';el.setAttribute('aria-label',el.getAttribute('aria-label')||'Fecha DD/MM/AAAA');Object.defineProperty(el,'value',{get(){return isoFecha(valueDescriptor.get.call(this));},set(v){iso=isoFecha(v);valueDescriptor.set.call(this,fechaVista(iso));},configurable:true});el.value=iso;el.addEventListener('change',ev=>{const raw=valueDescriptor.get.call(el);if(raw&&!Number.isFinite(dayNumber(raw))){el.setCustomValidity('Usa una fecha válida DD/MM/AAAA');el.reportValidity();ev.stopImmediatePropagation();return;}el.setCustomValidity('');iso=el.value;el.value=iso;},true);});}
setupDates();new MutationObserver(setupDates).observe(document.body,{childList:true,subtree:true});
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
  const changed=aircraftDirty.has(idx)||JSON.stringify(decodeAircraft(state[idx]))!==JSON.stringify({...defaultAc(fleet[idx]),...decodeAircraft(previewData.fleet[key])});
  if(changed){event.preventDefault();event.stopImmediatePropagation();if(await savePanel(idx)){confirmedNavigation=true;try{tab.click();}finally{confirmedNavigation=false;}}}
},true);
updateUndoButtons();

// Datos consultables copiados el 08/10/2026. Itinerarios históricos pendientes del respaldo JSON.

let panelSavePending=false;
async function savePanel(idx){
 if(panelSavePending)return false;
 panelSavePending=true;
 try{return await savePanelInternal(idx);}catch(e){showCloudError(e);return false;}finally{panelSavePending=false;}
}
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
  const groups=new Map(fleet.map(ac=>[ac.reg,[]]));
  flightsData.filter(f=>isoFecha(f.fecha)===date).slice().sort((a,b)=>
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
  if(panel.dataset.scheduleBase!==base){panel.dataset.scheduleBase=base;panel.dataset.dayOffset='0';}
  const offset=Number(panel.dataset.dayOffset||0);
  const date=scheduleOffsetDate(base,offset),groups=dailyScheduleGroups(date);
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
          return '<article class="daily-schedule-flight"><div class="flight-time">'+escapeRecord(time)+'</div><div class="daily-schedule-person"><small>Piloto</small><span>'+escapeRecord(f.piloto||'Sin asignar')+'</span></div>'+(f.estudiante?'<div class="daily-schedule-person"><small>Estudiante</small><span>'+escapeRecord(f.estudiante)+'</span></div>':'')+'</article>';
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
  document.getElementById('flight-ac').value=reg;
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
  document.getElementById('planner-summary').textContent=daily.length+' vuelos programados'+(incomplete?' · '+incomplete+' sin aeronave u horario: consulta el detalle inferior.':'');
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
  panel.dataset.dayOffset=String(offset);
  renderDailySchedule();
  panel.querySelector('[data-day-offset="'+offset+'"]')?.focus({preventScroll:true});
}


'use strict';
(() => {
 const concepts = ['Abono', 'Saldo', 'Pago total', 'Otro'];
 const statuses = {
  pending_quote: 'Falta registrar la cotización',
  pending_acceptance: 'Pendiente de aceptación',
  accepted: 'Aceptación coincidente',
  mismatch: 'Datos de aceptación no coinciden',
  needs_new_acceptance: 'Solicitar nueva aceptación'
 };
 const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money = cents => Number.isSafeInteger(cents) ? new Intl.NumberFormat('es-PA', {style:'currency', currency:'USD'}).format(cents / 100) : 'Sin importe';
 const day = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('es-PA', {timeZone:'America/Panama', dateStyle:'medium', timeStyle:'short'}).format(new Date(value)) : 'Sin fecha';
 const allowed = scope => !!scope && (scope.director === true || scope.full === true || scope.area === 'charters');
 function configuredAcceptanceUrl(policy) {
  if (!policy || typeof policy.formId !== 'string' || !policy.formId.trim() || typeof policy.conditionsVersion !== 'string' || !policy.conditionsVersion.trim() || typeof policy.privacyVersion !== 'string' || !policy.privacyVersion.trim()) {
   throw Error('El formulario de aceptación vigente no está configurado. No se copió la solicitud.');
  }
  const value = typeof policy.formUrl === 'string' ? policy.formUrl.trim() : '';
  let url;
  try { url = new URL(value); }
  catch { throw Error('La dirección HTTPS del formulario no es válida. No se copió la solicitud.'); }
  if (!/^https:\/\//i.test(value) || url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
   throw Error('La dirección HTTPS del formulario no es válida. No se copió la solicitud.');
  }
  return value;
 }
 let panel, tab, shell, owner = null, rights = null, policy = null, rows = [], cursor = null, busy = false, loaded = false, authBound = false, generation = 0;

 function operation() { return {generation, uid:owner}; }
 function sameOperation(op) { return op.generation === generation && op.uid === owner; }
 function staleOperation() { return Object.assign(Error('La vista de cotizaciones cambió.'), {staleQuoteOperation:true}); }
 function guard(op) {
  if (!sameOperation(op)) throw staleOperation();
  return currentUser();
 }

 function closeDialogs() {
  document.querySelectorAll('[data-quote-dialog]').forEach(d => { if (d.open) d.close(); else d.remove(); });
 }
 function clearData() {
  rows = []; cursor = null; loaded = false;
  closeDialogs();
  if (panel?.isConnected) {
   panel.querySelector('tbody').replaceChildren();
   panel.querySelector('[data-quote-count]').textContent = '';
   panel.querySelector('[data-quote-more]').hidden = true;
   panel.querySelector('[data-quote-new]').hidden = true;
  }
 }
 function reset() {
  generation += 1;
  clearData(); panel?.remove(); tab?.remove(); shell?.remove();
  panel = tab = shell = null; owner = rights = policy = null; busy = false;
 }
 function currentUser() {
  const user = firebase.auth().currentUser;
  if (!user || !owner || user.uid !== owner) {
   clearData(); rights = null;
   throw Error('Vuelve a iniciar sesión para revisar las cotizaciones.');
  }
  return user;
 }
 function bindAuth() {
  if (authBound) return;
  const auth = firebase.auth();
  if (typeof auth.onAuthStateChanged === 'function') {
   auth.onAuthStateChanged(user => { if (owner && user?.uid !== owner) reset(); });
   authBound = true;
  }
 }
 function message(text) { if (panel?.isConnected) panel.querySelector('[data-quote-message]').textContent = text; }
 async function session(edit = false, op = operation()) {
  guard(op);
  let result;
  try { result = await AccountRegistration.api('quote-session'); }
  catch (error) { if (!sameOperation(op)) throw staleOperation(); clearData(); rights = null; throw error; }
  guard(op);
  if (result.access?.view !== true) {
   clearData(); rights = null;
   throw Error('No tienes acceso a las cotizaciones de Charters.');
  }
  const previousEdit = rights?.edit;
  rights = {view:true, edit:result.access.edit === true};
  policy = result.policy || null;
  if (panel?.isConnected) panel.querySelector('[data-quote-new]').hidden = !rights.edit;
  if (previousEdit !== rights.edit && loaded) render();
  if (edit && !rights.edit) throw Error('Tu acceso permite consultar las cotizaciones, sin modificarlas.');
  return result;
 }
 function isReady(q) {
  const a = q?.latestAcceptance;
  return q?.quoteExists === true && q.readyForPaymentLink === true && a?.acceptedConditions === true && a?.acceptedPrivacy === true && a?.matchesCurrentQuote === true;
 }
 function statusText(q) {
  if (isReady(q)) return statuses.accepted;
  if (q.acceptanceStatus === 'accepted') return 'Revisar constancia de aceptación';
  return statuses[q.acceptanceStatus] || 'Pendiente de revisión';
 }
 function filtered() {
  const search = panel.querySelector('[data-quote-search]').value.trim().toLocaleLowerCase('es');
  const status = panel.querySelector('[data-quote-status]').value;
  return rows.filter(q => (!status || q.acceptanceStatus === status) && (!search || [q.reference, q.customerName, q.email, q.phone, q.description].some(v => String(v || '').toLocaleLowerCase('es').includes(search))));
 }
 function render() {
  if (!panel?.isConnected) return;
  const list = filtered();
  panel.querySelector('[data-quote-count]').textContent = `${list.length} cotizaciones mostradas · ${rows.length} cargadas${cursor ? ' · Hay más cotizaciones.' : ' · Lista completa cargada.'}`;
  panel.querySelector('[data-quote-more]').hidden = !cursor;
  panel.querySelector('[data-quote-new]').hidden = rights?.edit !== true;
  panel.querySelector('tbody').innerHTML = list.map(q => `<tr><td><b>${esc(q.reference)}</b><br>${esc(q.customerName || q.latestAcceptance?.name)}<br>${esc(q.email || q.latestAcceptance?.email)}<br>${esc(q.phone)}</td><td>${esc(q.description || 'Sin servicio registrado')}<br>${esc(q.flightDate || 'Sin fecha de vuelo')}</td><td><b>${esc(money(q.amountCents))}</b><br>${esc(q.paymentConcept || 'Por definir')}</td><td><span class="quote-state ${isReady(q) ? 'quote-state-ready' : 'quote-state-pending'}">${esc(statusText(q))}</span><br><small>${esc(q.latestAcceptance ? day(q.latestAcceptance.submittedAt) + ' · Panamá' : 'Sin aceptación recibida')}</small></td><td><button data-quote-detail="${esc(q.id)}">Ver aceptación</button>${rights?.edit ? `<button data-quote-edit="${esc(q.id)}">${q.quoteExists ? 'Editar cotización' : 'Registrar cotización'}</button>` : ''}${q.quoteExists ? `<button data-quote-copy="${esc(q.id)}">Copiar solicitud de aceptación</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5">No hay cotizaciones para estos filtros.</td></tr>';
  panel.querySelectorAll('[data-quote-detail]').forEach(b => { b.onclick = () => detail(b.dataset.quoteDetail); });
  panel.querySelectorAll('[data-quote-edit]').forEach(b => { b.onclick = () => edit(b.dataset.quoteEdit); });
  panel.querySelectorAll('[data-quote-copy]').forEach(b => { b.onclick = () => copyRequest(b.dataset.quoteCopy); });
 }
 async function load(more = false) {
  if (busy) return;
  const op = operation();
  busy = true; message('Cargando cotizaciones…');
  try {
   await session(false, op); guard(op);
   const result = await AccountRegistration.api('quote-list', {cursor:more ? cursor : null});
   guard(op);
   if (!Array.isArray(result.quotes)) throw Error('No se pudieron leer las cotizaciones.');
   rows = more ? [...rows, ...result.quotes] : result.quotes;
   cursor = result.nextCursor || null; loaded = true; render();
   message('La aceptación se comprueba con el correo, la referencia y el importe de este pago. El enlace de pago se envía después de esta revisión.');
  } catch (error) { if (sameOperation(op)) { clearData(); message(error.message); } }
  finally { if (sameOperation(op)) busy = false; }
 }
 function makeDialog(title) {
  const d = document.createElement('dialog');
  d.className = 'quote-dialog'; d.dataset.quoteDialog = '';
  const h = document.createElement('h2'); h.textContent = title; d.append(h);
  document.body.append(d); d.onclose = () => d.remove();
  return d;
 }
 function banner(q) {
  return `<section class="quote-check ${isReady(q) ? 'quote-check-ready' : ''}"><b>${esc(statusText(q))}</b><p>${isReady(q) ? 'Ambas aceptaciones coinciden con la cotización vigente. Revisa que el enlace de pago tenga este mismo importe antes de compartirlo.' : 'Espera una aceptación válida de esta cotización antes de compartir el enlace de pago.'}</p></section>`;
 }
 function acceptance(a) {
  return `<article class="quote-evidence"><h3>Aceptación del cliente</h3><dl><dt>Cliente</dt><dd>${esc(a.name)} · ${esc(a.email)}</dd><dt>Referencia</dt><dd>${esc(a.reference)}</dd><dt>Importe aceptado</dt><dd>${esc(money(a.amountCents))}</dd><dt>Condiciones de reserva y cancelación</dt><dd>${a.acceptedConditions === true ? 'Sí' : 'No'}</dd><dt>Privacidad</dt><dd>${a.acceptedPrivacy === true ? 'Sí' : 'No'}</dd><dt>Fecha de aceptación · Panamá</dt><dd>${esc(day(a.submittedAt))}</dd><dt>Recibida en Apps HP · Panamá</dt><dd>${esc(day(a.receivedAt))}</dd><dt>Coincide con la cotización vigente</dt><dd>${a.matchesCurrentQuote === true ? 'Sí' : 'No'}${a.reason ? ' · ' + esc(a.reason) : ''}</dd><dt>Versión de condiciones</dt><dd>${esc(a.conditionsVersion)}</dd><dt>Versión de privacidad</dt><dd>${esc(a.privacyVersion)}</dd></dl>${a.conditionsText ? `<details><summary>Condiciones que recibió el cliente</summary><p class="quote-policy">${esc(a.conditionsText)}</p></details>` : ''}${a.privacyText ? `<details><summary>Privacidad que recibió el cliente</summary><p class="quote-policy">${esc(a.privacyText)}</p></details>` : ''}</article>`;
 }
 async function detail(id) {
  const op = operation();
  const d = makeDialog('Aceptación de la cotización');
  d.insertAdjacentHTML('beforeend', '<div data-quote-summary></div><div data-quote-evidence></div><p data-quote-detail-message role="status">Cargando aceptación…</p><div class="quote-actions"><button data-quote-detail-refresh>Actualizar aceptación</button><button data-quote-history-more hidden>Cargar más aceptaciones</button><button data-quote-close>Cerrar</button></div>');
  d.querySelector('[data-quote-close]').onclick = () => d.close(); d.showModal();
  let next = null, working = false;
  async function page() {
   if (working) return; working = true;
   const b = d.querySelector('[data-quote-history-more]'); b.disabled = true;
   try {
    await session(false, op); guard(op);
    const result = await AccountRegistration.api('quote-detail', {id, cursor:next});
    guard(op); if (!d.isConnected) return;
    if (!result.quote || !Array.isArray(result.acceptances)) throw Error('No se pudo comprobar la aceptación.');
    const q = result.quote;
    d.querySelector('[data-quote-summary]').innerHTML = `<h3>${esc(q.reference)}</h3><p>${esc(q.customerName || q.latestAcceptance?.name)} · ${esc(q.email || q.latestAcceptance?.email)}<br>${esc(money(q.amountCents))} · ${esc(q.paymentConcept || 'Por definir')}<br>${esc(q.description)}</p>${banner(q)}<p>La aceptación no acredita un pago ni confirma por sí sola una reserva.</p>`;
    d.querySelector('[data-quote-evidence]').insertAdjacentHTML('beforeend', result.acceptances.map(acceptance).join(''));
    next = result.nextCursor || null; b.hidden = !next;
    d.querySelector('[data-quote-detail-message]').textContent = result.acceptances.length ? 'Constancias recibidas desde el formulario del cliente. Esta información no se puede marcar ni editar manualmente.' : 'Todavía no hay una aceptación recibida para esta referencia.';
   } catch (error) {
    if (sameOperation(op) && d.isConnected) { d.querySelector('[data-quote-summary]').textContent = ''; d.querySelector('[data-quote-evidence]').textContent = ''; d.querySelector('[data-quote-detail-message]').textContent = error.message; }
   } finally { working = false; if (sameOperation(op) && d.isConnected) b.disabled = false; }
  }
  d.querySelector('[data-quote-history-more]').onclick = page;
  d.querySelector('[data-quote-detail-refresh]').onclick = async () => {
   if (working) return;
   next = null; d.querySelector('[data-quote-evidence]').textContent = '';
   await page();
  };
  await page();
 }
 function parseAmount(value) {
  const match = String(value).trim().match(/^(\d{1,7})(?:[.,](\d{1,2}))?$/);
  if (!match) throw Error('Escribe el importe con un máximo de dos decimales.');
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 10000 || cents > 800000) throw Error('El importe de este pago debe estar entre US$100 y US$8.000.');
  return cents;
 }
 async function edit(id = null) {
  const op = operation();
  try {
   await session(true, op); guard(op);
   let q = {version:0, paymentConcept:'Abono'};
   if (id) { const result = await AccountRegistration.api('quote-detail', {id}); guard(op); q = result.quote; if (!q) throw Error('No se encontró la cotización.'); }
   const d = makeDialog(q.quoteExists ? 'Editar cotización' : 'Registrar cotización');
   d.insertAdjacentHTML('beforeend', `<form><div class="quote-fields"><label>Referencia de la cotización<input name="reference" required maxlength="100" value="${esc(q.reference)}"${q.reference ? ' readonly' : ''}></label><label>Nombre del cliente<input name="customerName" required maxlength="160" value="${esc(q.customerName || q.latestAcceptance?.name)}"></label><label>Correo de la cotización<input name="email" type="email" required maxlength="254" value="${esc(q.email || q.latestAcceptance?.email)}"></label><label>WhatsApp o teléfono<input name="phone" maxlength="40" value="${esc(q.phone)}"></label><label>Servicio o ruta<textarea name="description" required maxlength="3000">${esc(q.description)}</textarea></label><label>Fecha del vuelo (opcional)<input name="flightDate" type="date" value="${esc(q.flightDate)}"></label><label>Importe de este pago (US$)<input name="amount" inputmode="decimal" required placeholder="100.00" value="${Number.isSafeInteger(q.amountCents) ? (q.amountCents / 100).toFixed(2) : ''}"></label><label>Concepto del pago<select name="paymentConcept" aria-label="Concepto del pago">${concepts.map(c => `<option${q.paymentConcept === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label><label class="quote-notes">Observaciones internas<textarea name="notes" maxlength="4000">${esc(q.notes)}</textarea></label></div><p>Registra el importe de este pago concreto, sea abono, saldo o pago total. Si cambian el cliente, servicio, fecha, importe o concepto, el cliente deberá aceptar nuevamente. Las condiciones y su aceptación se reciben desde el formulario del cliente.</p><p data-quote-error role="status"></p><div class="quote-actions"><button type="button" data-quote-cancel>Cancelar</button><button type="submit">Guardar cotización</button></div></form>`);
   d.querySelector('[data-quote-cancel]').onclick = () => d.close(); d.showModal();
   let saving = false;
   d.querySelector('form').onsubmit = async event => {
    event.preventDefault(); if (saving) return; saving = true;
    const b = d.querySelector('[type=submit]'); b.disabled = true;
    try {
     await session(true, op); guard(op);
     const values = Object.fromEntries(new FormData(event.target));
     const record = {reference:values.reference, customerName:values.customerName, email:values.email, phone:values.phone, description:values.description, flightDate:values.flightDate, amountCents:parseAmount(values.amount), paymentConcept:values.paymentConcept, notes:values.notes, version:q.version || 0};
     if (id) record.id = id;
     await AccountRegistration.api('quote-save', {record}); guard(op);
     d.close(); await load();
    } catch (error) { if (sameOperation(op) && d.isConnected) d.querySelector('[data-quote-error]').textContent = error.message; }
    finally { saving = false; if (sameOperation(op) && d.isConnected) b.disabled = false; }
   };
  } catch (error) { if (sameOperation(op)) message(error.message); }
 }
 async function copyRequest(id) {
  const op = operation();
  try {
   const currentSession = await session(false, op); guard(op);
   const url = configuredAcceptanceUrl(currentSession.policy);
   const result = await AccountRegistration.api('quote-detail', {id}); guard(op);
   const q = result.quote;
   if (!q?.quoteExists) throw Error('Registra primero la cotización y el importe acordado.');
   const text = `Hola, ${q.customerName}. Para continuar con tu cotización de Charters Panamá, revisa las condiciones y registra tu aceptación aquí:\n${url}\n\nReferencia: ${q.reference}\nCorreo de la cotización: ${q.email}\nImporte de este pago: ${money(q.amountCents)}\nConcepto: ${q.paymentConcept}\n\nCompleta esos mismos datos y marca las casillas de condiciones y privacidad. Después de comprobar el registro, te facilitaremos el enlace de pago correspondiente. El formulario de aceptación no realiza ningún cobro.`;
   try { guard(op); await navigator.clipboard.writeText(text); guard(op); message('Solicitud copiada. Puedes pegarla en la conversación con el cliente. No se envió ningún mensaje.'); }
   catch {
    guard(op);
    const d = makeDialog('Solicitud de aceptación para el cliente');
    const area = document.createElement('textarea'); area.readOnly = true; area.className = 'quote-copy'; area.value = text; area.setAttribute('aria-label', 'Mensaje para copiar'); d.append(area);
    const note = document.createElement('p'); note.textContent = 'Selecciona y copia este mensaje para enviarlo al cliente. No se ha enviado automáticamente.'; d.append(note);
    const close = document.createElement('button'); close.textContent = 'Cerrar'; close.onclick = () => d.close(); d.append(close); d.showModal(); area.focus(); area.select();
   }
  } catch (error) { if (sameOperation(op)) message(error.message); }
 }
 function build(scope, mount) {
  owner = firebase.auth().currentUser?.uid || null; if (!owner) return;
  bindAuth();
  panel = document.createElement('section'); panel.id = 'panel-cotizaciones'; panel.className = 'aircraft-panel';
  panel.innerHTML = `<h2>Cotizaciones — Charters Panamá</h2><p>Registra cada cotización y comprueba la aceptación del cliente antes de compartir el enlace de pago.</p><div class="quote-controls"><label>Buscar<input data-quote-search type="search" placeholder="Referencia, nombre, correo o ruta"></label><label>Aceptación<select data-quote-status aria-label="Estado de aceptación"><option value="">Todas</option>${Object.entries(statuses).map(([key,label]) => `<option value="${key}">${esc(label)}</option>`).join('')}</select></label><button data-quote-new hidden>Registrar cotización</button><button data-quote-refresh>Actualizar cotizaciones</button></div><p data-quote-message role="status"></p><p data-quote-count></p><p class="quote-mobile-help">En el celular, desliza la tabla para ver la aceptación y las acciones.</p><div class="quote-scroll"><table><thead><tr><th>Referencia y cliente</th><th>Servicio</th><th>Este pago</th><th>Aceptación</th><th>Acciones</th></tr></thead><tbody></tbody></table></div><button data-quote-more hidden>Cargar más cotizaciones</button>`;
  mount.append(panel);
  panel.querySelector('[data-quote-new]').onclick = () => edit(); panel.querySelector('[data-quote-refresh]').onclick = () => load(); panel.querySelector('[data-quote-more]').onclick = () => load(true);
  panel.querySelector('[data-quote-search]').oninput = render; panel.querySelector('[data-quote-status]').onchange = render;
  if (scope.director) {
   tab = document.createElement('div'); tab.className = 'aircraft-tab'; tab.setAttribute('role', 'button'); tab.tabIndex = 0;
   tab.innerHTML = '<span class="tab-reg">COTIZACIONES</span>'; tab.onclick = open;
   tab.onkeydown = event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); open(); } };
   document.getElementById('sidebar-tabs')?.append(tab);
  }
 }
 function install(scope = null) {
  const effective = scope || (typeof isDirectorUser === 'function' && isDirectorUser() ? {director:true} : null);
  if (!allowed(effective) || !effective.director) return;
  if (owner && owner !== firebase.auth().currentUser?.uid || panel && !panel.isConnected) reset();
  if (!panel) { const mount = document.getElementById('content-area'); if (mount) build(effective, mount); }
 }
 function open() {
  if (typeof isDirectorUser !== 'function' || !isDirectorUser()) return;
  install(); if (!panel) return;
  document.querySelectorAll('.aircraft-tab,.aircraft-panel').forEach(e => e.classList.remove('active'));
  tab?.classList.add('active'); panel.classList.add('active');
  if (typeof closeDrawer === 'function') closeDrawer();
  load();
 }
 async function openStaff(scope, onBack) {
  if (!allowed(scope) || scope.director) return;
  reset();
  shell = document.createElement('section'); shell.id = 'quotes-staff-shell'; shell.className = 'quote-staff-shell';
  shell.innerHTML = '<header><button data-quote-back>Volver a mis funciones</button><h1>Cotizaciones</h1></header>';
  document.body.append(shell); build(scope, shell); if (!panel) return;
  const portal = document.getElementById('role-portal'); if (portal) portal.hidden = true;
  shell.querySelector('[data-quote-back]').onclick = () => { reset(); onBack(); };
  panel.classList.add('active'); await load();
 }
 const style = document.createElement('style');
 style.textContent = '#panel-cotizaciones{font:14px/1.5 system-ui,sans-serif;color:#173653}#panel-cotizaciones p{margin:14px 0}.quote-controls,.quote-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:16px 0}.quote-controls label,.quote-fields label{display:grid;gap:6px}.quote-controls input,.quote-controls select,.quote-dialog input,.quote-dialog select,.quote-dialog textarea{font:inherit;padding:9px;border:1px solid #bccddd;border-radius:6px;box-sizing:border-box;max-width:100%}.quote-scroll{overflow:auto;background:white;border:1px solid #d0dce7;border-radius:8px}.quote-scroll table{width:100%;border-collapse:collapse}.quote-scroll th,.quote-scroll td{text-align:left;padding:12px;border-bottom:1px solid #d0dce7;vertical-align:top;overflow-wrap:anywhere;min-width:140px}.quote-scroll th{background:#eaf2fa}.quote-scroll td button{display:block;margin-bottom:8px}.quote-state{display:inline-block;padding:5px 8px;border-radius:6px;font-weight:600}.quote-state-ready{background:#dff3e8;color:#115c36}.quote-state-pending{background:#fff0ce;color:#734907}.quote-dialog{width:min(850px,94vw);max-height:90vh;box-sizing:border-box;border:1px solid #bccddd;border-radius:12px;padding:24px;font:14px/1.5 system-ui,sans-serif;color:#173653;overflow:auto}.quote-dialog::backdrop{background:#10264088}.quote-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.quote-fields textarea{min-height:85px}.quote-notes{grid-column:1/-1}.quote-dialog [data-quote-error]{color:#a12626}.quote-dialog dl{display:grid;grid-template-columns:minmax(150px,1fr) 2fr;gap:8px 16px}.quote-dialog dt{font-weight:600}.quote-dialog dd{margin:0;overflow-wrap:anywhere}.quote-check{background:#fff3d7;border:1px solid #ead69d;padding:14px;border-radius:8px}.quote-check-ready{background:#e2f5e9;border-color:#a8d6b9}.quote-evidence{margin:20px 0;padding:16px;border:1px solid #d0dce7;border-radius:8px}.quote-policy{white-space:pre-wrap;overflow-wrap:anywhere}.quote-dialog details{margin-top:12px}.quote-copy{width:100%;min-height:300px}.quote-staff-shell{padding:20px;min-height:100vh;background:#f3f7fc;color:#173653}#panel-cotizaciones button,.quote-dialog button,.quote-staff-shell>header button{padding:9px 12px;border:1px solid #bccddd;border-radius:6px;cursor:pointer;background:#f3f7fc;color:#173653}#panel-cotizaciones [hidden]{display:none}@media(max-width:650px){.quote-fields{grid-template-columns:1fr}.quote-notes{grid-column:auto}.quote-dialog{padding:16px}.quote-dialog dl{grid-template-columns:1fr}.quote-dialog dd{margin:0 0 10px}.quote-controls>label{width:100%}.quote-controls input,.quote-controls select{width:100%}.quote-staff-shell{padding:12px}}';
 document.head.append(style);
 window.Quotes = {install, open, openStaff, canUse:allowed, reset};
})();

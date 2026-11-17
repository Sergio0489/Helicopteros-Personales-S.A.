'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const now = '2026-11-17T18:49:40.968Z';
const scope = {director:false, area:'charters', edit:true, export:false};
function quote(patch = {}) {
 return {id:'quote-a', reference:'CP-TEST-001', customerName:'CLIENTE FICTICIO <img src=x onerror=alert(1)>', email:'ficticio@example.test', phone:'', description:'Contadora <script>window.injected=true</script>', flightDate:'2026-12-10', amountCents:10000, paymentConcept:'Abono', notes:'Prueba interna', version:1, materialRevision:1, quoteExists:true, readyForPaymentLink:false, acceptanceStatus:'pending_acceptance', acceptanceCount:0, latestAcceptance:null, createdAt:now, updatedAt:now, ...patch};
}
function evidence(patch = {}) {
 return {id:'acceptance-test', reference:'CP-TEST-001', name:'CLIENTE FICTICIO', email:'ficticio@example.test', amountCents:10000, acceptedConditions:true, acceptedPrivacy:true, conditionsVersion:'charters-test-v1', privacyVersion:'privacy-test-v1', conditionsText:'CONDICIONES FICTICIAS <img src=x onerror=alert(1)>', privacyText:'PRIVACIDAD FICTICIA', formUrl:'https://sergio-40h.wixforms.com/f/7528524624544400415', submittedAt:now, receivedAt:now, matchesCurrentQuote:true, reason:'Los datos coinciden.', ...patch};
}
async function launch(t) {
 const browser = await chromium.launch({headless:true, ...(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {}), args:['--no-sandbox','--disable-dev-shm-usage']});
 t.after(() => browser.close()); return browser;
}
async function capture(page, name) {
 if (!process.env.HP_QUOTES_PREVIEW_DIR) return;
 fs.mkdirSync(process.env.HP_QUOTES_PREVIEW_DIR, {recursive:true});
 await page.screenshot({path:path.join(process.env.HP_QUOTES_PREVIEW_DIR, name + '.png'), fullPage:true});
}
async function fixture(browser, width, patch = {}) {
 const model = {view:true, edit:true, rows:[quote()], calls:[], ...patch};
 const page = await browser.newPage({viewport:{width, height:950}}), errors = [], external = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.route('**/*', route => {external.push(route.request().url());return route.abort();});
 await page.setContent('<div id="role-portal">Funciones anteriores</div><div id="sidebar-tabs"></div><div id="content-area"></div>');
 await page.exposeFunction('fixtureApi', async (action, body = {}) => {
  model.calls.push({action, body:structuredClone(body)});
  if (model.intercept) {
   const result = await model.intercept(action, body);
   if (result !== undefined) return result;
  }
  if (action === 'quote-session') return {access:{view:model.view, edit:model.edit}, policy:{conditionsVersion:'charters-test-v1', privacyVersion:'privacy-test-v1', formUrl:'https://sergio-40h.wixforms.com/f/7528524624544400415'}};
  if (!model.view) throw Error('No autorizado.');
  if (action === 'quote-list') return {quotes:structuredClone(model.rows), nextCursor:null};
  if (action === 'quote-detail') {
   const q = model.rows.find(q => q.id === body.id);
   if (!q) throw Error('No existe la cotización.');
   return {quote:structuredClone(q), acceptances:q.latestAcceptance ? [structuredClone(q.latestAcceptance)] : [], nextCursor:null};
  }
  if (action === 'quote-save') {
   if (!model.edit) throw Error('Solo consulta.');
   const old = model.rows.find(q => q.id === body.record.id);
   if (old && old.version !== body.record.version) throw Error('La cotización cambió. Actualiza antes de guardar.');
   const saved = quote({...body.record, id:old?.id || 'quote-new', quoteExists:true, version:(old?.version || 0) + 1});
   model.rows = [...model.rows.filter(q => q.id !== saved.id), saved];
   return {ok:true, quote:structuredClone(saved)};
  }
  throw Error('Acción inesperada: ' + action);
 });
 await page.evaluate(() => {
  window.fixtureUid = 'antonio-ficticio';
  window.firebase = {auth:() => ({get currentUser() {return window.fixtureUid ? {uid:window.fixtureUid} : null;}})};
  window.AccountRegistration = {api:(a, b) => window.fixtureApi(a, b)};
  window.isDirectorUser = () => false;
  Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async text => {window.copiedQuoteText = text;}}});
 });
 await page.addScriptTag({content:fs.readFileSync(path.join(root, 'quotes-ui.js'), 'utf8')});
 return {page, model, errors, external};
}
test('dedicated quotations page creates exact amounts and copies current quote data without sending or fabricating acceptance', async t => {
 const browser = await launch(t);
 for (const width of [1100, 390]) {
  const {page, model, errors, external} = await fixture(browser, width);
  await page.evaluate(scope => window.Quotes.openStaff(scope, () => {window.wentBack = true;}), scope);
  assert.equal(await page.locator('#role-portal').isVisible(), false);
  assert((await page.locator('#panel-cotizaciones').textContent()).includes('Cotizaciones — Charters Panamá'));
  assert.equal(await page.locator('#panel-cotizaciones img,#panel-cotizaciones script').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await capture(page, 'cotizaciones-' + width);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  // Copy must fetch fresh values, rather than sending the stale table amount.
  model.rows[0].amountCents = 10525;
  await page.locator('[data-quote-copy="quote-a"]').click();
  await page.getByText('Solicitud copiada. Puedes pegarla en la conversación con el cliente. No se envió ningún mensaje.').waitFor();
  const copied = await page.evaluate(() => window.copiedQuoteText);
  assert(copied.includes('CP-TEST-001'));
  assert(copied.includes('105.25'));
  assert(copied.includes('https://sergio-40h.wixforms.com/f/7528524624544400415'));
  assert(!model.calls.some(c => /send|payment|paguelo/i.test(c.action)));

  await page.getByRole('button', {name:'Registrar cotización', exact:true}).click();
  const d = page.locator('dialog');
  await d.getByLabel('Referencia de la cotización', {exact:true}).fill('CP-TEST-NUEVA');
  await d.getByLabel('Nombre del cliente', {exact:true}).fill('CLIENTE NUEVO FICTICIO');
  await d.getByLabel('Correo de la cotización', {exact:true}).fill('nuevo@example.test');
  await d.getByLabel('Servicio o ruta', {exact:true}).fill('Ruta ficticia de prueba');
  await d.getByLabel('Importe de este pago (US$)', {exact:true}).fill('100,01');
  await d.getByLabel('Concepto del pago', {exact:true}).selectOption('Saldo');
  await d.getByRole('button', {name:'Guardar cotización', exact:true}).click();
  await d.waitFor({state:'detached'});
  await page.locator('[data-quote-count]').filter({hasText:'2 cotizaciones'}).waitFor();
  const sent = model.calls.find(c => c.action === 'quote-save').body.record;
  assert.equal(sent.amountCents, 10001);
  assert.equal(sent.paymentConcept, 'Saldo');
  for (const forbidden of ['acceptedConditions','acceptedPrivacy','readyForPaymentLink','paid','paymentStatus','latestAcceptance']) assert.equal(sent[forbidden], undefined);
  assert.equal(await page.locator('[data-quote-new]').isVisible(), true);

  // The form retains its original optimistic-lock version and reports stale edits.
  await page.locator('[data-quote-edit="quote-a"]').click();
  assert.equal(await page.locator('dialog [name=reference]').isEditable(), false);
  model.rows.find(q => q.id === 'quote-a').version += 1;
  await page.locator('dialog [name=notes]').fill('FICTICIO cambio concurrente');
  await page.getByRole('button', {name:'Guardar cotización', exact:true}).click();
  await page.locator('[data-quote-error]').filter({hasText:'La cotización cambió'}).waitFor();
  await page.getByRole('button', {name:'Cancelar', exact:true}).click();
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await page.getByRole('button', {name:'Volver a mis funciones', exact:true}).click();
  assert.equal(await page.evaluate(() => window.wentBack), true);
  assert.equal(await page.locator('#quotes-staff-shell').count(), 0);
  await page.close();
 }
});
test('acceptance is read-only, incomplete evidence never appears ready, and revoked access clears cached quotations', async t => {
 const browser = await launch(t);
 for (const width of [1100, 390]) {
  const accepted = quote({latestAcceptance:evidence(), readyForPaymentLink:true, acceptanceStatus:'accepted', acceptanceCount:1});
  const inconsistent = quote({id:'quote-incomplete', reference:'CP-TEST-INCOMPLETA', latestAcceptance:evidence({acceptedPrivacy:false, matchesCurrentQuote:false}), readyForPaymentLink:true, acceptanceStatus:'accepted'});
  const {page, model, errors, external} = await fixture(browser, width, {edit:false, rows:[accepted, inconsistent]});
  await page.evaluate(scope => window.Quotes.openStaff(scope, () => {}), {...scope, edit:false});
  assert.equal(await page.getByRole('button', {name:'Registrar cotización', exact:true}).isVisible(), false);
  assert.equal(await page.locator('[data-quote-edit]').count(), 0);
  assert.equal(await page.locator('.quote-state-ready').count(), 1);
  assert((await page.locator('tbody tr').nth(1).textContent()).includes('Revisar constancia de aceptación'));
  await page.locator('[data-quote-detail="quote-a"]').click();
  await page.locator('dialog .quote-evidence').waitFor();
  assert.equal(await page.locator('dialog input,dialog select').count(), 0);
  assert.equal(await page.locator('dialog img,dialog script').count(), 0);
  const detailText = await page.locator('dialog').textContent();
  assert(detailText.includes('Condiciones de reserva y cancelación'));
  assert(detailText.includes('charters-test-v1'));
  assert(detailText.includes('privacy-test-v1'));
  assert(detailText.includes('1:49 p. m.'));
  await page.getByText('Condiciones que recibió el cliente', {exact:true}).click();
  assert((await page.locator('dialog').textContent()).includes('<img src=x onerror=alert(1)>'));
  assert(await page.locator('dialog').evaluate(d => d.scrollWidth <= d.clientWidth));
  await capture(page, 'aceptacion-' + width);
  // A fresh review must replace the previously accepted result after a material edit.
  model.rows[0].readyForPaymentLink = false;
  model.rows[0].acceptanceStatus = 'needs_new_acceptance';
  model.rows[0].latestAcceptance.matchesCurrentQuote = false;
  model.rows[0].latestAcceptance.reason = 'Se requiere una nueva aceptación de la cotización vigente.';
  await page.getByRole('button', {name:'Actualizar aceptación', exact:true}).click();
  await page.locator('dialog .quote-check').filter({hasText:'Solicitar nueva aceptación'}).waitFor();
  assert.equal(await page.locator('dialog .quote-check-ready').count(), 0);
  assert.equal(await page.locator('dialog .quote-evidence').count(), 1);
  await page.getByRole('button', {name:'Cerrar', exact:true}).click();
  model.view = false;
  const listsBefore = model.calls.filter(c => c.action === 'quote-list').length;
  await page.getByRole('button', {name:'Actualizar cotizaciones', exact:true}).click();
  await page.getByText('No tienes acceso a las cotizaciones de Charters.', {exact:true}).waitFor();
  assert.equal(await page.locator('[data-quote-detail]').count(), 0);
  assert.equal(model.calls.filter(c => c.action === 'quote-list').length, listsBefore);
  assert(!model.calls.some(c => c.action === 'quote-save'));
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await page.close();
 }
});
test('School has no quotations entry and a changed signed-in user cannot reuse an open page', async t => {
 const browser = await launch(t);
 const {page, model, errors, external} = await fixture(browser, 390);
 await page.evaluate(() => window.Quotes.openStaff({area:'school', edit:true}, () => {}));
 assert.equal(await page.locator('#panel-cotizaciones').count(), 0);
 assert.equal(model.calls.length, 0);
 await page.evaluate(scope => window.Quotes.openStaff(scope, () => {}), scope);
 await page.evaluate(() => {window.fixtureUid = 'otro-usuario';});
 const callsBefore = model.calls.length;
 await page.getByRole('button', {name:'Actualizar cotizaciones', exact:true}).click();
 await page.getByText('Vuelve a iniciar sesión para revisar las cotizaciones.', {exact:true}).waitFor();
 assert.equal(await page.locator('[data-quote-detail]').count(), 0);
 assert.equal(model.calls.length, callsBefore);
 assert.deepEqual(errors, []); assert.deepEqual(external, []);
 await page.close();
});
test('responses held across an account change cannot show or copy the previous account quotations', async t => {
 const browser = await launch(t);
 for (const pendingAction of ['quote-list', 'detail', 'copy']) {
  const privateA = quote({customerName:'CLIENTE A PRIVADO', reference:'CP-A-PRIVADA', email:'a-privado@example.test'});
  const publicB = quote({id:'quote-b', customerName:'CLIENTE B VISIBLE', reference:'CP-B-ACTUAL', email:'b@example.test'});
  const {page, model, errors, external} = await fixture(browser, 390, {rows:[privateA]});
  await page.evaluate(() => {
   const api = window.AccountRegistration.api;
   window.fixtureReturnedQuotes = [];
   window.AccountRegistration.api = async (action, body) => {
    const result = await api(action, body);
    window.fixtureReturnedQuotes.push({action, references:result.quotes?.map(q => q.reference) || (result.quote ? [result.quote.reference] : [])});
    return result;
   };
  });
  let release, startedResolve, held = false;
  const started = new Promise(resolve => {startedResolve = resolve;});
  const response = pendingAction === 'quote-list' ? {quotes:[privateA], nextCursor:null} : {quote:privateA, acceptances:[evidence({reference:privateA.reference, email:privateA.email})], nextCursor:null};
  if (pendingAction !== 'quote-list') await page.evaluate(scope => window.Quotes.openStaff(scope, () => {}), scope);
  model.intercept = action => {
   if (held || action !== (pendingAction === 'quote-list' ? 'quote-list' : 'quote-detail')) return undefined;
   held = true; startedResolve();
   return new Promise(resolve => {release = () => resolve(structuredClone(response));});
  };
  if (pendingAction === 'quote-list') await page.evaluate(scope => {window.openingA = window.Quotes.openStaff(scope, () => {});}, scope);
  else await page.locator(pendingAction === 'detail' ? '[data-quote-detail="quote-a"]' : '[data-quote-copy="quote-a"]').click();
  await started;

  // Reopening as B resets the module while A's authorized response is still in flight.
  model.rows = [publicB];
  await page.evaluate(() => {window.fixtureUid = 'cuenta-b';});
  await page.evaluate(scope => window.Quotes.openStaff(scope, () => {}), scope);
  await page.locator('[data-quote-detail="quote-b"]').waitFor();
  await page.locator('[data-quote-copy="quote-b"]').click();
  await page.getByText('Solicitud copiada. Puedes pegarla en la conversación con el cliente. No se envió ningún mensaje.').waitFor();
  assert((await page.evaluate(() => window.copiedQuoteText)).includes('CP-B-ACTUAL'));

  release();
  await page.waitForFunction(expectedAction => window.fixtureReturnedQuotes.some(r => r.action === expectedAction && r.references.includes('CP-A-PRIVADA')), pendingAction === 'quote-list' ? 'quote-list' : 'quote-detail');
  if (pendingAction === 'quote-list') await page.evaluate(() => window.openingA);
  await page.evaluate(() => Promise.resolve());
  const text = await page.locator('body').textContent();
  assert(text.includes('CLIENTE B VISIBLE'));
  assert(!text.includes('CLIENTE A PRIVADO'));
  assert(!text.includes('a-privado@example.test'));
  assert.equal(await page.locator('dialog').count(), 0);
  const copied = await page.evaluate(() => window.copiedQuoteText);
  assert(copied.includes('CP-B-ACTUAL'));
  assert(!copied.includes('CP-A-PRIVADA'));
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await page.close();
 }
});

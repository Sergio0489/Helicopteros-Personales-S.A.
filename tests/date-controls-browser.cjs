'use strict';
// Isolated browser regressions: synthetic records only; no cloud/auth scripts or network.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let browser;
before(async () => {
  browser = await chromium.launch({
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
});
after(async () => { await browser?.close(); });

function fixture() {
  const pilots = ['Zulu Piloto', 'álvaro Piloto', 'Beatriz Piloto'].map((nombre, i) => ({
    id: `p${i}`, authUid: `pilot-user-${i}`, nombre, email: `pilot${i}@example.test`,
    identity: `P-${i}`, numeroLicencia: `LIC-${i}`, licenseTypes: ['Instructor', 'RPA'],
    tipo: 'Instructor, RPA', instructorRatings: ['Monomotor'], rpaInstructor: true,
    instructorExpiry: '2031-01-01', rpaInstructorExpiry: '2031-02-01',
    medico: '2031-03-31', medicoClase: 'Primera',
    verificaciones: ['charter', 'instruction', 'both'].map((service, j) => ({
      id: `v${i}-${j}`, nombre: `HP${i}${j}`, modelo: 'PA 28', service,
      fecha: '2031-04-01', notes: `Original ${i}-${j}`,
    })),
  }));
  const students = ['Zulema Estudiante', 'Álvaro Estudiante', 'Beatriz Estudiante'].map((name, i) => ({
    id: `s${i}`, authUid: `student-user-${i}`, name, identity: `S-${i}`,
    email: `student${i}@example.test`, phone: `6000000${i}`, createdDate: '2026-01-01',
    stage: 'Interesado', funding: 'Propio', medicalClass: 'Segunda',
    medicalExpiry: '2031-05-31', obtainedCredentials: ['Privado'], history: [],
    courses: [{ id: `course${i}`, type: 'privado', status: 'Por iniciar',
      startDate: '2026-01-01', licenseDate: '', budgets: { matricula: 10000, material: 2000, teoria: 3000 },
      payments: [{ id: `payment${i}`, fee: 'matricula', cents: 10000, date: '2026-01-01' }], flights: [],
    }], registryFlights: [], extraPayments: [],
  }));
  const clients = ['Zulu Charter', 'Álamo Charter', 'Bravo Charter'].map((name, i) => ({
    id: `c${i}`, authUid: `client-user-${i}`, name, identity: `C-${i}`,
    email: `client${i}@example.test`, flights: [], payments: [],
  }));
  return { fleet: {}, pilotos: pilots, itinerarios: [], school: {
    version: 1, students, rates: { Simulador: { cents: 9000 } }, intakes: [], brochureUrl: '',
    registry: { entries: [], clients, destinations: [] }, paymentReceipts: [],
  } };
}
async function app(t, width = 1440, initial = fixture()) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const errors = [];
  page.setDefaultTimeout(6000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async d => { if(d.type()==='confirm')await d.accept();else{errors.push(d.message());await d.dismiss();} });
  await page.route('**/*', route => route.fulfill({ body: '' }));
  await page.clock.install({ time: new Date('2026-10-19T18:00:00Z') });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  await page.setContent(html);
  await page.evaluate(initial => {
    crypto.randomUUID ||= () => `test-${Math.random().toString(36).slice(2)}`;
    window.CLOUD_INITIAL = initial;
    window.writes = [];
    window.cloudWrite = async next => { window.writes.push(structuredClone(next)); };
    window.showCloudError = e => { throw e; };
    window.getPaymentReceivers = () => [{ uid: 'test-receiver', label: 'Receptor de prueba' }];
  }, initial);
  for (const file of ['functions/boxes.js', 'dashboard.js', 'students.js', 'registro.js', 'pilots-ui.js', 'box-ui.js']) {
    await page.addScriptTag({ path: path.join(root, file) });
  }
  await page.addStyleTag({ path: path.join(root, 'students.css') });
  await page.evaluate(() => {
    document.getElementById('access-screen').hidden = true;
    document.getElementById('dashboard-app').hidden = false;
    pilotosTab.click();
    closeDrawer();
  });
  t.after(async () => { await page.close(); assert.deepEqual(errors, [], 'No browser errors or unexpected alerts'); });
  assert.equal(await page.evaluate(() => writes.length), 0, 'Rendering must not save anything');
  return page;
}

for(const width of [1440,390])test(`Date pickers and navigation controls (${width}px)`,async t=>{
 const page=await app(t,width);
 async function calendar(selector){
  const input=page.locator(selector).first();await input.click();
  const picker=page.locator('#app-date-calendar');await picker.waitFor({state:'visible'});
  const bounds=await picker.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1,'Calendar fits viewport');
  await picker.locator('[data-day]').first().click();await picker.waitFor({state:'detached'});
  assert.match(await input.inputValue(),/\d{2}\/\d{2}\/\d{4}/);
  await input.fill('31122030');await input.press('Tab');assert.equal(await input.inputValue(),'31/12/2030');
 }
 await page.evaluate(()=>{itinerariosTab.click();closeDrawer();});
 await calendar('#flight-date');
 if(width<700){await page.locator('.flight-aircraft-picker').click();await page.locator('.flight-aircraft-dialog [data-option="1"]').click();}else await page.selectOption('#flight-ac',{index:1});assert(await page.inputValue('#flight-ac'));
 await page.evaluate(()=>{document.querySelector('#sidebar-tabs .aircraft-tab').click();});
 // Open the registry through its own tab, as a user does.
 await page.locator('#sidebar-tabs .aircraft-tab').filter({hasText:'REGISTRO DE BITÁCORA'}).evaluate(e=>e.click());
 await calendar('#registro-form [name=date]');
 await page.locator('#registro-form [name=observation]').fill('Borrador');
 await page.locator('[data-reset-registry]').click();assert.equal(await page.inputValue('#registro-form [name=observation]'),'');
 await page.evaluate(()=>{document.querySelector('#sidebar-tabs .aircraft-tab[data-idx="0"]').click();closeDrawer();});
 await calendar('#panel-0 input[data-equipment]');
 assert.equal(await page.evaluate(()=>writes.length),0,'Selecting dates alone must not write to Firebase');
});

for(const width of [1440,390])test(`Aircraft hundredths and optional emergency dates (${width}px)`,async t=>{
 const initial=fixture();
 initial.fleet.HP_1784={component_schema_v2:true,tac_anterior:'100.12',horas_acum_50:'10.12',horas_acum_100:'30.34',ciclos_totales:'100.56',ciclos_limite:'200.78',limite_motor:'2000',limite_helice:'2400',emerg_salvavidas_fechas:['2031-01-12','','2032-02-13',''],emerg_extintor:'2033-03-14'};
 const page=await app(t,width,initial);
 // UTC is already the next day; defaults must still use Panama's date.
 await page.clock.setSystemTime(new Date('2026-10-20T03:30:00Z'));
 await page.evaluate(()=>{document.querySelector('#sidebar-tabs .aircraft-tab[data-idx="0"]').click();closeDrawer();});
 const dates=()=>page.locator('#emerg-body-0 input[data-equipment]').evaluateAll(inputs=>inputs.map(e=>e.value));
 const expected=['2031-01-12','','2032-02-13','','2033-03-14','','',''];
 assert.deepEqual(await dates(),expected,'Render preserves both assigned and empty dates');
 await page.locator('#tac-actual-0').fill('100.19');
 assert.equal(await page.inputValue('#horas_diarias-0'),'0.07');
 await page.locator('#panel-0 .aircraft-header .save-btn').first().click();
 await page.waitForFunction(()=>writes.length===1);
 const saved=await page.evaluate(()=>previewData.fleet.HP_1784);
 assert.equal(saved.tac_anterior,'100.19');assert.equal(saved.horas_acum_50,'10.19');assert.equal(saved.horas_acum_100,'30.41');
 assert.equal(saved.ciclos_totales,'100.63');assert.equal(saved.ciclos_limite,'200.85');
 assert.equal(saved.bitacora_horas.at(-1).hv,'0.07');assert.equal(saved.bitacora_tac.at(-1).hv,'0.07');
 assert.deepEqual(saved.emerg_salvavidas_fechas,expected.slice(0,4));
 assert.deepEqual(saved.emerg_flares_fechas,['','']);assert.deepEqual(saved.emerg_botiquin_fechas,['']);
 assert.deepEqual(await dates(),expected,'Saving hours must not assign expiration dates');
 // Manual totals and daily hours, including the maximum five-digit reading.
 for(const [selector,value] of [['#motor-manual-0','12345.67'],['#limite-motor-0','23456.78'],['#horas_diarias-0','0.03'],['#horas-venc-dia-0','0.03']]){
  await page.locator(selector).fill(value);assert(await page.locator(selector).evaluate(e=>e.checkValidity()),selector);
 }
 await page.locator('#panel-0 .aircraft-header .save-btn').first().click();
 await page.waitForFunction(()=>writes.length===2);
 assert.equal(await page.evaluate(()=>previewData.fleet.HP_1784.ciclos_totales),'12345.70');
 assert.equal(await page.evaluate(()=>previewData.fleet.HP_1784.horas_acum_100),'30.44');
 assert.deepEqual(await dates(),expected);
 // Clicking an assigned date preserves it; clicking an empty date initializes only that field.
 await page.locator('#emerg-salvavidas-0-0').click();await page.keyboard.press('Escape');
 assert.deepEqual(await dates(),expected);
 await page.locator('#emerg-salvavidas-0-1').click();
 assert.equal(await page.inputValue('#emerg-salvavidas-0-1'),'19/10/2026');
 assert.equal(await page.evaluate(()=>state[0].emerg_salvavidas_fechas[1]),'2026-10-19');
 await page.locator('#app-date-calendar [data-clear]').click();
 assert.equal(await page.inputValue('#emerg-salvavidas-0-1'),'');
 await page.locator('#emerg-body-0 .equipment-column').first().getByRole('button',{name:'+ Agregar fecha',exact:true}).click();
 assert.equal(await page.inputValue('#emerg-salvavidas-0-4'),'');
 assert.equal(await page.evaluate(()=>writes.length),2,'Calendar interaction does not write to the cloud');
 await page.locator('#panel-0 .aircraft-header .save-btn').first().click();
 await page.waitForFunction(()=>writes.length===3);
 assert.deepEqual(await page.evaluate(()=>previewData.fleet.HP_1784.emerg_salvavidas_fechas),['2031-01-12','','2032-02-13','','']);

 // The registry's actual form accepts hundredths, synchronizes charges, and preserves the precision in corrections.
 await page.locator('#sidebar-tabs .aircraft-tab').filter({hasText:'REGISTRO DE BITÁCORA'}).evaluate(e=>e.click());
 const reg=await page.evaluate(()=>fleet[0].reg);
 await page.selectOption('#registro-form [name=aircraft]',reg);
 await page.locator('#registro-form [name=current]').fill('101.22');
 assert.equal(await page.inputValue('#registro-form [name=hours]'),'1.31','1.03 × 1.275 rounds once to hundredths');
 assert.equal(await page.locator('[data-aircraft-hours]').innerText(),'1.03 h');
 await page.locator('#registro-form [name=pilot]').fill('Piloto de prueba');
 await page.locator('#registro-form [name=person]').fill('Zulema Estudiante');
 await page.locator('#registro-form [name=hours]').fill('1.27');
 await page.locator('#registro-form [name=rate]').fill('90.00');
 await page.locator('#registro-form [type=submit]').click();
 await page.locator('.registro-confirm [data-confirm]').click();
 await page.waitForFunction(()=>writes.length===4);
 let result=await page.evaluate(()=>({entry:previewData.school.registry.entries[0],flight:previewData.school.students[0].courses[0].flights[0]}));
 assert.equal(result.entry.hours100,127);assert.equal(result.entry.aircraftHours100,103);assert.equal(result.entry.costCents,11430);
 assert.equal(result.flight.hours100,127);assert.equal(result.flight.costCents,11430);
 assert.match(await page.locator('[data-registry-history]').innerText(),/Persona: 1\.27 h/);
 await page.locator('[data-edit-registry]').first().click();
 assert.equal(await page.inputValue('dialog [name=hours]'),'1.27');
 await page.locator('dialog [name=hours]').fill('1.29');
 await page.locator('dialog [name=reason]').fill('Corrección sintética de centésimas');
 await page.locator('dialog [type=submit]').click();
 await page.waitForFunction(()=>writes.length===5);
 result=await page.evaluate(()=>({entry:previewData.school.registry.entries[0],flight:previewData.school.students[0].courses[0].flights[0]}));
 assert.equal(result.entry.hours100,129);assert.equal(result.flight.hours100,129);assert.equal(result.flight.costCents,11610);
 const exportXML=await page.evaluate(()=>new TextDecoder().decode(Registro.math.personalWorkbook(previewData.school.registry.entries,panamaISO(),panamaISO(),'all','all')));
 assert(exportXML.includes('formatCode="0.00"'));assert(exportXML.includes('<v>1.29</v>'));
 await page.locator('#sidebar-tabs .aircraft-tab').filter({hasText:'ESTUDIANTES / CLIENTES'}).evaluate(e=>e.click());
 await page.evaluate(()=>School.openSearchTarget({kind:'student',id:'s0'}));
 await page.locator('[data-action=statement]').click();
 assert.match(await page.locator('.school-statement-dialog .school-equipment-hours').innerText(),/1\.29 h/);
 assert(await page.locator('.school-statement-dialog td').filter({hasText:/^1\.29$/}).count());
});

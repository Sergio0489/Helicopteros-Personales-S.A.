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
async function app(t, width = 1440) {
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
  }, fixture());
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
